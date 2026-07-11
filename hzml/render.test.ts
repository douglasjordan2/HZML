import { describe, expect, test } from "bun:test";
import { html, raw } from "./render";

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
