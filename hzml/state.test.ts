import { describe, expect, test } from "bun:test";
import { createQueryCache, createToggleRegistry, createDeferredRegistry } from "./state";
import type { DatabaseAdapter } from "./db";

function stubAdapter() {
  const calls = { query: 0, run: 0, close: 0 };
  const adapter: DatabaseAdapter = {
    query(sql, params) {
      calls.query++;
      return [{ sql, params: JSON.stringify(params ?? []) } as never];
    },
    run() {
      calls.run++;
      return { changes: 1 };
    },
    close() {
      calls.close++;
    },
  };
  return { adapter, calls };
}

describe("createQueryCache", () => {
  test("identical sql+params served from cache", () => {
    const { adapter, calls } = stubAdapter();
    const cached = createQueryCache(adapter);
    const first = cached.query("SELECT 1", [1]);
    const second = cached.query("SELECT 1", [1]);
    expect(calls.query).toBe(1);
    expect(second).toBe(first);
  });

  test("different params miss the cache", () => {
    const { adapter, calls } = stubAdapter();
    const cached = createQueryCache(adapter);
    cached.query("SELECT 1", [1]);
    cached.query("SELECT 1", [2]);
    cached.query("SELECT 1");
    expect(calls.query).toBe(3);
  });

  test("run() clears the cache", () => {
    const { adapter, calls } = stubAdapter();
    const cached = createQueryCache(adapter);
    cached.query("SELECT 1", []);
    cached.run("UPDATE t SET x = 1");
    cached.query("SELECT 1", []);
    expect(calls.run).toBe(1);
    expect(calls.query).toBe(2);
  });

  test("close() is a no-op that leaves the underlying adapter open", () => {
    const { adapter, calls } = stubAdapter();
    const cached = createQueryCache(adapter);
    cached.close();
    expect(calls.close).toBe(0);
  });
});

describe("createToggleRegistry", () => {
  test("no name registers a checkbox", () => {
    const reg = createToggleRegistry();
    reg.register("t1");
    expect(reg.emit()).toBe('<input type="checkbox" id="t1" hidden>');
  });

  test("a name registers a radio", () => {
    const reg = createToggleRegistry();
    reg.register("t1", "group");
    expect(reg.emit()).toBe('<input type="radio" id="t1" name="group" hidden>');
  });

  test("checked renders the attribute", () => {
    const reg = createToggleRegistry();
    reg.register("t1", undefined, true);
    expect(reg.emit()).toBe('<input type="checkbox" id="t1" checked hidden>');
  });

  test("re-register upgrades checked but never downgrades", () => {
    const reg = createToggleRegistry();
    reg.register("t1");
    reg.register("t1", undefined, true);
    expect(reg.emit()).toContain(" checked");
    reg.register("t1", undefined, false);
    reg.register("t1");
    expect(reg.emit()).toContain(" checked");
  });

  test("duplicate ids emit once, entries join with newlines", () => {
    const reg = createToggleRegistry();
    reg.register("a");
    reg.register("a");
    reg.register("b", "g");
    expect(reg.emit()).toBe(
      '<input type="checkbox" id="a" hidden>\n<input type="radio" id="b" name="g" hidden>',
    );
  });
});

describe("createDeferredRegistry", () => {
  test("starts empty", () => {
    const reg = createDeferredRegistry();
    expect(reg.hasEntries()).toBe(false);
    expect(reg.entries()).toEqual([]);
  });

  test("register stores id, promise, and render in order", () => {
    const reg = createDeferredRegistry();
    const p1 = Promise.resolve("x");
    const render = (data: unknown) => String(data);
    reg.register(7, p1, render);
    reg.register(8, p1, render);
    expect(reg.hasEntries()).toBe(true);
    expect(reg.entries().map(e => e.id)).toEqual([7, 8]);
    expect(reg.entries()[0].promise).toBe(p1);
    expect(reg.entries()[0].render("hi")).toBe("hi");
  });
});
