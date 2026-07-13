# HZML

A micrometaframework built on [HTMZ](https://leanrada.com/htmz/) and [HTM](https://github.com/developit/htm). Server-rendered HTML with client-side reactivity using web primitives — no bundler, no virtual DOM, no hydration.

## How it works

HZML uses a hidden `<iframe name="htmz">` for navigation. When a link or form targets that iframe, the browser loads the response into it. The iframe's `onload` handler finds every element with an ID in the response and replaces the matching element on the page, then updates the URL via `history.pushState`. No client-side JavaScript framework, no fetch calls — just native browser behavior.

The server decides whether to send a full page or a partial based on the browser's `Sec-Fetch-Dest` header. Routes are `.hzml` files with `<server>` and `<template>` blocks. `<server>` runs on the server (data loading, form handling). `<template>` renders to HTML.

## What even is "state" anyway?

A sidebar slides in. A tab switches. An accordion opens. For the last decade, the industry's answer to these interactions has been: download a JS file, construct a virtual representation of your document in memory, diff it against the previous version, and surgically patch the real DOM. All so a `<div>` can do something that looks awfully like `display: none` -> `display: block`.

Real state management is a database transaction, a session token, a shopping cart persisted across tabs. But showing and hiding a panel? Highlighting the active tab? That's a boolean. The browser has had a native boolean state primitive since HTML 2.0 — `<input type="checkbox">`. It persists across interactions. It's queryable with CSS. It requires zero JavaScript to toggle.

HZML takes this literally. Instead of shipping a reactivity engine to the client, we use what's already there:

- **Hidden checkboxes** store boolean state (open/closed, visible/hidden)
- **Hidden radio buttons** store enum state (which tab, which accordion item)
- **Labels** dispatch state changes (clicking a label toggles its linked input)
- **CSS `:has()`** reacts to state changes (if body has a checked #drawer, show the drawer)
- **`onclick` + `hzml.set()`** handles computed values (10 lines of client JS in the shell — buttons call transforms directly, no iframe round-trip)

No virtual DOM. No diffing. No re-rendering. No hydration. No `useState`, no `useEffect`, no `subscribe()`. The browser does all of it natively, and it's been able to for years.

### The escalation ladder

Not every interaction needs the same tool. HZML provides three tiers, each adding capability:

1. **Toggled/Toggler** — boolean/enum, zero JS, CSS `:has()`
2. **Dispatcher/Dispatched** — computed values, minimal client JS (`onclick` + `hzml.set()`)
3. **`<script>` + `hzml.get()`/`hzml.set()`** — cross-channel logic, custom client behavior
4. **HTMZ navigation** — server state, forms, data mutations

Toggles cover drawers, modals, tabs, accordions, dropdowns, tooltips — anything that's fundamentally "show this, hide that." Dispatcher covers quantity steppers, rating pickers, bounded inputs — anything that transforms a value. `<script>` blocks with `hzml.get()`/`hzml.set()` handle cross-channel dependencies like calculators. For everything beyond that — data fetching, form submission, real-time updates, anything that touches the server — HZML uses the server round-trip. Click a link, the server responds with HTML, HTMZ swaps it into the page. That's not a limitation, that's the architecture. The server is the state machine. The client is a viewport.

## Quick start

```bash
bun install
bun run dev
```

Open `http://localhost:4965`.

## Project structure

```
index.ts              # Entry point — 3 lines
routes/
  layout.hzml         # Root layout (wraps all pages)
  index.hzml          # /
  about.hzml          # /about
  todos.hzml          # /todos (GET + POST)
  blog/
    layout.hzml       # Nested layout (blog sidebar)
    index.hzml        # /blog
    $id.hzml          # /blog/:id (dynamic param)
components/           # Project components (globally available)
public/               # Static files
app.css               # Tailwind input
hzml/                 # Framework internals
```

## Routes

Routes are `.hzml` files in `routes/`. At startup, the framework scans the directory tree once and builds an in-memory route table. Incoming requests match against this table with zero filesystem I/O — just Map lookups. When a route file is added, removed, or renamed during development, the watcher rebuilds the table automatically.

A route is a `.hzml` file with an optional `<server>` block and a `<template>` block:

```html
<server>
  hzml.get((request) => {
    return {
      title: "Home",
      message: "Hello from HZML.",
    }
  })
</server>

<template>
  <div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</template>
```

### Server functions

Server blocks receive a single `hzml` object with everything injected:

- **`hzml.get(fn)`** — handle GET requests, return data for the template
- **`hzml.post(fn)`** — handle POST requests with `request.body`
- **`hzml.redirect(url)`** — redirect to another route
- **`hzml.db`** — database adapter (SQLite by default)

```html
<server>
  const items = []

  hzml.get((request) => {
    return { items }
  })

  hzml.post((request) => {
    items.push(request.body.title)
    return { items }
  })
</server>
```

### Imports in server blocks

Server blocks support ES `import` statements. Imports are transformed to dynamic `await import(...)` at registration time, so any package, file, or built-in module is available:

```html
<server>
  import { readFile } from "fs/promises";
  import postgres from "postgres";

  const sql = postgres(process.env.DATABASE_URL);

  hzml.get(async () => {
    const config = JSON.parse(await readFile("./site.json", "utf-8"));
    const rows = await sql`select * from posts limit ${config.feedSize}`;
    return { config, rows };
  });
</server>
```

Default, named, namespace, and side-effect imports all work. Imports run once per route, when the route is first registered.

### Dynamic params

Name a file with `$` prefix — `$id.hzml` matches `/blog/anything` and exposes `request.params.id`:

```html
<server>
  hzml.get((request) => {
    return { id: request.params.id }
  })
</server>

<template>
  <h1>Post ${id}</h1>
</template>
```

### Per-route metadata

A route can declare its own `<head>` block alongside `<server>` / `<template>`. The framework keeps the universal chrome (charset, viewport, stylesheet) and splices the route's head into the document head for full-page renders. This gives each route its own `<title>`, `meta description`, canonical link, Open Graph tags, and page-specific JSON-LD — essential for multi-page sites where every page would otherwise inherit the homepage's metadata:

```html
<head>
  <title>My Page</title>
  <meta name="description" content="..." />
  <link rel="canonical" href="https://example.com/my-page" />
  <script type="application/ld+json">{ "@type": "WebPage" }</script>
</head>

<template>
  <h1>My Page</h1>
</template>
```

The `<head>` block is injected verbatim — it is **not** run through the template engine, so literal JSON-LD with `{ }` is safe (no `${}` interpolation). A route that omits `<head>` falls back to a default `<title>`.

**Layouts can contribute base head tags.** A `layout.hzml` may declare its own `<head>` for site-wide defaults (default title, OG `site_name`, favicon). The framework merges heads from the outermost layout inward, then the route on top. Singleton tags — `<title>`, `<meta name>`, `<meta property>`, `<meta http-equiv>`, and `<link rel="canonical">` — are de-duplicated, with the most specific source winning (route over layout). Everything else (extra `<link>`s, multiple JSON-LD blocks) accumulates.

```html
<!-- routes/layout.hzml -->
<head>
  <title>My Site</title>
  <meta property="og:site_name" content="My Site" />
  <link rel="icon" href="/favicon.ico" />
</head>
```

**Head updates on HTMZ navigation, too.** Merged head tags are tagged internally so that when you navigate via an HTMZ link, the client swaps the document's `<title>` and metadata to match the destination page — keeping the browser tab title, canonical, and OG tags correct without a full reload. The universal chrome (charset, viewport, stylesheet) is never touched.

### Layouts

Add `layout.hzml` at any directory level. Layouts nest automatically — a route in `routes/blog/` gets both the root layout and the blog layout:

```html
<template>
  <nav>...</nav>
  <div id="content">
    ${children}
  </div>
</template>
```

## Components

Components are `.hzml` files in `components/`. They're globally available in all templates — no imports needed. The `<//>` closing tag is HTM shorthand — it closes the nearest open component.

Built-in components ship with the framework:

**Link** and **Form** exist because every `<a>` and `<form>` needs `target="htmz"` for iframe navigation. Rather than making developers remember that on every element, the components handle it:

```html
<${Link} href="/about" class="text-blue-600">About<//>
<!-- renders as: <a href="/about" target="htmz" class="text-blue-600">About</a> -->

<${Form} action="/todos">
  <input type="text" name="title" />
  <button type="submit">Add</button>
<//>
<!-- renders as: <form method="post" action="/todos" target="htmz">...</form> -->
```

**Slot** and **Fill** project content across page boundaries — nav badges, sidebars, footers — using named channels:

```html
<!-- in layout.hzml (the hole) -->
<${Slot} channel="todo-count" />

<!-- in todos.hzml (the content) -->
<${Fill} channel="todo-count">
  <span class="badge">${todos.length}</span>
<//>
```

On full page loads, the server merges fill content into matching slots and strips the fills. On partial loads, the iframe's `onload` handler does the same merge client-side. Multiple slots can subscribe to the same channel.

**Toggled**, **Toggler**, **Dispatcher**, and **Dispatched** handle client-side reactivity — see below. Slot/Fill handles cross-route content projection (where content appears); Dispatcher/Dispatched handles local interactive state (what the current value is).

You can create your own components by adding `.hzml` files to a `components/` directory in your project root. They follow the same `<template>` format as routes.

### Component loaders

Components can include a `<loader>` block for server-side logic. The loader runs before the template renders, receives the component's props as local variables, and can return new variables or override existing ones.

```html
<!-- components/Greeting.hzml -->
<loader>
  const name = typeof who === "string" ? who : "world";
  const time = new Date().getHours();
  const period = time < 12 ? "morning" : time < 17 ? "afternoon" : "evening";
  return { greeting: "Good " + period + ", " + name + "!" };
</loader>

<template>
  <p class="${cls || ''}">${greeting}</p>
</template>
```

```html
<${Greeting} who="Douglas" class="text-lg" />
<!-- renders as: <p class="text-lg">Good afternoon, Douglas!</p> -->
```

Loaders can also return a raw string to replace the entire component output, which is useful for validation or early returns:

```html
<!-- components/Badge.hzml -->
<loader>
  if (!children) return "<span>empty badge</span>";
  const colors = {
    info: "bg-blue-100 text-blue-800",
    success: "bg-green-100 text-green-800",
    warning: "bg-yellow-100 text-yellow-800",
    error: "bg-red-100 text-red-800",
  };
  return { badgeClass: colors[variant] || colors.info };
</loader>

<template>
  <span class="inline-block px-2 py-1 text-xs font-medium rounded-full ${badgeClass}">${children}</span>
</template>
```

Loaders have access to `hzml.db` for database queries, making components fully self-contained — a component can own both its data and its rendering:

```html
<!-- components/TodoCount.hzml -->
<loader>
  const rows = hzml.db.query("SELECT COUNT(*) as count FROM todos")
  const count = rows[0]?.count || 0
  if (count === 0) return ""
  return { count }
</loader>

<template>
  <span class="${cls || ''}">${count} todo${count !== 1 ? 's' : ''}</span>
</template>
```

```html
<${TodoCount} class="font-bold" />
<!-- renders as: <span class="font-bold">3 todos</span> -->
```

No route-level loader needed. No prop drilling. The component queries what it needs, every time it renders.

Loaders are synchronous and have no access to `hzml.get()`, `hzml.post()`, `hzml.redirect()`, or the request object — those are `<server>` block concepts for routes. The `<loader>` name is the convention: loaders load and transform data, servers handle HTTP.

## Templating

Templates use [HTM](https://github.com/developit/htm) — JSX-like syntax in tagged template literals. No transpiler, no build step for templates. Everything runs server-side as string concatenation.

```html
<!-- expressions -->
<h1>${title}</h1>

<!-- conditionals -->
${showMessage && html`<p>Visible!</p>`}

<!-- iteration -->
${items.map(item => html`<li>${item}</li>`)}

<!-- components -->
<${MyComponent} prop="value">children<//>
```

## Client Reactivity

### Toggled and Toggler

**Toggled** — reactive content that responds to boolean or enum state. Creates a hidden checkbox (or radio button) automatically and wraps its children with reactive Tailwind classes.

```html
<${Toggled} id="drawer" ontrue="translate-x-0 opacity-100" onfalse="translate-x-full opacity-0"
  class="fixed top-0 right-0 w-80 h-full bg-white shadow-xl transition-all duration-300">
  Drawer content here
<//>
```

- `id` — names the state. Becomes the hidden input's id.
- `ontrue` — classes applied when checked. Each gets `group-has-[#id:checked]/root:` prepended automatically.
- `onfalse` — classes applied unconditionally (the "default" visual state).
- `name` — optional. Makes it a radio button for enum state (tabs).
- `checked` — optional. Sets initial state.

Multiple Toggled components can share the same `id` — only one hidden input is created.

**Toggler** — a trigger that changes state. Renders a `<label>` pointing at a Toggled's id.

```html
<${Toggler} id="drawer" class="cursor-pointer">Open<//>
```

- `on` — can only check (becomes unclickable once checked)
- `off` — can only uncheck (becomes unclickable when unchecked)
- Neither — toggles both directions

#### Tabs with radio buttons

Pass `name` to group Toggled components as radio buttons. The browser enforces mutual exclusion — checking one unchecks the others. No JavaScript coordination needed.

```html
<${Toggler} id="tab-features">Features<//>
<${Toggler} id="tab-pricing">Pricing<//>

<${Toggled} id="tab-features" name="tabs" checked ontrue="block" onfalse="hidden">
  Features content
<//>
<${Toggled} id="tab-pricing" name="tabs" ontrue="block" onfalse="hidden">
  Pricing content
<//>
```

### Dispatcher and Dispatched

**Dispatcher** — a trigger that computes a new value. Renders a `<button>` with an `onclick` that calls `hzml.set()`.

**Dispatched** — reactive content that displays the current value. Renders either a visible element (when `tag` is provided) or a hidden input (for form submission).

The `to`/`by` channel connects them. Dispatcher's `transform` function runs client-side on click — no server round-trip.

```html
<${Dispatcher} to="qty" transform=${v => v - 1}>-<//>
<${Dispatched} by="qty" tag="span" value="1" class="text-2xl font-mono" />
<${Dispatcher} to="qty" transform=${v => +v + 1}>+<//>
<${Dispatched} by="qty" value="1" name="quantity" />
```

- `to` — the channel name. Connects this Dispatcher to Dispatched elements with the same `by`.
- `transform` — a function `(currentValue) => nextValue`. Runs client-side on click. Constraints live here — `transform=${v => Math.max(1, Math.min(10, +v + 1))}` enforces bounds.
- `value` — for direct value setting (instead of transform). Useful for selection UIs like buttons that set a specific value.
- `then` — additional JavaScript to run after dispatching (e.g., `then="recalc()"`).
- `by` — the channel to subscribe to (Dispatched).
- `tag` — renders as that element. Omit for a hidden input (Dispatched).
- `value` — initial display value (Dispatched).
- `name` — form field name, hidden input mode (Dispatched).

Multiple Dispatchers and Dispatched elements on the same channel stay in sync. One click updates every Dispatched element on that channel.

Values pass through as strings — transforms own their own typing. Use `v - 1` for subtraction (JS implicit coercion) or `+v + 1` for addition (explicit parse).

### Client-side API

The framework exposes two functions for use in `<script>` blocks:

- **`hzml.get(name)`** — read the current value of a channel
- **`hzml.set(name, valueOrFn)`** — set a channel to a value, or pass a function to transform the current value

These are the same primitives Dispatcher uses internally. For cross-channel logic (e.g., a tip calculator where changing the bill recalculates the tip), use a `<script>` block:

```html
<script>
function recalc() {
  const bill = +hzml.get('bill');
  const pct = +hzml.get('pct');
  hzml.set('tip', '$' + (bill * pct / 100).toFixed(2));
}
</script>
```

## Styling

Tailwind is built in, not optional. All CSS is render-blocking — scattered CSS makes this worse. Tailwind produces a single, minimal CSS file containing only the classes you actually use, with zero runtime overhead. Write classes directly in templates. The build step scans `.hzml` files automatically.

```bash
bun run build          # one-time build
bun run css:watch      # watch mode
bun run dev            # server + css watch together
```

## Database

SQLite is the default database — zero config, zero dependencies on Bun. Available as `hzml.db` in both `<server>` blocks (routes) and `<loader>` blocks (components):

```html
<server>
  hzml.db.run("CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, title TEXT)")

  hzml.get((request) => {
    const posts = hzml.db.query("SELECT * FROM posts")
    return { posts }
  })
</server>
```

Data persists in `data.db` at the project root.

### Request-scoped query cache

Within a single request, identical SQL queries are deduplicated automatically. If two components both call `hzml.db.query("SELECT COUNT(*) FROM todos")` during the same render, only the first actually hits the database. The cache is a Map keyed by `sql + JSON.stringify(params)`, lives on the per-request `RenderContext`, and is garbage collected when the request ends — no invalidation, no TTL, no stale data across requests. Any `run()` (write) within the request clears the cache, so reads after writes always see fresh data.

### Custom database

Pass any object that implements `DatabaseAdapter` to use a different database:

```typescript
import hzml from "./hzml";

hzml({
  port: 4965,
  db: {
    provider: {
      async query(sql, params) { /* ... */ },
      async run(sql, params) { /* ... */ },
      close() { /* ... */ },
    }
  }
});
```

Async adapters work — route handlers can be async too:

```html
<server>
  hzml.get(async (request) => {
    const posts = await hzml.db.query("SELECT * FROM posts")
    return { posts }
  })
</server>
```

## Plugins

Plugins extend the `hzml.*` namespace, swap the database adapter, or inject identifiers directly into route scope. They run once at startup, before any routes are registered.

```typescript
import hzml from "./hzml";
import type { HzmlPlugin } from "./hzml/plugin";

const myPlugin: HzmlPlugin = {
  name: "my-plugin",
  setup(ctx) {
    ctx.extend("now", () => new Date());           // hzml.now() in server/loader blocks
    ctx.inject("VERSION", "1.0.0");                // VERSION as a top-level identifier in server blocks
    ctx.setDb({ /* DatabaseAdapter */ });          // replace the default db
  },
};

hzml({ port: 4965, plugins: [myPlugin] });
```

`PluginContext`:

- **`ctx.extend(key, value)`** — adds `value` to the `hzml` namespace as `hzml[key]`. Available in both `<server>` blocks and component `<loader>` blocks.
- **`ctx.inject(key, value)`** — adds `value` as a top-level identifier in route `<server>` blocks (no `hzml.` prefix needed). Useful for things that should look like language primitives.
- **`ctx.setDb(adapter)`** — replaces `hzml.db` for the rest of startup.
- **`ctx.db`** (read-only) — the currently configured database adapter.
- **`ctx.projectDir`** — absolute path to the project root.

See [`examples/ghostpres-plugin.ts`](./examples/ghostpres-plugin.ts) for a real plugin that wires up [GhostPress](https://github.com/douglasjordan2/ghostpres) — a Postgres jsonb pipeline DSL — as both `hzml.ghost` (for queries) and the `hzml.db` adapter (for raw SQL).

## Dev Server

HZML includes a built-in dev server with hot reload. When the server starts, it watches `routes/` and `components/` for changes to `.hzml` files and automatically reloads connected browsers via Server-Sent Events.

- **Route changes** clear the cached route context so the next request re-evaluates the `<server>` block
- **Component changes** rebuild the component's render closure in-place
- **Errors** render an inline overlay in the browser with the message and stack trace, and log to the terminal in red

No configuration needed — hot reload is always on during development.

## Testing

The framework core is covered by a bun:test suite — 144 tests across every module in `hzml/`, running in well under a second with zero extra dependencies.

```bash
bun run test
```

Tests are colocated with their modules (`hzml/<module>.test.ts`), fixtures live in `hzml/fixtures/`, and HTTP tests call the handler directly — no ports, no real database, no network. CI runs the suite on every pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) for the conventions.

## Streaming

HZML supports streaming HTML responses using `hzml.defer()` and the `<Suspense>` component. Slow data sources can resolve after the initial page shell is sent, replacing a fallback with the real content when it arrives — similar to Remix's `defer` pattern.

```html
<server>
  hzml.get(async () => ({
    fast: await db.query("SELECT * FROM cache"),
    slow: hzml.defer(fetch("https://slow-api.example.com").then(r => r.json())),
  }))
</server>

<template>
  <h1>Dashboard</h1>
  <div>${fast.map(row => html`<p>${row.name}</p>`)}</div>

  <${Suspense} await=${slow} fallback=${html`<div class="animate-pulse h-24"></div>`}>
    ${(data) => html`<ul>${data.map(item => html`<li>${item.name}</li>`)}</ul>`}
  <//>
</template>
```

`hzml.defer()` wraps a Promise. The template renders immediately with the fallback. When the promise resolves, the fallback is swapped for the real content. Deferred promises time out after 30 seconds.

Streaming works on both navigation paths:

- **Direct navigation** (typing a URL or refreshing) — the server holds the connection open via `ReadableStream` and flushes `<template>` + `<script>` chunks that swap content as each promise resolves.
- **HTMZ navigation** (clicking a link) — the partial response returns immediately with Suspense fallbacks. An inline script fetches resolved data from a one-time NDJSON endpoint (`/__hzml/deferred/:id`) and swaps each placeholder in the main page as it arrives.

## Runtime

HZML uses web-standard `Request`/`Response` APIs. The entry point is runtime-agnostic:

```typescript
import hzml from "./hzml";
hzml(4965);
```

Works with Bun, Deno, and Node.js.

## Editor support

HZML includes a [Tree-sitter](https://tree-sitter.github.io/) grammar for syntax highlighting in Neovim. It parses `.hzml` files and uses language injection to delegate TypeScript highlighting to `<server>` and `<loader>` blocks and HTML highlighting to `<template>` blocks.

See [`tree-sitter-hzml/README.md`](tree-sitter-hzml/README.md) for setup instructions.

## Dependencies

- [HTMZ](https://github.com/Kalabasa/htmz) — the world's greatest reactive framework
- [HTM](https://github.com/developit/htm) — tagged template literals
- [tailwindcss](https://tailwindcss.com) — 🩵
