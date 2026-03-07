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
- **Noop iframe navigation** handles computed values (the anchor tag knows the next value, the iframe fires onload, the hash is a key-value store)

No virtual DOM. No diffing. No re-rendering. No hydration. No `useState`, no `useEffect`, no `subscribe()`. The browser does all of it natively, and it's been able to for years.

### The escalation ladder

Not every interaction needs the same tool. HZML provides four tiers, each adding capability:

1. **Toggled/Toggler** — boolean/enum, zero JS, CSS `:has()`
2. **Dispatcher/Dispatched** — computed values, compiler-generated client JS
3. **`hzml.on()` + Dispatcher/Dispatched** — custom client behavior, full handler control
4. **Raw `<script>`** — escape hatch

Toggles cover drawers, modals, tabs, accordions, dropdowns, tooltips — anything that's fundamentally "show this, hide that." Dispatcher covers quantity steppers, rating pickers, bounded inputs — anything that transforms a value. For everything beyond that — data fetching, form submission, real-time updates, anything that touches the server — HZML uses the server round-trip. Click a link, the server responds with HTML, HTMZ swaps it into the page. That's not a limitation, that's the architecture. The server is the state machine. The client is a viewport.

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

**Emitter** and **Listener** push content across page boundaries — nav badges, sidebars, footers — using channel-based signals:

```html
<!-- in layout.hzml (the receiver) -->
<${Listener} channel="todo-count" />

<!-- in todos.hzml (the sender) -->
<${Emitter} channel="todo-count">
  <span class="badge">${todos.length}</span>
<//>
```

On full page loads, the server merges emitter content into matching listeners and strips the emitters. On partial loads, the iframe's `onload` handler does the same merge client-side. Multiple listeners can subscribe to the same channel.

**Toggled**, **Toggler**, **Dispatcher**, and **Dispatched** handle client-side reactivity — see below.

You can create your own components by adding `.hzml` files to a `components/` directory in your project root. They follow the same `<template>` format as routes.

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

**Dispatcher** — a trigger that computes a new value. The `transform` function receives the current value and returns the next value.

**Dispatched** — reactive content that displays the current value. Renders either a visible element (when `tag` is provided) or a hidden input (for form submission).

The `to`/`by` channel connects them. The framework auto-generates the client-side update logic — no `<server>` block needed.

```html
<${Dispatcher} to="qty" transform=${v => v - 1}>-<//>
<${Dispatched} by="qty" tag="span" value="1" class="text-2xl font-mono" />
<${Dispatcher} to="qty" transform=${v => +v + 1}>+<//>
<${Dispatched} by="qty" value="1" name="quantity" />
```

- `to` — the channel name. Connects this Dispatcher to Dispatched elements with the same `by`.
- `transform` — a function `(currentValue) => nextValue`. The compiler serializes it and emits it as client-side code. Constraints live here — `transform=${v => Math.max(1, Math.min(10, +v + 1))}` enforces bounds.
- `by` — the channel to subscribe to.
- `tag` — renders as that element. Omit for a hidden input.
- `value` — initial display value. The first Dispatched's value is the initial state for the channel.
- `name` — form field name (hidden input mode).

Multiple Dispatchers and Dispatched elements on the same channel stay in sync. One click updates every Dispatched element and recomputes every Dispatcher's next href.

Values pass through as strings — transforms own their own typing. Use `v - 1` for subtraction (JS implicit coercion) or `+v + 1` for addition (explicit parse). String values work too: `transform=${() => "red"}`.

For cases that need full control beyond what `transform` provides, `hzml.on(name, callback)` in a `<server>` block registers a raw client-side handler as an escape hatch.

## Styling

Tailwind is built in, not optional. All CSS is render-blocking — scattered CSS makes this worse. Tailwind produces a single, minimal CSS file containing only the classes you actually use, with zero runtime overhead. Write classes directly in templates. The build step scans `.hzml` files automatically.

```bash
bun run build          # one-time build
bun run css:watch      # watch mode
bun run dev            # server + css watch together
```

## Database

SQLite is the default database — zero config, zero dependencies on Bun. Available as `hzml.db` in server blocks:

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

## Runtime

HZML uses web-standard `Request`/`Response` APIs. The entry point is runtime-agnostic:

```typescript
import hzml from "./hzml";
hzml(4965);
```

Works with Bun, Deno, and Node.js.

## Editor support

HZML includes a [Tree-sitter](https://tree-sitter.github.io/) grammar for syntax highlighting in Neovim. It parses `.hzml` files and uses language injection to delegate TypeScript highlighting to `<server>` blocks and HTML highlighting to `<template>` blocks.

See [`tree-sitter-hzml/README.md`](tree-sitter-hzml/README.md) for setup instructions.

## Dependencies

- [HTMZ](https://github.com/Kalabasa/htmz) — the iframe navigation pattern that started it all
- [HTM](https://github.com/developit/htm) — tagged template literals
- [tailwindcss](https://tailwindcss.com)
