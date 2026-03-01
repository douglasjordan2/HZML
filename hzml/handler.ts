import { join, extname } from "path";
import { readFile, access, readdir, stat } from "fs/promises";
import { parseRoute, executeScript, renderTemplate } from "./router";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

export function createHandler(routesDir: string, publicDir: string) {

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
      const subLayouts = [...layouts];
      const subLayout = join(subDir, "layout.hzml");
      if (await fileExists(subLayout)) subLayouts.push(subLayout);

      const indexFile = join(subDir, "index.hzml");
      if (await fileExists(indexFile)) {
        return { filePath: indexFile, params: { ...params }, layouts: subLayouts };
      }
    }

    const dynamicDir = await findDynamic(dir, "dir");
    if (dynamicDir) {
      const paramName = dynamicDir.name.slice(1);
      const subLayouts = [...layouts];
      const subLayout = join(dynamicDir.path, "layout.hzml");
      if (await fileExists(subLayout)) subLayouts.push(subLayout);

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
    const subLayouts = [...layouts];
    const subLayout = join(subDir, "layout.hzml");
    if (await fileExists(subLayout)) subLayouts.push(subLayout);
    return walk(remaining, subDir, { ...params }, subLayouts);
  }

  const dynamicDir = await findDynamic(dir, "dir");
  if (dynamicDir) {
    const paramName = dynamicDir.name.slice(1);
    const subLayouts = [...layouts];
    const subLayout = join(dynamicDir.path, "layout.hzml");
    if (await fileExists(subLayout)) subLayouts.push(subLayout);
    return walk(remaining, dynamicDir.path, { ...params, [paramName]: segment }, subLayouts);
  }

  return null;
}

const shell = (head: string, body: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HZML</title>
  <link rel="stylesheet" href="/app.css">
  ${head}
</head>
<body>
  ${body}
  <iframe hidden name="htmz" onload="
    if (!contentDocument || !contentDocument.body.childNodes.length) return;
    document.querySelector('#content').innerHTML = contentDocument.body.innerHTML;
    history.pushState(null, '', contentWindow.location.pathname);
  "></iframe>
</body>
</html>`;

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function renderRoute(match: RouteMatch, isPartial: boolean, request: Request): Promise<Response> {
  const source = await readFile(match.filePath, "utf-8");
  const route = parseRoute(source);

  let body: string;

  if (route.script) {
    const data = await executeScript(route.script, request, match.params);

    if (data?.__redirect) {
      return Response.redirect(data.__redirect, 302);
    }

    body = route.template ? renderTemplate(route.template, data) : "";
  } else {
    body = source;
  }

  const [rootLayout, ...nestedLayouts] = match.layouts;

  for (const layoutPath of nestedLayouts.reverse()) {
    const source = await readFile(layoutPath, "utf-8");
    const layout = parseRoute(source);
    const tmpl = layout.template || source;
    body = renderTemplate(tmpl, { children: body });
  }

  if (isPartial) return htmlResponse(body);

  if (rootLayout) {
    const source = await readFile(rootLayout, "utf-8");
    const layout = parseRoute(source);
    const tmpl = layout.template || source;
    body = renderTemplate(tmpl, { children: body });
  }

  return htmlResponse(shell("", body));
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
