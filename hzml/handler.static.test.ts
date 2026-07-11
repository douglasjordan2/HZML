import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHarness, pageRequest, type Harness } from "./fixtures/handler-harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness({
    routes: {
      "hello.hzml": "<template><p>hello route</p></template>",
    },
    publicFiles: {
      "app.css": "body { color: blue; }",
      "data.bin": "binary-ish",
      "img/logo.svg": "<svg></svg>",
    },
  });
});

afterAll(async () => {
  await h.cleanup();
});

describe("static file serving", () => {
  test("known extension gets its mapped MIME type", async () => {
    const res = await h.handler(pageRequest("/app.css"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/css");
    expect(await res.text()).toBe("body { color: blue; }");
  });

  test("nested static paths resolve", async () => {
    const res = await h.handler(pageRequest("/img/logo.svg"));
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(await res.text()).toBe("<svg></svg>");
  });

  test("unknown extension falls back to application/octet-stream", async () => {
    const res = await h.handler(pageRequest("/data.bin"));
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  test("extension paths missing from public fall through to routing and 404", async () => {
    const res = await h.handler(pageRequest("/missing.css"));
    expect(res.status).toBe(404);
  });
});

describe("route fallthrough and 404", () => {
  test("extensionless paths are routed, not served statically", async () => {
    const res = await h.handler(pageRequest("/hello"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toContain("<p>hello route</p>");
  });

  test("unmatched routes return 404 Not Found", async () => {
    const res = await h.handler(pageRequest("/nope"));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found");
  });
});
