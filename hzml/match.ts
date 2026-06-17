import { join } from "path";
import { access, readdir } from "fs/promises";

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

export interface RouteTable {
  layouts: string[];
  index?: string;
  staticFiles: Map<string, string>;
  dynamicFile?: { param: string; file: string };
  staticDirs: Map<string, RouteTable>;
  dynamicDir?: { param: string; table: RouteTable };
}

async function scanDir(dir: string, parentLayouts: string[]): Promise<RouteTable> {
  const layouts = [...parentLayouts];
  const layoutFile = join(dir, "layout.hzml");
  if (await fileExists(layoutFile)) layouts.push(layoutFile);

  const table: RouteTable = {
    layouts,
    staticFiles: new Map(),
    staticDirs: new Map(),
  };

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return table;
  }

  for (const entry of entries) {
    if (entry.name === "layout.hzml") continue;

    if (entry.isFile() && entry.name.endsWith(".hzml")) {
      if (entry.name === "index.hzml") {
        table.index = join(dir, entry.name);
      } else if (entry.name.startsWith("$")) {
        table.dynamicFile = {
          param: entry.name.slice(1, -5),
          file: join(dir, entry.name),
        };
      } else {
        table.staticFiles.set(
          entry.name.slice(0, -5),
          join(dir, entry.name),
        );
      }
    }

    if (entry.isDirectory()) {
      const subTable = await scanDir(join(dir, entry.name), layouts);
      if (entry.name.startsWith("$")) {
        table.dynamicDir = {
          param: entry.name.slice(1),
          table: subTable,
        };
      } else {
        table.staticDirs.set(entry.name, subTable);
      }
    }
  }

  return table;
}

export async function buildRouteTable(routesDir: string): Promise<RouteTable> {
  return scanDir(routesDir, []);
}

export function matchFromTable(table: RouteTable, pathname: string): RouteMatch | null {
  const segments = pathname === "/" ? [] : pathname.split("/").filter(Boolean);
  return walkTable(table, segments, {});
}

function walkTable(
  node: RouteTable,
  segments: string[],
  params: Record<string, string>,
): RouteMatch | null {
  if (segments.length === 0) {
    if (node.index) {
      return { filePath: node.index, params: { ...params }, layouts: node.layouts };
    }
    return null;
  }

  const [segment, ...remaining] = segments;

  if (remaining.length === 0) {
    const staticFile = node.staticFiles.get(segment);
    if (staticFile) {
      return { filePath: staticFile, params: { ...params }, layouts: node.layouts };
    }

    if (node.dynamicFile) {
      return {
        filePath: node.dynamicFile.file,
        params: { ...params, [node.dynamicFile.param]: segment },
        layouts: node.layouts,
      };
    }

    const staticDir = node.staticDirs.get(segment);
    if (staticDir?.index) {
      return { filePath: staticDir.index, params: { ...params }, layouts: staticDir.layouts };
    }

    if (node.dynamicDir?.table.index) {
      return {
        filePath: node.dynamicDir.table.index,
        params: { ...params, [node.dynamicDir.param]: segment },
        layouts: node.dynamicDir.table.layouts,
      };
    }

    return null;
  }

  const staticDir = node.staticDirs.get(segment);
  if (staticDir) {
    return walkTable(staticDir, remaining, { ...params });
  }

  if (node.dynamicDir) {
    return walkTable(
      node.dynamicDir.table,
      remaining,
      { ...params, [node.dynamicDir.param]: segment },
    );
  }

  return null;
}
