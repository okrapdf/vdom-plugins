import type {
  VdomPlugin,
  PluginCommand,
  CommandContext,
  CommandResult,
} from '../../types';
import { type QwenMarkdownConfig, qwenMarkdownConfigSchema } from './types';

export { qwenMarkdownConfigSchema };
export type { QwenMarkdownConfig };

async function callTransformApi(
  imageUrl: string,
  config: QwenMarkdownConfig,
  promptStyle: 'table' | 'page' | 'json'
): Promise<CommandResult> {
  try {
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        model: config.model,
        promptStyle,
        entityType: 'all',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `API error: ${response.status} - ${error}` };
    }

    const data = await response.json();

    if (!data.success) {
      return { success: false, error: data.error || 'Unknown API error' };
    }

    return {
      success: true,
      content: data.markdown,
      format: promptStyle === 'json' ? 'json' : 'markdown',
      metadata: { model: data.model, tokens: data.tokens },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { success: false, error: message };
  }
}

const extractMarkdownCommand: PluginCommand<QwenMarkdownConfig> = {
  id: 'extract-markdown',
  title: 'Extract as Markdown',
  contexts: ['table', 'figure', 'all'],
  outputFormat: 'markdown',
  icon: 'file-text',
  shortcut: 'Ctrl+M',
  async handler(ctx: CommandContext<QwenMarkdownConfig>): Promise<CommandResult> {
    if (!ctx.imageUrl) {
      return { success: false, error: 'No image URL provided' };
    }
    return callTransformApi(ctx.imageUrl, ctx.config, 'table');
  },
};

const extractPageMarkdownCommand: PluginCommand<QwenMarkdownConfig> = {
  id: 'extract-page-markdown',
  title: 'Extract Full Page',
  contexts: ['all'],
  outputFormat: 'markdown',
  icon: 'file',
  async handler(ctx: CommandContext<QwenMarkdownConfig>): Promise<CommandResult> {
    if (!ctx.imageUrl) {
      return { success: false, error: 'No image URL provided' };
    }
    return callTransformApi(ctx.imageUrl, ctx.config, 'page');
  },
};

const extractJsonCommand: PluginCommand<QwenMarkdownConfig> = {
  id: 'extract-json',
  title: 'Extract as JSON',
  contexts: ['table'],
  outputFormat: 'json',
  icon: 'braces',
  async handler(ctx: CommandContext<QwenMarkdownConfig>): Promise<CommandResult> {
    if (!ctx.imageUrl) {
      return { success: false, error: 'No image URL provided' };
    }
    return callTransformApi(ctx.imageUrl, ctx.config, 'json');
  },
};

export const qwenMarkdownPlugin: VdomPlugin<QwenMarkdownConfig> = {
  name: 'qwen-markdown',
  description: 'Transform entities to markdown via Qwen VL',
  version: '1.0.0',
  runsOn: [],
  defaultEnabled: true,
  configSchema: qwenMarkdownConfigSchema,
  commands: [extractMarkdownCommand, extractPageMarkdownCommand, extractJsonCommand],
  handler: async () => ({ success: true }),
};

export default qwenMarkdownPlugin;
