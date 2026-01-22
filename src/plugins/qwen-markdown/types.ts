import type { PluginConfigSchema } from '../../types';

export interface QwenMarkdownConfig {
  model: string;
  promptStyle: 'table' | 'page' | 'json';
  apiEndpoint: string;
}

export const qwenMarkdownConfigSchema: PluginConfigSchema = {
  model: {
    type: 'select',
    default: 'qwen/qwen3-vl-235b-a22b-instruct',
    label: 'Vision Model',
    options: [
      { label: 'Qwen3 VL 235B', value: 'qwen/qwen3-vl-235b-a22b-instruct' },
      { label: 'Qwen 2.5 VL 72B', value: 'qwen/qwen-2.5-vl-72b-instruct' },
      { label: 'Gemini 2.0 Flash', value: 'google/gemini-2.0-flash-001' },
    ],
  },
  promptStyle: {
    type: 'select',
    default: 'table',
    label: 'Extraction Style',
    options: [
      { label: 'Table (pipe-delimited)', value: 'table' },
      { label: 'Full Page Markdown', value: 'page' },
      { label: 'Structured JSON', value: 'json' },
    ],
  },
  apiEndpoint: {
    type: 'string',
    default: '/api/transform/entity-to-markdown',
    label: 'API Endpoint',
    description: 'Transformation API endpoint',
  },
};
