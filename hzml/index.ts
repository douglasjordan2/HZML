import { resolve, basename } from "path";
import { createHandler } from "./handler";
import { createSQLiteAdapter, type DatabaseAdapter } from "./db";
import { createSSEManager, startWatcher, SSE_CLIENT_SCRIPT } from "./dev";
import { initRouter } from "./router";
import { resolvePlugins, type HzmlPlugin, type FrameworkContext } from "./plugin";

interface HzmlOptions {
  port?: number;
  db?: { provider?: DatabaseAdapter | "sqlite"; path?: string };
  plugins?: HzmlPlugin[];
}

export default async function hzml(options: HzmlOptions) {
  const port = options.port ?? 4965;
  const dbConfig = typeof options === "number" ? undefined : options.db;

  let db: DatabaseAdapter | undefined;
  if (dbConfig?.provider && typeof dbConfig.provider !== "string") {
    db = dbConfig.provider;
  } else {
    db = createSQLiteAdapter(dbConfig?.path ?? "./data.db");
  }

  const projectDir = process.cwd();
  const routesDir = resolve(projectDir, "routes");
  const publicDir = resolve(projectDir, "public");

  const { extensions, injections } = await resolvePlugins(options.plugins ?? [], db, projectDir);

  const frameworkCtx: FrameworkContext = { db, extensions, injections };
  const router = initRouter(frameworkCtx);

  await router.loadComponents(projectDir);

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
    }
    sseManager.broadcast("reload");
  });

  const handler = createHandler(routesDir, publicDir, router, sseManager, SSE_CLIENT_SCRIPT);

  if (globalThis.Bun) {
    Bun.serve({ port, fetch: handler });
  } else if (globalThis.Deno) {
    // @ts-ignore: Deno global
    Deno.serve({ port }, handler);
  } else {
    const { createServer } = await import("node:http");
    createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
      }
      const request = new Request(url, { method: req.method, headers });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    }).listen(port);
  }

  console.log(`http://localhost:${port}`);
}
