import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "path";
import { buildRouteTable, matchFromTable, type RouteTable } from "./match";

const FIXTURES = join(import.meta.dir, "fixtures", "routes-match");
const p = (...parts: string[]) => join(FIXTURES, ...parts);

let table: RouteTable;

beforeAll(async () => {
  table = await buildRouteTable(FIXTURES);
});

describe("buildRouteTable", () => {
  test("missing directory yields an empty table", async () => {
    const empty = await buildRouteTable(p("does-not-exist"));
    expect(empty.index).toBeUndefined();
    expect(empty.staticFiles.size).toBe(0);
    expect(empty.staticDirs.size).toBe(0);
    expect(empty.dynamicFile).toBeUndefined();
    expect(empty.dynamicDir).toBeUndefined();
    expect(matchFromTable(empty, "/")).toBeNull();
  });
});

describe("matchFromTable", () => {
  test("root index", () => {
    const m = matchFromTable(table, "/");
    expect(m?.filePath).toBe(p("index.hzml"));
    expect(m?.params).toEqual({});
  });

  test("dynamic file captures the segment as a param", () => {
    const m = matchFromTable(table, "/anything-else");
    expect(m?.filePath).toBe(p("$slug.hzml"));
    expect(m?.params).toEqual({ slug: "anything-else" });
  });

  test("static file inside a static dir", () => {
    const m = matchFromTable(table, "/blog/post");
    expect(m?.filePath).toBe(p("blog", "post.hzml"));
    expect(m?.params).toEqual({});
  });

  test("dynamic file inside a static dir", () => {
    const m = matchFromTable(table, "/blog/42");
    expect(m?.filePath).toBe(p("blog", "$id.hzml"));
    expect(m?.params).toEqual({ id: "42" });
  });

  test("static file inside a dynamic dir", () => {
    const m = matchFromTable(table, "/alice/settings");
    expect(m?.filePath).toBe(p("$user", "settings.hzml"));
    expect(m?.params).toEqual({ user: "alice" });
  });

  test("multi-segment params through nested dynamic dirs", () => {
    const m = matchFromTable(table, "/alice/billing");
    expect(m?.filePath).toBe(p("$user", "$section", "index.hzml"));
    expect(m?.params).toEqual({ user: "alice", section: "billing" });
  });

  test("unmatched paths return null", () => {
    expect(matchFromTable(table, "/about/nope/deeper")).toBeNull();
    expect(matchFromTable(table, "/blog/42/extra")).toBeNull();
  });
});

describe("last-segment precedence", () => {
  test("static file beats dynamic file and static dir index", () => {
    const m = matchFromTable(table, "/about");
    expect(m?.filePath).toBe(p("about.hzml"));
    expect(m?.params).toEqual({});
  });

  test("dynamic file beats static dir index", () => {
    const m = matchFromTable(table, "/docs");
    expect(m?.filePath).toBe(p("$slug.hzml"));
    expect(m?.params).toEqual({ slug: "docs" });
  });

  test("dynamic file beats dynamic dir index", () => {
    const dyn = matchFromTable(table, "/alice");
    expect(dyn?.filePath).toBe(p("$slug.hzml"));
    expect(dyn?.params).toEqual({ slug: "alice" });
  });

  test("static dir index beats dynamic dir index when no dynamic file exists", () => {
    const m = matchFromTable(table, "/area/team");
    expect(m?.filePath).toBe(p("area", "team", "index.hzml"));
    expect(m?.params).toEqual({});
  });

  test("dynamic dir index is the last resort", () => {
    const m = matchFromTable(table, "/area/other");
    expect(m?.filePath).toBe(p("area", "$x", "index.hzml"));
    expect(m?.params).toEqual({ x: "other" });
  });
});

describe("layout accumulation", () => {
  test("root routes carry the root layout", () => {
    const m = matchFromTable(table, "/");
    expect(m?.layouts).toEqual([p("layout.hzml")]);
  });

  test("nested layouts accumulate outermost-first", () => {
    const m = matchFromTable(table, "/blog/post");
    expect(m?.layouts).toEqual([p("layout.hzml"), p("blog", "layout.hzml")]);
  });

  test("dirs without their own layout inherit the parent chain", () => {
    const m = matchFromTable(table, "/alice/settings");
    expect(m?.layouts).toEqual([p("layout.hzml")]);
  });

  test("static dir index match uses the dir's own layout chain", () => {
    const m = matchFromTable(table, "/area/team");
    expect(m?.layouts).toEqual([p("layout.hzml"), p("area", "team", "layout.hzml")]);
  });
});
