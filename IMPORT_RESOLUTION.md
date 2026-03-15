# Import Resolution Design

**Date:** 2026-03-15
**Status:** Design decided, pre-implementation

---

## 1. The Current Model

Server blocks execute via `new Function()`:

```ts
const clean = script.replace(/^import\s.*$/gm, "");
const hzml = { get, post, redirect, db, ...extensions };
const register = new Function("hzml", ...injectionKeys, clean);
register(hzml, ...injectionValues);
```

`new Function()` creates an isolated scope with no module system. Everything the code needs must be passed in as arguments. Import statements are stripped because `import` doesn't exist in this context — it would throw a syntax error.

This model is the source of HZML's simplicity. No bundler, no module graph, no resolution algorithm. But it means users can't bring their own code into server blocks.

---

## 2. What Users Would Want to Import

1. **Their own modules** — `import { validateEmail } from "../lib/validators"` — shared logic across routes
2. **npm packages** — `import { z } from "zod"`, `import dayjs from "dayjs"`
3. **Schema definitions** — the Drizzle ORM case
4. **TypeScript types** — erased at runtime, not relevant

Case 3 is already handled by the plugin system's `inject()`. Case 4 is free. Cases 1 and 2 are the gap.

---

## 3. Options Evaluated

### Option A: Pre-resolve imports, keep `new Function()`

Before passing the script to `new Function()`, parse import statements, resolve them with `import()`, and inject the bindings as additional function parameters:

```ts
const imports = parseImports(script);
const resolved = {};
for (const imp of imports) {
  const mod = await import(resolvePath(imp.source, filePath));
  for (const binding of imp.bindings) {
    resolved[binding.local] = mod[binding.imported];
  }
}

const clean = script.replace(/^import\s.*$/gm, "");
const register = new Function("hzml", ...Object.keys(resolved), clean);
register(hzml, ...Object.values(resolved));
```

What this requires:
- An import statement parser (regex won't handle `import { a as b }`, `import *`, default imports)
- Path resolution (relative paths from route file, bare specifiers into node_modules)
- Module caching (don't re-import per request)
- Handling default vs named exports

What it preserves:
- `new Function()` stays
- No bundler, no temp files
- Server blocks feel the same

Complexity: ~100-150 lines for parser + resolver.

### Option B: Replace `new Function()` with real modules

Write server blocks to temp files, `import()` them as actual modules:

```ts
const tempPath = join(tmpDir, hash(filePath) + ".ts");
await writeFile(tempPath, `export default function(hzml) { ${script} }`);
const mod = await import(tempPath);
mod.default(hzml);
```

User imports work natively — the runtime resolves them. Zero custom resolution.

What this costs:
- Temp files on disk (or platform-specific in-memory module APIs)
- Error stack traces point to temp files, not `.hzml` files
- Module cache invalidation (`import()` is cached — hot reload breaks)
- May break runtime agnosticism (different runtimes have different module APIs)
- The `new Function()` simplicity is gone

### Option C: Convention-based auto-discovery (chosen)

No import statements. HZML discovers `lib/*.ts` at boot, imports all exports, injects them into server scope. Same pattern as components:

```
lib/
  validators.ts    → validateEmail, validateUrl available in all <server> blocks
  formatting.ts    → formatDate, formatCurrency available
```

For npm packages, the plugin system handles it:

```ts
plugins: [
  inject({ z: () => import("zod").then(m => m.z) }),
]
```

Or inline in config:

```ts
export default defineConfig({
  inject: ["zod", "dayjs"],
});
```

What this costs:
- Auto-discovery loader (~30 lines, same pattern as `loadFromDir`)
- Name collision risk (same as components — last write wins)
- No per-route scoping — everything is global

What it preserves:
- `new Function()` stays
- No bundler, no import parsing
- Consistent with components/ convention
- Zero new concepts

Complexity: ~30-50 lines.

### Option D: Hybrid

Start with Option C. Add Option A later as an escape hatch if someone proves per-route imports are needed.

---

## 4. Why Option C

### Per-route scoping is a browser concept

Import statements in frameworks like Next.js and Remix look per-route:

```ts
import { validateEmail } from "../lib/validators";
```

But on the server, this is an illusion. Node/Bun loads the module once into memory at first `import()`. Every subsequent import of the same path returns the cached module object. The "scope" is the process, not the route.

HZML already works this way. Components load once at boot into `componentCache`. Route contexts cache after first execution. Plugin extensions resolve at startup. The server has everything in memory and every route can use it.

So import resolution isn't about "which route gets access to what." It's about "how does user code get into the server's memory so server blocks can reference it." And HZML already has a pattern for that: auto-discovery of a conventioned directory.

### The pattern is proven

| Convention | Directory | Loaded at | Available in |
|---|---|---|---|
| Components | `components/` | Boot | `<template>` blocks |
| Built-in components | `hzml/components/` | Boot | `<template>` blocks |
| Plugin extensions | via `extend()` | Boot | `hzml.*` in `<server>` blocks |
| Plugin injections | via `inject()` | Boot | `<server>` and `<template>` blocks |
| **User modules** | **`lib/`** | **Boot** | **`<server>` blocks** |

User modules follow the same lifecycle as everything else. No new discovery mechanism, no new injection path.

### Comparison

| | Complexity | Bundler risk | Fits HZML patterns | Covers needs |
|---|---|---|---|---|
| **A: Pre-resolve** | ~150 lines | Low (no bundler, but building a linker) | No (introduces imports) | Full |
| **B: Real modules** | High | High (one step from needing a bundler) | No (changes execution model) | Full |
| **C: Auto-discovery** | ~30 lines | None | Yes | Most |
| **D: Hybrid** | ~30 lines now | Low | Yes initially | Full eventually |

---

## 5. Implementation

### `lib/` Discovery

A `loadLib()` function, parallel to `loadComponents()`:

```ts
async function loadLib(projectDir: string): Promise<Record<string, unknown>> {
  const libDir = join(projectDir, "lib");
  const exports: Record<string, unknown> = {};

  let entries;
  try {
    entries = await readdir(libDir);
  } catch {
    return exports;
  }

  for (const file of entries) {
    if (!file.endsWith(".ts") && !file.endsWith(".js")) continue;
    const mod = await import(join(libDir, file));
    for (const [name, value] of Object.entries(mod)) {
      if (name !== "default") {
        exports[name] = value;
      }
    }
  }

  return exports;
}
```

Default exports are skipped — named exports only. This avoids ambiguity (`export default` from two files would collide). Named exports from different files can still collide, but the collision is visible (same name = last file wins, alphabetically).

### Integration

`loadLib()` runs during boot in `index.ts`, after plugin resolution. The results merge into `frameworkCtx.injections`:

```ts
const { extensions, injections } = await resolvePlugins(options.plugins ?? [], db, projectDir);
const libExports = await loadLib(projectDir);
const allInjections = { ...libExports, ...injections };

const frameworkCtx: FrameworkContext = { db, extensions, injections: allInjections };
```

Plugin injections override lib exports (spread last). This is intentional — a plugin that injects `eq` should override a user-defined `eq` in `lib/`.

### Hot Reload

The file watcher in `index.ts` already watches `routes/` and `components/`. Adding `lib/` to the watch list and re-running `loadLib()` on change would enable hot reload for user modules. The lib exports feed into `frameworkCtx.injections`, which are read from the closure on every request — no cache invalidation needed beyond re-running the import.

Dynamic `import()` caches modules by URL. To bust the cache on hot reload, append a query param:

```ts
const mod = await import(join(libDir, file) + `?v=${Date.now()}`);
```

This is a known pattern for Bun/Deno. Node.js may need `--experimental-import-meta-resolve` or a different approach.

### What Users See

```
project/
  lib/
    validators.ts
    formatting.ts
  routes/
    todos.hzml
  components/
  hzml/
```

```ts
// lib/validators.ts
export function validateEmail(email: string): boolean {
  return /^[^@]+@[^@]+\.[^@]+$/.test(email);
}

export function validateTitle(title: string): string | null {
  if (!title || title.trim().length === 0) return "Title is required";
  if (title.length > 200) return "Title must be under 200 characters";
  return null;
}
```

```html
<!-- routes/todos.hzml -->
<server>
  hzml.post((request) => {
    const error = validateTitle(request.body.title)
    if (error) return { error, todos: [] }
    hzml.db.run("INSERT INTO todos (title) VALUES (?)", [request.body.title])
    const todos = hzml.db.query("SELECT * FROM todos")
    return { todos }
  })
</server>
```

No import statement. `validateTitle` is available because it's exported from a file in `lib/`. Same as how `Link` is available because it's a component in `components/`.

---

## 6. npm Packages

User modules in `lib/` handle case 1 (user's own code). For npm packages (case 2), two paths:

### Plugin injection (explicit)

```ts
// hzml.config.ts or index.ts
import zod from "@hzml/zod";

hzml({
  plugins: [zod()],
});
```

The Zod plugin calls `ctx.inject("z", z)` during setup.

### Wrapper in lib/ (no plugin needed)

```ts
// lib/zod.ts
export { z } from "zod";
```

One line. `z` is now available in all server blocks. No plugin system needed. The user just re-exports what they want from `lib/`.

This second approach means the plugin system isn't required for npm package injection — `lib/` handles it naturally. Plugins are for packages that need setup logic (Drizzle needs to wrap `bun:sqlite`, auth needs session config). Simple re-exports belong in `lib/`.

---

## 7. Open Questions

**Subdirectories in lib/.** Should `lib/db/queries.ts` be discovered? Recursive discovery adds complexity and makes collision tracking harder. Starting with flat `lib/*.ts` is simpler. Users who need organization can use one file with multiple exports.

**Name collision reporting.** When two files in `lib/` export the same name, should HZML warn? Currently last-write-wins silently (same as components). A startup warning would be helpful.

**lib/ in server blocks only, or templates too?** Components and plugin injections are available in templates. Should lib exports be? Probably yes — a formatting function (`formatDate`) is useful in templates. The injection path is the same (`frameworkCtx.injections` merges into `allData` in `renderTemplate`).

---

## 8. What This Intentionally Does NOT Do

- **No import statements in `.hzml` files.** The `import` keyword does not work and will not be made to work. The auto-discovery convention replaces it.
- **No bundler.** Module resolution uses the runtime's native `import()`. No webpack, no vite, no esbuild.
- **No per-route scoping.** Everything in `lib/` is global. This matches how servers actually work — modules load once into process memory.
- **No dynamic imports in server blocks.** `await import("...")` inside a `<server>` block won't work because the block runs inside `new Function()`. All imports resolve at boot.

---

## 9. Client-Side Imports

Server-side imports resolve at boot via `lib/` and plugins. Client-side imports are a different problem — the browser needs to resolve modules at runtime.

### The Platform Answer: Import Maps

Import maps are a browser-native feature that maps bare specifiers to URLs. They work without a bundler, without a build step, and without framework infrastructure:

```html
<script type="importmap">
{
  "imports": {
    "chart.js": "https://esm.sh/chart.js@4",
    "confetti": "https://esm.sh/canvas-confetti@1"
  }
}
</script>

<script type="module">
import { Chart } from "chart.js";
</script>
```

The problem is that import maps are invisible plumbing. The developer has to know about `<script type="importmap">`, know to put it before any module scripts, know to use `type="module"` on their script blocks, and know about ESM CDNs like esm.sh or jspm.io. That's a lot of prerequisite knowledge for "I want to use Chart.js on this page."

### The HZML Design Principle

Every built-in component in HZML exists because the underlying mechanism is not immediately perceptible:

- `<${Link}>` exists because `target="htmz"` is an implementation detail of iframe navigation
- `<${Toggled}>` exists because hidden checkboxes + CSS `:has()` selectors are not how a developer thinks about "show/hide this panel"
- `<${Slot}>` exists because `data-slot` / `data-fill` attributes and the merge algorithm are framework internals

The pattern: **if the developer has to think about how the browser does it rather than what they want to happen, the framework should bridge that gap.**

Import maps fall into this category. The developer thinks "I want to use Chart.js in this script." They shouldn't have to think about import map JSON, script ordering, ESM CDN URLs, or `type="module"`.

### Proposed: `<imports>` Block

A new block type in `.hzml` files alongside `<server>`, `<template>`, `<loader>`, and `<script>`:

```html
<imports>
  chart.js: 4
  confetti: canvas-confetti@1
</imports>

<script>
  import { Chart } from "chart.js";

  const ctx = document.getElementById("myChart");
  new Chart(ctx, { type: "bar", data: chartData });
</script>
```

What the framework does at render time:

1. Parses the `<imports>` block — each line is `localName: package@version` (or just `package@version` if the names match)
2. Generates the `<script type="importmap">` JSON from the declarations
3. Injects it into the HTML head (before any scripts)
4. Emits the `<script>` block as `<script type="module">` (because import statements require module context)

What the developer sees: a simple list of what they want to use, then normal `import` statements in their script. No JSON to write, no CDN URLs to look up, no `type="module"` to remember.

### Resolution

The `<imports>` block resolves package names to URLs using a CDN convention. esm.sh is a natural default — it serves any npm package as an ES module:

```
chart.js: 4         → https://esm.sh/chart.js@4
confetti: canvas-confetti@1  → https://esm.sh/canvas-confetti@1
three: 0.160        → https://esm.sh/three@0.160
```

A configurable CDN base URL (defaulting to `https://esm.sh/`) keeps this flexible:

```ts
// hzml.config.ts
export default defineConfig({
  cdn: "https://esm.sh/",
});
```

### Route-Level vs Global

Import maps must appear once per HTML document, before any module scripts. If different routes declare different `<imports>`, the framework merges them into one map in the shell.

But the simpler model: `<imports>` in the root `layout.hzml` declares everything available globally. Individual routes just use `import` in their `<script>` blocks. This matches HZML's server-side pattern — everything is global, loaded once.

```html
<!-- layout.hzml -->
<imports>
  chart.js: 4
  confetti: canvas-confetti@1
  alpinejs: alpinejs@3
</imports>

<template>
  ...
</template>
```

```html
<!-- routes/dashboard.hzml -->
<script>
  import { Chart } from "chart.js";
  // just works — the import map is in the layout
</script>
```

### What `<script>` Becomes

Currently, `parseRoute` extracts `<script>` blocks and emits them as `<script>` tags. When an `<imports>` block is present (in the route or any parent layout), the emitted script tag becomes `<script type="module">` automatically. The developer doesn't choose — if there are imports, it's a module.

If no `<imports>` block exists anywhere in the layout chain, `<script>` blocks emit as regular scripts (current behavior). No breaking change.

### What This Looks Like End to End

```html
<!-- layout.hzml -->
<imports>
  chart.js: 4
</imports>

<template>
  <div id="content">${children}</div>
</template>
```

```html
<!-- routes/dashboard.hzml -->
<server>
  hzml.get((request) => {
    const sales = hzml.db.query("SELECT month, total FROM sales")
    return { sales }
  })
</server>

<template>
  <h1>Dashboard</h1>
  <canvas id="sales-chart"></canvas>
</template>

<script>
  import { Chart } from "chart.js";

  const el = document.getElementById("sales-chart");
  new Chart(el, {
    type: "line",
    data: {
      labels: ${JSON.stringify(sales.map(s => s.month))},
      datasets: [{ data: ${JSON.stringify(sales.map(s => s.total))} }]
    }
  });
</script>
```

Rendered HTML:

```html
<script type="importmap">
{"imports":{"chart.js":"https://esm.sh/chart.js@4"}}
</script>
<!-- ... -->
<script type="module">
  import { Chart } from "chart.js";
  // ...
</script>
```

The developer wrote a flat list of packages and a normal import statement. The framework handled the import map JSON, the CDN URL, the script type, and the injection order.

### Open Questions

**CDN reliability.** esm.sh is a single point of failure. Should the framework support fallback CDNs? Or is this the user's responsibility via the config?

**Versioning.** The `<imports>` format shows `chart.js: 4`. Is this a semver major? An exact version? esm.sh resolves `@4` to the latest 4.x — that's probably the right default.

**Sub-path imports.** Some packages need sub-path imports: `import "chart.js/auto"`. The import map spec supports this with trailing slashes. The `<imports>` block syntax would need to handle it.

**Self-hosted modules.** Users who vendor their JS or use private registries need to point at their own URLs. The `<imports>` format could support full URLs as an escape hatch: `chart: https://my-cdn.com/chart.js@4/+esm`.

### Local Modules

Import maps resolve any URL the browser can reach, including local paths served from `public/`:

```html
<imports>
  chart.js: 4
  my-utils: ./js/utils.js
</imports>
```

A relative path (starts with `./` or `/`) resolves against the static file server. A bare name with a version gets the CDN prefix. The distinction is clear from the syntax:

```
chart.js: 4              → https://esm.sh/chart.js@4    (CDN)
my-utils: ./js/utils.js  → /js/utils.js                 (local, served from public/)
```

This lets developers put their own client-side JS in `public/js/` and import it alongside npm packages with the same syntax.

---

## 10. Why Shared Code Is a Non-Problem

Frameworks like Next.js and Remix need to share code between server and client because of hydration — the client re-executes server component logic to "take over" the DOM. This creates a real need for shared validation, formatting, and business logic modules that run on both sides.

HZML has no hydration. The server renders HTML. The client displays it. This eliminates the shared-code problem entirely.

**Form validation** — the classic shared-code example. In HZML, validation runs in the `<server>` block. The server validates the POST, returns errors, and the page re-renders with error messages. The client never validates — the round-trip is fast enough. No shared validation module needed.

**Formatting functions** — `formatCurrency(1999)` → `"$19.99"`. In HZML, the server renders the formatted string in the template. The client displays what the server sent. The only case where client-side formatting matters is in Dispatcher transforms, which are inline lambdas: `transform=${v => '$' + (v / 100).toFixed(2)}`. Not enough to justify a shared module.

**Constants and enums** — status values, config flags. The server renders HTML with the right values baked in. The client doesn't need to know the enum definition — it displays what it received.

Every shared-code example dissolves when you follow HZML's model: the server renders the truth, the client displays it. Client-side code is only needed for things that are purely client-side (charts, animations, interactive widgets). Those don't need server logic. Server-side code (validation, data access, formatting) doesn't need to run on the client.

The two-copy concern — having a function in `lib/` for the server and separately in `public/js/` for the client — only arises if the same logic genuinely needs to execute in both places. In HZML's architecture, it doesn't.

---

## 11. Position on Bundlers

HZML does not use a bundler. This is not an ideological position — it's a practical one. Nothing in the current architecture requires one.

The server side will never need a bundler. `new Function()` with injected scope, `lib/` auto-discovery, and the plugin system cover every server-side import case without module resolution.

The client side doesn't need one today. `<imports>` blocks generate browser-native import maps. The browser resolves modules at runtime. No build step.

If a bundler ever becomes necessary, it would only touch the client-side build path:

- **Tree shaking** — shipping only the parts of a library the client uses
- **Minification** — smaller payloads for production
- **TypeScript in client scripts** — `<script>` blocks currently can't use TS

These are production optimizations, not development requirements. A bundler could sit behind `hzml build` and process the import map into optimized bundles. The `<imports>` syntax wouldn't change — the developer experience stays the same, the build step is an optional optimization layer.

The server-side execution model (`new Function()`, closures, injection) is unaffected regardless of what happens on the client side.
