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
  BBox,
  NormalizedBBox,
  VdomLifecycleEvent,
  VdomReadyStateValue,
  EntityType,
  VdomNode,
  ConfigFieldType,
  ConfigField,
  PluginConfigSchema,
  ViewControlType,
  ViewControlSchema,
  EntityOverlay,
  NodeBadge,
  Annotation,
  PluginEmitType,
  PluginEmitData,
  QueryEngine,
  EmitFunction,
  PluginContext,
  PluginResult,
  VdomPlugin,
  PluginManagerEvent,
  PluginManagerEventData,
  IPluginManager,
  EntityContextType,
  CommandOutputFormat,
  CommandContext,
  CommandResult,
  PluginCommand,
  ResolvedCommand,
} from './types';

export {
  VdomReadyState,
  isVdomPlugin,
  isPluginResult,
  isPluginCommand,
  isCommandResult,
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

export {
  qwenMarkdownPlugin,
  qwenMarkdownConfigSchema,
  type QwenMarkdownConfig,
} from './plugins/qwen-markdown';

export {
  ocrClassifierPlugin,
  ocrClassifierConfigSchema,
  type OcrClassifierConfig,
  type EntityCreationPayload,
} from './plugins/ocr-classifier';

export {
  coordTableDetectorPlugin,
  coordTableDetectorConfigSchema,
  coordTableDetectorViewControls,
  type CoordTableDetectorConfig,
  type CoordTableDetectorStats,
  type DetectedTable,
} from './plugins/coord-table-detector';

// =============================================================================
// Plugin Registry - Default plugins array
// =============================================================================
import { orphanDetectorPlugin } from './plugins/orphan-detector';
import { qwenMarkdownPlugin } from './plugins/qwen-markdown';
import { ocrClassifierPlugin } from './plugins/ocr-classifier';
import { coordTableDetectorPlugin } from './plugins/coord-table-detector';
import type { VdomPlugin } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defaultPlugins: VdomPlugin<any>[] = [
  orphanDetectorPlugin,
  qwenMarkdownPlugin,
  ocrClassifierPlugin,
  coordTableDetectorPlugin,
];
