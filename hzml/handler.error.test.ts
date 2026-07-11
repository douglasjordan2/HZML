import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHarness, pageRequest, partialRequest, type Harness } from "./fixtures/handler-harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness({
    routes: {
      "boom.hzml":
        '<server>hzml.get(() => { throw new Error("kaboom <tag>") })</server>' +
        "<template><p>never rendered</p></template>",
    },
  });
});

afterAll(async () => {
  await h.cleanup();
});

describe("error overlay", () => {
  test("full-page: throwing server script streams the overlay and still terminates", async () => {
    const res = await h.handler(pageRequest("/boom"));
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('class="__hzml-error"');
    expect(body).toContain("kaboom &lt;tag&gt;");
    expect(body).toContain("boom.hzml");
    expect(body).not.toContain("never rendered");
    expect(body.trim().endsWith("</html>")).toBe(true);
  });

  test("partial: overlay comes back as a plain response, not a document", async () => {
    const res = await h.handler(partialRequest("/boom"));
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('class="__hzml-error"');
    expect(body).toContain("kaboom &lt;tag&gt;");
    expect(body).not.toContain("<!DOCTYPE html>");
    expect(body).not.toContain("<iframe");
  });
});
