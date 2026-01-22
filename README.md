# @okrapdf/vdom-plugins

Chrome Extension-like plugin architecture for VDOM document analysis. Plugins declare capabilities via manifest, host renders UI dynamically.

## Installation

```bash
npm install @okrapdf/vdom-plugins
# or
pnpm add @okrapdf/vdom-plugins
```

## Quick Start

```typescript
import { 
  pluginManager, 
  orphanDetectorPlugin,
  type VdomPlugin 
} from '@okrapdf/vdom-plugins';

// Register built-in plugin
pluginManager.register(orphanDetectorPlugin);

// Enable it
pluginManager.enable('orphan-detector');

// Run on lifecycle event
const results = await pluginManager.runEvent('interactive', {
  document: {
    id: 'doc-123',
    getAllNodes: () => nodes,
    getNode: (id) => nodes.find(n => n.id === id),
    pages: [nodes],
  },
  $: queryEngine,
});
```

## Architecture

### Plugin Interface

Plugins follow a manifest-based pattern inspired by Chrome Extensions:

```typescript
interface VdomPlugin<TConfig = Record<string, unknown>> {
  name: string;
  description: string;
  version?: string;
  runsOn: VdomLifecycleEvent[];           // When to trigger
  handler: (ctx: PluginContext<TConfig>) => PluginResult | Promise<PluginResult>;
  configSchema?: PluginConfigSchema;       // User-configurable options
  viewControls?: ViewControlSchema[];      // UI controls (toggles, filters)
  defaultEnabled?: boolean;
  cleanup?: () => void | Promise<void>;
  dependencies?: string[];                 // Other plugins this depends on
}
```

### Lifecycle Events

Plugins declare which events they respond to:

- `loading` - Document loading started
- `ready` - DOM ready, basic structure available
- `interactive` - User can interact, OCR may still be running
- `complete` - All processing done
- `nodeAdded` / `nodeRemoved` / `nodeUpdated` - Node mutations
- `selectionChanged` - User selection changed
- `pageChanged` - Current page changed

### Plugin Context

Handlers receive a rich context object:

```typescript
interface PluginContext<TConfig> {
  document: {
    id: string;
    getAllNodes(): VdomNode[];
    getNode(id: string): VdomNode | undefined;
    pages: VdomNode[][];
  };
  $: QueryEngine;        // jQuery-like selector
  event: VdomLifecycleEvent;
  pageNumber?: number;
  node?: VdomNode;       // For node-specific events
  config: TConfig;       // User configuration
  emit: EmitFunction;    // Emit overlays, badges, annotations
  log: LogFunction;
}
```

### Emit Types

Plugins can emit visual decorations:

- **overlays** - Bounding box highlights on the PDF viewer
- **badges** - Labels attached to tree nodes
- **annotations** - Text annotations (highlight, underline, etc.)
- **stats** - Computed statistics for display

## Built-in Plugins

### Orphan Detector

Detects OCR blocks not covered by semantic entities (tables, figures, etc.).

```typescript
import { orphanDetectorPlugin } from '@okrapdf/vdom-plugins';

pluginManager.register(orphanDetectorPlugin);
pluginManager.setConfig('orphan-detector', {
  coverageThreshold: 0.5,  // 50% overlap required
  showOverlays: true,
  showBadges: true,
  badgeColor: 'orange',
});
```

## Creating Custom Plugins

```typescript
import type { VdomPlugin, PluginContext, PluginResult } from '@okrapdf/vdom-plugins';

interface MyConfig {
  threshold: number;
}

const myPlugin: VdomPlugin<MyConfig> = {
  name: 'my-plugin',
  description: 'Does something useful',
  version: '1.0.0',
  runsOn: ['complete'],
  defaultEnabled: false,
  
  configSchema: {
    threshold: {
      type: 'number',
      label: 'Threshold',
      default: 0.8,
      min: 0,
      max: 1,
    },
  },
  
  handler: async (ctx: PluginContext<MyConfig>): Promise<PluginResult> => {
    const { threshold } = ctx.config;
    const nodes = ctx.$('table').toArray();
    
    // Process nodes...
    
    ctx.emit('stats', { tablesFound: nodes.length });
    
    return { success: true };
  },
};
```

## API Reference

### VdomPluginManager

```typescript
class VdomPluginManager {
  register(plugin: VdomPlugin): void;
  unregister(name: string): void;
  enable(name: string): void;
  disable(name: string): void;
  isEnabled(name: string): boolean;
  setConfig(name: string, config: Record<string, unknown>): void;
  getConfig(name: string): Record<string, unknown>;
  getPlugins(): VdomPlugin[];
  getEnabledPlugins(): string[];
  runEvent(event, context): Promise<Map<string, PluginResult>>;
  on(event, handler): () => void;  // Returns unsubscribe function
}
```

### Utilities

```typescript
import { overlapRatio, bboxContains } from '@okrapdf/vdom-plugins';

// Calculate overlap between two bounding boxes (0-1)
const ratio = overlapRatio(bbox1, bbox2);

// Check if inner bbox is contained by outer (with threshold)
const contained = bboxContains(outer, inner, 0.5);
```

## License

MIT
