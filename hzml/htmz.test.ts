import { describe, expect, test } from "bun:test";
import { htmzHead, htmzTail, mergeHead } from "./htmz";

describe("mergeHead singleton tags", () => {
  test("later title wins", () => {
    expect(mergeHead("<title>A</title>", "<title>B</title>"))
      .toBe("<title data-hzml-head>B</title>");
  });

  test("later meta[name] wins", () => {
    const out = mergeHead(
      '<meta name="description" content="old">',
      '<meta name="description" content="new">',
    );
    expect(out).toBe('<meta data-hzml-head name="description" content="new">');
  });

  test("later meta[property] wins", () => {
    const out = mergeHead(
      '<meta property="og:title" content="old">',
      '<meta property="og:title" content="new">',
    );
    expect(out).toContain('content="new"');
    expect(out).not.toContain('content="old"');
  });

  test("later meta[http-equiv] wins", () => {
    const out = mergeHead(
      '<meta http-equiv="refresh" content="1">',
      '<meta http-equiv="refresh" content="2">',
    );
    expect(out).toContain('content="2"');
    expect(out).not.toContain('content="1"');
  });

  test("later canonical link wins", () => {
    const out = mergeHead(
      '<link rel="canonical" href="/old">',
      '<link rel="canonical" href="/new">',
    );
    expect(out).toContain('href="/new"');
    expect(out).not.toContain('href="/old"');
  });

  test("different meta names are distinct keys", () => {
    const out = mergeHead(
      '<meta name="description" content="d">',
      '<meta name="author" content="a">',
    );
    expect(out).toContain('name="description"');
    expect(out).toContain('name="author"');
  });
});

describe("mergeHead accumulation and marking", () => {
  test("non-singleton tags accumulate in order", () => {
    const out = mergeHead(
      '<link rel="stylesheet" href="/a.css">',
      '<link rel="stylesheet" href="/b.css">',
    );
    const aIdx = out.indexOf("/a.css");
    const bIdx = out.indexOf("/b.css");
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);
  });

  test("every emitted tag carries data-hzml-head", () => {
    const out = mergeHead(
      '<title>T</title><link rel="stylesheet" href="/a.css">',
      '<meta name="x" content="y">',
    );
    for (const tag of out.split("\n  ")) {
      expect(tag).toContain("data-hzml-head");
    }
  });

  test("empty sources are skipped", () => {
    expect(mergeHead("", "<title>X</title>", ""))
      .toBe("<title data-hzml-head>X</title>");
  });

  test("multi-line script and style bodies stay intact", () => {
    const script = '<script type="application/ld+json">\n{"@type":\n"Thing"}\n</script>';
    const style = "<style>\nbody { color: red; }\n</style>";
    const out = mergeHead(script, style);
    expect(out).toContain('{"@type":\n"Thing"}');
    expect(out).toContain("body { color: red; }");
  });
});

describe("htmzHead", () => {
  test("falls back to the marked HZML title", () => {
    expect(htmzHead()).toContain("<title data-hzml-head>HZML</title>");
  });

  test("uses the provided route head instead", () => {
    const out = htmzHead("<title data-hzml-head>Custom</title>");
    expect(out).toContain("<title data-hzml-head>Custom</title>");
    expect(out).not.toContain(">HZML</title>");
  });
});

describe("htmzTail", () => {
  test("embeds scripts and dev client before the htmz iframe", () => {
    const out = htmzTail("<script>a()</script>", "<script>dev()</script>");
    expect(out).toContain("<script>a()</script>");
    expect(out).toContain("<script>dev()</script>");
    expect(out).toContain('<iframe hidden name="htmz"');
    expect(out.trim().endsWith("</html>")).toBe(true);
  });
});
