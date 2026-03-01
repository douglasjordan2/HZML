# HZML

A minimal web framework built on [HTMZ](https://leanrada.com/htmz/) and [HTM](https://github.com/developit/htm). Server-rendered HTML with SPA-like navigation using web primitives — no client-side JavaScript framework required.

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
  get((request) => {
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

- **`get(fn)`** — handle GET requests, return data for the template
- **`post(fn)`** — handle POST requests with `request.body`
- **`redirect(url)`** — redirect to another route

```html
<server>
  const items = []

  get((request) => {
    return { items }
  })

  post((request) => {
    items.push(request.body.title)
    return { items }
  })
</server>
```

### Dynamic params

Name a file with `$` prefix — `$id.hzml` matches `/blog/anything` and exposes `request.params.id`:

```html
<server>
  get((request) => {
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

Three built-in components ship with the framework: **`Link`**, **`Form`**, and **`Swap`**. The first two exist because of how HTMZ works under the hood.

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

### Swap

Because HTMZ replaces elements by matching IDs, a route's response can update any part of the page — not just `#content`. The `Swap` component makes this intent explicit:

```html
<${Swap} id="todo-count">
  <span class="badge">${todos.length}</span>
<//>
```

When this route responds, the HTMZ handler finds `id="todo-count"` in the response and replaces the matching element wherever it lives on the page — even if it's in the nav, a sidebar, or a completely different layout section. One request, multiple DOM updates, zero JavaScript.

`Swap` renders as a `<span>` with the given ID. The real structure lives inside it.

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

## Runtime

HZML uses web-standard `Request`/`Response` APIs. The entry point is runtime-agnostic:

```typescript
import hzml from "./hzml";
hzml(4965);
```

Works with Bun, Deno, and Node.js.

## Dependencies

- [HTMZ](https://github.com/Kalabasa/htmz) — the world's greatest reactive framework, and the main inspiration for this project. One hidden iframe, zero JavaScript.
- [HTM](https://github.com/developit/htm) — tagged template literals
- [tailwindcss](https://tailwindcss.com) — ❤️
