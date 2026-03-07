export interface RenderContext {
  toggleRegistry: ToggleRegistry;
  dispatchRegistry: DispatchRegistry;
  nextDid: () => string;
}

interface DispatchTransform {
  did: string;
  source: string;
}

interface DispatchChannel {
  transforms: DispatchTransform[];
  initialValue: string | null;
}

interface ManualHandler {
  name: string;
  source: string;
}

export interface DispatchRegistry {
  registerTransform(channel: string, did: string, transformSource: string): void;
  registerInitialValue(channel: string, value: string): void;
  registerManual(name: string, callbackSource: string): void;
  emit(): string;
}

export function createDidCounter(): () => string {
  let counter = 0;
  return () => 'd' + (counter++);
}

export function createDispatchRegistry(): DispatchRegistry {
  const channels = new Map<string, DispatchChannel>();
  const manualHandlers = new Map<string, ManualHandler>();

  function getChannel(name: string): DispatchChannel {
    let ch = channels.get(name);
    if (!ch) {
      ch = { transforms: [], initialValue: null };
      channels.set(name, ch);
    }
    return ch;
  }

  return {
    registerTransform(channel: string, did: string, transformSource: string) {
      getChannel(channel).transforms.push({ did, source: transformSource });
    },

    registerInitialValue(channel: string, value: string) {
      const ch = getChannel(channel);
      if (ch.initialValue === null) ch.initialValue = value;
    },

    registerManual(name: string, callbackSource: string) {
      if (manualHandlers.has(name)) return;
      manualHandlers.set(name, { name, source: callbackSource });
    },

    emit(): string {
      const parts: string[] = [];

      if (channels.size > 0) {
        const lines: string[] = [];
        lines.push('(function(){');
        lines.push('var _t={');
        for (const [, ch] of channels) {
          for (const t of ch.transforms) {
            lines.push(`${t.did}:${t.source},`);
          }
        }
        lines.push('};');
        lines.push("function _noop(k,v){return'/noop.html?'+v+'#'+k+'='+v}");
        lines.push("function _up(name,value){");
        lines.push("document.querySelectorAll('[data-dispatched=\"'+name+'\"]').forEach(function(el){");
        lines.push("if(el.tagName==='INPUT')el.value=value;else el.textContent=value;");
        lines.push("});");
        lines.push("document.querySelectorAll('[data-dispatcher=\"'+name+'\"]').forEach(function(el){");
        lines.push("var fn=_t[el.dataset.did];");
        lines.push("if(fn)el.href=_noop(name,fn(value));");
        lines.push("});");
        lines.push("}");

        for (const [name, ch] of channels) {
          if (ch.transforms.length > 0) {
            lines.push(`hzml.on(${JSON.stringify(name)},function(v){_up(${JSON.stringify(name)},v)});`);
            if (ch.initialValue !== null) {
              lines.push(`_up(${JSON.stringify(name)},${JSON.stringify(ch.initialValue)});`);
            }
          }
        }

        lines.push('})();');
        parts.push('<script>' + lines.join('') + '</script>');
      }

      if (manualHandlers.size > 0) {
        parts.push('<script>' +
          [...manualHandlers.values()]
            .map(e => `hzml.on(${JSON.stringify(e.name)},${e.source});`)
            .join('') +
          '</script>');
      }

      return parts.join('');
    },
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
