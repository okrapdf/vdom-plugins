import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { qwenMarkdownPlugin, type QwenMarkdownConfig } from './index';
import type { CommandContext, VdomNode } from '../../types';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockNode(overrides: Partial<VdomNode> = {}): VdomNode {
  return {
    id: 'node-1',
    type: 'table',
    bbox: { x1: 0, y1: 0, x2: 100, y2: 100 },
    pageNumber: 1,
    classNames: [],
    attributes: {},
    ...overrides,
  };
}

function createMockContext(overrides: Partial<CommandContext<QwenMarkdownConfig>> = {}): CommandContext<QwenMarkdownConfig> {
  return {
    entity: createMockNode(),
    bbox: { x1: 0, y1: 0, x2: 100, y2: 100 },
    pageNumber: 1,
    documentId: 'doc-123',
    imageUrl: 'https://example.com/image.png',
    config: {
      model: 'qwen/qwen3-vl-235b-a22b-instruct',
      promptStyle: 'table',
      apiEndpoint: '/api/transform/entity-to-markdown',
    },
    log: vi.fn(),
    ...overrides,
  };
}

describe('qwenMarkdownPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('plugin structure', () => {
    it('has correct metadata', () => {
      expect(qwenMarkdownPlugin.name).toBe('qwen-markdown');
      expect(qwenMarkdownPlugin.version).toBe('1.0.0');
      expect(qwenMarkdownPlugin.defaultEnabled).toBe(true);
    });

    it('exports three commands', () => {
      expect(qwenMarkdownPlugin.commands).toHaveLength(3);
      expect(qwenMarkdownPlugin.commands?.map(c => c.id)).toEqual([
        'extract-markdown',
        'extract-page-markdown',
        'extract-json',
      ]);
    });

    it('extract-markdown has Ctrl+M shortcut', () => {
      const cmd = qwenMarkdownPlugin.commands?.find(c => c.id === 'extract-markdown');
      expect(cmd?.shortcut).toBe('Ctrl+M');
    });
  });

  describe('extract-markdown command', () => {
    const getCommand = () => qwenMarkdownPlugin.commands!.find(c => c.id === 'extract-markdown')!;

    it('returns error when no imageUrl provided', async () => {
      const ctx = createMockContext({ imageUrl: undefined });
      const result = await getCommand().handler(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No image URL provided');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('calls API with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          markdown: '| A | B |\n|---|---|\n| 1 | 2 |',
          model: 'qwen/qwen3-vl-235b-a22b-instruct',
          tokens: { input: 100, output: 50 },
        }),
      });

      const ctx = createMockContext({
        imageUrl: 'https://storage.googleapis.com/okrapdf/test.png',
        config: {
          model: 'qwen/qwen3-vl-235b-a22b-instruct',
          promptStyle: 'table',
          apiEndpoint: '/api/transform/entity-to-markdown',
        },
      });

      await getCommand().handler(ctx);

      expect(mockFetch).toHaveBeenCalledWith('/api/transform/entity-to-markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: 'https://storage.googleapis.com/okrapdf/test.png',
          model: 'qwen/qwen3-vl-235b-a22b-instruct',
          promptStyle: 'table',
          entityType: 'table',
        }),
      });
    });

    it('returns markdown content on success', async () => {
      const markdownContent = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          markdown: markdownContent,
          model: 'qwen/qwen3-vl-235b-a22b-instruct',
          tokens: { input: 100, output: 50 },
        }),
      });

      const ctx = createMockContext();
      const result = await getCommand().handler(ctx);

      expect(result.success).toBe(true);
      expect(result.content).toBe(markdownContent);
      expect(result.format).toBe('markdown');
      expect(result.metadata).toEqual({
        model: 'qwen/qwen3-vl-235b-a22b-instruct',
        tokens: { input: 100, output: 50 },
      });
    });

    it('handles API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      });

      const ctx = createMockContext();
      const result = await getCommand().handler(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error: 500 - Internal server error');
    });

    it('handles API returning success: false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: 'File not found: gs://okrapdf/test.pdf',
        }),
      });

      const ctx = createMockContext();
      const result = await getCommand().handler(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found: gs://okrapdf/test.pdf');
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const ctx = createMockContext();
      const result = await getCommand().handler(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    });

    it('handles non-Error exceptions', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      const ctx = createMockContext();
      const result = await getCommand().handler(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('extract-page-markdown command', () => {
    const getCommand = () => qwenMarkdownPlugin.commands!.find(c => c.id === 'extract-page-markdown')!;

    it('calls API with page promptStyle', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          markdown: '# Page Title\n\nParagraph text...',
        }),
      });

      const ctx = createMockContext();
      await getCommand().handler(ctx);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"promptStyle":"page"'),
        })
      );
    });

    it('returns markdown format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          markdown: '# Page Title',
        }),
      });

      const ctx = createMockContext();
      const result = await getCommand().handler(ctx);

      expect(result.format).toBe('markdown');
    });
  });

  describe('extract-json command', () => {
    const getCommand = () => qwenMarkdownPlugin.commands!.find(c => c.id === 'extract-json')!;

    it('calls API with json promptStyle', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          markdown: '{"headers": ["A", "B"], "rows": [["1", "2"]]}',
        }),
      });

      const ctx = createMockContext();
      await getCommand().handler(ctx);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"promptStyle":"json"'),
        })
      );
    });

    it('returns json format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          markdown: '{"headers": ["A"], "rows": []}',
        }),
      });

      const ctx = createMockContext();
      const result = await getCommand().handler(ctx);

      expect(result.format).toBe('json');
    });

    it('only appears in table contexts', () => {
      const cmd = getCommand();
      expect(cmd.contexts).toEqual(['table']);
    });
  });

  describe('command contexts', () => {
    it('extract-markdown available for table, figure, ocr-block, and all', () => {
      const cmd = qwenMarkdownPlugin.commands!.find(c => c.id === 'extract-markdown');
      expect(cmd?.contexts).toEqual(['table', 'figure', 'ocr-block', 'all']);
    });

    it('extract-page-markdown available for all contexts', () => {
      const cmd = qwenMarkdownPlugin.commands!.find(c => c.id === 'extract-page-markdown');
      expect(cmd?.contexts).toEqual(['all']);
    });
  });
});

describe('entity type to promptStyle mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, markdown: 'test' }),
    });
  });

  it('table entity uses table promptStyle', async () => {
    const ctx = createMockContext({
      entity: createMockNode({ type: 'table' }),
    });
    const cmd = qwenMarkdownPlugin.commands!.find(c => c.id === 'extract-markdown')!;
    await cmd.handler(ctx);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"promptStyle":"table"'),
      })
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"entityType":"table"'),
      })
    );
  });

  it('figure entity uses page promptStyle', async () => {
    const ctx = createMockContext({
      entity: createMockNode({ type: 'figure' }),
    });
    const cmd = qwenMarkdownPlugin.commands!.find(c => c.id === 'extract-markdown')!;
    await cmd.handler(ctx);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"promptStyle":"page"'),
      })
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"entityType":"figure"'),
      })
    );
  });

  it('ocr-block entity uses page promptStyle', async () => {
    const ctx = createMockContext({
      entity: createMockNode({ type: 'ocr-block' }),
    });
    const cmd = qwenMarkdownPlugin.commands!.find(c => c.id === 'extract-markdown')!;
    await cmd.handler(ctx);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"promptStyle":"page"'),
      })
    );
  });
});

describe('transform API gs:// URL handling (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plugin sends gs:// URL to API which converts to signed URL', async () => {
    // Simulate what happens when a gs:// URL is passed
    // The API should convert it to a signed HTTPS URL before calling VLM
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        markdown: '| Table data |',
      }),
    });

    const ctx = createMockContext({
      // This gs:// URL would have been passed from the inspector
      imageUrl: 'gs://okrapdf/inbox/ocr-123/page.pdf#page=1',
    });

    const cmd = qwenMarkdownPlugin.commands!.find(c => c.id === 'extract-markdown')!;
    await cmd.handler(ctx);

    // Plugin sends the URL as-is - API is responsible for conversion
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('gs://okrapdf/inbox/ocr-123/page.pdf#page=1'),
      })
    );
  });

  it('API returns error for non-existent gs:// file', async () => {
    // Simulate API returning 400 for file not found
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: false,
        error: 'File not found: gs://okrapdf/nonexistent.pdf',
      }),
    });

    const ctx = createMockContext({
      imageUrl: 'gs://okrapdf/nonexistent.pdf',
    });

    const cmd = qwenMarkdownPlugin.commands!.find(c => c.id === 'extract-markdown')!;
    const result = await cmd.handler(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
  });
});
