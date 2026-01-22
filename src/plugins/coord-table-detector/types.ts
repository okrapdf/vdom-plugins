/**
 * Coordinate-Based Table Detector Types
 *
 * Based on Wang & Shen (2025) "Hybrid OCR-LLM Framework" paper findings:
 * - Table detection via spatial analysis achieves F1=1.0 at 54x faster than VLM
 * - Key insight: spatial structure preservation > OCR accuracy
 */

import type { BBox } from '../../types';

export interface CoordTableDetectorConfig {
  /** Y-coordinate tolerance for row clustering (0-1000 scale). Default: 15 */
  rowTolerance: number;

  /** X-coordinate tolerance for column alignment (0-1000 scale). Default: 20 */
  columnTolerance: number;

  /** Minimum columns to consider a table. Default: 2 */
  minColumns: number;

  /** Minimum rows to consider a table. Default: 2 */
  minRows: number;

  /** Confidence threshold to emit table (0-1). Default: 0.7 */
  confidenceThreshold: number;

  /** Show overlay boxes on detected tables. Default: true */
  showOverlays: boolean;

  /** Overlay border style. Default: '2px solid #3b82f6' */
  overlayBorderStyle: string;

  /** Enable debug mode (logs clustering details). Default: false */
  debug: boolean;
}

export interface DetectedTable {
  /** Unique ID */
  id: string;

  /** Bounding box encompassing all cells */
  bbox: BBox;

  /** Page number (1-indexed) */
  pageNumber: number;

  /** Number of detected rows */
  rowCount: number;

  /** Number of detected columns */
  columnCount: number;

  /** Confidence score (0-1) based on alignment regularity */
  confidence: number;

  /** IDs of constituent OCR blocks */
  blockIds: string[];

  /** Row-column structure */
  grid: GridCell[][];
}

export interface GridCell {
  /** OCR block ID (null if empty cell) */
  blockId: string | null;

  /** Cell bounding box */
  bbox: BBox;

  /** Text content (if available) */
  text?: string;

  /** Row index (0-indexed) */
  row: number;

  /** Column index (0-indexed) */
  col: number;
}

export interface RowCluster {
  /** Y-center of the row */
  yCenter: number;

  /** All blocks in this row */
  blocks: ClusterBlock[];
}

export interface ClusterBlock {
  id: string;
  bbox: BBox;
  xCenter: number;
  yCenter: number;
  text?: string;
}

export interface ColumnCluster {
  /** X-center of the column */
  xCenter: number;

  /** Indices of rows containing this column */
  rowIndices: number[];
}

export interface CoordTableDetectorStats {
  /** Total OCR blocks analyzed */
  totalBlocks: number;

  /** Number of tables detected */
  tablesDetected: number;

  /** Pages with tables */
  pagesWithTables: number[];

  /** Blocks assigned to tables */
  blocksInTables: number;

  /** Detection latency in ms */
  latencyMs: number;

  /** Average confidence of detected tables */
  avgConfidence: number;
}
