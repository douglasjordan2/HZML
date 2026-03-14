export interface RenderContext {
  toggleRegistry: ToggleRegistry;
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
