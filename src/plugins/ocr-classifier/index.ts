import type {
  VdomPlugin,
  PluginCommand,
  CommandContext,
  CommandResult,
} from '../../types';
import {
  type OcrClassifierConfig,
  type EntityCreationPayload,
  ocrClassifierConfigSchema,
} from './types';

export { ocrClassifierConfigSchema };
export type { OcrClassifierConfig, EntityCreationPayload };

function createEntityPayload(
  ctx: CommandContext<OcrClassifierConfig>,
  entityType: EntityCreationPayload['entity']['type'],
  options?: { level?: number }
): EntityCreationPayload {
  return {
    action: 'create_entity',
    entity: {
      type: entityType,
      bbox: ctx.bbox,
      pageNumber: ctx.pageNumber,
      sourceBlockId: ctx.entity.id,
      title: typeof ctx.entity.textContent === 'string' 
        ? ctx.entity.textContent.slice(0, 100) 
        : undefined,
      ...(options?.level !== undefined && { level: options.level }),
    },
  };
}

const markAsParagraphCommand: PluginCommand<OcrClassifierConfig> = {
  id: 'mark-as-paragraph',
  title: 'Mark as Paragraph',
  contexts: ['ocr-block'],
  outputFormat: 'json',
  icon: 'align-left',
  async handler(ctx: CommandContext<OcrClassifierConfig>): Promise<CommandResult> {
    const payload = createEntityPayload(ctx, 'paragraph');
    return {
      success: true,
      content: JSON.stringify(payload),
      format: 'json',
      metadata: payload as unknown as Record<string, unknown>,
    };
  },
};

const markAsHeadingCommand: PluginCommand<OcrClassifierConfig> = {
  id: 'mark-as-heading',
  title: 'Mark as Heading',
  contexts: ['ocr-block'],
  outputFormat: 'json',
  icon: 'heading',
  async handler(ctx: CommandContext<OcrClassifierConfig>): Promise<CommandResult> {
    const payload = createEntityPayload(ctx, 'heading', { level: 1 });
    return {
      success: true,
      content: JSON.stringify(payload),
      format: 'json',
      metadata: payload as unknown as Record<string, unknown>,
    };
  },
};

const markAsListCommand: PluginCommand<OcrClassifierConfig> = {
  id: 'mark-as-list',
  title: 'Mark as List Item',
  contexts: ['ocr-block'],
  outputFormat: 'json',
  icon: 'list',
  async handler(ctx: CommandContext<OcrClassifierConfig>): Promise<CommandResult> {
    const payload = createEntityPayload(ctx, 'list');
    return {
      success: true,
      content: JSON.stringify(payload),
      format: 'json',
      metadata: payload as unknown as Record<string, unknown>,
    };
  },
};

const markAsHeaderCommand: PluginCommand<OcrClassifierConfig> = {
  id: 'mark-as-header',
  title: 'Mark as Page Header',
  contexts: ['ocr-block'],
  outputFormat: 'json',
  icon: 'panel-top',
  async handler(ctx: CommandContext<OcrClassifierConfig>): Promise<CommandResult> {
    const payload = createEntityPayload(ctx, 'header');
    return {
      success: true,
      content: JSON.stringify(payload),
      format: 'json',
      metadata: payload as unknown as Record<string, unknown>,
    };
  },
};

export const ocrClassifierPlugin: VdomPlugin<OcrClassifierConfig> = {
  name: 'ocr-classifier',
  description: 'Classify OCR blocks as semantic entities (paragraph, heading, list)',
  version: '1.0.0',
  runsOn: [],
  defaultEnabled: true,
  configSchema: ocrClassifierConfigSchema,
  commands: [
    markAsParagraphCommand,
    markAsHeadingCommand,
    markAsListCommand,
    markAsHeaderCommand,
  ],
  handler: async () => ({ success: true }),
};

export default ocrClassifierPlugin;
