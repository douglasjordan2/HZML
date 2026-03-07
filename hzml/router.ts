import { join, basename } from "path";
import { readdir, readFile } from "fs/promises";
import htm from "htm";
import { html, h as baseH, type HtmlChild, type PropValue } from "./render";
import type { RenderContext } from "./state";
import type { DatabaseAdapter } from "./db";

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
  template: string;
}

export function parseRoute(source: string): ParsedRoute {
  const scriptMatch = source.match(/<server>([\s\S]*?)<\/server>/);
  const templateMatch = source.match(/<template>([\s\S]*?)<\/template>/);

  return {
    script: scriptMatch ? scriptMatch[1].trim() : "",
    template: templateMatch ? templateMatch[1].trim() : "",
  };
}

const componentCache: Record<string, ComponentFn> = {};

const JS_GLOBALS = new Set([
  'Boolean', 'Number', 'String', 'Array', 'Object', 'Math', 'Date', 'JSON',
  'undefined', 'null', 'true', 'false', 'Infinity', 'NaN',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
  'console', 'window', 'document', 'globalThis',
  'Map', 'Set', 'Promise', 'Symbol', 'RegExp', 'Error', 'TypeError',
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

    const templateVars = extractTemplateVars(parsed.template);

    const tmpl = parsed.template;

    componentCache[name] = (props: Record<string, unknown>, ctx?: RenderContext) => {
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
        data.children = (data.children as unknown[])
          .flat(Infinity)
          .filter((c: unknown) => c != null && typeof c !== "boolean")
          .join("");
      }

      return renderTemplate(tmpl, data, ctx);
    };
  }

}

export async function loadComponents(projectDir?: string): Promise<void> {
  if (Object.keys(componentCache).length > 0) return;

  await loadFromDir(BUILT_IN_COMPONENTS);

  if (projectDir) {
    await loadFromDir(join(projectDir, "components"));
  }

  componentCache['Dispatcher'] = (props: Record<string, unknown>, ctx?: RenderContext) => {
    const to = props.to as string;
    const transform = props.transform as Function | undefined;
    const value = props.value as string | undefined;
    const children = Array.isArray(props.children)
      ? (props.children as unknown[]).flat(Infinity).filter(c => c != null && typeof c !== 'boolean').join('')
      : (props.children || '');
    const reserved = new Set(['to', 'value', 'transform', 'children']);
    const attrs = Object.entries(props)
      .filter(([k]) => !reserved.has(k))
      .map(([k, v]) => k === 'class' ? ` class="${v}"` : ` ${k}="${v}"`)
      .join('');

    let did = '';
    if (transform && ctx) {
      did = ctx.nextDid();
      ctx.dispatchRegistry.registerTransform(to, did, transform.toString());
    }

    let href = '#';
    if (value !== undefined) {
      href = `/noop.html?${encodeURIComponent(value)}#${to}=${encodeURIComponent(value)}`;
    }

    const didAttr = did ? ` data-did="${did}"` : '';
    return `<a href="${href}" target="htmz" data-dispatcher="${to}"${didAttr}${attrs}>${children}</a>`;
  };

  componentCache['Dispatched'] = (props: Record<string, unknown>, ctx?: RenderContext) => {
    const by = props.by as string;
    const tag = props.tag as string | undefined;
    const value = props.value as string || '';
    const name = props.name as string | undefined;
    const cls = (props.class as string) || '';
    const children = Array.isArray(props.children)
      ? (props.children as unknown[]).flat(Infinity).filter(c => c != null && typeof c !== 'boolean').join('')
      : (props.children || '');

    if (ctx && value) {
      ctx.dispatchRegistry.registerInitialValue(by, value);
    }

    if (tag) {
      return `<${tag} data-dispatched="${by}"${cls ? ` class="${cls}"` : ''}>${children || value}</${tag}>`;
    }
    return `<input data-dispatched="${by}" value="${value}" name="${name || by}" type="hidden">`;
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

}

interface DispatchHandler {
  name: string;
  source: string;
}

interface RouteContext {
  getHandler: RouteHandler | null;
  postHandler: RouteHandler | null;
  onHandlers: DispatchHandler[];
}

const routeContexts: Record<string, RouteContext> = {};

function getRouteContext(script: string, filePath: string, db?: DatabaseAdapter): RouteContext {
  if (routeContexts[filePath]) return routeContexts[filePath];

  let getHandler: RouteHandler | null = null;
  let postHandler: RouteHandler | null = null;
  const onHandlers: DispatchHandler[] = [];

  const get = (fn: RouteHandler) => { getHandler = fn; };
  const post = (fn: RouteHandler) => { postHandler = fn; };
  const redirect = (url: string) => ({ __redirect: url });
  const on = (name: string, fn: Function) => { onHandlers.push({ name, source: fn.toString() }); };

  const clean = script.replace(/^import\s.*$/gm, "");

  const hzml = { get, post, redirect, db, on };
  const register = new Function("hzml", clean);
  register(hzml);

  const ctx = { getHandler, postHandler, onHandlers };
  routeContexts[filePath] = ctx;
  return ctx;
}

interface ScriptResult {
  data: Record<string, unknown>;
  onHandlers: DispatchHandler[];
}

export async function executeScript(
  script: string,
  request: Request,
  params: Record<string, string> = {},
  filePath: string = "",
  db?: DatabaseAdapter,
): Promise<ScriptResult> {
  const { getHandler, postHandler, onHandlers } = getRouteContext(script, filePath, db);

  const method = request.method.toLowerCase();

  const req: HzmlRequest = { method, headers: request.headers, params };

  if (method === "post" && postHandler) {
    const formData = await request.formData();
    req.body = Object.fromEntries(formData);
    return { data: await postHandler(req), onHandlers };
  }

  if (method === "get" && getHandler) return { data: await getHandler(req), onHandlers };

  return { data: {}, onHandlers };
}

const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'finally',
  'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new',
  'return', 'static', 'super', 'switch', 'this', 'throw', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'yield',
]);

export function renderTemplate(
  template: string,
  data: Record<string, unknown>,
  ctx?: RenderContext,
): string {
  if (!template) return "";

  const allData = { ...componentCache, ...data };
  const keys = Object.keys(allData).filter(k => !RESERVED.has(k) && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k));
  const values = keys.map(k => allData[k]);

  let htmlFn: (strings: TemplateStringsArray, ...vals: unknown[]) => string;

  if (ctx) {
    const ctxH = (type: string | ComponentFn, props: Record<string, PropValue> | null, ...children: HtmlChild[]): string => {
      if (typeof type === "function") {
        return type({ ...props, children: children.flat() }, ctx);
      }
      return baseH(type, props, ...children);
    };
    const _ctxHtml = htm.bind(ctxH);
    htmlFn = (strings: TemplateStringsArray, ...vals: unknown[]): string => {
      const result = _ctxHtml(strings, ...vals);
      return Array.isArray(result) ? (result as string[]).join("") : result as string;
    };
  } else {
    htmlFn = html;
  }

  const fn = new Function("html", ...keys, "return html`" + template + "`");
  return fn(htmlFn, ...values);
}
