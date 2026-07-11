import { join, basename } from "path";
import { readdir, readFile } from "fs/promises";
import htm from "htm";
import { html, h as baseH, raw, escapeHtml, escapeChild, type HtmlChild, type PropValue } from "./render";
import { renderStorage, type RenderContext } from "./state";
import type { FrameworkContext } from "./plugin";
import { Deferred, isDeferred } from "./deferred";

const BUILT_IN_COMPONENTS = join(import.meta.dirname ?? import.meta.dir, "components");

type ComponentFn = (props: Record<string, unknown>, ctx?: RenderContext) => string;
type RouteHandler = (req: HzmlRequest) => Record<string, unknown> | Promise<Record<string, unknown>>;

interface HzmlRequest {
  method: string;
  headers: Headers;
  params: Record<string, string>;
  body?: Record<string, FormDataEntryValue>;
}

interface ParsedRoute {
  script: string;
  clientScript: string;
  loader: string;
  template: string;
}

export function parseRoute(source: string): ParsedRoute {
  const scriptMatch = source.match(/<server>([\s\S]*?)<\/server>/);
  const clientScriptMatch = source.match(/<script>([\s\S]*?)<\/script>/);
  const loaderMatch = source.match(/<loader>([\s\S]*?)<\/loader>/);
  const templateMatch = source.match(/<template>([\s\S]*?)<\/template>/);

  return {
    script: scriptMatch?.[1]?.trim() || "",
    clientScript: clientScriptMatch?.[1]?.trim() || "",
    loader: loaderMatch?.[1]?.trim() || "",
    template:  templateMatch?.[1]?.trim() || "",
  };
}

const JS_GLOBALS = new Set([
  'Boolean', 'Number', 'String', 'Array', 'Object', 'Math', 'Date', 'JSON',
  'undefined', 'null', 'true', 'false', 'Infinity', 'NaN',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
  'console', 'window', 'document', 'globalThis',
  'Map', 'Set', 'Promise', 'Symbol', 'RegExp', 'Error', 'TypeError',
]);

const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'finally',
  'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new',
  'return', 'static', 'super', 'switch', 'this', 'throw', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'yield',
]);

function extractTemplateVars(template: string): Set<string> {
  const vars = new Set<string>();
  const exprRe = /\$\{/g;
  let m;

  while ((m = exprRe.exec(template)) !== null) {
    let depth = 1;
    let i = m.index + 2;
    while (i < template.length && depth > 0) {
      if (template[i] === '{') depth++;
      else if (template[i] === '}') depth--;
      if (depth > 0) i++;
    }
    const expr = template.slice(m.index + 2, i);

    for (const id of expr.matchAll(/(?<!\.)(?<!')(?<!")([a-zA-Z_]\w*)/g)) {
      const name = id[1];
      if (!JS_GLOBALS.has(name) && !RESERVED.has(name)) {
        vars.add(name);
      }
    }
  }

  return vars;
}

export interface HzmlRouter {
  db?: import("./db").DatabaseAdapter;
  executeScript: (script: string, request: Request, params?: Record<string, string>, filePath?: string) => Promise<Record<string, unknown>>;
  renderTemplate: (template: string, data: Record<string, unknown>, ctx?: RenderContext) => string;
  loadComponents: (projectDir?: string) => Promise<void>;
  clearComponentCache: (name?: string) => void;
  clearRouteContext: (filePath?: string) => void;
  reloadComponent: (name: string, filePath: string) => Promise<void>;
}

interface RouteContext {
  getHandler: RouteHandler | null;
  postHandler: RouteHandler | null;
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as
  new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;

function transformImports(script: string): string {
  let counter = 0;
  const next = () => `__hz_imp_${counter++}`;

  let out = script.replace(
    /^[ \t]*import\s+(['"][^'"]+['"])\s*;?\s*$/gm,
    (_, source) => `await import(${source});`,
  );

  out = out.replace(
    /^[ \t]*import\s+(.+?)\s+from\s+(['"][^'"]+['"])\s*;?\s*$/gm,
    (_, raw, source) => {
      const binding = raw.trim();

      const ns = binding.match(/^\*\s+as\s+(\w+)$/);
      if (ns) return `const ${ns[1]} = await import(${source});`;

      const mixedNs = binding.match(/^(\w+)\s*,\s*\*\s+as\s+(\w+)$/);
      if (mixedNs) {
        const tmp = next();
        return `const ${tmp} = await import(${source}); const ${mixedNs[1]} = ${tmp}.default; const ${mixedNs[2]} = ${tmp};`;
      }

      const mixed = binding.match(/^(\w+)\s*,\s*\{([^}]+)\}$/);
      if (mixed) {
        const tmp = next();
        const named = mixed[2].replace(/(\w+)\s+as\s+(\w+)/g, "$1: $2");
        return `const ${tmp} = await import(${source}); const ${mixed[1]} = ${tmp}.default; const {${named}} = ${tmp};`;
      }

      const named = binding.match(/^\{([^}]+)\}$/);
      if (named) {
        const renamed = named[1].replace(/(\w+)\s+as\s+(\w+)/g, "$1: $2");
        return `const {${renamed}} = await import(${source});`;
      }

      if (/^\w+$/.test(binding)) {
        return `const ${binding} = (await import(${source})).default;`;
      }

      return `/* hzml: unparsed import "${binding}" */`;
    },
  );

  return out;
}

export function initRouter(frameworkCtx: FrameworkContext): HzmlRouter {
  const componentCache: Record<string, ComponentFn> = {};
  const routeContexts: Record<string, Promise<RouteContext>> = {};
  const templateFnCache = new Map<string, Function>();

  function clearComponentCache(name?: string) {
    templateFnCache.clear();
    if (name) {
      delete componentCache[name];
    } else {
      for (const k of Object.keys(componentCache)) delete componentCache[k];
    }
  }

  function clearRouteContext(filePath?: string) {
    templateFnCache.clear();
    if (filePath) {
      delete routeContexts[filePath];
    } else {
      for (const k of Object.keys(routeContexts)) delete routeContexts[k];
    }
  }

  function buildLoaderHzml() {
    const obj: Record<string, unknown> = { ...frameworkCtx.extensions };
    Object.defineProperty(obj, 'db', {
      enumerable: true,
      configurable: true,
      get: () => renderStorage.getStore()?.db ?? frameworkCtx.db,
    });
    return obj;
  }

  function buildComponentFn(parsed: ParsedRoute): ComponentFn {
    const templateVars = extractTemplateVars(parsed.template);
    const tmpl = parsed.template;
    const loaderCode = parsed.loader;

    return (props: Record<string, unknown>, ctx?: RenderContext) => {
      const data: Record<string, unknown> = {};

      for (const v of templateVars) {
        data[v] = undefined;
      }

      data.cls = undefined;

      Object.assign(data, props);

      if ("class" in data) {
        data.cls = data.class;
        delete data.class;
      }

      if (Array.isArray(data.children)) {
        const joined = (data.children as unknown[])
          .flat(Infinity)
          .filter((c: unknown) => c != null && typeof c !== "boolean")
          .join("");
        data.children = joined ? raw(joined) : "";
      }

      if (loaderCode) {
        const keys = Object.keys(data).filter(k => k !== 'hzml' && !RESERVED.has(k) && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k));
        const values = keys.map(k => data[k]);
        const hzml = buildLoaderHzml();
        const loaderFn = new Function('hzml', ...keys, `{\n${loaderCode}\n}`);
        const result = loaderFn(hzml, ...values);
        if (typeof result === "string") return result;
        if (typeof result === "object" && result !== null) Object.assign(data, result);
      }

      return renderTemplate(tmpl, data, ctx);
    };
  }

  async function loadFromDir(dir: string) {
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const file of entries) {
      if (!file.endsWith(".hzml")) continue;

      const name = basename(file, ".hzml");
      const source = await readFile(join(dir, file), "utf-8");
      const parsed = parseRoute(source);

      if (!parsed.template) continue;

      componentCache[name] = buildComponentFn(parsed);
    }
  }

  async function loadComponents(projectDir?: string): Promise<void> {
    if (Object.keys(componentCache).length > 0) return;

    await loadFromDir(BUILT_IN_COMPONENTS);

    if (projectDir) {
      await loadFromDir(join(projectDir, "components"));
    }

    componentCache['Dispatcher'] = (props: Record<string, unknown>) => {
      const to = props.to as string;
      const transform = props.transform as Function | undefined;
      const value = props.value as string | undefined;
      const then = props.then as string | undefined;
      const tag = (props.tag as string) || 'button';
      const children = Array.isArray(props.children)
        ? (props.children as unknown[]).flat(Infinity).filter(c => c != null && typeof c !== 'boolean').join('')
        : (props.children || '');
      const reserved = new Set(['to', 'value', 'transform', 'then', 'tag', 'children']);
      const attrs = Object.entries(props)
        .filter(([k]) => !reserved.has(k))
        .map(([k, v]) => ` ${k}="${escapeHtml(String(v))}"`)
        .join('');

      let onclick = '';
      if (transform) {
        onclick = `hzml.set('${to}',${transform.toString()})`;
      } else if (value !== undefined) {
        const escaped = String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        onclick = `hzml.set('${to}','${escaped}')`;
      }
      if (then) onclick += ';' + then;

      const onclickAttr = onclick ? ` onclick="${escapeHtml(onclick)}"` : '';
      const typeAttr = tag === 'button' ? ' type="button"' : '';
      return `<${tag}${typeAttr}${onclickAttr}${attrs}>${children}</${tag}>`;
    };

    componentCache['Dispatched'] = (props: Record<string, unknown>) => {
      const by = props.by as string;
      const tag = props.tag as string | undefined;
      const value = props.value == null ? '' : String(props.value);
      const name = props.name as string | undefined;
      const cls = (props.class as string) || '';
      const children = Array.isArray(props.children)
        ? (props.children as unknown[]).flat(Infinity).filter(c => c != null && typeof c !== 'boolean').join('')
        : (props.children || '');

      if (tag) {
        return `<${tag} data-d="${escapeHtml(by)}"${cls ? ` class="${escapeHtml(cls)}"` : ''}>${children || escapeHtml(value)}</${tag}>`;
      }
      return `<input data-d="${escapeHtml(by)}" value="${escapeHtml(value)}" name="${escapeHtml(name || by)}" type="hidden">`;
    };

    componentCache['Toggler'] = (props: Record<string, unknown>) => {
      const id = props.id as string;
      const on = props.on;
      const off = props.off;
      const tag = props.tag as string | undefined;
      const ontrue = (props.ontrue as string) || '';
      const onfalse = (props.onfalse as string) || '';
      const cls = (props.class as string) || '';
      const children = Array.isArray(props.children)
        ? (props.children as unknown[]).flat(Infinity).filter(c => c != null && typeof c !== 'boolean').join('')
        : (props.children || '');

      const dirAttr = on !== undefined ? ' data-toggle-dir="on"'
        : off !== undefined ? ' data-toggle-dir="off"'
        : '';

      if (tag) {
        const classes = [
          ...ontrue.split(' ').filter(Boolean).map(c => `group-has-[#${id}:checked]/root:${c}`),
          ...onfalse.split(' ').filter(Boolean),
          ...cls.split(' ').filter(Boolean),
        ].join(' ');
        return `<${tag} class="${classes}"><label for="${id}"${dirAttr} class="contents cursor-pointer">${children}</label></${tag}>`;
      }

      return `<label for="${id}"${dirAttr}${cls ? ` class="${cls}"` : ''}>${children}</label>`;
    };

    componentCache['Toggled'] = (props: Record<string, unknown>, ctx?: RenderContext) => {
      const id = props.id as string;
      const name = props.name as string | undefined;
      const checked = !!props.checked;
      const ontrue = (props.ontrue as string) || '';
      const onfalse = (props.onfalse as string) || '';
      const cls = ((props.class as string) || '');
      const tag = (props.tag as string) || 'div';
      const children = Array.isArray(props.children)
        ? (props.children as unknown[]).flat(Infinity).filter(c => c != null && typeof c !== 'boolean').join('')
        : (props.children || '');

      if (ctx) {
        ctx.toggleRegistry.register(id, name, checked);
      }

      const classes = [
        ...ontrue.split(' ').filter(Boolean).map(c => `group-has-[#${id}:checked]/root:${c}`),
        ...onfalse.split(' ').filter(Boolean),
        ...cls.split(' ').filter(Boolean),
      ].join(' ');

      return `<${tag} class="${classes}">${children}</${tag}>`;
    };

    componentCache['Suspense'] = (props: Record<string, unknown>, ctx?: RenderContext) => {
      const awaited = props.await;
      const fallback = (props.fallback as string) || '';
      const children = Array.isArray(props.children)
        ? (props.children as unknown[]).flat(Infinity).filter((c: unknown) => c != null && typeof c !== 'boolean')
        : [];
      const renderFn = children.find(c => typeof c === 'function') as
        ((data: unknown) => string) | undefined;

      if (!renderFn) return fallback;

      if (!isDeferred(awaited)) return renderFn(awaited);

      if (ctx?.deferredRegistry) {
        ctx.deferredRegistry.register(awaited.id, awaited.promise, renderFn);
      }
      return `<div id="__s:${awaited.id}">${fallback}</div>`;
    };
  }

  async function reloadComponent(name: string, filePath: string) {
    const source = await readFile(filePath, "utf-8");
    const parsed = parseRoute(source);

    if (!parsed.template) {
      delete componentCache[name];
      return;
    }

    componentCache[name] = buildComponentFn(parsed);
  }

  function getRouteContext(script: string, filePath: string): Promise<RouteContext> {
    if (routeContexts[filePath]) return routeContexts[filePath];

    routeContexts[filePath] = (async () => {
      let getHandler: RouteHandler | null = null;
      let postHandler: RouteHandler | null = null;

      const get = (fn: RouteHandler) => { getHandler = fn; };
      const post = (fn: RouteHandler) => { postHandler = fn; };
      const redirect = (url: string) => ({ __redirect: url });

      const transformed = transformImports(script);

      const defer = <T>(promise: Promise<T>) => new Deferred(promise);
      const hzml: Record<string, unknown> = { get, post, redirect, defer, ...frameworkCtx.extensions };
      Object.defineProperty(hzml, 'db', {
        enumerable: true,
        configurable: true,
        get: () => renderStorage.getStore()?.db ?? frameworkCtx.db,
      });

      const injectionKeys = Object.keys(frameworkCtx.injections).filter(k => !RESERVED.has(k) && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k));
      const injectionValues = injectionKeys.map(k => frameworkCtx.injections[k]);

      const register = new AsyncFunction("hzml", ...injectionKeys, transformed);
      await register(hzml, ...injectionValues);

      return { getHandler, postHandler };
    })();

    return routeContexts[filePath];
  }

  async function executeScript(
    script: string,
    request: Request,
    params: Record<string, string> = {},
    filePath: string = "",
  ): Promise<Record<string, unknown>> {
    const { getHandler, postHandler } = await getRouteContext(script, filePath);

    const method = request.method.toLowerCase();

    const req: HzmlRequest = { method, headers: request.headers, params };

    if (method === "post" && postHandler) {
      const formData = await request.formData();
      req.body = Object.fromEntries(formData);
      return await postHandler(req);
    }

    if (method === "get" && getHandler) return await getHandler(req);

    return {};
  }

  function renderTemplate(
    template: string,
    data: Record<string, unknown>,
    ctx?: RenderContext,
  ): string {
    if (!template) return "";

    const allData = { ...componentCache, ...frameworkCtx.injections, ...data };
    const keys = Object.keys(allData).filter(k =>
      k !== "html" && k !== "raw" && !RESERVED.has(k) && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k)
    );
    const values = keys.map(k => allData[k]);

    let htmlFn: (strings: TemplateStringsArray, ...vals: unknown[]) => string;

    if (ctx) {
      const ctxH = (type: string | ComponentFn, props: Record<string, PropValue> | null, ...children: HtmlChild[]): string => {
        if (typeof type === "function") {
          return raw(type({ ...props, children: children.flat() }, ctx));
        }
        return baseH(type, props, ...children);
      };
      const _ctxHtml = htm.bind(ctxH);
      htmlFn = (strings: TemplateStringsArray, ...vals: unknown[]): string => {
        const result = _ctxHtml(strings, ...vals);
        return raw(Array.isArray(result) ? result.flat(Infinity).map(escapeChild).join("") : result as string);
      };
    } else {
      htmlFn = html;
    }

    const cacheKey = template + "\0" + keys.join(",");
    let fn = templateFnCache.get(cacheKey);
    if (!fn) {
      fn = new Function("html", "raw", ...keys, "return html`" + template + "`");
      templateFnCache.set(cacheKey, fn);
    }
    return String(fn(htmlFn, raw, ...values));
  }

  return {
    db: frameworkCtx.db,
    executeScript,
    renderTemplate,
    loadComponents,
    clearComponentCache,
    clearRouteContext,
    reloadComponent,
  };
}
