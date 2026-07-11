import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";
import { createHarness, pageRequest, type Harness } from "./fixtures/handler-harness";

let h: Harness;
let body: string;

async function pollFile(path: string, tries = 40): Promise<string> {
  for (let i = 0; i < tries; i++) {
    try {
      return await readFile(path, "utf-8");
    } catch {
      await new Promise(r => setTimeout(r, 25));
    }
  }
  throw new Error(`file never appeared: ${path}`);
}

beforeAll(async () => {
  h = await createHarness({
    routes: {
      "layout.hzml":
        '<template><main><${Slot} channel="side"><//>${children}</main></template>',
      "index.hzml":
        "<template>" +
        '<${Fill} channel="side">sidebar-content<//>' +
        '<${Toggled} id="menu" ontrue="open" checked=${true}>menu-body<//>' +
        '<${Toggler} id="menu" on tag="button">show<//>' +
        '<${Toggler} id="menu" off>hide<//>' +
        "</template>",
    },
  });
  body = await (await h.handler(pageRequest("/"))).text();
});

afterAll(async () => {
  await h.cleanup();
});

describe("toggle machinery on full-page renders", () => {
  test("registered toggles emit hidden inputs ahead of the body", async () => {
    const input = body.indexOf('<input type="checkbox" id="menu" checked hidden>');
    const content = body.indexOf("menu-body");
    expect(input).toBeGreaterThan(-1);
    expect(input).toBeLessThan(content);
  });

  test("generateToggleCSS emits on and off label rules", async () => {
    expect(body).toContain(
      ':has(#menu:checked) label[data-toggle-dir="on"][for="menu"] { pointer-events: none; }',
    );
    expect(body).toContain(
      'label[data-toggle-dir="off"][for="menu"] { pointer-events: none; }',
    );
    expect(body).toContain(
      ':has(#menu:checked) label[data-toggle-dir="off"][for="menu"] { pointer-events: auto; }',
    );
  });

  test("mergeChannels moves fill content into the slot and strips the fill wrapper", async () => {
    expect(body).toContain('<span data-slot="side">sidebar-content</span>');
    expect(body).not.toContain('<span data-fill=');
  });

  test("toggle manifest lands inside the temp sandbox with the used classes", async () => {
    const manifest = await pollFile(join(h.root, ".toggle-manifest"));
    expect(manifest).toContain("group-has-[#menu:checked]/root:open");
  });
});
