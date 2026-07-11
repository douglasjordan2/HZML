import htm from "htm";

type ComponentFn = (props: Record<string, unknown>) => string;
export type HtmlChild = string | number | boolean | null | undefined | HtmlChild[];
export type PropValue = string | number | boolean | null | undefined;

export class SafeHtml extends String {}

export function raw(value: unknown): string {
  return new SafeHtml(value == null ? "" : String(value)) as unknown as string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeChild(child: unknown): string {
  if (child == null || typeof child === "boolean") return "";
  if (child instanceof SafeHtml) return String(child);
  return escapeHtml(String(child));
}

function escapeAttr(value: unknown): string {
  if (value instanceof SafeHtml) return String(value);
  return escapeHtml(String(value));
}

export function h(type: string | ComponentFn, props: Record<string, PropValue> | null, ...children: HtmlChild[]): string {
  if (typeof type === "function") {
    return raw(type({ ...props, children: children.flat() }));
  }

  const attrs = props
    ? Object.entries(props)
        .filter(([_, v]) => v !== false && v != null)
        .map(([k, v]) => v === true ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`)
        .join("")
    : "";

  const inner = children
    .flat(Infinity)
    .map(escapeChild)
    .join("");

  if (VOID_TAGS.has(type)) {
    return raw(`<${type}${attrs}>`);
  }

  return raw(`<${type}${attrs}>${inner}</${type}>`);
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr",
  "img", "input", "link", "meta", "source", "track", "wbr",
]);

const _html = htm.bind(h);

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  const result = _html(strings, ...values);
  return raw(Array.isArray(result) ? result.flat(Infinity).map(escapeChild).join("") : result);
}
