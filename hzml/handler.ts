import { join, extname } from "path";
import { readFile, access, readdir, stat, writeFile } from "fs/promises";
import { parseRoute, executeScript, renderTemplate } from "./router";
import { createToggleRegistry, createDispatchRegistry, createDidCounter, type RenderContext } from "./state";
import { htmz } from "./htmz";
import type { DatabaseAdapter } from "./db";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

export function createHandler(routesDir: string, publicDir: string, db?: DatabaseAdapter) {

const manifestPath = join(routesDir, "..", ".toggle-manifest");
const manifestClasses = new Set<string>();

function updateToggleManifest(body: string): void {
  const re = /group-has-\[#[\w-]+:checked\]\/root:[\w\[\]\/:.!-]+/g;
  let m;
  let changed = false;
  while ((m = re.exec(body)) !== null) {
    if (!manifestClasses.has(m[0])) {
      manifestClasses.add(m[0]);
      changed = true;
    }
  }
  if (changed) {
    writeFile(manifestPath, [...manifestClasses].join("\n")).catch(() => {});
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function findDynamic(dir: string, type: "file" | "dir"): Promise<{ name: string; path: string } | null> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.name.startsWith("$")) continue;
      if (type === "file" && entry.isFile() && entry.name.endsWith(".hzml")) {
        return { name: entry.name, path: join(dir, entry.name) };
      }
      if (type === "dir" && entry.isDirectory()) {
        return { name: entry.name, path: join(dir, entry.name) };
      }
    }
  } catch {}
  return null;
}

async function collectLayouts(dir: string, layouts: string[]): Promise<string[]> {
  const copy = [...layouts];
  const layout = join(dir, "layout.hzml");
  if (await fileExists(layout)) copy.push(layout);
  return copy;
}

interface RouteMatch {
  filePath: string;
  params: Record<string, string>;
  layouts: string[];
}

async function matchRoute(pathname: string): Promise<RouteMatch | null> {
  const segments = pathname === "/" ? [] : pathname.split("/").filter(Boolean);
  const layouts: string[] = [];

  const rootLayout = join(routesDir, "layout.hzml");
  if (await fileExists(rootLayout)) layouts.push(rootLayout);

  return walk(segments, routesDir, {}, layouts);
}

async function walk(
  segments: string[],
  dir: string,
  params: Record<string, string>,
  layouts: string[],
): Promise<RouteMatch | null> {
  if (segments.length === 0) {
    const indexFile = join(dir, "index.hzml");
    if (await fileExists(indexFile)) {
      return { filePath: indexFile, params: { ...params }, layouts: [...layouts] };
    }
    return null;
  }

  const [segment, ...remaining] = segments;

  if (remaining.length === 0) {
    const exact = join(dir, segment + ".hzml");
    if (await fileExists(exact)) {
      return { filePath: exact, params: { ...params }, layouts: [...layouts] };
    }

    const dynamic = await findDynamic(dir, "file");
    if (dynamic) {
      const paramName = dynamic.name.slice(1, -5);
      return {
        filePath: dynamic.path,
        params: { ...params, [paramName]: segment },
        layouts: [...layouts],
      };
    }

    const subDir = join(dir, segment);
    if (await isDirectory(subDir)) {
      const subLayouts = await collectLayouts(subDir, layouts);
      const indexFile = join(subDir, "index.hzml");
      if (await fileExists(indexFile)) {
        return { filePath: indexFile, params: { ...params }, layouts: subLayouts };
      }
    }

    const dynamicDir = await findDynamic(dir, "dir");
    if (dynamicDir) {
      const paramName = dynamicDir.name.slice(1);
      const subLayouts = await collectLayouts(dynamicDir.path, layouts);
      const indexFile = join(dynamicDir.path, "index.hzml");
      if (await fileExists(indexFile)) {
        return {
          filePath: indexFile,
          params: { ...params, [paramName]: segment },
          layouts: subLayouts,
        };
      }
    }

    return null;
  }

  const subDir = join(dir, segment);
  if (await isDirectory(subDir)) {
    const subLayouts = await collectLayouts(subDir, layouts);
    return walk(remaining, subDir, { ...params }, subLayouts);
  }

  const dynamicDir = await findDynamic(dir, "dir");
  if (dynamicDir) {
    const paramName = dynamicDir.name.slice(1);
    const subLayouts = await collectLayouts(dynamicDir.path, layouts);
    return walk(remaining, dynamicDir.path, { ...params, [paramName]: segment }, subLayouts);
  }

  return null;
}

async function resolveData(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const entries = Object.entries(data);
  const resolved = await Promise.all(
    entries.map(async ([k, v]) => [k, v instanceof Promise ? await v : v])
  );
  return Object.fromEntries(resolved);
}

function mergeChannels(body: string): string {
  const emitterRe = /<span data-emit="([^"]+)" hidden>/g;
  const emitters: Record<string, string> = {};
  const ranges: [number, number][] = [];
  let match;

  while ((match = emitterRe.exec(body)) !== null) {
    const channel = match[1];
    const outerStart = match.index;
    const innerStart = outerStart + match[0].length;
    let depth = 1, i = innerStart;

    while (i < body.length && depth > 0) {
      if (body.startsWith('</span>', i)) {
        depth--;
        if (depth === 0) {
          emitters[channel] = body.slice(innerStart, i).trim();
          ranges.push([outerStart, i + 7]);
          emitterRe.lastIndex = i + 7;
          break;
        }
        i += 7;
      } else if (body[i] === '<' && body.startsWith('<span', i) &&
                 (body[i + 5] === ' ' || body[i + 5] === '>' || body[i + 5] === '/')) {
        depth++;
        i += 5;
      } else {
        i++;
      }
    }
  }

  let result = body;
  for (let j = ranges.length - 1; j >= 0; j--) {
    result = result.slice(0, ranges[j][0]) + result.slice(ranges[j][1]);
  }

  return result.replace(
    /<span data-listen="([^"]+)"><\/span>/g,
    (m, ch) => ch in emitters ? `<span data-listen="${ch}">${emitters[ch]}</span>` : m
  );
}

function generateToggleCSS(body: string): string {
  const re = /<label[^>]+data-toggle-dir="(on|off)"[^>]+for="([^"]+)"/g;
  const rules: string[] = [];
  const seen = new Set<string>();
  let m;

  while ((m = re.exec(body)) !== null) {
    const dir = m[1];
    const id = m[2];
    const key = `${dir}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (dir === "on") {
      rules.push(`:has(#${id}:checked) label[data-toggle-dir="on"][for="${id}"] { pointer-events: none; }`);
    } else {
      rules.push(`label[data-toggle-dir="off"][for="${id}"] { pointer-events: none; }`);
      rules.push(`:has(#${id}:checked) label[data-toggle-dir="off"][for="${id}"] { pointer-events: auto; }`);
    }
  }

  const forFirstRe = /<label[^>]+for="([^"]+)"[^>]+data-toggle-dir="(on|off)"/g;
  while ((m = forFirstRe.exec(body)) !== null) {
    const id = m[1];
    const dir = m[2];
    const key = `${dir}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (dir === "on") {
      rules.push(`:has(#${id}:checked) label[data-toggle-dir="on"][for="${id}"] { pointer-events: none; }`);
    } else {
      rules.push(`label[data-toggle-dir="off"][for="${id}"] { pointer-events: none; }`);
      rules.push(`:has(#${id}:checked) label[data-toggle-dir="off"][for="${id}"] { pointer-events: auto; }`);
    }
  }

  return rules.length ? `<style>${rules.join("\n")}</style>` : "";
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function renderRoute(match: RouteMatch, isPartial: boolean, request: Request): Promise<Response> {
  const ctx: RenderContext = {
    toggleRegistry: createToggleRegistry(),
    dispatchRegistry: createDispatchRegistry(),
    nextDid: createDidCounter(),
  };
  const source = await readFile(match.filePath, "utf-8");
  const route = parseRoute(source);

  let body: string;

  if (route.script) {
    const result = await executeScript(route.script, request, match.params, match.filePath, db);

    if (result.data?.__redirect) {
      return Response.redirect(result.data.__redirect, 302);
    }

    for (const h of result.onHandlers) {
      ctx.dispatchRegistry.registerManual(h.name, h.source);
    }

    const data = await resolveData(result.data);
    body = route.template ? renderTemplate(route.template, data, ctx) : "";
  } else {
    body = route.template ? renderTemplate(route.template, {}, ctx) : source;
  }

  const [rootLayout, ...nestedLayouts] = match.layouts;

  for (const layoutPath of nestedLayouts.reverse()) {
    const source = await readFile(layoutPath, "utf-8");
    const layout = parseRoute(source);
    const tmpl = layout.template || source;
    body = renderTemplate(tmpl, { children: body }, ctx);
  }

  if (isPartial) {
    const toggleInputs = ctx.toggleRegistry.emit();
    const dispatchScripts = ctx.dispatchRegistry.emit();
    return htmlResponse(`<div id="content">${toggleInputs}${body}${dispatchScripts}</div>`);
  }

  if (rootLayout) {
    const source = await readFile(rootLayout, "utf-8");
    const layout = parseRoute(source);
    const tmpl = layout.template || source;
    body = renderTemplate(tmpl, { children: body }, ctx);
    body = mergeChannels(body);
  }

  const toggleInputs = ctx.toggleRegistry.emit();
  if (toggleInputs) {
    body = toggleInputs + '\n' + body;
  }
  const dispatchScripts = ctx.dispatchRegistry.emit();
  const toggleCSS = generateToggleCSS(body);
  updateToggleManifest(body);
  return htmlResponse(htmz(body, toggleCSS, dispatchScripts));
}

return async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const isPartial = req.headers.get("Sec-Fetch-Dest") === "iframe";

  const staticPath = join(publicDir, url.pathname);
  if (extname(staticPath) && await fileExists(staticPath)) {
    const content = await readFile(staticPath);
    const mime = MIME_TYPES[extname(staticPath)] ?? "application/octet-stream";
    return new Response(content, {
      headers: { "Content-Type": mime },
    });
  }

  const match = await matchRoute(url.pathname);
  if (!match) {
    return new Response("Not Found", { status: 404 });
  }

  return renderRoute(match, isPartial, req);
};

}
