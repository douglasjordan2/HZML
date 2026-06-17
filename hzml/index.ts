import { resolve, basename } from "path";
import { createHandler } from "./handler";
import { createSQLiteAdapter, type DatabaseAdapter } from "./db";
import { createSSEManager, startWatcher, SSE_CLIENT_SCRIPT } from "./dev";
import { initRouter } from "./router";
import { resolvePlugins, type HzmlPlugin, type FrameworkContext } from "./plugin";
import { buildRouteTable, type RouteTable } from "./match";

interface HzmlOptions {
  port?: number;
  db?: { provider?: DatabaseAdapter | "sqlite"; path?: string };
  plugins?: HzmlPlugin[];
}

export default async function hzml(options: HzmlOptions | number = {}) {
  const opts: HzmlOptions = typeof options === "number" ? { port: options } : options;
  const port = opts.port ?? 4965;
  const dbConfig = opts.db;

  let db: DatabaseAdapter | undefined;
  if (dbConfig?.provider && typeof dbConfig.provider !== "string") {
    db = dbConfig.provider;
  } else {
    db = createSQLiteAdapter(dbConfig?.path ?? "./data.db");
  }

  const projectDir = process.cwd();
  const routesDir = resolve(projectDir, "routes");
  const publicDir = resolve(projectDir, "public");

  const resolved = await resolvePlugins(opts.plugins ?? [], db, projectDir);

  const frameworkCtx: FrameworkContext = { db: resolved.db, extensions: resolved.extensions, injections: resolved.injections };
  const router = initRouter(frameworkCtx);

  await router.loadComponents(projectDir);

  let routeTable = await buildRouteTable(routesDir);

  const componentsDir = resolve(projectDir, "components");
  const sseManager = createSSEManager();

  startWatcher([routesDir, componentsDir], async (filePath, kind) => {
    const name = basename(filePath, ".hzml");
    if (filePath.startsWith(componentsDir)) {
      if (kind === "delete") {
        router.clearComponentCache(name);
      } else {
        try {
          await router.reloadComponent(name, filePath);
        } catch (err) {
          console.error(`\x1b[31m[hzml] Failed to reload component ${name}:\x1b[0m`, err);
        }
      }
    } else {
      router.clearRouteContext(filePath);
      routeTable = await buildRouteTable(routesDir);
    }
    sseManager.broadcast("reload");
  });

  const handler = createHandler(routesDir, publicDir, router, () => routeTable, sseManager, SSE_CLIENT_SCRIPT);

  if (globalThis.Bun) {
    Bun.serve({ port, fetch: handler, idleTimeout: 255 });
  } else if (globalThis.Deno) {
    // @ts-ignore: Deno global
    Deno.serve({ port }, handler);
  } else {
    const { createServer } = await import("node:http");
    const { Readable } = await import("node:stream");
    createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
      }
      const request = new Request(url, { method: req.method, headers });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        Readable.fromWeb(response.body as any).pipe(res);
      } else {
        res.end();
      }
    }).listen(port);
  }

  console.log(`http://localhost:${port}`);
}
