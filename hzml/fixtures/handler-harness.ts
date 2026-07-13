import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { initRouter } from "../router";
import { createHandler } from "../handler";
import { buildRouteTable } from "../match";
import type { DatabaseAdapter } from "../db";

export interface Harness {
  root: string;
  routesDir: string;
  publicDir: string;
  handler: (req: Request) => Promise<Response>;
  cleanup: () => Promise<void>;
}

export async function createHarness(opts: {
  routes?: Record<string, string>;
  publicFiles?: Record<string, string>;
  db?: DatabaseAdapter;
} = {}): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), "hzml-test-"));
  const routesDir = join(root, "routes");
  const publicDir = join(root, "public");
  await mkdir(routesDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });

  for (const [rel, content] of Object.entries(opts.routes ?? {})) {
    const path = join(routesDir, rel);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  for (const [rel, content] of Object.entries(opts.publicFiles ?? {})) {
    const path = join(publicDir, rel);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  const router = initRouter({ db: opts.db, extensions: {}, injections: {} });
  await router.loadComponents();
  const routeTable = await buildRouteTable(routesDir);
  const handler = createHandler(routesDir, publicDir, router, () => routeTable);

  return {
    root,
    routesDir,
    publicDir,
    handler,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export function pageRequest(path: string, init?: RequestInit): Request {
  return new Request(`http://test.local${path}`, init);
}

export function partialRequest(path: string): Request {
  return new Request(`http://test.local${path}`, {
    headers: { "Sec-Fetch-Dest": "iframe" },
  });
}
