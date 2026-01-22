/**
 * @okrapdf/vdom-plugins
 *
 * Chrome Extension-like plugin architecture for VDOM document analysis.
 * Plugins declare capabilities via manifest, host renders UI dynamically.
 */

// =============================================================================
// Types - Plugin API surface
// =============================================================================
export type {
  // Bounding boxes
  BBox,
  NormalizedBBox,
  // Lifecycle
  VdomLifecycleEvent,
  VdomReadyStateValue,
  // Plugin nodes
  VdomNode,
  // Config schema
  ConfigFieldType,
  ConfigField,
  PluginConfigSchema,
  // View controls (Chrome action API equivalent)
  ViewControlType,
  ViewControlSchema,
  // Emit types
  EntityOverlay,
  NodeBadge,
  Annotation,
  PluginEmitType,
  PluginEmitData,
  // Context & Result
  QueryEngine,
  EmitFunction,
  PluginContext,
  PluginResult,
  // Plugin interface
  VdomPlugin,
  // Manager types
  PluginManagerEvent,
  PluginManagerEventData,
  IPluginManager,
} from './types';

export {
  VdomReadyState,
  isVdomPlugin,
  isPluginResult,
  validatePluginConfig,
} from './types';

// =============================================================================
// Runtime - Plugin manager
// =============================================================================
export { VdomPluginManager, pluginManager } from './runtime';

// =============================================================================
// Utilities
// =============================================================================
export { overlapRatio, bboxContains } from './utils';

// =============================================================================
// Built-in Plugins
// =============================================================================
export {
  orphanDetectorPlugin,
  orphanDetectorConfigSchema,
  orphanDetectorViewControls,
  type OrphanDetectorConfig,
  type OrphanDetectorStats,
} from './plugins/orphan-detector';

// =============================================================================
// Plugin Registry - Default plugins array
// =============================================================================
import { orphanDetectorPlugin } from './plugins/orphan-detector';
import type { VdomPlugin } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defaultPlugins: VdomPlugin<any>[] = [
  orphanDetectorPlugin,
];
