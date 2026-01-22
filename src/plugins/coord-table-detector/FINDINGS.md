# Coordinate-Based Table Detection: Research Findings

Based on: **Wang & Shen (2025)** "Hybrid OCR-LLM Framework for Enterprise-Scale Document Information Extraction Under Copy-heavy Task" ([arXiv:2510.10138](https://arxiv.org/abs/2510.10138))

## Executive Summary

This plugin implements the paper's key finding: **table detection via spatial coordinate analysis achieves F1=1.0 at 54x faster latency than multimodal VLM approaches**.

| Approach | F1 Score | Latency | Speed |
|----------|----------|---------|-------|
| Coordinate-based | **1.000** | **0.6s** | 54x faster |
| VLM (Qwen2.5-VL-7B) | 0.999 | 33.9s | baseline |
| OCR + Direct LLM | 0.997 | 13.8s | 2.5x faster |

## Key Insight: Spatial Structure > OCR Accuracy

The paper's critical finding:

> "Spatial structure preservation, rather than character recognition accuracy alone, determines extraction success."

Evidence: EasyOCR achieved **F1=0.000** (complete failure) despite decent OCR accuracy because it doesn't preserve document spatial structure (bounding box coordinates).

### What This Means for OkraPDF

| Component | Preserves Spatial Structure? | Table Detection |
|-----------|------------------------------|-----------------|
| Google DocAI | Yes (`bounding_poly.normalized_vertices`) | Works |
| PaddleOCR | Yes | Works |
| EasyOCR | No | **Fails** |

Google DocAI already provides the spatial structure we need. This plugin leverages that existing data.

## Algorithm Design

### Paper Approach: "Table-Based Extraction"

The paper describes table-based extraction as:

1. **LLM identifies table regions and target cell coordinates**
2. **Rule-based parser extracts content deterministically**

Key optimization:
> "Minimize hallucination and reduce generation cost by limiting model output to positional metadata."

### This Plugin's Approach

We skip the LLM entirely for table *detection* by using pure coordinate analysis:

```
OCR Blocks with BBoxes
        ↓
┌──────────────────────────────────────┐
│ 1. Row Clustering                     │
│    Group blocks by Y-coordinate       │
│    Tolerance: ~15 (0-1000 scale)      │
├──────────────────────────────────────┤
│ 2. Column Detection                   │
│    Find X-positions consistent        │
│    across multiple rows               │
│    Tolerance: ~20 (0-1000 scale)      │
├──────────────────────────────────────┤
│ 3. Grid Formation                     │
│    Build row×column structure         │
│    Mark empty cells                   │
├──────────────────────────────────────┤
│ 4. Confidence Scoring                 │
│    - Cell fill ratio                  │
│    - Row height consistency           │
│    - Column width consistency         │
└──────────────────────────────────────┘
        ↓
Detected Tables with BBoxes
```

### Why This Works

Tables have predictable spatial patterns:
- **Rows**: Text blocks at similar Y-coordinates
- **Columns**: X-positions that repeat across rows
- **Grid regularity**: Consistent cell sizes

These patterns are detectable with simple clustering algorithms, no ML required.

## Configuration Parameters

| Parameter | Default | Range | Rationale |
|-----------|---------|-------|-----------|
| `rowTolerance` | 15 | 5-50 | ~1.5% of page height. Accounts for slight vertical misalignment in OCR |
| `columnTolerance` | 20 | 5-50 | ~2% of page width. Allows for variable column widths |
| `minColumns` | 2 | 2-10 | Single column isn't a table |
| `minRows` | 2 | 2-10 | Single row isn't a table |
| `confidenceThreshold` | 0.7 | 0.5-1.0 | Filter low-quality detections |

## Confidence Scoring

Confidence is calculated from three factors (weighted average):

```typescript
confidence =
  fillRatio * 0.4 +           // % of non-empty cells
  rowHeightConsistency * 0.3 + // 1/(1 + variance/mean)
  colWidthConsistency * 0.3    // 1/(1 + variance/mean)
```

High confidence tables have:
- Most cells filled (high fill ratio)
- Similar row heights (low variance)
- Similar column widths (low variance)

## Integration with Existing OkraPDF Pipeline

### Current Flow (VLM-based)
```
DocAI OCR → Page Images → Qwen VL → Entity Detection → Overlays
                            ↑
                     2-10s per page
```

### Proposed Hybrid Flow
```
DocAI OCR → Coord-Table-Detector → Tables Found?
                                     ├── Yes → Use detected tables (fast path)
                                     └── No/Low confidence → Qwen VL fallback
```

Benefits:
- **Latency**: ~1-5ms per page vs 2-10s for VLM
- **Cost**: No API calls for obvious tables
- **Accuracy**: VLM fallback ensures robustness

## Known Limitations

| Limitation | Mitigation |
|------------|------------|
| Merged cells | Grid may show gaps; use VLM for complex tables |
| Nested tables | Algorithm detects outermost table only |
| Tables without borders | Works if OCR blocks are grid-aligned |
| Rotated tables | Requires rotation correction first |
| Very small tables | minRows/minColumns filters may exclude |

## A/B Testing Plan

**Feature Flag**: `coord-table-detector-enabled`

### Phase 1: Shadow Mode
- Run coord-detector alongside VLM
- Compare detected tables vs VLM results
- Metrics: precision, recall, IoU of bounding boxes

### Phase 2: Conditional Use
- Use coord-detector when confidence > 0.85
- Fall back to VLM otherwise
- Measure latency improvement, accuracy retention

### Phase 3: Default On
- Enable by default for born-digital PDFs
- Keep VLM for scanned/degraded documents

## Integration Options (TODO: Decide)

The plugin currently emits **overlays** (visual decoration). Need to decide how it integrates with the entity system.

### Option A: Overlay Only (Current)

```
Trigger: Auto on 'interactive' lifecycle
Result:  Visual boxes on PDF (debugging/comparison)
Creates: Nothing in VDOM tree
```

**Pros**: Simple, good for A/B testing vs VLM
**Cons**: Tables not selectable, no commands, not persisted

### Option B: Command-Based (Recommended)

```
Trigger: User clicks "Detect Tables" button/command
Result:  Returns entity creation payloads
Creates: VdomNodes via host app
```

```typescript
// Would look like:
const detectTablesCommand: PluginCommand = {
  id: 'detect-tables',
  title: 'Detect Tables (Coordinate)',
  contexts: ['all'],  // page-level command
  outputFormat: 'json',
  async handler(ctx) {
    const tables = detectTablesOnPage(...);
    return {
      success: true,
      content: JSON.stringify({
        action: 'create_entities',
        entities: tables.map(t => ({
          type: 'table',
          bbox: t.bbox,
          pageNumber: t.pageNumber,
          metadata: { confidence: t.confidence, source: 'coord-detector' }
        }))
      }),
      format: 'json',
    };
  }
};
```

**Pros**: User-controlled, matches ocr-classifier pattern, tables become real entities
**Cons**: Requires user action, not automatic

### Option C: Auto + Entity Emission

```
Trigger: Auto on 'interactive' lifecycle
Result:  Emits 'transformation' with entity payloads
Creates: Host subscribes and creates VdomNodes
```

**Pros**: Automatic, tables appear in tree
**Cons**: Need host integration, may create duplicates if VLM also runs

### Current Status: Incomplete

- [x] Core detection algorithm
- [x] Overlay emission
- [ ] Entity creation (needs decision above)
- [ ] Host integration (inspector)
- [ ] A/B test vs VLM detection

---

## Files Modified

| File | Purpose |
|------|---------|
| `types.ts` | Config, stats, and grid cell interfaces |
| `index.ts` | Core detection algorithm and plugin export |
| `FINDINGS.md` | This document |

## References

1. Wang, Z., & Shen, X. (2025). Hybrid OCR-LLM Framework for Enterprise-Scale Document Information Extraction Under Copy-heavy Task. arXiv:2510.10138v1

2. OkraPDF HYBRID_OCR_LLM_FINDINGS.md - Architecture comparison with paper

3. Google DocAI `bounding_poly` documentation - Spatial structure format
