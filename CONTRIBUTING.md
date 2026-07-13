# Contributing

## Setup

```bash
bun install
bun run dev    # dev server with hot reload at http://localhost:4965
bun run test   # full test suite
```

## Tests

Every change to `hzml/` should keep the suite green, and new behavior should
arrive with tests. The suite is plain bun:test — no extra dependencies — and
runs in well under a second; CI runs it on every pull request.

### Layout

- Tests are colocated: `hzml/<module>.test.ts` next to `hzml/<module>.ts`.
- Shared fixtures live in `hzml/fixtures/` (route trees, component projects,
  import-target modules, and the HTTP test harness).
- HTTP-level tests use `hzml/fixtures/handler-harness.ts`, which builds a
  throwaway project in a temp dir and returns the handler as a plain
  `(Request) => Promise<Response>` function.

### Rules that keep the suite fast and hermetic

- **No servers.** Call the handler function directly; drain streaming
  responses with `await response.text()`. Never `Bun.serve` in a test.
- **No real databases.** Use `createSQLiteAdapter(":memory:")` or a stub
  adapter. Never touch `data.db`.
- **Temp-dir layout matters.** The handler writes `.toggle-manifest` one
  level above the routes dir, so fixture routes must live at
  `<tmpRoot>/routes` (the harness does this for you). That write is also
  fire-and-forget — poll/retry when asserting on the manifest.
- **No real waits.** Deferred tests use pre-resolved/pre-rejected promises.
  Don't assert exact `Deferred.id` values; the counter is module-global.

### Sharp edges to know about

- `executeScript` caches compiled handlers by `filePath` (default `""`).
  Every test case needs a distinct `filePath`, or stale handlers leak
  between cases.
- `clearComponentCache()` and `clearRouteContext()` both clear the whole
  template cache too, and `loadComponents` is load-once per router —
  create a fresh `initRouter` per describe block when in doubt.
- Dynamic `import()` inside `<server>` blocks resolves relative to
  `hzml/router.ts`'s directory — use absolute `file://` specifiers for
  fixture modules.
- `h()` returns a `SafeHtml` String object; wrap in `String()` before
  `toBe()` against a string literal.

## Not yet gated

`tsc --noEmit` has pre-existing errors, so CI does not typecheck yet.
Cleaning those up (and adding the gate) is welcome work. Browser E2E and
tree-sitter grammar tests are also open territory.
