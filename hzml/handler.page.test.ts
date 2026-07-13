import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHarness, pageRequest, type Harness } from "./fixtures/handler-harness";

let h: Harness;
let bare: Harness;

beforeAll(async () => {
  h = await createHarness({
    routes: {
      "layout.hzml":
        '<head><title>Root</title><meta name="desc" content="root"></head>' +
        "<template><main>${children}</main></template>",
      "section/layout.hzml": "<template><section>${children}</section></template>",
      "section/page.hzml":
        "<head><title>Page</title></head><template><p>content</p></template>",
    },
  });
  bare = await createHarness({
    routes: { "index.hzml": "<template><p>home</p></template>" },
  });
});

afterAll(async () => {
  await h.cleanup();
  await bare.cleanup();
});

describe("full-page rendering", () => {
  test("response is a complete htmz document", async () => {
    const res = await h.handler(pageRequest("/section/page"));
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(body).toContain('<body class="group/root">');
    expect(body).toContain('<iframe hidden name="htmz"');
    expect(body.trim().endsWith("</html>")).toBe(true);
  });

  test("nested layouts wrap inner-to-outer, root layout outermost", async () => {
    const body = await (await h.handler(pageRequest("/section/page"))).text();
    expect(body).toContain("<main><section><p>content</p></section></main>");
  });

  test("route head merges over layout head; route wins for title", async () => {
    const body = await (await h.handler(pageRequest("/section/page"))).text();
    expect(body).toContain("<title data-hzml-head>Page</title>");
    expect(body).not.toContain(">Root</title>");
    expect(body).toContain('<meta data-hzml-head name="desc" content="root">');
  });

  test("fallback title appears when no head is declared anywhere", async () => {
    const body = await (await bare.handler(pageRequest("/"))).text();
    expect(body).toContain("<title data-hzml-head>HZML</title>");
    expect(body).toContain("<p>home</p>");
  });
});
