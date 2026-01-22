/**
 * Coordinate-Based Table Detector Plugin
 *
 * Implements the "Table-Based Extraction" approach from:
 * Wang & Shen (2025) "Hybrid OCR-LLM Framework for Enterprise-Scale
 * Document Information Extraction Under Copy-heavy Task" (arXiv:2510.10138)
 *
 * Key finding: Spatial pattern detection achieves F1=1.0 with 0.6s latency,
 * 54x faster than multimodal VLM approaches while maintaining accuracy.
 *
 * Algorithm:
 * 1. Cluster OCR blocks by Y-coordinate proximity (row detection)
 * 2. Detect column alignment across rows via X-coordinate clustering
 * 3. Identify table regions where ≥minRows share ≥minColumns
 * 4. Calculate confidence based on grid regularity
 */

import type {
  VdomPlugin,
  PluginContext,
  PluginResult,
  PluginConfigSchema,
  EntityOverlay,
  ViewControlSchema,
  VdomNode,
  BBox,
} from '../../types';

import type {
  CoordTableDetectorConfig,
  CoordTableDetectorStats,
  DetectedTable,
  RowCluster,
  ClusterBlock,
  GridCell,
} from './types';

export type {
  CoordTableDetectorConfig,
  CoordTableDetectorStats,
  DetectedTable,
};

export const coordTableDetectorConfigSchema: PluginConfigSchema = {
  rowTolerance: {
    type: 'number',
    default: 15,
    min: 5,
    max: 50,
    step: 5,
    label: 'Row Tolerance',
    description: 'Y-distance threshold for grouping blocks into rows (0-1000 scale)',
  },
  columnTolerance: {
    type: 'number',
    default: 20,
    min: 5,
    max: 50,
    step: 5,
    label: 'Column Tolerance',
    description: 'X-distance threshold for aligning columns (0-1000 scale)',
  },
  minColumns: {
    type: 'number',
    default: 2,
    min: 2,
    max: 10,
    step: 1,
    label: 'Min Columns',
    description: 'Minimum columns to classify as table',
  },
  minRows: {
    type: 'number',
    default: 2,
    min: 2,
    max: 10,
    step: 1,
    label: 'Min Rows',
    description: 'Minimum rows to classify as table',
  },
  confidenceThreshold: {
    type: 'number',
    default: 0.7,
    min: 0.5,
    max: 1.0,
    step: 0.05,
    label: 'Confidence Threshold',
    description: 'Minimum confidence to emit table detection',
  },
  showOverlays: {
    type: 'boolean',
    default: true,
    label: 'Show Overlays',
    description: 'Highlight detected tables on PDF viewer',
  },
  overlayBorderStyle: {
    type: 'string',
    default: '2px solid #3b82f6',
    label: 'Overlay Style',
    description: 'CSS border style for table overlays',
    placeholder: '2px solid #3b82f6',
  },
  debug: {
    type: 'boolean',
    default: false,
    label: 'Debug Mode',
    description: 'Log detailed clustering information',
  },
};

export const coordTableDetectorViewControls: ViewControlSchema[] = [
  {
    type: 'filter',
    id: 'showTablesOnly',
    label: 'Tables only',
    labelTemplate: 'Tables only ({tablesDetected})',
    filterTarget: 'overlays',
    defaultValue: false,
  },
  {
    type: 'toggle',
    id: 'showGridLines',
    label: 'Show grid',
    description: 'Show row/column grid lines',
    defaultValue: false,
  },
];

// =============================================================================
// Core Algorithm: Coordinate-Based Table Detection
// =============================================================================

function getBBoxCenter(bbox: BBox): { x: number; y: number } {
  return {
    x: (bbox.x1 + bbox.x2) / 2,
    y: (bbox.y1 + bbox.y2) / 2,
  };
}

/**
 * Cluster blocks into rows by Y-coordinate proximity.
 * Blocks within `tolerance` Y-distance are grouped together.
 */
function clusterIntoRows(
  blocks: ClusterBlock[],
  tolerance: number
): RowCluster[] {
  if (blocks.length === 0) return [];

  // Sort by Y-center
  const sorted = [...blocks].sort((a, b) => a.yCenter - b.yCenter);

  const rows: RowCluster[] = [];
  let currentRow: RowCluster = {
    yCenter: sorted[0].yCenter,
    blocks: [sorted[0]],
  };

  for (let i = 1; i < sorted.length; i++) {
    const block = sorted[i];
    const rowYCenter =
      currentRow.blocks.reduce((sum, b) => sum + b.yCenter, 0) /
      currentRow.blocks.length;

    if (Math.abs(block.yCenter - rowYCenter) <= tolerance) {
      // Same row
      currentRow.blocks.push(block);
    } else {
      // New row
      currentRow.yCenter = rowYCenter;
      rows.push(currentRow);
      currentRow = {
        yCenter: block.yCenter,
        blocks: [block],
      };
    }
  }

  // Push final row
  currentRow.yCenter =
    currentRow.blocks.reduce((sum, b) => sum + b.yCenter, 0) /
    currentRow.blocks.length;
  rows.push(currentRow);

  return rows;
}

/**
 * Detect column X-positions from row clusters.
 * Columns are X-positions that appear consistently across rows.
 */
function detectColumns(
  rows: RowCluster[],
  tolerance: number,
  minRows: number
): number[] {
  if (rows.length < minRows) return [];

  // Collect all X-centers from all rows
  const allXCenters: { x: number; rowIdx: number }[] = [];
  rows.forEach((row, rowIdx) => {
    row.blocks.forEach((block) => {
      allXCenters.push({ x: block.xCenter, rowIdx });
    });
  });

  if (allXCenters.length === 0) return [];

  // Cluster X-centers
  const sorted = [...allXCenters].sort((a, b) => a.x - b.x);
  const columnClusters: { xCenter: number; rowSet: Set<number> }[] = [];

  for (const item of sorted) {
    // Find existing cluster within tolerance
    let found = false;
    for (const cluster of columnClusters) {
      if (Math.abs(item.x - cluster.xCenter) <= tolerance) {
        cluster.rowSet.add(item.rowIdx);
        // Update center as running average
        cluster.xCenter =
          (cluster.xCenter * cluster.rowSet.size + item.x) /
          (cluster.rowSet.size + 1);
        found = true;
        break;
      }
    }

    if (!found) {
      columnClusters.push({
        xCenter: item.x,
        rowSet: new Set([item.rowIdx]),
      });
    }
  }

  // Filter columns that appear in at least minRows
  const validColumns = columnClusters
    .filter((col) => col.rowSet.size >= minRows)
    .map((col) => col.xCenter)
    .sort((a, b) => a - b);

  return validColumns;
}

/**
 * Build grid structure from rows and detected columns.
 */
function buildGrid(
  rows: RowCluster[],
  columns: number[],
  tolerance: number
): GridCell[][] {
  const grid: GridCell[][] = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const gridRow: GridCell[] = [];

    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const colX = columns[colIdx];

      // Find block closest to this column position
      const matchingBlock = row.blocks.find(
        (b) => Math.abs(b.xCenter - colX) <= tolerance
      );

      if (matchingBlock) {
        gridRow.push({
          blockId: matchingBlock.id,
          bbox: matchingBlock.bbox,
          text: matchingBlock.text,
          row: rowIdx,
          col: colIdx,
        });
      } else {
        // Empty cell - interpolate bbox from column position
        const colWidth = columns.length > 1
          ? (colIdx < columns.length - 1
              ? columns[colIdx + 1] - colX
              : colX - columns[colIdx - 1])
          : 100;

        const rowBlocks = row.blocks;
        const minY = Math.min(...rowBlocks.map((b) => b.bbox.y1));
        const maxY = Math.max(...rowBlocks.map((b) => b.bbox.y2));

        gridRow.push({
          blockId: null,
          bbox: {
            x1: colX - colWidth / 2,
            y1: minY,
            x2: colX + colWidth / 2,
            y2: maxY,
          },
          row: rowIdx,
          col: colIdx,
        });
      }
    }

    grid.push(gridRow);
  }

  return grid;
}

/**
 * Calculate confidence score based on grid regularity.
 * Higher score = more regular cell sizes and better alignment.
 */
function calculateConfidence(grid: GridCell[][]): number {
  if (grid.length === 0 || grid[0].length === 0) return 0;

  const rowCount = grid.length;
  const colCount = grid[0].length;

  // Factor 1: Cell fill ratio (non-empty cells)
  let filledCells = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.blockId !== null) filledCells++;
    }
  }
  const fillRatio = filledCells / (rowCount * colCount);

  // Factor 2: Row height consistency
  const rowHeights = grid.map((row) => {
    const heights = row
      .filter((c) => c.blockId !== null)
      .map((c) => c.bbox.y2 - c.bbox.y1);
    return heights.length > 0
      ? heights.reduce((a, b) => a + b, 0) / heights.length
      : 0;
  });

  const avgRowHeight =
    rowHeights.reduce((a, b) => a + b, 0) / rowHeights.length;
  const rowHeightVariance =
    rowHeights.reduce((sum, h) => sum + Math.pow(h - avgRowHeight, 2), 0) /
    rowHeights.length;
  const rowHeightConsistency =
    avgRowHeight > 0 ? 1 / (1 + rowHeightVariance / avgRowHeight) : 0;

  // Factor 3: Column width consistency
  const colWidths: number[] = [];
  for (let col = 0; col < colCount; col++) {
    const widths = grid
      .map((row) => row[col])
      .filter((c) => c.blockId !== null)
      .map((c) => c.bbox.x2 - c.bbox.x1);
    if (widths.length > 0) {
      colWidths.push(widths.reduce((a, b) => a + b, 0) / widths.length);
    }
  }

  const avgColWidth =
    colWidths.length > 0
      ? colWidths.reduce((a, b) => a + b, 0) / colWidths.length
      : 0;
  const colWidthVariance =
    colWidths.length > 0
      ? colWidths.reduce((sum, w) => sum + Math.pow(w - avgColWidth, 2), 0) /
        colWidths.length
      : 0;
  const colWidthConsistency =
    avgColWidth > 0 ? 1 / (1 + colWidthVariance / avgColWidth) : 0;

  // Weighted combination
  const confidence =
    fillRatio * 0.4 +
    rowHeightConsistency * 0.3 +
    colWidthConsistency * 0.3;

  return Math.min(1, Math.max(0, confidence));
}

/**
 * Compute bounding box encompassing all blocks.
 */
function computeTableBBox(blocks: ClusterBlock[]): BBox {
  if (blocks.length === 0) {
    return { x1: 0, y1: 0, x2: 0, y2: 0 };
  }

  return {
    x1: Math.min(...blocks.map((b) => b.bbox.x1)),
    y1: Math.min(...blocks.map((b) => b.bbox.y1)),
    x2: Math.max(...blocks.map((b) => b.bbox.x2)),
    y2: Math.max(...blocks.map((b) => b.bbox.y2)),
  };
}

/**
 * Detect tables on a single page.
 */
function detectTablesOnPage(
  blocks: ClusterBlock[],
  pageNumber: number,
  config: CoordTableDetectorConfig,
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void
): DetectedTable[] {
  const tables: DetectedTable[] = [];

  if (blocks.length < config.minRows * config.minColumns) {
    return tables;
  }

  // Step 1: Cluster into rows
  const rows = clusterIntoRows(blocks, config.rowTolerance);

  if (config.debug) {
    log('debug', `Page ${pageNumber}: Found ${rows.length} rows from ${blocks.length} blocks`);
  }

  if (rows.length < config.minRows) {
    return tables;
  }

  // Step 2: Detect columns
  const columns = detectColumns(rows, config.columnTolerance, config.minRows);

  if (config.debug) {
    log('debug', `Page ${pageNumber}: Detected ${columns.length} columns`);
  }

  if (columns.length < config.minColumns) {
    return tables;
  }

  // Step 3: Build grid
  const grid = buildGrid(rows, columns, config.columnTolerance);

  // Step 4: Calculate confidence
  const confidence = calculateConfidence(grid);

  if (config.debug) {
    log('debug', `Page ${pageNumber}: Grid ${rows.length}x${columns.length}, confidence: ${confidence.toFixed(3)}`);
  }

  if (confidence < config.confidenceThreshold) {
    return tables;
  }

  // Step 5: Create table
  const allBlocks = rows.flatMap((r) => r.blocks);
  const table: DetectedTable = {
    id: `coord-table-p${pageNumber}-${Date.now()}`,
    bbox: computeTableBBox(allBlocks),
    pageNumber,
    rowCount: rows.length,
    columnCount: columns.length,
    confidence,
    blockIds: allBlocks.map((b) => b.id),
    grid,
  };

  tables.push(table);

  return tables;
}

// =============================================================================
// Plugin Handler
// =============================================================================

async function coordTableDetectorHandler(
  ctx: PluginContext<CoordTableDetectorConfig>
): Promise<PluginResult> {
  const startTime = performance.now();
  const config: CoordTableDetectorConfig = {
    rowTolerance: ctx.config.rowTolerance ?? 15,
    columnTolerance: ctx.config.columnTolerance ?? 20,
    minColumns: ctx.config.minColumns ?? 2,
    minRows: ctx.config.minRows ?? 2,
    confidenceThreshold: ctx.config.confidenceThreshold ?? 0.7,
    showOverlays: ctx.config.showOverlays ?? true,
    overlayBorderStyle: ctx.config.overlayBorderStyle ?? '2px solid #3b82f6',
    debug: ctx.config.debug ?? false,
  };

  ctx.log('info', `Running coord-table-detector with config: ${JSON.stringify(config)}`);

  // Get all OCR blocks (span.ocr-block or similar)
  const ocrBlocks = ctx.$('span.ocr-block').toArray();

  if (ocrBlocks.length === 0) {
    ctx.log('info', 'No OCR blocks found, skipping table detection');
    return {
      success: true,
      data: {
        stats: {
          totalBlocks: 0,
          tablesDetected: 0,
          blocksInTables: 0,
          latencyMs: performance.now() - startTime,
        },
      },
    };
  }

  // Group blocks by page
  const blocksByPage = new Map<number, ClusterBlock[]>();

  for (const block of ocrBlocks) {
    if (!block.bbox) continue;

    const { x, y } = getBBoxCenter(block.bbox);
    const clusterBlock: ClusterBlock = {
      id: block.id,
      bbox: block.bbox,
      xCenter: x,
      yCenter: y,
      text: typeof block.textContent === 'string' ? block.textContent : block._textContent,
    };

    const pageBlocks = blocksByPage.get(block.pageNumber) || [];
    pageBlocks.push(clusterBlock);
    blocksByPage.set(block.pageNumber, pageBlocks);
  }

  // Detect tables on each page
  const allTables: DetectedTable[] = [];

  for (const [pageNumber, blocks] of blocksByPage) {
    const pageTables = detectTablesOnPage(blocks, pageNumber, config, ctx.log);
    allTables.push(...pageTables);
  }

  const latencyMs = performance.now() - startTime;

  ctx.log(
    'info',
    `Detected ${allTables.length} tables in ${latencyMs.toFixed(1)}ms`
  );

  // Emit overlays
  if (config.showOverlays && allTables.length > 0) {
    const overlays: EntityOverlay[] = allTables.map((table) => ({
      id: `coord-table-overlay-${table.id}`,
      type: 'table-detected',
      bbox: table.bbox,
      page: table.pageNumber,
      style: {
        border: config.overlayBorderStyle,
        background: 'rgba(59, 130, 246, 0.1)',
        opacity: 0.8,
      },
      label: `Table ${table.rowCount}×${table.columnCount}`,
      tooltip: `Coordinate-detected table. Confidence: ${(table.confidence * 100).toFixed(0)}%`,
    }));

    ctx.emit('overlays', overlays);
  }

  // Compute stats
  const pagesWithTables = [...new Set(allTables.map((t) => t.pageNumber))].sort(
    (a, b) => a - b
  );
  const blocksInTables = allTables.reduce(
    (sum, t) => sum + t.blockIds.length,
    0
  );
  const avgConfidence =
    allTables.length > 0
      ? allTables.reduce((sum, t) => sum + t.confidence, 0) / allTables.length
      : 0;

  const stats: CoordTableDetectorStats = {
    totalBlocks: ocrBlocks.length,
    tablesDetected: allTables.length,
    pagesWithTables,
    blocksInTables,
    latencyMs,
    avgConfidence,
  };

  ctx.emit('stats', stats as unknown as Record<string, string | number>);

  return {
    success: true,
    data: {
      stats: stats as unknown as Record<string, string | number>,
      overlays: config.showOverlays
        ? allTables.map((t) => ({
            id: `coord-table-overlay-${t.id}`,
            type: 'table-detected',
            bbox: t.bbox,
            page: t.pageNumber,
            style: { border: config.overlayBorderStyle },
          }))
        : [],
    },
  };
}

// =============================================================================
// Plugin Export
// =============================================================================

export const coordTableDetectorPlugin: VdomPlugin<CoordTableDetectorConfig> = {
  name: 'coord-table-detector',
  description:
    'Detect tables via OCR block coordinate analysis (54x faster than VLM)',
  version: '1.0.0',
  runsOn: ['interactive'],
  defaultEnabled: false, // Opt-in for now, experimental
  configSchema: coordTableDetectorConfigSchema,
  viewControls: coordTableDetectorViewControls,
  handler: coordTableDetectorHandler,
};

export default coordTableDetectorPlugin;
