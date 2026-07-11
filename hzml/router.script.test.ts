import { describe, expect, test } from "bun:test";
import { join } from "path";
import { pathToFileURL } from "url";
import { initRouter, type HzmlRouter } from "./router";

const MOD = pathToFileURL(join(import.meta.dir, "fixtures", "modules", "mod.ts")).href;
const SIDE = pathToFileURL(join(import.meta.dir, "fixtures", "modules", "side.ts")).href;

function makeRouter(): HzmlRouter {
  return initRouter({ db: undefined, extensions: {}, injections: {} });
}

function get(url = "http://test.local/"): Request {
  return new Request(url);
}

function post(form: Record<string, string>, url = "http://test.local/"): Request {
  const body = new FormData();
  for (const [k, v] of Object.entries(form)) body.append(k, v);
  return new Request(url, { method: "POST", body });
}

let fileCounter = 0;
const nextFile = () => `virtual-route-${fileCounter++}.hzml`;

describe("executeScript handlers", () => {
  test("GET request selects the get handler", async () => {
    const router = makeRouter();
    const script = `hzml.get(() => ({ via: "get" }))\nhzml.post(() => ({ via: "post" }))`;
    const data = await router.executeScript(script, get(), {}, nextFile());
    expect(data).toEqual({ via: "get" });
  });

  test("POST request selects the post handler and receives the form body", async () => {
    const router = makeRouter();
    const script = `hzml.get(() => ({ via: "get" }))\nhzml.post((req) => ({ via: "post", name: req.body.name }))`;
    const data = await router.executeScript(script, post({ name: "douglas" }), {}, nextFile());
    expect(data).toEqual({ via: "post", name: "douglas" });
  });

  test("params reach the handler", async () => {
    const router = makeRouter();
    const script = `hzml.get((req) => ({ id: req.params.id }))`;
    const data = await router.executeScript(script, get(), { id: "42" }, nextFile());
    expect(data).toEqual({ id: "42" });
  });

  test("no matching handler yields an empty object", async () => {
    const router = makeRouter();
    const script = `hzml.post(() => ({ via: "post" }))`;
    const data = await router.executeScript(script, get(), {}, nextFile());
    expect(data).toEqual({});
  });

  test("hzml.redirect helper produces the __redirect marker", async () => {
    const router = makeRouter();
    const script = `hzml.get(() => hzml.redirect("/target"))`;
    const data = await router.executeScript(script, get(), {}, nextFile());
    expect(data).toEqual({ __redirect: "/target" });
  });
});

describe("executeScript route-context caching", () => {
  test("same filePath reuses the first script's handlers (documented pitfall)", async () => {
    const router = makeRouter();
    const shared = nextFile();
    const first = await router.executeScript(`hzml.get(() => ({ v: 1 }))`, get(), {}, shared);
    const second = await router.executeScript(`hzml.get(() => ({ v: 2 }))`, get(), {}, shared);
    expect(first).toEqual({ v: 1 });
    expect(second).toEqual({ v: 1 });
  });

  test("clearRouteContext forces re-evaluation", async () => {
    const router = makeRouter();
    const shared = nextFile();
    await router.executeScript(`hzml.get(() => ({ v: 1 }))`, get(), {}, shared);
    router.clearRouteContext(shared);
    const data = await router.executeScript(`hzml.get(() => ({ v: 2 }))`, get(), {}, shared);
    expect(data).toEqual({ v: 2 });
  });
});

describe("executeScript import transformation (six forms)", () => {
  test("bare import runs for side effects", async () => {
    const router = makeRouter();
    const g = globalThis as Record<string, unknown> & typeof globalThis;
    const before = (g.__hzSideEffect as number) ?? 0;
    const script = `import "${SIDE}"\nhzml.get(() => ({ ok: true }))`;
    const data = await router.executeScript(script, get(), {}, nextFile());
    expect(data).toEqual({ ok: true });
    expect(g.__hzSideEffect).toBe(before + 1);
  });

  test("default import", async () => {
    const router = makeRouter();
    const script = `import d from "${MOD}"\nhzml.get(() => ({ d }))`;
    expect(await router.executeScript(script, get(), {}, nextFile())).toEqual({ d: "D" });
  });

  test("namespace import", async () => {
    const router = makeRouter();
    const script = `import * as m from "${MOD}"\nhzml.get(() => ({ v: m.a + m.b }))`;
    expect(await router.executeScript(script, get(), {}, nextFile())).toEqual({ v: "AB" });
  });

  test("named import with rename", async () => {
    const router = makeRouter();
    const script = `import { a, b as bee } from "${MOD}"\nhzml.get(() => ({ v: a + bee }))`;
    expect(await router.executeScript(script, get(), {}, nextFile())).toEqual({ v: "AB" });
  });

  test("mixed default + named import", async () => {
    const router = makeRouter();
    const script = `import d, { a } from "${MOD}"\nhzml.get(() => ({ v: d + a }))`;
    expect(await router.executeScript(script, get(), {}, nextFile())).toEqual({ v: "DA" });
  });

  test("mixed default + namespace import", async () => {
    const router = makeRouter();
    const script = `import d, * as m from "${MOD}"\nhzml.get(() => ({ v: d + m.b }))`;
    expect(await router.executeScript(script, get(), {}, nextFile())).toEqual({ v: "DB" });
  });
});
