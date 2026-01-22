import type {
  VdomPlugin,
  PluginContext,
  PluginResult,
  PluginConfigSchema,
  EntityOverlay,
  NodeBadge,
  ViewControlSchema,
} from '../../types';
import { overlapRatio } from '../../utils';

export { overlapRatio };

export interface OrphanDetectorConfig {
  coverageThreshold: number;
  showOverlays: boolean;
  showBadges: boolean;
  overlayBorderStyle: string;
  badgeColor: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';
}

export const orphanDetectorConfigSchema: PluginConfigSchema = {
  coverageThreshold: {
    type: 'number',
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
    label: 'Coverage Threshold',
    description: 'Minimum overlap ratio to consider block "covered" (0-1)',
  },
  showOverlays: {
    type: 'boolean',
    default: true,
    label: 'Show Overlays',
    description: 'Highlight orphans on PDF viewer',
  },
  showBadges: {
    type: 'boolean',
    default: true,
    label: 'Show Badges',
    description: 'Add ORPHAN badges to tree nodes',
  },
  overlayBorderStyle: {
    type: 'string',
    default: '2px dashed #f59e0b',
    label: 'Overlay Border Style',
    description: 'CSS border style for orphan overlays',
    placeholder: '2px dashed #f59e0b',
  },
  badgeColor: {
    type: 'select',
    default: 'orange',
    label: 'Badge Color',
    description: 'Color of ORPHAN badge',
    options: [
      { label: 'Red', value: 'red' },
      { label: 'Orange', value: 'orange' },
      { label: 'Yellow', value: 'yellow' },
      { label: 'Green', value: 'green' },
      { label: 'Blue', value: 'blue' },
      { label: 'Purple', value: 'purple' },
      { label: 'Gray', value: 'gray' },
    ],
  },
};

export interface OrphanDetectorStats {
  totalOcrBlocks: number;
  coveredBlocks: number;
  orphanBlocks: number;
  coverageRatio: number;
  pagesWithOrphans: number[];
}

export const orphanDetectorViewControls: ViewControlSchema[] = [
  {
    type: 'filter',
    id: 'showOrphansOnly',
    label: 'Orphans only',
    labelTemplate: 'Orphans only ({orphanBlocks})',
    filterTarget: 'both',
    defaultValue: false,
  },
];

async function orphanDetectorHandler(
  ctx: PluginContext<OrphanDetectorConfig>
): Promise<PluginResult> {
  const {
    coverageThreshold = 0.5,
    showOverlays = true,
    showBadges = true,
    overlayBorderStyle = '2px dashed #f59e0b',
    badgeColor = 'orange',
  } = ctx.config;

  ctx.log('debug', `Running orphan detector with threshold: ${coverageThreshold}`);

  const ocrBlocks = ctx.$('span.ocr-block').toArray();
  const semanticEntities = ctx.$('table, figure, aside, article, section').toArray();

  ctx.log('info', `Found ${ocrBlocks.length} OCR blocks and ${semanticEntities.length} entities`);

  const orphans = ocrBlocks.filter((block) => {
    if (!block.bbox) return true;

    const isCovered = semanticEntities.some((entity) => {
      if (!entity.bbox) return false;
      return overlapRatio(block.bbox, entity.bbox) >= coverageThreshold;
    });

    return !isCovered;
  });

  ctx.log('info', `Detected ${orphans.length} orphan blocks`);

  const pagesWithOrphans = [...new Set(orphans.map((o) => o.pageNumber))].sort((a, b) => a - b);

  if (showOverlays && orphans.length > 0) {
    const overlays: EntityOverlay[] = orphans
      .filter((block) => block.bbox)
      .map((block) => ({
        id: `orphan-overlay-${block.id}`,
        type: 'orphan',
        bbox: block.bbox!,
        page: block.pageNumber,
        style: {
          border: overlayBorderStyle,
          background: 'rgba(245, 158, 11, 0.1)',
          opacity: 0.8,
        },
        label: 'ORPHAN',
        tooltip: `Uncovered OCR block: "${String(block._textContent || block.textContent || '').slice(0, 50)}..."`,
      }));

    ctx.emit('overlays', overlays);
    ctx.log('debug', `Emitted ${overlays.length} overlays`);
  }

  if (showBadges && orphans.length > 0) {
    const badges: NodeBadge[] = orphans.map((block) => ({
      nodeId: block.id,
      text: 'ORPHAN',
      color: badgeColor,
      tooltip: 'This OCR block is not covered by any semantic entity',
    }));

    ctx.emit('badges', badges);
    ctx.log('debug', `Emitted ${badges.length} badges`);
  }

  const stats: OrphanDetectorStats = {
    totalOcrBlocks: ocrBlocks.length,
    coveredBlocks: ocrBlocks.length - orphans.length,
    orphanBlocks: orphans.length,
    coverageRatio: ocrBlocks.length > 0
      ? (ocrBlocks.length - orphans.length) / ocrBlocks.length
      : 1,
    pagesWithOrphans,
  };

  ctx.emit('stats', stats as unknown as Record<string, string | number>);

  return {
    success: true,
    data: {
      stats: stats as unknown as Record<string, string | number>,
      overlays: showOverlays ? orphans.filter((b) => b.bbox).map((b) => ({
        id: `orphan-overlay-${b.id}`,
        type: 'orphan',
        bbox: b.bbox!,
        page: b.pageNumber,
        style: { border: overlayBorderStyle },
      })) : [],
      badges: showBadges ? orphans.map((b) => ({
        nodeId: b.id,
        text: 'ORPHAN',
        color: badgeColor,
      })) : [],
    },
  };
}

export const orphanDetectorPlugin: VdomPlugin<OrphanDetectorConfig> = {
  name: 'orphan-detector',
  description: 'Detect OCR blocks not covered by semantic entities',
  version: '1.0.0',
  runsOn: ['interactive'],
  defaultEnabled: true,
  configSchema: orphanDetectorConfigSchema,
  viewControls: orphanDetectorViewControls,
  handler: orphanDetectorHandler,
};

export default orphanDetectorPlugin;
