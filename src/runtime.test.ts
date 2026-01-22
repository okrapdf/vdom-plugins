import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VdomPluginManager } from './runtime';
import type {
  VdomPlugin,
  VdomNode,
  PluginCommand,
  CommandContext,
  CommandResult,
  EntityContextType,
} from './types';

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

function createMockCommand(overrides: Partial<PluginCommand> = {}): PluginCommand {
  return {
    id: 'test-cmd',
    title: 'Test Command',
    contexts: ['all'] as EntityContextType[],
    outputFormat: 'markdown',
    handler: vi.fn().mockResolvedValue({ success: true, content: 'test' }),
    ...overrides,
  };
}

function createMockPlugin(overrides: Partial<VdomPlugin> = {}): VdomPlugin {
  return {
    name: 'test-plugin',
    description: 'Test plugin',
    runsOn: [],
    handler: vi.fn().mockResolvedValue({ success: true }),
    defaultEnabled: true,
    ...overrides,
  };
}

describe('VdomPluginManager - Commands', () => {
  let manager: VdomPluginManager;

  beforeEach(() => {
    manager = new VdomPluginManager();
  });

  describe('getCommandsForEntity', () => {
    it('returns empty array when no plugins registered', () => {
      const node = createMockNode();
      const commands = manager.getCommandsForEntity(node);
      expect(commands).toEqual([]);
    });

    it('returns empty array when plugin has no commands', () => {
      const plugin = createMockPlugin({ commands: undefined });
      manager.register(plugin);

      const node = createMockNode();
      const commands = manager.getCommandsForEntity(node);
      expect(commands).toEqual([]);
    });

    it('returns commands matching "all" context', () => {
      const cmd = createMockCommand({ contexts: ['all'] });
      const plugin = createMockPlugin({ commands: [cmd] });
      manager.register(plugin);

      const node = createMockNode({ type: 'figure' });
      const commands = manager.getCommandsForEntity(node);

      expect(commands).toHaveLength(1);
      expect(commands[0].id).toBe('test-cmd');
      expect(commands[0].pluginName).toBe('test-plugin');
    });

    it('returns commands matching specific entity type', () => {
      const tableCmd = createMockCommand({ id: 'table-cmd', contexts: ['table'] });
      const figureCmd = createMockCommand({ id: 'figure-cmd', contexts: ['figure'] });
      const plugin = createMockPlugin({ commands: [tableCmd, figureCmd] });
      manager.register(plugin);

      const tableNode = createMockNode({ type: 'table' });
      const commands = manager.getCommandsForEntity(tableNode);

      expect(commands).toHaveLength(1);
      expect(commands[0].id).toBe('table-cmd');
    });

    it('filters out commands from disabled plugins', () => {
      const cmd = createMockCommand();
      const plugin = createMockPlugin({ commands: [cmd], defaultEnabled: false });
      manager.register(plugin);

      const node = createMockNode();
      const commands = manager.getCommandsForEntity(node);
      expect(commands).toEqual([]);
    });

    it('respects static enabled=false on command', () => {
      const cmd = createMockCommand({ enabled: false });
      const plugin = createMockPlugin({ commands: [cmd] });
      manager.register(plugin);

      const node = createMockNode();
      const commands = manager.getCommandsForEntity(node);
      expect(commands).toEqual([]);
    });

    it('respects dynamic enabled function on command', () => {
      const cmd = createMockCommand({
        enabled: (entity) => entity.type === 'table',
      });
      const plugin = createMockPlugin({ commands: [cmd] });
      manager.register(plugin);

      const tableNode = createMockNode({ type: 'table' });
      const figureNode = createMockNode({ type: 'figure' });

      expect(manager.getCommandsForEntity(tableNode)).toHaveLength(1);
      expect(manager.getCommandsForEntity(figureNode)).toHaveLength(0);
    });

    it('respects static visible=false on command', () => {
      const cmd = createMockCommand({ visible: false });
      const plugin = createMockPlugin({ commands: [cmd] });
      manager.register(plugin);

      const node = createMockNode();
      const commands = manager.getCommandsForEntity(node);
      expect(commands).toEqual([]);
    });

    it('respects dynamic visible function on command', () => {
      const cmd = createMockCommand({
        visible: (entity) => entity.pageNumber === 1,
      });
      const plugin = createMockPlugin({ commands: [cmd] });
      manager.register(plugin);

      const page1Node = createMockNode({ pageNumber: 1 });
      const page2Node = createMockNode({ pageNumber: 2 });

      expect(manager.getCommandsForEntity(page1Node)).toHaveLength(1);
      expect(manager.getCommandsForEntity(page2Node)).toHaveLength(0);
    });

    it('aggregates commands from multiple enabled plugins', () => {
      const plugin1 = createMockPlugin({
        name: 'plugin-1',
        commands: [createMockCommand({ id: 'cmd-1' })],
      });
      const plugin2 = createMockPlugin({
        name: 'plugin-2',
        commands: [createMockCommand({ id: 'cmd-2' })],
      });
      manager.register(plugin1);
      manager.register(plugin2);

      const node = createMockNode();
      const commands = manager.getCommandsForEntity(node);

      expect(commands).toHaveLength(2);
      expect(commands.map((c) => c.id)).toContain('cmd-1');
      expect(commands.map((c) => c.id)).toContain('cmd-2');
    });
  });

  describe('executeCommand', () => {
    it('returns error when plugin not found', async () => {
      const node = createMockNode();
      const ctx: Omit<CommandContext, 'config' | 'log'> = {
        entity: node,
        bbox: node.bbox,
        pageNumber: node.pageNumber,
        documentId: 'doc-1',
      };

      const result = await manager.executeCommand('nonexistent', 'cmd', ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error when command not found', async () => {
      const plugin = createMockPlugin({ commands: [] });
      manager.register(plugin);

      const node = createMockNode();
      const ctx: Omit<CommandContext, 'config' | 'log'> = {
        entity: node,
        bbox: node.bbox,
        pageNumber: node.pageNumber,
        documentId: 'doc-1',
      };

      const result = await manager.executeCommand('test-plugin', 'nonexistent', ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error when plugin is disabled', async () => {
      const cmd = createMockCommand();
      const plugin = createMockPlugin({ commands: [cmd], defaultEnabled: false });
      manager.register(plugin);

      const node = createMockNode();
      const ctx: Omit<CommandContext, 'config' | 'log'> = {
        entity: node,
        bbox: node.bbox,
        pageNumber: node.pageNumber,
        documentId: 'doc-1',
      };

      const result = await manager.executeCommand('test-plugin', 'test-cmd', ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not enabled');
    });

    it('executes command handler and returns result', async () => {
      const handler = vi.fn().mockResolvedValue({
        success: true,
        content: '| A | B |\n|---|---|\n| 1 | 2 |',
        format: 'markdown',
      });
      const cmd = createMockCommand({ handler });
      const plugin = createMockPlugin({ commands: [cmd] });
      manager.register(plugin);

      const node = createMockNode();
      const ctx: Omit<CommandContext, 'config' | 'log'> = {
        entity: node,
        bbox: node.bbox,
        pageNumber: node.pageNumber,
        documentId: 'doc-1',
        imageUrl: 'https://example.com/image.png',
      };

      const result = await manager.executeCommand('test-plugin', 'test-cmd', ctx);

      expect(result.success).toBe(true);
      expect(result.content).toContain('| A | B |');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('passes plugin config to handler', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true });
      const cmd = createMockCommand({ handler });
      const plugin = createMockPlugin({ commands: [cmd] });
      manager.register(plugin);
      manager.setConfig('test-plugin', { model: 'gpt-4', temperature: 0.5 });

      const node = createMockNode();
      const ctx: Omit<CommandContext, 'config' | 'log'> = {
        entity: node,
        bbox: node.bbox,
        pageNumber: node.pageNumber,
        documentId: 'doc-1',
      };

      await manager.executeCommand('test-plugin', 'test-cmd', ctx);

      const callArg = handler.mock.calls[0][0] as CommandContext;
      expect(callArg.config).toEqual({ model: 'gpt-4', temperature: 0.5 });
    });

    it('catches handler errors and returns failure', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('API timeout'));
      const cmd = createMockCommand({ handler });
      const plugin = createMockPlugin({ commands: [cmd] });
      manager.register(plugin);

      const node = createMockNode();
      const ctx: Omit<CommandContext, 'config' | 'log'> = {
        entity: node,
        bbox: node.bbox,
        pageNumber: node.pageNumber,
        documentId: 'doc-1',
      };

      const result = await manager.executeCommand('test-plugin', 'test-cmd', ctx);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API timeout');
    });

    it('emits command:started event', async () => {
      const cmd = createMockCommand();
      const plugin = createMockPlugin({ commands: [cmd] });
      manager.register(plugin);

      const startedHandler = vi.fn();
      manager.on('command:started', startedHandler);

      const node = createMockNode();
      const ctx: Omit<CommandContext, 'config' | 'log'> = {
        entity: node,
        bbox: node.bbox,
        pageNumber: node.pageNumber,
        documentId: 'doc-1',
      };

      await manager.executeCommand('test-plugin', 'test-cmd', ctx);

      expect(startedHandler).toHaveBeenCalledWith({
        pluginName: 'test-plugin',
        commandId: 'test-cmd',
        entityId: 'node-1',
      });
    });

    it('emits command:completed event on success', async () => {
      const cmd = createMockCommand();
      const plugin = createMockPlugin({ commands: [cmd] });
      manager.register(plugin);

      const completedHandler = vi.fn();
      manager.on('command:completed', completedHandler);

      const node = createMockNode();
      const ctx: Omit<CommandContext, 'config' | 'log'> = {
        entity: node,
        bbox: node.bbox,
        pageNumber: node.pageNumber,
        documentId: 'doc-1',
      };

      await manager.executeCommand('test-plugin', 'test-cmd', ctx);

      expect(completedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginName: 'test-plugin',
          commandId: 'test-cmd',
          result: { success: true, content: 'test' },
        })
      );
      expect(completedHandler.mock.calls[0][0].duration).toBeGreaterThanOrEqual(0);
    });

    it('emits command:error event on failure', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Network error'));
      const cmd = createMockCommand({ handler });
      const plugin = createMockPlugin({ commands: [cmd] });
      manager.register(plugin);

      const errorHandler = vi.fn();
      manager.on('command:error', errorHandler);

      const node = createMockNode();
      const ctx: Omit<CommandContext, 'config' | 'log'> = {
        entity: node,
        bbox: node.bbox,
        pageNumber: node.pageNumber,
        documentId: 'doc-1',
      };

      await manager.executeCommand('test-plugin', 'test-cmd', ctx);

      expect(errorHandler).toHaveBeenCalledWith({
        pluginName: 'test-plugin',
        commandId: 'test-cmd',
        error: expect.any(Error),
      });
    });
  });

  describe('command contexts matching', () => {
    it.each([
      ['table', ['table'], true],
      ['table', ['figure'], false],
      ['table', ['table', 'figure'], true],
      ['table', ['all'], true],
      ['figure', ['all'], true],
      ['text', ['table', 'figure'], false],
      ['ocr-block', ['ocr-block', 'text'], true],
    ])(
      'entity type "%s" with contexts %j returns commands: %s',
      (entityType, contexts, shouldMatch) => {
        const cmd = createMockCommand({ contexts: contexts as EntityContextType[] });
        const plugin = createMockPlugin({ commands: [cmd] });
        manager.register(plugin);

        const node = createMockNode({ type: entityType });
        const commands = manager.getCommandsForEntity(node);

        expect(commands.length > 0).toBe(shouldMatch);
      }
    );

    it('ocr-block type matches ocr-block context (regression: inspector dropdown)', () => {
      const ocrClassifierCmd = createMockCommand({
        id: 'mark-as-paragraph',
        title: 'Mark as Paragraph',
        contexts: ['ocr-block'],
      });
      const plugin = createMockPlugin({
        name: 'ocr-classifier',
        commands: [ocrClassifierCmd],
      });
      manager.register(plugin);

      const correctNode = createMockNode({ type: 'ocr-block' });
      expect(manager.getCommandsForEntity(correctNode)).toHaveLength(1);

      const wrongTypeNode = createMockNode({ type: 'ocr' });
      expect(manager.getCommandsForEntity(wrongTypeNode)).toHaveLength(0);
    });
  });
});
