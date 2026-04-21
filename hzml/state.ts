import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseAdapter } from "./db";

export interface RenderContext {
  toggleRegistry: ToggleRegistry;
  deferredRegistry: DeferredRegistry;
  db?: DatabaseAdapter;
}

export const renderStorage = new AsyncLocalStorage<RenderContext>();

export function createQueryCache(underlying: DatabaseAdapter): DatabaseAdapter {
  const cache = new Map<string, unknown>();

  const key = (sql: string, params?: unknown[]) =>
    sql + '\0' + JSON.stringify(params ?? []);

  return {
    query(sql, params) {
      const k = key(sql, params as unknown[]);
      if (cache.has(k)) return cache.get(k) as never;
      const result = underlying.query(sql, params);
      cache.set(k, result);
      return result;
    },
    run(sql, params) {
      cache.clear();
      return underlying.run(sql, params);
    },
    close() {},
  };
}

interface ToggleEntry {
  id: string;
  type: 'checkbox' | 'radio';
  name?: string;
  checked?: boolean;
}

interface ToggleRegistry {
  register(id: string, name?: string, checked?: boolean): void;
  emit(): string;
}

interface DeferredEntry {
  id: number;
  promise: Promise<unknown>;
  render: (data: unknown) => string;
}

interface DeferredRegistry {
  register(id: number, promise: Promise<unknown>, render: (data: unknown) => string): void;
  entries(): DeferredEntry[];
  hasEntries(): boolean;
}

export function createDeferredRegistry(): DeferredRegistry {
  const items: DeferredEntry[] = [];

  return {
    register(id, promise, render) {
      items.push({ id, promise, render });
    },
    entries() {
      return items;
    },
    hasEntries() {
      return items.length > 0;
    },
  };
}

export function createToggleRegistry(): ToggleRegistry {
  const entries = new Map<string, ToggleEntry>();

  return {
    register(id: string, name?: string, checked?: boolean) {
      const existing = entries.get(id);
      if (existing) {
        if (checked && !existing.checked) {
          existing.checked = true;
        }
        return;
      }
      entries.set(id, {
        id,
        type: name ? 'radio' : 'checkbox',
        name,
        checked,
      });
    },

    emit(): string {
      return [...entries.values()]
        .map(e => {
          let s = `<input type="${e.type}" id="${e.id}"`;
          if (e.name) s += ` name="${e.name}"`;
          if (e.checked) s += ` checked`;
          s += ` hidden>`;
          return s;
        })
        .join('\n');
    },
  };
}
