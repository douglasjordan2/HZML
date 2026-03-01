import htm from "htm";

type ComponentFn = (props: Record<string, unknown>) => string;
type HtmlChild = string | number | boolean | null | undefined | HtmlChild[];
type PropValue = string | number | boolean | null | undefined;

function h(type: string | ComponentFn, props: Record<string, PropValue> | null, ...children: HtmlChild[]): string {
  if (typeof type === "function") {
    return type({ ...props, children: children.flat() });
  }

  const attrs = props
    ? Object.entries(props)
        .filter(([_, v]) => v !== false && v != null)
        .map(([k, v]) => v === true ? ` ${k}` : ` ${k}="${v}"`)
        .join("")
    : "";

  const inner = children
    .flat(Infinity)
    .map((c) => (c == null || c === false ? "" : String(c)))
    .join("");

  if (VOID_TAGS.has(type)) {
    return `<${type}${attrs}>`;
  }

  return `<${type}${attrs}>${inner}</${type}>`;
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr",
  "img", "input", "link", "meta", "source", "track", "wbr",
]);

const _html = htm.bind(h);

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  const result = _html(strings, ...values);
  return Array.isArray(result) ? result.join("") : result;
}
