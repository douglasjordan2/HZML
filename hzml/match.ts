import { join } from "path";
import { access, readdir, stat } from "fs/promises";

export interface RouteMatch {
  filePath: string;
  params: Record<string, string>;
  layouts: string[];
}

export async function fileExists(path: string): Promise<boolean> {
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

export async function matchRoute(routesDir: string, pathname: string): Promise<RouteMatch | null> {
  const segments = pathname === "/" ? [] : pathname.split("/").filter(Boolean);
  const layouts: string[] = [];

  const rootLayout = join(routesDir, "layout.hzml");
  if (await fileExists(rootLayout)) layouts.push(rootLayout);

  return walk(segments, routesDir, {}, layouts);
}
