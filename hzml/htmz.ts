export function htmz(body: string, head = "", scripts = ""): string {
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
  <script>
    window.hzml = { on: function(name, fn) { window.hzml._h.set(name, fn); }, _h: new Map() };

    function htmz(frame) {
      if (frame.contentWindow.location.pathname === '/noop.html') {
        frame.contentWindow.location.hash.slice(1).split('&').forEach(function(p) {
          var kv = p.split('=');
          var handler = window.hzml._h.get(kv[0]);
          if (handler) handler(kv[1]);
        });
        return;
      }

      if (!frame.contentDocument || !frame.contentDocument.body.childNodes.length) return;

      setTimeout(() => {
        [...frame.contentDocument.querySelectorAll('[id]')].forEach(e =>
          document.getElementById(e.id)?.replaceWith(e)
        );

        document.querySelectorAll('[data-emit]').forEach(e =>
          document.querySelectorAll('[data-listen="' + e.dataset.emit + '"]').forEach(t =>
            t.innerHTML = e.innerHTML
          )
        );

        history.pushState(null, '', frame.contentWindow.location.pathname);
      });
    }
  </script>
  ${scripts}
  <iframe hidden name="htmz" onload="window.htmz(this)"></iframe>
</body>
</html>`;
}
