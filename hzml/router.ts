import { join, basename } from "path";
import { readdir, readFile } from "fs/promises";
import { html } from "./render";

const BUILT_IN_COMPONENTS = join(import.meta.dirname ?? import.meta.dir, "components");

type ComponentFn = (props: Record<string, unknown>) => string;
type RouteHandler = (req: HzmlRequest) => Record<string, unknown>;

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

    const templateVars = new Set<string>();
    parsed.template.replace(/\$\{(\w+)/g, (_, v) => { templateVars.add(v); return _; });

    const tmpl = parsed.template;

    componentCache[name] = (props: Record<string, unknown>) => {
      const data: Record<string, unknown> = {};

      for (const v of templateVars) {
        data[v] = undefined;
      }

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

      return renderTemplate(tmpl, data);
    };
  }

}

export async function loadComponents(projectDir?: string): Promise<void> {
  if (Object.keys(componentCache).length > 0) return;

  await loadFromDir(BUILT_IN_COMPONENTS);

  if (projectDir) {
    await loadFromDir(join(projectDir, "components"));
  }
}

export async function executeScript(
  script: string,
  request: Request,
  params: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  let getHandler: RouteHandler | null = null;
  let postHandler: RouteHandler | null = null;

  const get = (fn: RouteHandler) => { getHandler = fn; };
  const post = (fn: RouteHandler) => { postHandler = fn; };
  const redirect = (url: string) => ({ __redirect: url });

  const clean = script.replace(/^import\s.*$/gm, "");

  const register = new Function("get", "post", "redirect", clean);
  register(get, post, redirect);

  const method = request.method.toLowerCase();

  const req: HzmlRequest = { method, headers: request.headers, params };

  if (method === "post" && postHandler) {
    const formData = await request.formData();
    req.body = Object.fromEntries(formData);
    return postHandler(req);
  }

  if (method === "get" && getHandler) return getHandler(req);

  return {};
}

export function renderTemplate(
  template: string,
  data: Record<string, unknown>,
): string {
  if (!template) return "";

  const allData = { ...componentCache, ...data };
  const keys = Object.keys(allData);
  const values = Object.values(allData);

  const fn = new Function("html", ...keys, "return html`" + template + "`");
  return fn(html, ...values);
}
