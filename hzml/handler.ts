import { join, extname } from "path";
import { readFile, writeFile } from "fs/promises";
import { parseRoute } from "./router";
import type { HzmlRouter } from "./router";
import { createToggleRegistry, createDeferredRegistry, createQueryCache, renderStorage, type RenderContext } from "./state";
import { isDeferred } from "./deferred";
import type { Deferred } from "./deferred";
import { htmzHead, htmzTail } from "./htmz";
import { matchFromTable, fileExists, type RouteMatch, type RouteTable } from "./match";
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

interface PendingDeferredEntry {
  id: number;
  promise: Promise<unknown>;
  render: (data: unknown) => string;
}

export function createHandler(routesDir: string, publicDir: string, router: HzmlRouter, getRouteTable: () => RouteTable, sseManager?: { handler(): Response }, devClientScript?: string) {

let deferredRequestId = 0;
const pendingDeferreds = new Map<string, PendingDeferredEntry[]>();

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
    entries.map(async ([k, v]) => [k, isDeferred(v) ? v : (v instanceof Promise ? await v : v)])
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
    deferredRegistry: createDeferredRegistry(),
    db: router.db ? createQueryCache(router.db) : undefined,
  };

  return renderStorage.run(ctx, () => renderRouteInner(match, isPartial, request, ctx));
}

async function renderRouteInner(match: RouteMatch, isPartial: boolean, request: Request, ctx: RenderContext): Promise<Response> {
  const source = await readFile(match.filePath, "utf-8");
  const route = parseRoute(source);
  const clientScript = route.clientScript || '';

  if (isPartial) {
    let body: string;
    if (route.script) {
      const data = await router.executeScript(route.script, request, match.params, match.filePath);
      if (data?.__redirect) return Response.redirect(data.__redirect, 302);
      const resolved = await resolveData(data);
      body = route.template ? router.renderTemplate(route.template, resolved, ctx) : "";
    } else {
      body = route.template ? router.renderTemplate(route.template, {}, ctx) : source;
    }
    const scriptTag = clientScript ? `<script>${clientScript}</script>` : '';
    const [, ...nestedLayouts] = match.layouts;
    for (const layoutPath of nestedLayouts.reverse()) {
      const src = await readFile(layoutPath, "utf-8");
      const layout = parseRoute(src);
      body = router.renderTemplate(layout.template || src, { children: body }, ctx);
    }
    const toggleInputs = ctx.toggleRegistry.emit();

    let deferredScript = '';
    if (ctx.deferredRegistry.hasEntries()) {
      const requestId = String(++deferredRequestId);
      pendingDeferreds.set(requestId, ctx.deferredRegistry.entries());
      setTimeout(() => pendingDeferreds.delete(requestId), 60_000);
      deferredScript = `<script>(function(){` +
        `var d=parent.document;` +
        `fetch('/__hzml/deferred/${requestId}').then(function(r){` +
        `var reader=r.body.getReader(),decoder=new TextDecoder(),buf='';` +
        `function pump(){reader.read().then(function(result){` +
        `if(result.done){if(buf.trim())swap(buf.trim());return}` +
        `buf+=decoder.decode(result.value,{stream:true});` +
        `var lines=buf.split('\\n');buf=lines.pop();` +
        `lines.filter(Boolean).forEach(swap);pump()})}` +
        `function swap(line){try{var data=JSON.parse(line);` +
        `var el=d.getElementById('__s:'+data.id);` +
        `if(el){var t=d.createElement('template');` +
        `t.innerHTML=data.html;el.replaceWith(t.content)}}catch(e){}}` +
        `pump()})` +
        `})()</script>`;
    }

    return htmlResponse(`<div id="content">${toggleInputs}${body}${scriptTag}</div>${deferredScript}`);
  }

  if (!route.script) {
    let body = route.template ? router.renderTemplate(route.template, {}, ctx) : source;
    const scriptTag = clientScript ? `<script>${clientScript}</script>` : '';
    const [rootLayout, ...nestedLayouts] = match.layouts;
    for (const layoutPath of nestedLayouts.reverse()) {
      const src = await readFile(layoutPath, "utf-8");
      const layout = parseRoute(src);
      body = router.renderTemplate(layout.template || src, { children: body }, ctx);
    }
    if (rootLayout) {
      const src = await readFile(rootLayout, "utf-8");
      const layout = parseRoute(src);
      body = router.renderTemplate(layout.template || src, { children: body }, ctx);
      body = mergeChannels(body);
    }
    const toggleInputs = ctx.toggleRegistry.emit();
    if (toggleInputs) body = toggleInputs + '\n' + body;
    const toggleCSS = generateToggleCSS(body);
    updateToggleManifest(body);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(htmzHead()));
        controller.enqueue(encoder.encode(toggleCSS + body));
        controller.enqueue(encoder.encode(htmzTail(scriptTag, devClientScript ?? "")));
        controller.close();
      }
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(htmzHead()));

      try {
        const data = await router.executeScript(route.script!, request, match.params, match.filePath);

        if (data?.__redirect) {
          const url = data.__redirect as string;
          controller.enqueue(encoder.encode(
            `<meta http-equiv="refresh" content="0;url=${encodeURI(url)}">`+
            `<script>location.replace(${JSON.stringify(url)})</script>`
          ));
          controller.enqueue(encoder.encode(htmzTail("", "")));
          controller.close();
          return;
        }

        const resolved = await resolveData(data);
        let body = route.template ? router.renderTemplate(route.template, resolved, ctx) : "";
        const scriptTag = clientScript ? `<script>${clientScript}</script>` : '';
        const [rootLayout, ...nestedLayouts] = match.layouts;

        for (const layoutPath of nestedLayouts.reverse()) {
          const src = await readFile(layoutPath, "utf-8");
          const layout = parseRoute(src);
          body = router.renderTemplate(layout.template || src, { children: body }, ctx);
        }

        if (rootLayout) {
          const src = await readFile(rootLayout, "utf-8");
          const layout = parseRoute(src);
          body = router.renderTemplate(layout.template || src, { children: body }, ctx);
          body = mergeChannels(body);
        }

        const toggleInputs = ctx.toggleRegistry.emit();
        if (toggleInputs) body = toggleInputs + '\n' + body;
        const toggleCSS = generateToggleCSS(body);
        updateToggleManifest(body);

        controller.enqueue(encoder.encode(toggleCSS + body));

        if (ctx.deferredRegistry.hasEntries()) {
          const deferredEntries = ctx.deferredRegistry.entries();
          const TIMEOUT = 30_000;
          const timeout = (ms: number) => new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("Deferred timed out")), ms)
          );

          await Promise.allSettled(deferredEntries.map(entry =>
            Promise.race([entry.promise, timeout(TIMEOUT)])
              .then(value => {
                const rendered = entry.render(value);
                controller.enqueue(encoder.encode(
                  `<template id="__s:${entry.id}:r">${rendered}</template>` +
                  `<script>(function(){var t=document.getElementById('__s:${entry.id}:r'),` +
                  `p=document.getElementById('__s:${entry.id}');` +
                  `if(p&&t){p.replaceWith(t.content);t.remove()}})()</script>`
                ));
              })
              .catch(() => {
                controller.enqueue(encoder.encode(
                  `<template id="__s:${entry.id}:r"><div style="color:red;padding:8px;border:1px solid red;border-radius:4px">Failed to load</div></template>` +
                  `<script>(function(){var t=document.getElementById('__s:${entry.id}:r'),` +
                  `p=document.getElementById('__s:${entry.id}');` +
                  `if(p&&t){p.replaceWith(t.content);t.remove()}})()</script>`
                ));
              })
          ));
        }

        controller.enqueue(encoder.encode(htmzTail(scriptTag, devClientScript ?? "")));
      } catch (err) {
        console.error(`\x1b[31m[hzml] Error rendering ${match.filePath}:\x1b[0m`, err);
        controller.enqueue(encoder.encode(renderErrorOverlay(err, match.filePath)));
        controller.enqueue(encoder.encode(htmzTail("", devClientScript ?? "")));
      }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

return async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const isPartial = req.headers.get("Sec-Fetch-Dest") === "iframe";

  if (url.pathname === "/__hzml/sse" && sseManager) {
    return sseManager.handler();
  }

  if (url.pathname.startsWith("/__hzml/deferred/")) {
    const requestId = url.pathname.slice("/__hzml/deferred/".length);
    const entries = pendingDeferreds.get(requestId);
    pendingDeferreds.delete(requestId);

    if (!entries) {
      return new Response("Not Found", { status: 404 });
    }

    const encoder = new TextEncoder();
    const TIMEOUT = 30_000;
    const timeout = (ms: number) => new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("Deferred timed out")), ms)
    );

    const stream = new ReadableStream({
      async start(controller) {
        await Promise.allSettled(entries.map(entry =>
          Promise.race([entry.promise, timeout(TIMEOUT)])
            .then(value => {
              const rendered = entry.render(value);
              controller.enqueue(encoder.encode(
                JSON.stringify({ id: entry.id, html: rendered }) + '\n'
              ));
            })
            .catch(() => {
              controller.enqueue(encoder.encode(
                JSON.stringify({ id: entry.id, html: '<div style="color:red;padding:8px;border:1px solid red;border-radius:4px">Failed to load</div>' }) + '\n'
              ));
            })
        ));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
    });
  }

  const staticPath = join(publicDir, url.pathname);
  if (extname(staticPath) && await fileExists(staticPath)) {
    const content = await readFile(staticPath);
    const mime = MIME_TYPES[extname(staticPath)] ?? "application/octet-stream";
    return new Response(content, {
      headers: { "Content-Type": mime },
    });
  }

  const match = matchFromTable(getRouteTable(), url.pathname);
  if (!match) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    return await renderRoute(match, isPartial, req);
  } catch (err) {
    console.error(`\x1b[31m[hzml] Error rendering ${match.filePath}:\x1b[0m`, err);
    const overlay = renderErrorOverlay(err, match.filePath);
    if (isPartial) {
      return htmlResponse(overlay);
    }
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(htmzHead()));
        controller.enqueue(encoder.encode(overlay));
        controller.enqueue(encoder.encode(htmzTail("", devClientScript ?? "")));
        controller.close();
      }
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
};

}
