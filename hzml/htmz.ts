export function htmzHead(routeHead = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/app.css">
  ${routeHead || '<title data-hzml-head>HZML</title>'}
</head>
<body class="group/root">
`;
}

function splitHeadTags(head: string): string[] {
  const tags: string[] = [];
  const re = /<(title|script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>|<[a-zA-Z][\w-]*\b[^>]*?>/g;
  let m;
  while ((m = re.exec(head)) !== null) tags.push(m[0]);
  return tags;
}

function headKey(tag: string): string | null {
  const lower = tag.toLowerCase();
  if (lower.startsWith("<title")) return "title";
  if (lower.startsWith("<base")) return "base";
  const name = tag.match(/<meta\b[^>]*\bname=["']([^"']+)["']/i)?.[1];
  if (name) return `meta:name:${name.toLowerCase()}`;
  const property = tag.match(/<meta\b[^>]*\bproperty=["']([^"']+)["']/i)?.[1];
  if (property) return `meta:property:${property.toLowerCase()}`;
  const httpEquiv = tag.match(/<meta\b[^>]*\bhttp-equiv=["']([^"']+)["']/i)?.[1];
  if (httpEquiv) return `meta:http-equiv:${httpEquiv.toLowerCase()}`;
  const rel = tag.match(/<link\b[^>]*\brel=["']([^"']+)["']/i)?.[1];
  if (rel && rel.toLowerCase() === "canonical") return "link:rel:canonical";
  return null;
}

function markTag(tag: string): string {
  return tag.replace(/^<([a-zA-Z][\w-]*)/, "<$1 data-hzml-head");
}

// Merge head fragments (layout heads outermost-first, then the route head).
// Later sources win for singleton tags (title, meta[name|property|http-equiv],
// canonical link); everything else accumulates. Every emitted tag is marked
// with data-hzml-head so the client can swap them on partial navigation.
export function mergeHead(...sources: string[]): string {
  const keyed = new Map<string, string>();
  const extras: string[] = [];
  for (const src of sources) {
    if (!src) continue;
    for (const tag of splitHeadTags(src)) {
      const marked = markTag(tag);
      const key = headKey(tag);
      if (key) keyed.set(key, marked);
      else extras.push(marked);
    }
  }
  return [...keyed.values(), ...extras].join("\n  ");
}

export function htmzTail(scripts = "", devClient = ""): string {
  return `  <script>
    window.hzml = {
      get: function(name) {
        var el = document.querySelector('[data-d="' + name + '"]');
        return el ? (el.tagName === 'INPUT' ? el.value : el.textContent) : '';
      },
      set: function(name, fn) {
        var v = typeof fn === 'function' ? fn(hzml.get(name)) : fn;
        document.querySelectorAll('[data-d="' + name + '"]').forEach(function(e) {
          if (e.tagName === 'INPUT') e.value = v; else e.textContent = v;
        });
      }
    };

    function htmz(frame) {
      if (!frame.contentDocument || !frame.contentDocument.body.childNodes.length) return;

      setTimeout(() => {
        var headTpl = frame.contentDocument.getElementById('__hzml-head');
        if (headTpl && headTpl.content) {
          document.head.querySelectorAll('[data-hzml-head]').forEach(function(e) { e.remove(); });
          document.head.appendChild(headTpl.content.cloneNode(true));
          var newTitle = document.head.querySelector('title[data-hzml-head]');
          if (newTitle) document.title = newTitle.textContent;
        }

        [...frame.contentDocument.querySelectorAll('[id]')].forEach(e =>
          document.getElementById(e.id)?.replaceWith(e)
        );

        document.querySelectorAll('[data-fill]').forEach(e =>
          document.querySelectorAll('[data-slot="' + e.dataset.fill + '"]').forEach(t =>
            t.innerHTML = e.innerHTML
          )
        );

        document.getElementById('content')?.querySelectorAll('script').forEach(function(old) {
          var s = document.createElement('script');
          s.textContent = old.textContent;
          old.parentNode.replaceChild(s, old);
        });

        history.pushState(null, '', frame.contentWindow.location.pathname);
      });
    }
  </script>
  ${scripts}
  ${devClient}
  <iframe hidden name="htmz" onload="window.htmz(this)"></iframe>
</body>
</html>`;
}

export function htmz(body: string, head = "", scripts = "", devClient = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HZML</title>
  <link rel="stylesheet" href="/app.css">
  ${head}
</head>
<body class="group/root">
  ${body}
` + htmzTail(scripts, devClient);
}
