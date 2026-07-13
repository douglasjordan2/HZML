import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHarness, pageRequest, partialRequest, type Harness } from "./fixtures/handler-harness";

let h: Harness;

const SUSPENSE_TEMPLATE =
  '<${Suspense} await=${user} fallback="loading...">${(u) => "<b>" + u + "</b>"}<//>';

beforeAll(async () => {
  h = await createHarness({
    routes: {
      "defer-ok.hzml":
        '<server>hzml.get(() => ({ user: hzml.defer(Promise.resolve("doug")) }))</server>' +
        `<template>${SUSPENSE_TEMPLATE}</template>`,
      "defer-fail.hzml":
        '<server>hzml.get(() => ({ user: hzml.defer(Promise.reject(new Error("nope"))) }))</server>' +
        `<template>${SUSPENSE_TEMPLATE}</template>`,
    },
  });
});

afterAll(async () => {
  await h.cleanup();
});

describe("full-page deferred streaming", () => {
  test("fallback renders first, resolved value streams as a swap template", async () => {
    const body = await (await h.handler(pageRequest("/defer-ok"))).text();
    const slot = body.match(/<div id="__s:(\d+)">loading\.\.\.<\/div>/);
    expect(slot).not.toBeNull();
    expect(body).toContain(`<template id="__s:${slot![1]}:r"><b>doug</b></template>`);
    expect(body).toContain(`document.getElementById('__s:${slot![1]}')`);
  });

  test("rejected deferred streams the failure fallback", async () => {
    const body = await (await h.handler(pageRequest("/defer-fail"))).text();
    expect(body).toContain("loading...");
    expect(body).toContain("Failed to load");
    expect(body).not.toContain("<b>");
  });
});

describe("partial deferred endpoint", () => {
  test("partial embeds a deferred fetch; the endpoint streams ndjson then 404s", async () => {
    const body = await (await h.handler(partialRequest("/defer-ok"))).text();
    const m = body.match(/\/__hzml\/deferred\/([a-z0-9-]+)/);
    expect(m).not.toBeNull();

    const res = await h.handler(pageRequest(`/__hzml/deferred/${m![1]}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");
    const lines = (await res.text()).trim().split("\n").map(l => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0].html).toBe("<b>doug</b>");
    expect(typeof lines[0].id).toBe("number");

    const again = await h.handler(pageRequest(`/__hzml/deferred/${m![1]}`));
    expect(again.status).toBe(404);
  });

  test("rejected deferred reports the failure html over ndjson", async () => {
    const body = await (await h.handler(partialRequest("/defer-fail"))).text();
    const m = body.match(/\/__hzml\/deferred\/([a-z0-9-]+)/);
    const res = await h.handler(pageRequest(`/__hzml/deferred/${m![1]}`));
    const lines = (await res.text()).trim().split("\n").map(l => JSON.parse(l));
    expect(lines[0].html).toContain("Failed to load");
  });

  test("unknown deferred ids 404", async () => {
    const res = await h.handler(pageRequest("/__hzml/deferred/not-a-real-id"));
    expect(res.status).toBe(404);
  });
});
