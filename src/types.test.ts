import { describe, it, expect } from 'vitest';
import {
  isPluginCommand,
  isCommandResult,
  isVdomPlugin,
  isPluginResult,
} from './types';

describe('type guards', () => {
  describe('isPluginCommand', () => {
    it('returns true for valid command', () => {
      const cmd = {
        id: 'test',
        title: 'Test',
        contexts: ['all'],
        outputFormat: 'markdown',
        handler: async () => ({ success: true }),
      };
      expect(isPluginCommand(cmd)).toBe(true);
    });

    it('returns false for missing id', () => {
      const cmd = {
        title: 'Test',
        contexts: ['all'],
        outputFormat: 'markdown',
        handler: async () => ({ success: true }),
      };
      expect(isPluginCommand(cmd)).toBe(false);
    });

    it('returns false for missing handler', () => {
      const cmd = {
        id: 'test',
        title: 'Test',
        contexts: ['all'],
        outputFormat: 'markdown',
      };
      expect(isPluginCommand(cmd)).toBe(false);
    });

    it('returns false for non-array contexts', () => {
      const cmd = {
        id: 'test',
        title: 'Test',
        contexts: 'all',
        outputFormat: 'markdown',
        handler: async () => ({ success: true }),
      };
      expect(isPluginCommand(cmd)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isPluginCommand(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isPluginCommand(undefined)).toBe(false);
    });
  });

  describe('isCommandResult', () => {
    it('returns true for success result', () => {
      expect(isCommandResult({ success: true })).toBe(true);
    });

    it('returns true for failure result', () => {
      expect(isCommandResult({ success: false, error: 'oops' })).toBe(true);
    });

    it('returns true for result with content', () => {
      expect(
        isCommandResult({ success: true, content: 'markdown', format: 'markdown' })
      ).toBe(true);
    });

    it('returns false for missing success', () => {
      expect(isCommandResult({ content: 'test' })).toBe(false);
    });

    it('returns false for null', () => {
      expect(isCommandResult(null)).toBe(false);
    });
  });

  describe('isVdomPlugin', () => {
    it('returns true for valid plugin', () => {
      const plugin = {
        name: 'test',
        description: 'Test plugin',
        runsOn: ['ready'],
        handler: async () => ({ success: true }),
      };
      expect(isVdomPlugin(plugin)).toBe(true);
    });

    it('returns true for plugin with commands', () => {
      const plugin = {
        name: 'test',
        description: 'Test plugin',
        runsOn: [],
        handler: async () => ({ success: true }),
        commands: [
          {
            id: 'cmd',
            title: 'Cmd',
            contexts: ['all'],
            outputFormat: 'markdown',
            handler: async () => ({ success: true }),
          },
        ],
      };
      expect(isVdomPlugin(plugin)).toBe(true);
    });

    it('returns false for missing name', () => {
      const plugin = {
        description: 'Test plugin',
        runsOn: ['ready'],
        handler: async () => ({ success: true }),
      };
      expect(isVdomPlugin(plugin)).toBe(false);
    });

    it('returns false for missing runsOn', () => {
      const plugin = {
        name: 'test',
        description: 'Test plugin',
        handler: async () => ({ success: true }),
      };
      expect(isVdomPlugin(plugin)).toBe(false);
    });
  });

  describe('isPluginResult', () => {
    it('returns true for success result', () => {
      expect(isPluginResult({ success: true })).toBe(true);
    });

    it('returns true for failure result', () => {
      expect(isPluginResult({ success: false, error: 'failed' })).toBe(true);
    });

    it('returns true for result with data', () => {
      expect(
        isPluginResult({
          success: true,
          data: { overlays: [], badges: [] },
        })
      ).toBe(true);
    });

    it('returns false for missing success', () => {
      expect(isPluginResult({ data: {} })).toBe(false);
    });
  });
});
