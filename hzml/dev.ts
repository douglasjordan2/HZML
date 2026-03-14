import { watch } from "fs";
import { access } from "fs/promises";

interface SSEManager {
  broadcast(event: string, data?: string): void;
  handler(): Response;
}

export function createSSEManager(): SSEManager {
  const controllers = new Set<ReadableStreamDefaultController>();

  function broadcast(event: string, data?: string) {
    const msg = `event: ${event}\ndata: ${data ?? ""}\n\n`;
    for (const ctrl of controllers) {
      try {
        ctrl.enqueue(new TextEncoder().encode(msg));
      } catch {
        controllers.delete(ctrl);
      }
    }
  }

  function handler(): Response {
    let ctrl: ReadableStreamDefaultController;
    const stream = new ReadableStream({
      start(controller) {
        ctrl = controller;
        controllers.add(controller);
        controller.enqueue(new TextEncoder().encode(":connected\n\n"));
      },
      cancel() {
        controllers.delete(ctrl);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  return { broadcast, handler };
}

export function startWatcher(
  dirs: string[],
  onChange: (filePath: string, kind: "change" | "create" | "delete") => void,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { filePath: string; kind: "change" | "create" | "delete" } | null = null;

  for (const dir of dirs) {
    try {
      watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename || !filename.endsWith(".hzml")) return;
        const filePath = `${dir}/${filename}`;

        if (timer) clearTimeout(timer);

        pending = { filePath, kind: "change" };
        timer = setTimeout(async () => {
          timer = null;
          if (!pending) return;
          const { filePath: fp } = pending;
          try {
            await access(fp);
            pending.kind = "change";
          } catch {
            pending.kind = "delete";
          }
          onChange(pending.filePath, pending.kind);
          pending = null;
        }, 50);
      });
    } catch (err) {
      console.warn(`\x1b[33m[hzml] fs.watch failed for ${dir}:\x1b[0m`, err);
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderErrorOverlay(err: unknown, filePath?: string): string {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error && err.stack ? err.stack : "";
  const file = filePath ? `<p style="margin:0 0 8px;opacity:0.7">${escapeHtml(filePath)}</p>` : "";

  return `<div class="__hzml-error" style="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);color:#ff6b6b;font-family:monospace;padding:32px;overflow:auto">
<h2 style="margin:0 0 12px;color:#ff4444">Build Error</h2>
${file}
<pre style="white-space:pre-wrap;color:#ffaaaa;margin:0">${escapeHtml(message)}</pre>
${stack ? `<pre style="white-space:pre-wrap;color:#888;margin:16px 0 0;font-size:12px">${escapeHtml(stack)}</pre>` : ""}
</div>`;
}

export const SSE_CLIENT_SCRIPT = `<script>
(function() {
  var es = new EventSource('/__hzml/sse');
  es.addEventListener('reload', function() { location.reload(); });
  es.onerror = function() {
    es.close();
    setTimeout(function() { location.reload(); }, 1000);
  };
})();
</script>`;
