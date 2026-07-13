import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHarness, partialRequest, type Harness } from "./fixtures/handler-harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness({
    routes: {
      "layout.hzml":
        "<head><title>Root</title></head><template><main>${children}</main></template>",
      "section/layout.hzml": "<template><section>${children}</section></template>",
      "section/page.hzml":
        "<head><title>Page</title></head><template><p>content</p></template>",
    },
  });
});

afterAll(async () => {
  await h.cleanup();
});

describe("partial (iframe) rendering", () => {
  test("payload carries the merged head in a template element", async () => {
    const res = await h.handler(partialRequest("/section/page"));
    const body = await res.text();
    expect(body).toContain('<template id="__hzml-head">');
    expect(body).toContain("<title data-hzml-head>Page</title>");
  });

  test("body is wrapped in the content div, not a full document", async () => {
    const body = await (await h.handler(partialRequest("/section/page"))).text();
    expect(body).toContain('<div id="content">');
    expect(body).not.toContain("<!DOCTYPE html>");
    expect(body).not.toContain("<iframe");
  });

  test("root layout is excluded, nested layouts are included", async () => {
    const body = await (await h.handler(partialRequest("/section/page"))).text();
    expect(body).toContain("<section><p>content</p></section>");
    expect(body).not.toContain("<main>");
  });
});
