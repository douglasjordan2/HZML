import { describe, expect, test } from "bun:test";
import { initRouter } from "./router";
import { createToggleRegistry, createDeferredRegistry, type RenderContext } from "./state";

function makeRouter(injections: Record<string, unknown> = {}) {
  return initRouter({ db: undefined, extensions: {}, injections });
}

function makeCtx(): RenderContext {
  return {
    toggleRegistry: createToggleRegistry(),
    deferredRegistry: createDeferredRegistry(),
  };
}

describe("renderTemplate", () => {
  test("interpolates data into the template", () => {
    const router = makeRouter();
    expect(router.renderTemplate("<p>${name}</p>", { name: "world" }))
      .toBe("<p>world</p>");
  });

  test("injections are available as template variables", () => {
    const router = makeRouter({ site: "HZML" });
    expect(router.renderTemplate("<p>${site}</p>", {})).toBe("<p>HZML</p>");
  });

  test("data keys named html/raw cannot shadow the template helpers", () => {
    const router = makeRouter();
    const out = router.renderTemplate(
      "<div>${html`<i>ok</i>`}${raw('<b>r</b>')}</div>",
      { html: "hijack", raw: "hijack" },
    );
    expect(out).toBe("<div><i>ok</i><b>r</b></div>");
  });

  test("reserved words and invalid identifiers in data are filtered out", () => {
    const router = makeRouter();
    const out = router.renderTemplate("<p>${name}</p>", {
      name: "ok",
      "my-key": 1,
      "class": 2,
      "123abc": 3,
    });
    expect(out).toBe("<p>ok</p>");
  });

  test("same template and key set renders correctly across repeated calls", () => {
    const router = makeRouter();
    const tmpl = "<p>${name}-${n}</p>";
    expect(router.renderTemplate(tmpl, { name: "a", n: 1 })).toBe("<p>a-1</p>");
    expect(router.renderTemplate(tmpl, { name: "b", n: 2 })).toBe("<p>b-2</p>");
  });
});

describe("renderTemplate ctx path (regression for #5's second call site)", () => {
  test("multi-root sibling map blocks flatten without commas", () => {
    const router = makeRouter();
    const tmpl = "${items.map(p => html`<b>${p}</b>`)} ${others.map(p => html`<i>${p}</i>`)}";
    const out = router.renderTemplate(
      tmpl,
      { items: ["a", "b"], others: ["c", "d"] },
      makeCtx(),
    );
    expect(out).toBe("<b>a</b><b>b</b> <i>c</i><i>d</i>");
  });

  test("plain strings at the root are escaped, SafeHtml passes through", () => {
    const router = makeRouter();
    const out = router.renderTemplate(
      "${bad} ${raw('<em>ok</em>')}",
      { bad: "<script>" },
      makeCtx(),
    );
    expect(out).toBe("&lt;script&gt; <em>ok</em>");
  });

  test("single-root templates behave identically with and without ctx", () => {
    const router = makeRouter();
    const tmpl = "<div>${items.map(p => html`<b>${p}</b>`)}</div>";
    const data = { items: ["x", "y"] };
    expect(router.renderTemplate(tmpl, data, makeCtx()))
      .toBe(router.renderTemplate(tmpl, data));
  });
});
