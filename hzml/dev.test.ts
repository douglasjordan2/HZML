import { describe, expect, test } from "bun:test";
import { createSSEManager, renderErrorOverlay } from "./dev";

async function nextChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read();
  return new TextDecoder().decode(value);
}

describe("createSSEManager", () => {
  test("connecting enqueues :connected and sets SSE headers", async () => {
    const mgr = createSSEManager();
    const res = mgr.handler();
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    expect(await nextChunk(reader)).toBe(":connected\n\n");
  });

  test("broadcast fans out formatted events to every connected client", async () => {
    const mgr = createSSEManager();
    const r1 = mgr.handler().body!.getReader();
    const r2 = mgr.handler().body!.getReader();
    await nextChunk(r1);
    await nextChunk(r2);
    mgr.broadcast("reload", "now");
    expect(await nextChunk(r1)).toBe("event: reload\ndata: now\n\n");
    expect(await nextChunk(r2)).toBe("event: reload\ndata: now\n\n");
  });

  test("omitted data broadcasts as an empty data line", async () => {
    const mgr = createSSEManager();
    const r = mgr.handler().body!.getReader();
    await nextChunk(r);
    mgr.broadcast("reload");
    expect(await nextChunk(r)).toBe("event: reload\ndata: \n\n");
  });

  test("a cancelled client is dropped and later broadcasts still reach the rest", async () => {
    const mgr = createSSEManager();
    const dead = mgr.handler().body!.getReader();
    const live = mgr.handler().body!.getReader();
    await nextChunk(dead);
    await nextChunk(live);
    await dead.cancel();
    mgr.broadcast("reload", "1");
    mgr.broadcast("reload", "2");
    expect(await nextChunk(live)).toBe("event: reload\ndata: 1\n\n");
    expect(await nextChunk(live)).toBe("event: reload\ndata: 2\n\n");
  });
});

describe("renderErrorOverlay", () => {
  test("Error renders escaped message, stack, and file path", () => {
    const err = new Error("boom <script>");
    const out = renderErrorOverlay(err, "/routes/x.hzml");
    expect(out).toContain("boom &lt;script&gt;");
    expect(out).toContain("/routes/x.hzml");
    expect(out).toContain("Error: boom");
  });

  test("non-Error values are stringified with no stack block", () => {
    const out = renderErrorOverlay("plain failure");
    expect(out).toContain("plain failure");
    expect(out).not.toContain('font-size:12px');
  });

  test("missing filePath omits the file line", () => {
    const out = renderErrorOverlay(new Error("x"));
    expect(out).not.toContain("<p ");
  });

  test("stackless Error omits the stack block", () => {
    const err = new Error("nostack");
    err.stack = "";
    const out = renderErrorOverlay(err, "/f.hzml");
    expect(out).toContain("nostack");
    expect(out).not.toContain('font-size:12px');
  });
});
