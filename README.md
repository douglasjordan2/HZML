# HZML

A micrometaframework built on [HTMZ](https://leanrada.com/htmz/) and [HTM](https://github.com/developit/htm). Server-rendered HTML with client-side reactivity using web primitives — no bundler, no virtual DOM, no hydration, no client-side JavaScript framework required.

## How it works

HZML uses a hidden iframe (the HTMZ pattern) for navigation. Links and forms target the iframe, the server decides whether to send a full page or a partial based on the browser's `Sec-Fetch-Dest` header. No custom JavaScript, no virtual DOM, no hydration.

Routes are `.hzml` files with `<server>` and `<template>` blocks. `<server>` is where your server-side code lives (data loading, form handling). `<template>` is what gets rendered to HTML. Need client-side JavaScript? Just use `<script>` inside `<template>` — it passes through as normal HTML.

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

Components are `.hzml` files in `components/`. They're globally available in all templates — no imports needed.

Four built-in components ship with the framework: **`Link`**, **`Form`**, **`Emitter`**, and **`Listener`**. The first two exist because of how HTMZ works under the hood.

HTMZ uses a hidden `<iframe name="htmz">` for navigation. When a link or form targets that iframe, the browser loads the response into it. The iframe's `onload` handler finds every element with an ID in the response and replaces the matching element on the page, then updates the URL via `history.pushState`. No client-side JavaScript framework, no fetch calls — just native browser behavior.

For this to work, every `<a>` and `<form>` in your app needs `target="htmz"`. Rather than making developers remember that on every element, the built-in components handle it:

```html
<${Link} href="/about" class="text-blue-600">About<//>

<!-- renders as: <a href="/about" target="htmz" class="text-blue-600">About</a> -->
```

```html
<${Form} action="/todos">
  <input type="text" name="title" />
  <button type="submit">Add</button>
<//>

<!-- renders as: <form method="post" action="/todos" target="htmz">...</form> -->
```

### Emitter / Listener

Routes can push content into any part of the page — nav badges, sidebars, footers — using channel-based signals. An `Emitter` produces content, a `Listener` receives it. They're connected by a shared channel name.

```html
<!-- in layout.hzml (the receiver) -->
<${Listener} channel="todo-count" />

<!-- in todos.hzml (the sender) -->
<${Emitter} channel="todo-count">
  <span class="badge">${todos.length}</span>
<//>
```

On full page loads, the server merges emitter content into matching listeners and strips the emitters from the response. On partial loads (HTMZ navigation), the iframe's `onload` handler does the same merge client-side. Multiple listeners can subscribe to the same channel — no duplicate ID issues.

The `<//>` closing tag is HTM shorthand — it closes the nearest open component.

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

## Styling

HZML is opinionated about styling. All CSS is render-blocking — the browser won't paint until it finishes parsing every stylesheet and style tag. Scattered CSS makes this worse. Tailwind produces a single, minimal CSS file containing only the classes you actually use, with zero runtime overhead — so it's built in, not optional. Write classes directly in templates. The build step scans `.hzml` files automatically.

```bash
bun run build          # one-time build
bun run css:watch      # watch mode
bun run dev            # server + css watch together
```

## Client Reactivity

### What even is "state" anyway?

A sidebar slides in. A tab switches. An accordion opens. For the last decade, the industry's answer to these interactions has been: download a JS file, construct a virtual representation of your document in memory, diff it against the previous version, and surgically patch the real DOM. All so a `<div>` can do something that looks awfully like `display: none` -> `display: block`.

Real state management is a database transaction, a session token, a shopping cart persisted across tabs. But showing and hiding a panel? Highlighting the active tab? That's a boolean. The browser has had a native boolean state primitive since HTML 2.0 — `<input type="checkbox">`. It persists across interactions. It's queryable with CSS. It requires zero JavaScript to toggle.

HZML takes this literally. Instead of shipping a reactivity engine to the client, we use what's already there:

- **Hidden checkboxes** store boolean state (open/closed, visible/hidden)
- **Hidden radio buttons** store enum state (which tab, which accordion item)
- **Labels** dispatch state changes (clicking a label toggles its linked input)
- **CSS `:has()`** reacts to state changes (if body has a checked #drawer, show the drawer)

No virtual DOM. No diffing. No re-rendering. No hydration. No `useState`, no `useEffect`, no `subscribe()`. The browser does all of it natively, and it's been able to for years. 

### Toggled and Toggler

Two components handle client-side reactivity:

**Toggled** — reactive content that responds to state. Creates a hidden input automatically and wraps its children in a div with reactive Tailwind classes.

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

### Tabs with radio buttons

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

### Counter (numeric state)

Toggles handle booleans. But some UI patterns need a number — quantity steppers, rating pickers, pagination. CSS can't do arithmetic, so HZML uses a minimal protocol: anchor tags that navigate a cached `/noop.html` route with a hash encoding the new value.

```html
<a data-counter="qty" data-step="-1" href="/noop.html?0#qty=0" target="htmz">-</a>
<span data-counter="qty">1</span>
<a data-counter="qty" data-step="1" href="/noop.html?2#qty=2" target="htmz">+</a>
<input data-counter="qty" type="hidden" name="quantity" value="1" />
```

- `data-counter` binds an element to a state key. The element's role is determined by its type: anchors with `data-step` are setters (hrefs recomputed on each click), `<input>` elements get their value updated, everything else gets `textContent` updated.
- `data-min` / `data-max` on the display element enforces bounds.
- Multiple steppers sharing the same counter name stay in sync.

The state is deterministic — `qty + 1` is always known at click time. The href pre-computes the result, the iframe loads a cached noop document, and the `onload` handler parses the hash and updates the DOM. No server round-trip for trivial arithmetic.

This is not a general-purpose reactivity system. It's for buffered server inputs — values that will eventually be sent to the server (add to cart, update quantity). The non-deterministic part (cart validation, inventory checks, discounts) is always the server round-trip via regular HTMZ navigation.

### What about everything else?

Toggles cover the common cases — drawers, modals, tabs, accordions, dropdowns, tooltips — anything that's fundamentally "show this, hide that." Counters cover bounded numeric inputs. For everything beyond that — data fetching, form submission, real-time updates, anything that touches the server — HZML uses the server round-trip. Click a link, the server responds with HTML, HTMZ swaps it into the page. That's not a limitation, that's the architecture. The server is the state machine. The client is a viewport.

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

HZML includes a [Tree-sitter](https://tree-sitter.github.io/) grammar for syntax highlighting. Tree-sitter is built into Neovim — it parses `.hzml` files into a syntax tree and uses language injection to delegate TypeScript highlighting to `<server>` blocks and HTML highlighting to `<template>` blocks. No build step, no TextMate regexes — just a real parser.

No VS Code extension yet. Tree-sitter gives us precise, context-aware highlighting with the right level of complexity for an opinionated framework. If someone wants to build a TextMate grammar or VS Code extension, PRs welcome.

### Neovim setup

#### With nvim-treesitter

Add the parser config to your nvim-treesitter setup, pointing to your local clone:

```lua
local treesitter_parser_config = require("nvim-treesitter.parsers").get_parser_configs()

treesitter_parser_config.hzml = {
  install_info = {
    url = "/path/to/hzml/tree-sitter-hzml",
    files = {"src/parser.c", "src/scanner.c"},
    branch = "main",
  },
}

vim.treesitter.language.register("hzml", "hzml")
vim.filetype.add({ extension = { hzml = "hzml" } })
```

Then run `:TSInstall hzml`.

Copy the query files to your Neovim runtimepath:

```bash
mkdir -p ~/.local/share/nvim/site/queries/hzml
cp tree-sitter-hzml/queries/hzml/* ~/.local/share/nvim/site/queries/hzml/
```

> **Note:** The `url` must point to the `tree-sitter-hzml` directory directly — not the parent repo. Using the GitHub URL won't work because the grammar lives in a subdirectory, and nvim-treesitter can't resolve it during compilation.

#### Manual setup

Requires [`tree-sitter-cli`](https://github.com/tree-sitter/tree-sitter/blob/master/cli/README.md) and a C compiler.

```bash
cd tree-sitter-hzml
tree-sitter generate
tree-sitter build --output parser/hzml.so
```

Copy the built parser and queries to your Neovim runtimepath:

```bash
mkdir -p ~/.local/share/nvim/site/parser
cp parser/hzml.so ~/.local/share/nvim/site/parser/

mkdir -p ~/.local/share/nvim/site/queries/hzml
cp queries/hzml/* ~/.local/share/nvim/site/queries/hzml/

mkdir -p ~/.config/nvim/ftdetect
cp ftdetect/hzml.lua ~/.config/nvim/ftdetect/
```

Add to your Neovim config:

```lua
vim.api.nvim_create_autocmd("FileType", {
  pattern = "hzml",
  callback = function(args)
    pcall(vim.treesitter.start, args.buf, "hzml")
  end,
})
```

## Dependencies

- [HTMZ](https://github.com/Kalabasa/htmz) — the world's greatest reactive framework, and the main inspiration for this project. One hidden iframe, zero JavaScript.
- [HTM](https://github.com/developit/htm) — tagged template literals
- [tailwindcss](https://tailwindcss.com) — ❤️
