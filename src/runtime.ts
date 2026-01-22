import type {
  VdomPlugin,
  VdomLifecycleEvent,
  PluginContext,
  PluginResult,
  PluginManagerEvent,
  PluginManagerEventData,
  IPluginManager,
  PluginEmitType,
  PluginEmitData,
} from './types';
import { VdomReadyState, type VdomReadyStateValue } from './types';

type HandlerFn<E extends PluginManagerEvent> = (data: PluginManagerEventData[E]) => void;

export class VdomPluginManager implements IPluginManager {
  private plugins = new Map<string, VdomPlugin>();
  private enabledPlugins = new Set<string>();
  private pluginConfigs = new Map<string, Record<string, unknown>>();
  private listeners = new Map<PluginManagerEvent, Set<HandlerFn<PluginManagerEvent>>>();
  private _readyState: VdomReadyStateValue = VdomReadyState.LOADING;

  get readyState(): VdomReadyStateValue {
    return this._readyState;
  }

  setReadyState(state: VdomReadyStateValue): void {
    this._readyState = state;
  }

  register(plugin: VdomPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    this.plugins.set(plugin.name, plugin);

    if (plugin.configSchema) {
      const defaultConfig: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(plugin.configSchema)) {
        defaultConfig[key] = field.default;
      }
      this.pluginConfigs.set(plugin.name, defaultConfig);
    }

    if (plugin.defaultEnabled) {
      this.enabledPlugins.add(plugin.name);
    }

    this.emit('plugin:registered', { name: plugin.name });
  }

  unregister(name: string): void {
    const plugin = this.plugins.get(name);
    if (plugin?.cleanup) {
      plugin.cleanup();
    }

    this.plugins.delete(name);
    this.enabledPlugins.delete(name);
    this.pluginConfigs.delete(name);

    this.emit('plugin:unregistered', { name });
  }

  enable(name: string): void {
    if (!this.plugins.has(name)) {
      throw new Error(`Plugin "${name}" is not registered`);
    }
    this.enabledPlugins.add(name);
    this.emit('plugin:enabled', { name });
  }

  disable(name: string): void {
    this.enabledPlugins.delete(name);
    this.emit('plugin:disabled', { name });
  }

  isEnabled(name: string): boolean {
    return this.enabledPlugins.has(name);
  }

  setConfig(name: string, config: Record<string, unknown>): void {
    if (!this.plugins.has(name)) {
      throw new Error(`Plugin "${name}" is not registered`);
    }
    const existing = this.pluginConfigs.get(name) || {};
    this.pluginConfigs.set(name, { ...existing, ...config });
    this.emit('plugin:configChanged', { name, config: this.pluginConfigs.get(name)! });
  }

  getConfig(name: string): Record<string, unknown> {
    return this.pluginConfigs.get(name) || {};
  }

  getPlugins(): VdomPlugin[] {
    return Array.from(this.plugins.values());
  }

  getPlugin(name: string): VdomPlugin | undefined {
    return this.plugins.get(name);
  }

  getEnabledPlugins(): string[] {
    return Array.from(this.enabledPlugins);
  }

  async runEvent(
    event: VdomLifecycleEvent,
    context: Omit<PluginContext, 'event' | 'config' | 'emit' | 'log'>
  ): Promise<Map<string, PluginResult>> {
    const results = new Map<string, PluginResult>();
    const pluginsToRun = this.getPluginsForEvent(event);

    for (const plugin of pluginsToRun) {
      if (!this.enabledPlugins.has(plugin.name)) continue;

      this.emit('plugin:started', { name: plugin.name, event });
      const startTime = performance.now();

      const ctx: PluginContext = {
        ...context,
        event,
        config: this.pluginConfigs.get(plugin.name) || {},
        emit: <T extends PluginEmitType>(type: T, data: PluginEmitData[T]) => {
          this.emit('lifecycle:emit', { pluginName: plugin.name, type, data });
        },
        log: (level, message) => {
          if (level === 'error') {
            console.error(`[${plugin.name}] ${message}`);
          }
        },
      };

      try {
        const result = await plugin.handler(ctx);
        results.set(plugin.name, result);

        const duration = performance.now() - startTime;
        this.emit('plugin:completed', { name: plugin.name, result, duration });
      } catch (error) {
        const result: PluginResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        results.set(plugin.name, result);
        this.emit('plugin:error', { name: plugin.name, error: error as Error });
      }
    }

    return results;
  }

  private getPluginsForEvent(event: VdomLifecycleEvent): VdomPlugin[] {
    const plugins: VdomPlugin[] = [];
    const resolved = new Set<string>();

    const resolve = (name: string) => {
      if (resolved.has(name)) return;

      const plugin = this.plugins.get(name);
      if (!plugin) return;

      if (plugin.dependencies) {
        for (const dep of plugin.dependencies) {
          resolve(dep);
        }
      }

      if (plugin.runsOn.includes(event)) {
        plugins.push(plugin);
      }
      resolved.add(name);
    };

    for (const name of this.plugins.keys()) {
      resolve(name);
    }

    return plugins;
  }

  on<E extends PluginManagerEvent>(
    event: E,
    handler: (data: PluginManagerEventData[E]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as HandlerFn<PluginManagerEvent>);

    return () => {
      this.listeners.get(event)?.delete(handler as HandlerFn<PluginManagerEvent>);
    };
  }

  emit<E extends PluginManagerEvent>(event: E, data: PluginManagerEventData[E]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (e) {
          console.error(`Error in event handler for ${event}:`, e);
        }
      }
    }
  }

  clear(): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.cleanup) {
        plugin.cleanup();
      }
    }
    this.plugins.clear();
    this.enabledPlugins.clear();
    this.pluginConfigs.clear();
    this.listeners.clear();
  }
}

export const pluginManager = new VdomPluginManager();
