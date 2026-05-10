import type { DatabaseAdapter } from "./db";

export interface HzmlPlugin {
  name: string;
  setup: (ctx: PluginContext) => void | Promise<void>;
}

export interface PluginContext {
  readonly db: DatabaseAdapter | undefined;
  setDb: (db: DatabaseAdapter) => void;
  projectDir: string;
  extend: (key: string, value: unknown) => void;
  inject: (key: string, value: unknown) => void;
}

export interface FrameworkContext {
  db?: DatabaseAdapter;
  extensions: Record<string, unknown>;
  injections: Record<string, unknown>;
}

export async function resolvePlugins(
  plugins: HzmlPlugin[],
  initialDb: DatabaseAdapter | undefined,
  projectDir: string,
): Promise<{ db: DatabaseAdapter | undefined; extensions: Record<string, unknown>; injections: Record<string, unknown> }> {
  let db = initialDb;
  const extensions: Record<string, unknown> = {};
  const injections: Record<string, unknown> = {};

  for (const plugin of plugins) {
    const ctx: PluginContext = {
      get db() { return db; },
      setDb: (next) => { db = next; },
      projectDir,
      extend: (key, value) => { extensions[key] = value; },
      inject: (key, value) => { injections[key] = value; },
    };
    await plugin.setup(ctx);
  }

  return { db, extensions, injections };
}
