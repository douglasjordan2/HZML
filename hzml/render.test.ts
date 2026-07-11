import { describe, expect, test } from "bun:test";
import { h, html, raw } from "./render";

describe("html multi-root templates", () => {
  test("flattens sibling array interpolations without commas", () => {
    const items = ["a", "b"];
    const others = ["c", "d"];
    const out = html`${items.map(p => html`<b>${p}</b>`)} ${others.map(p => html`<i>${p}</i>`)}`;
    expect(String(out)).toBe("<b>a</b><b>b</b> <i>c</i><i>d</i>");
  });

  test("flattens deeply nested arrays", () => {
    const out = html`${[["x", ["y"]], "z"]} tail`;
    expect(String(out)).toBe("xyz tail");
  });

  test("drops null, undefined, and boolean root children", () => {
    const out = html`${null}a${undefined}b${false}c${true}`;
    expect(String(out)).toBe("abc");
  });

  test("escapes plain strings at the root", () => {
    const out = html`${"<script>"} ${"&"}`;
    expect(String(out)).toBe("&lt;script&gt; &amp;");
  });

  test("passes SafeHtml through unescaped without double-escaping", () => {
    const out = html`${raw("<em>ok</em>")} ${html`<b>${"<x>"}</b>`}`;
    expect(String(out)).toBe("<em>ok</em> <b>&lt;x&gt;</b>");
  });
});

describe("html single-root templates", () => {
  test("renders nested array children inside an element", () => {
    const items = ["a", "b"];
    const out = html`<div>${items.map(p => html`<b>${p}</b>`)}</div>`;
    expect(String(out)).toBe("<div><b>a</b><b>b</b></div>");
  });

  test("escapes interpolated text inside elements", () => {
    const out = html`<p>${"<script>alert(1)</script>"}</p>`;
    expect(String(out)).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });
});

describe("h attributes", () => {
  test("escapes double quotes in attribute values", () => {
    expect(String(h("div", { title: 'a"b' }))).toBe('<div title="a&quot;b"></div>');
  });

  test("true renders a bare attribute", () => {
    expect(String(h("input", { disabled: true }))).toBe("<input disabled>");
  });

  test("false and null attributes are dropped", () => {
    expect(String(h("input", { disabled: false, readonly: null }))).toBe("<input>");
  });

  test("SafeHtml attribute values bypass escaping", () => {
    expect(String(h("div", { title: raw("a&amp;b") }))).toBe('<div title="a&amp;b"></div>');
  });
});

describe("h void tags", () => {
  test("no closing tag, no trailing slash", () => {
    expect(String(h("img", { src: "x" }))).toBe('<img src="x">');
  });

  test("children are ignored", () => {
    expect(String(h("br", null, "ignored"))).toBe("<br>");
  });
});

describe("h component functions", () => {
  test("children flatten one level only, unlike host elements' flat(Infinity)", () => {
    let received: unknown;
    const comp = (props: Record<string, unknown>) => {
      received = props.children;
      return raw("<x></x>");
    };
    h(comp, null, ["a", ["b", ["c"]]] as never);
    expect(received).toEqual(["a", ["b", ["c"]]]);
    expect(String(h("div", null, ["a", ["b", ["c"]]] as never))).toBe("<div>abc</div>");
  });

  test("props pass through alongside children", () => {
    let received: Record<string, unknown> = {};
    const comp = (props: Record<string, unknown>) => {
      received = props;
      return raw("<x></x>");
    };
    h(comp, { name: "z" } as never, "kid");
    expect(received.name).toBe("z");
    expect(received.children).toEqual(["kid"]);
  });
});

describe("raw", () => {
  test("null and undefined become empty SafeHtml", () => {
    expect(String(raw(null))).toBe("");
    expect(String(raw(undefined))).toBe("");
    expect(String(html`${raw(null)}ok`)).toBe("ok");
  });
});
