export function htmz(body: string, head = ""): string {
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
    const state = new Map();

    function htmz(frame) {
      if (frame.contentWindow.location.pathname === '/noop.html') {
        frame.contentWindow.location.hash.slice(1).split('&').forEach((p) => {
          const kv = p.split('=');
          state.set(kv[0], +kv[1]);
        });

        state.forEach((v, k) => {
          const ref = document.querySelector('[data-counter="' + k + '"]:not([data-step]):not(input)');
          const lo = +(ref?.dataset.min ?? -Infinity);
          const hi = +(ref?.dataset.max ?? Infinity);
          v = Math.max(lo, Math.min(hi, v));
          state.set(k, v);
          document.querySelectorAll('[data-counter="' + k + '"]').forEach((el) => {
            if (el.dataset.step) el.href = '/noop.html?' + (v + +el.dataset.step) + '#' + k + '=' + (v + +el.dataset.step);
            else if (el.tagName === 'INPUT') el.value = v;
            else el.textContent = v;
          });
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
  <iframe hidden name="htmz" onload="window.htmz(this)"></iframe>
</body>
</html>`;
}
