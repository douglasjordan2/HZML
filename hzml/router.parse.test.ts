import { describe, expect, test } from "bun:test";
import { parseRoute } from "./router";

describe("parseRoute", () => {
  test("extracts all five blocks", () => {
    const source = [
      "<server>hzml.get(() => ({}))</server>",
      "<script>console.log('client')</script>",
      "<loader>return { n: 1 }</loader>",
      "<template><p>hi</p></template>",
      "<head><title>T</title></head>",
    ].join("\n");
    const parsed = parseRoute(source);
    expect(parsed.script).toBe("hzml.get(() => ({}))");
    expect(parsed.clientScript).toBe("console.log('client')");
    expect(parsed.loader).toBe("return { n: 1 }");
    expect(parsed.template).toBe("<p>hi</p>");
    expect(parsed.head).toBe("<title>T</title>");
  });

  test("missing blocks yield empty strings", () => {
    const parsed = parseRoute("<template><p>only</p></template>");
    expect(parsed.script).toBe("");
    expect(parsed.clientScript).toBe("");
    expect(parsed.loader).toBe("");
    expect(parsed.head).toBe("");
    expect(parsed.template).toBe("<p>only</p>");
  });

  test("block contents are trimmed", () => {
    const parsed = parseRoute("<template>\n   <p>x</p>\n  </template>");
    expect(parsed.template).toBe("<p>x</p>");
  });

  test("only the first occurrence of each block is used", () => {
    const parsed = parseRoute(
      "<template><p>first</p></template><template><p>second</p></template>",
    );
    expect(parsed.template).toBe("<p>first</p>");
  });

  test("empty source yields all-empty route", () => {
    const parsed = parseRoute("");
    expect(parsed).toEqual({ script: "", clientScript: "", loader: "", template: "", head: "" });
  });
});
