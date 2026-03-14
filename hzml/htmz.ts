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
  <iframe hidden name="htmz" onload="window.htmz(this)"></iframe>
</body>
</html>`;
}
