import { describe, expect, test } from "bun:test";
import { resolvePlugins, type HzmlPlugin, type PluginContext } from "./plugin";
import type { DatabaseAdapter } from "./db";

function fakeDb(tag: string): DatabaseAdapter {
  return {
    query: () => [{ tag } as never],
    run: () => ({ changes: 0 }),
    close: () => {},
  };
}

describe("resolvePlugins", () => {
  test("plugins run sequentially in order, async setup awaited", async () => {
    const order: string[] = [];
    const plugins: HzmlPlugin[] = [
      {
        name: "first",
        setup: async () => {
          await Promise.resolve();
          order.push("first");
        },
      },
      { name: "second", setup: () => void order.push("second") },
    ];
    await resolvePlugins(plugins, undefined, "/proj");
    expect(order).toEqual(["first", "second"]);
  });

  test("ctx.db getter sees a setDb from an earlier plugin", async () => {
    const replacement = fakeDb("replacement");
    let seenBytSecond: DatabaseAdapter | undefined;
    const plugins: HzmlPlugin[] = [
      { name: "a", setup: (ctx: PluginContext) => ctx.setDb(replacement) },
      { name: "b", setup: (ctx: PluginContext) => void (seenBytSecond = ctx.db) },
    ];
    const resolved = await resolvePlugins(plugins, fakeDb("initial"), "/proj");
    expect(seenBytSecond).toBe(replacement);
    expect(resolved.db).toBe(replacement);
  });

  test("initial db flows through when no plugin replaces it", async () => {
    const initial = fakeDb("initial");
    const resolved = await resolvePlugins([], initial, "/proj");
    expect(resolved.db).toBe(initial);
  });

  test("extend and inject populate the returned records", async () => {
    const plugins: HzmlPlugin[] = [
      {
        name: "a",
        setup: (ctx: PluginContext) => {
          ctx.extend("mailer", "smtp");
          ctx.inject("theme", "dark");
        },
      },
    ];
    const resolved = await resolvePlugins(plugins, undefined, "/proj");
    expect(resolved.extensions).toEqual({ mailer: "smtp" });
    expect(resolved.injections).toEqual({ theme: "dark" });
  });

  test("a later plugin's key overrides an earlier one's", async () => {
    const plugins: HzmlPlugin[] = [
      { name: "a", setup: (ctx: PluginContext) => ctx.extend("k", "old") },
      { name: "b", setup: (ctx: PluginContext) => ctx.extend("k", "new") },
    ];
    const resolved = await resolvePlugins(plugins, undefined, "/proj");
    expect(resolved.extensions).toEqual({ k: "new" });
  });

  test("projectDir is passed to every plugin", async () => {
    const dirs: string[] = [];
    const plugins: HzmlPlugin[] = [
      { name: "a", setup: (ctx: PluginContext) => void dirs.push(ctx.projectDir) },
      { name: "b", setup: (ctx: PluginContext) => void dirs.push(ctx.projectDir) },
    ];
    await resolvePlugins(plugins, undefined, "/my/project");
    expect(dirs).toEqual(["/my/project", "/my/project"]);
  });
});
