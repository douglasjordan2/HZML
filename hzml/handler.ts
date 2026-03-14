import { join, extname } from "path";
import { readFile, writeFile } from "fs/promises";
import { parseRoute, executeScript, renderTemplate } from "./router";
import { createToggleRegistry, type RenderContext } from "./state";
import { htmz } from "./htmz";
import type { DatabaseAdapter } from "./db";
import { matchRoute, fileExists, type RouteMatch } from "./match";
import { renderErrorOverlay } from "./dev";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

export function createHandler(routesDir: string, publicDir: string, db?: DatabaseAdapter, sseManager?: { handler(): Response }, devClientScript?: string) {

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

function generateToggleCSS(body: string): string {
  const re = /<label[^>]+>/g;
  const rules: string[] = [];
  const seen = new Set<string>();
  let m;

  while ((m = re.exec(body)) !== null) {
    const tag = m[0];
    const dirMatch = tag.match(/data-toggle-dir="(on|off)"/);
    const forMatch = tag.match(/for="([^"]+)"/);
    if (!dirMatch || !forMatch) continue;

    const dir = dirMatch[1];
    const id = forMatch[1];
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

async function resolveData(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const entries = Object.entries(data);
  const resolved = await Promise.all(
    entries.map(async ([k, v]) => [k, v instanceof Promise ? await v : v])
  );
  return Object.fromEntries(resolved);
}

function mergeChannels(body: string): string {
  const fillRe = /<span data-fill="([^"]+)" hidden>/g;
  const fills: Record<string, string> = {};
  const ranges: [number, number][] = [];
  let match;

  while ((match = fillRe.exec(body)) !== null) {
    const channel = match[1];
    const outerStart = match.index;
    const innerStart = outerStart + match[0].length;
    let depth = 1, i = innerStart;

    while (i < body.length && depth > 0) {
      if (body.startsWith('</span>', i)) {
        depth--;
        if (depth === 0) {
          fills[channel] = body.slice(innerStart, i).trim();
          ranges.push([outerStart, i + 7]);
          fillRe.lastIndex = i + 7;
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
    /<span data-slot="([^"]+)"><\/span>/g,
    (m, ch) => ch in fills ? `<span data-slot="${ch}">${fills[ch]}</span>` : m
  );
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function renderRoute(match: RouteMatch, isPartial: boolean, request: Request): Promise<Response> {
  const ctx: RenderContext = {
    toggleRegistry: createToggleRegistry(),
  };
  const source = await readFile(match.filePath, "utf-8");
  const route = parseRoute(source);

  let body: string;
  const clientScript = route.clientScript || '';

  if (route.script) {
    const data = await executeScript(route.script, request, match.params, match.filePath, db);

    if (data?.__redirect) {
      return Response.redirect(data.__redirect, 302);
    }

    const resolved = await resolveData(data);
    body = route.template ? renderTemplate(route.template, resolved, ctx) : "";
  } else {
    body = route.template ? renderTemplate(route.template, {}, ctx) : source;
  }

  const scriptTag = clientScript ? `<script>${clientScript}</script>` : '';

  const [rootLayout, ...nestedLayouts] = match.layouts;

  for (const layoutPath of nestedLayouts.reverse()) {
    const source = await readFile(layoutPath, "utf-8");
    const layout = parseRoute(source);
    const tmpl = layout.template || source;
    body = renderTemplate(tmpl, { children: body }, ctx);
  }

  if (isPartial) {
    const toggleInputs = ctx.toggleRegistry.emit();
    return htmlResponse(`<div id="content">${toggleInputs}${body}${scriptTag}</div>`);
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
  const toggleCSS = generateToggleCSS(body);
  updateToggleManifest(body);
  return htmlResponse(htmz(body, toggleCSS, scriptTag, devClientScript ?? ""));
}

return async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const isPartial = req.headers.get("Sec-Fetch-Dest") === "iframe";

  if (url.pathname === "/__hzml/sse" && sseManager) {
    return sseManager.handler();
  }

  const staticPath = join(publicDir, url.pathname);
  if (extname(staticPath) && await fileExists(staticPath)) {
    const content = await readFile(staticPath);
    const mime = MIME_TYPES[extname(staticPath)] ?? "application/octet-stream";
    return new Response(content, {
      headers: { "Content-Type": mime },
    });
  }

  const match = await matchRoute(routesDir, url.pathname);
  if (!match) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    return await renderRoute(match, isPartial, req);
  } catch (err) {
    console.error(`\x1b[31m[hzml] Error rendering ${match.filePath}:\x1b[0m`, err);
    const overlay = renderErrorOverlay(err, match.filePath);
    return htmlResponse(htmz(overlay, "", "", devClientScript ?? ""));
  }
};

}
