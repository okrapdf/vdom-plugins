/**
 * VDOM Plugin System Types
 *
 * Chrome Extension-like plugin architecture for document analysis.
 * Plugins declare capabilities via manifest, host renders UI dynamically.
 */

// =============================================================================
// Bounding Box Types
// =============================================================================

export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface NormalizedBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// =============================================================================
// Lifecycle Events
// =============================================================================

export type VdomLifecycleEvent =
  | 'loading'
  | 'ready'
  | 'interactive'
  | 'complete'
  | 'nodeAdded'
  | 'nodeRemoved'
  | 'nodeUpdated'
  | 'selectionChanged'
  | 'pageChanged';

export const VdomReadyState = {
  LOADING: 'loading',
  INTERACTIVE: 'interactive',
  COMPLETE: 'complete',
} as const;

export type VdomReadyStateValue = typeof VdomReadyState[keyof typeof VdomReadyState];

// =============================================================================
// Entity Types (single source of truth - like Typebot's discriminated unions)
// =============================================================================

/**
 * All valid entity/node types in the VDOM system.
 * Used by both VdomNode.type and PluginCommand.contexts.
 * Adding a new entity type? Add it here and TypeScript will guide you.
 */
export type EntityType =
  | 'table'
  | 'figure'
  | 'text'
  | 'ocr-block'
  | 'header'
  | 'footer'
  | 'list'
  | 'page'
  | 'document'
  | 'paragraph'
  | 'heading'
  | 'footnote'
  | 'summary'
  | 'signature'
  | 'form';

// =============================================================================
// Plugin Node (minimal interface plugins operate on)
// =============================================================================

export interface VdomNode {
  id: string;
  type: EntityType | string; // EntityType preferred, string for extensibility
  bbox: BBox;
  pageNumber: number;
  textContent?: string | Promise<string>;
  _textContent?: string;
  classNames: string[];
  attributes: Record<string, unknown>;
  parent?: VdomNode | null;
  children?: VdomNode[];
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Plugin Configuration Schema (like Chrome's options_ui)
// =============================================================================

export type ConfigFieldType = 'string' | 'number' | 'boolean' | 'select' | 'color';

export interface ConfigField {
  type: ConfigFieldType;
  label: string;
  description?: string;
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: unknown }[];
  placeholder?: string;
}

export type PluginConfigSchema = Record<string, ConfigField>;

// =============================================================================
// View Controls (like Chrome's action API)
// =============================================================================

export type ViewControlType = 'toggle' | 'filter' | 'action';

export interface ViewControlSchema {
  type: ViewControlType;
  id: string;
  label: string;
  description?: string;
  defaultValue?: boolean;
  filterTarget?: 'overlays' | 'tree' | 'both';
  actionHandler?: string;
  labelTemplate?: string;
}

// =============================================================================
// Plugin Emit Types
// =============================================================================

export interface EntityOverlay {
  id: string;
  type: string;
  bbox: BBox | NormalizedBBox;
  page: number;
  style?: {
    border?: string;
    background?: string;
    opacity?: number;
  };
  label?: string;
  tooltip?: string;
}

export interface NodeBadge {
  nodeId: string;
  text: string;
  color: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';
  tooltip?: string;
}

export interface Annotation {
  nodeId: string;
  startOffset: number;
  endOffset: number;
  type: 'highlight' | 'underline' | 'strikethrough' | 'comment';
  color?: string;
  comment?: string;
}

export type PluginEmitType = 'overlays' | 'badges' | 'annotations' | 'stats' | 'error' | 'transformation';

export interface PluginEmitData {
  overlays: EntityOverlay[];
  badges: NodeBadge[];
  annotations: Annotation[];
  stats: Record<string, number | string>;
  error: { message: string; details?: unknown };
  transformation: { nodeId: string; format: CommandOutputFormat; content: string };
}

// =============================================================================
// Plugin Commands (Chrome contextMenus-inspired)
// =============================================================================

/**
 * Context types for command filtering. Derived from EntityType + special contexts.
 */
export type EntityContextType = EntityType | 'all' | 'selection';

/**
 * Output format for transformation commands.
 */
export type CommandOutputFormat = 'markdown' | 'html' | 'json' | 'text';

/**
 * Context passed to command handler during execution.
 */
export interface CommandContext<TConfig = Record<string, unknown>> {
  /** The selected entity/node */
  entity: VdomNode;

  /** Entity's image URL (for vision models) - populated by host */
  imageUrl?: string;

  /** Entity's bounding box */
  bbox: BBox;

  /** Page number (1-indexed) */
  pageNumber: number;

  /** Document ID */
  documentId: string;

  /** Plugin config */
  config: TConfig;

  /** Logging */
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
}

/**
 * Result returned by command handler.
 */
export interface CommandResult {
  success: boolean;
  /** The transformed content */
  content?: string;
  /** Output format */
  format?: CommandOutputFormat;
  /** Error if failed */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Command that appears in entity context menu (dropdown).
 * Like Chrome's chrome.contextMenus.create() properties.
 */
export interface PluginCommand<TConfig = Record<string, unknown>> {
  /** Unique command ID within plugin */
  id: string;

  /** Display text in dropdown. Use %s for entity title interpolation */
  title: string;

  /** Entity types this command appears for (like Chrome's ContextType) */
  contexts: EntityContextType[];

  /** Output format this command produces */
  outputFormat: CommandOutputFormat;

  /** Data getter name for node.data display (e.g., 'markdown' shows as markdown() in inspector) */
  dataGetter?: string;

  /** Icon for dropdown (optional) - icon name or URL */
  icon?: string;

  /** Keyboard shortcut (optional) e.g., "Ctrl+M" */
  shortcut?: string;

  /** Whether command is enabled (can be static or dynamic) */
  enabled?: boolean | ((entity: VdomNode) => boolean);

  /** Whether command is visible (can be static or dynamic) */
  visible?: boolean | ((entity: VdomNode) => boolean);

  /** The handler - called when user clicks this command */
  handler: (ctx: CommandContext<TConfig>) => Promise<CommandResult>;
}

/**
 * Command with plugin name attached (used by manager).
 */
export interface ResolvedCommand<TConfig = Record<string, unknown>> extends PluginCommand<TConfig> {
  /** Plugin that owns this command */
  pluginName: string;
}

// =============================================================================
// Plugin Context
// =============================================================================

export type QueryEngine = (selector: string) => {
  toArray(): VdomNode[];
  length: number;
  first(): VdomNode | undefined;
  filter(predicate: (node: VdomNode) => boolean): { toArray(): VdomNode[] };
};

export type EmitFunction = <T extends PluginEmitType>(
  type: T,
  data: PluginEmitData[T]
) => void;

export interface PluginContext<TConfig = Record<string, unknown>> {
  document: {
    id: string;
    getAllNodes(): VdomNode[];
    getNode(id: string): VdomNode | undefined;
    pages: VdomNode[][];
  };
  $: QueryEngine;
  event: VdomLifecycleEvent;
  pageNumber?: number;
  node?: VdomNode;
  config: TConfig;
  emit: EmitFunction;
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
}

// =============================================================================
// Plugin Result
// =============================================================================

export interface PluginResult {
  success: boolean;
  data?: {
    overlays?: EntityOverlay[];
    badges?: NodeBadge[];
    annotations?: Annotation[];
    stats?: Record<string, number | string>;
  };
  error?: string;
  errorDetails?: unknown;
}

// =============================================================================
// Plugin Interface (the manifest)
// =============================================================================

export interface VdomPlugin<TConfig = Record<string, unknown>> {
  name: string;
  description: string;
  version?: string;
  runsOn: VdomLifecycleEvent[];
  handler: (ctx: PluginContext<TConfig>) => PluginResult | Promise<PluginResult>;
  commands?: PluginCommand<TConfig>[];
  configSchema?: PluginConfigSchema;
  viewControls?: ViewControlSchema[];
  defaultEnabled?: boolean;
  cleanup?: () => void | Promise<void>;
  dependencies?: string[];
}

// =============================================================================
// Plugin Manager Types
// =============================================================================

export type PluginManagerEvent =
  | 'plugin:registered'
  | 'plugin:unregistered'
  | 'plugin:enabled'
  | 'plugin:disabled'
  | 'plugin:configChanged'
  | 'plugin:started'
  | 'plugin:completed'
  | 'plugin:error'
  | 'lifecycle:emit'
  | 'command:started'
  | 'command:completed'
  | 'command:error';

export interface PluginManagerEventData {
  'plugin:registered': { name: string };
  'plugin:unregistered': { name: string };
  'plugin:enabled': { name: string };
  'plugin:disabled': { name: string };
  'plugin:configChanged': { name: string; config: Record<string, unknown> };
  'plugin:started': { name: string; event: VdomLifecycleEvent };
  'plugin:completed': { name: string; result: PluginResult; duration: number };
  'plugin:error': { name: string; error: Error };
  'lifecycle:emit': { pluginName: string; type: PluginEmitType; data: unknown };
  'command:started': { pluginName: string; commandId: string; entityId: string };
  'command:completed': { pluginName: string; commandId: string; result: CommandResult; duration: number };
  'command:error': { pluginName: string; commandId: string; error: Error };
}

export interface IPluginManager {
  register(plugin: VdomPlugin): void;
  unregister(name: string): void;
  enable(name: string): void;
  disable(name: string): void;
  isEnabled(name: string): boolean;
  setConfig(name: string, config: Record<string, unknown>): void;
  getConfig(name: string): Record<string, unknown>;
  getPlugin(name: string): VdomPlugin | undefined;
  getPlugins(): VdomPlugin[];
  getEnabledPlugins(): string[];
  runEvent(
    event: VdomLifecycleEvent,
    context: Omit<PluginContext, 'event' | 'config' | 'emit' | 'log'>
  ): Promise<Map<string, PluginResult>>;
  getCommandsForEntity(entity: VdomNode): ResolvedCommand[];
  executeCommand(
    pluginName: string,
    commandId: string,
    context: Omit<CommandContext, 'config' | 'log'>
  ): Promise<CommandResult>;
  on<E extends PluginManagerEvent>(
    event: E,
    handler: (data: PluginManagerEventData[E]) => void
  ): () => void;
  emit<E extends PluginManagerEvent>(event: E, data: PluginManagerEventData[E]): void;
}

// =============================================================================
// Type Guards
// =============================================================================

export function isVdomPlugin(value: unknown): value is VdomPlugin {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    Array.isArray(obj.runsOn) &&
    typeof obj.handler === 'function'
  );
}

export function isPluginResult(value: unknown): value is PluginResult {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as Record<string, unknown>).success === 'boolean';
}

export function isPluginCommand(value: unknown): value is PluginCommand {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    Array.isArray(obj.contexts) &&
    typeof obj.outputFormat === 'string' &&
    typeof obj.handler === 'function'
  );
}

export function isCommandResult(value: unknown): value is CommandResult {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as Record<string, unknown>).success === 'boolean';
}

export function validatePluginConfig(
  config: Record<string, unknown>,
  schema: PluginConfigSchema
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const [key, field] of Object.entries(schema)) {
    const value = config[key] ?? field.default;
    if (value === undefined) {
      errors.push(`Missing required field: ${key}`);
      continue;
    }
    switch (field.type) {
      case 'number':
        if (typeof value !== 'number') {
          errors.push(`Field ${key} must be a number`);
        } else {
          if (field.min !== undefined && value < field.min) {
            errors.push(`Field ${key} must be >= ${field.min}`);
          }
          if (field.max !== undefined && value > field.max) {
            errors.push(`Field ${key} must be <= ${field.max}`);
          }
        }
        break;
      case 'string':
        if (typeof value !== 'string') errors.push(`Field ${key} must be a string`);
        break;
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`Field ${key} must be a boolean`);
        break;
      case 'select':
        if (field.options && !field.options.some((o) => o.value === value)) {
          errors.push(`Field ${key} must be one of: ${field.options.map((o) => o.value).join(', ')}`);
        }
        break;
    }
  }
  return { valid: errors.length === 0, errors };
}
