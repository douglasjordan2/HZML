import { resolve } from "path";
import { loadComponents } from "./router";
import { createHandler } from "./handler";
import { createSQLiteAdapter, type DatabaseAdapter } from "./db";

interface HzmlOptions {
  port?: number;
  db?: { provider?: DatabaseAdapter | "sqlite"; path?: string };
}

export default async function hzml(options: number | HzmlOptions = 4965) {
  const port = typeof options === "number" ? options : (options.port ?? 4965);
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

  await loadComponents(projectDir);

  const handler = createHandler(routesDir, publicDir, db);

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
