import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "path";
import { initRouter, type HzmlRouter } from "./router";
import { renderStorage, createToggleRegistry, createDeferredRegistry, type RenderContext } from "./state";
import type { DatabaseAdapter } from "./db";

const PROJECT = join(import.meta.dir, "fixtures", "components-project");
const PROJECT_B = join(import.meta.dir, "fixtures", "components-project-b");

function stubDb(n: number): DatabaseAdapter {
  return {
    query: () => [{ n } as never],
    run: () => ({ changes: 0 }),
    close: () => {},
  };
}

describe("loadComponents and component rendering", () => {
  let router: HzmlRouter;

  beforeAll(async () => {
    router = initRouter({ db: stubDb(1), extensions: {}, injections: {} });
    await router.loadComponents(PROJECT);
  });

  test("project component renders with props, children, and class→cls", () => {
    const out = router.renderTemplate(
      '<${Card} title="T" class="cool">kid<//>',
      {},
    );
    expect(out).toBe('<div class="cool"><h3>T</h3>kid</div>');
  });

  test("file-based built-in components load alongside project ones", () => {
    const out = router.renderTemplate('<${Slot} channel="side">s<//>', {});
    expect(out).toBe('<span data-slot="side">s</span>');
  });

  test("programmatic built-in components are registered", () => {
    const out = router.renderTemplate('<${Dispatched} by="x" value="v" />', {});
    expect(out).toBe('<input data-d="x" value="v" name="x" type="hidden">');
  });

  test("loader string return short-circuits and replaces the output", () => {
    const out = router.renderTemplate('<${Loud} word="hi" upper=${true} />', {});
    expect(out).toBe("HI");
  });

  test("loader non-string non-object return falls through to the template", () => {
    const out = router.renderTemplate('<${Loud} word="hi" upper=${false} />', {});
    expect(out).toBe("<span>hi</span>");
  });

  test("loader object return merges into template data", () => {
    const out = router.renderTemplate('<${Merge} n=${3} />', {});
    expect(out).toBe("<b>3:6</b>");
  });

  test("loader hzml.db falls back to the framework db without a render store", () => {
    const out = router.renderTemplate('<${DbCount} />', {});
    expect(out).toBe("<i>1</i>");
  });

  test("loader hzml.db prefers the renderStorage context db", () => {
    const ctx: RenderContext = {
      toggleRegistry: createToggleRegistry(),
      deferredRegistry: createDeferredRegistry(),
      db: stubDb(9),
    };
    const out = renderStorage.run(ctx, () =>
      router.renderTemplate('<${DbCount} />', {}, ctx),
    );
    expect(out).toBe("<i>9</i>");
  });

  test("loadComponents is load-once: a second dir is a silent no-op", async () => {
    await router.loadComponents(PROJECT_B);
    expect(() => router.renderTemplate('<${Extra} />', {})).toThrow();
  });
});

describe("cache clearing and reloading", () => {
  test("reloadComponent swaps a component's implementation", async () => {
    const router = initRouter({ db: undefined, extensions: {}, injections: {} });
    await router.loadComponents(PROJECT);
    expect(router.renderTemplate('<${Merge} n=${2} />', {})).toBe("<b>2:4</b>");
    await router.reloadComponent(
      "Merge",
      join(PROJECT_B, "components", "Extra.hzml"),
    );
    expect(router.renderTemplate('<${Merge} n=${2} />', {})).toBe("<u>extra</u>");
  });

  test("clearComponentCache then loadComponents picks up a different dir", async () => {
    const router = initRouter({ db: undefined, extensions: {}, injections: {} });
    await router.loadComponents(PROJECT);
    router.clearComponentCache();
    await router.loadComponents(PROJECT_B);
    expect(router.renderTemplate('<${Extra} />', {})).toBe("<u>extra</u>");
    expect(() => router.renderTemplate('<${Card} title="T" />', {})).toThrow();
  });
});
