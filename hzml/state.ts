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
  onCallback: string | null;
}

interface ManualHandler {
  name: string;
  source: string;
}

export interface DispatchRegistry {
  registerTransform(channel: string, did: string, transformSource: string): void;
  registerInitialValue(channel: string, value: string): void;
  registerOn(channel: string, callbackSource: string): void;
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
      ch = { transforms: [], initialValue: null, onCallback: null };
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

    registerOn(channel: string, callbackSource: string) {
      const ch = getChannel(channel);
      if (ch.onCallback === null) ch.onCallback = callbackSource;
    },

    registerManual(name: string, callbackSource: string) {
      if (manualHandlers.has(name)) return;
      manualHandlers.set(name, { name, source: callbackSource });
    },

    emit(): string {
      const parts: string[] = [];

      if (channels.size > 0) {
        const hasTransforms = [...channels.values()].some(ch => ch.transforms.length > 0);
        const hasOnCallbacks = [...channels.values()].some(ch => ch.onCallback !== null);
        const lines: string[] = [];
        lines.push('(function(){');

        if (hasTransforms) {
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
        }

        if (hasOnCallbacks) {
          const stateEntries = [...channels.entries()]
            .filter(([, ch]) => ch.initialValue !== null)
            .map(([name, ch]) => `${JSON.stringify(name)}:${JSON.stringify(ch.initialValue)}`);
          lines.push(`var _state={${stateEntries.join(',')}};`);
          lines.push("function dispatch(name,value){");
          lines.push("document.querySelectorAll('[data-dispatched=\"'+name+'\"]').forEach(function(el){");
          lines.push("if(el.tagName==='INPUT')el.value=value;else el.textContent=value;");
          lines.push("});");
          lines.push("}");
        }

        for (const [name, ch] of channels) {
          if (ch.transforms.length > 0 || ch.onCallback) {
            const bodyParts: string[] = [];
            if (ch.onCallback) bodyParts.push(`_state[${JSON.stringify(name)}]=v`);
            if (ch.transforms.length > 0) bodyParts.push(`_up(${JSON.stringify(name)},v)`);
            if (ch.onCallback) {
              const chObj = `{name:${JSON.stringify(name)},forEach:function(fn){document.querySelectorAll('[data-dispatcher="${name}"]').forEach(fn)}}`;
              bodyParts.push(`(${ch.onCallback})(${chObj},v,_state)`);
            }
            lines.push(`hzml.on(${JSON.stringify(name)},function(v){${bodyParts.join(';')}});`);
            if (ch.initialValue !== null) {
              if (ch.transforms.length > 0) {
                lines.push(`_up(${JSON.stringify(name)},${JSON.stringify(ch.initialValue)});`);
              }
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
