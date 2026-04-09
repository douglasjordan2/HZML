export interface RenderContext {
  toggleRegistry: ToggleRegistry;
  deferredRegistry: DeferredRegistry;
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
