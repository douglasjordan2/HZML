# HZML

A minimal web framework built on [HTMZ](https://leanrada.com/htmz/) and [HTM](https://github.com/developit/htm). Server-rendered HTML with SPA-like navigation using web primitives — no client-side JavaScript framework required.

## How it works

HZML uses a hidden iframe (the HTMZ pattern) for navigation. Links and forms target the iframe, the server decides whether to send a full page or a partial based on the browser's `Sec-Fetch-Dest` header. No custom JavaScript, no virtual DOM, no hydration.

Routes are `.hzml` files with `<script>` and `<template>` blocks. Templates use HTM — tagged template literals that look like JSX but run on the server as plain string concatenation.

## Quick start

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

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

A route is a `.hzml` file with an optional `<script>` block and a `<template>` block:

```html
<script>
  get((request) => {
    return {
      title: "Home",
      message: "Hello from HZML.",
    }
  })
</script>

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
<script>
  const items = []

  get((request) => {
    return { items }
  })

  post((request) => {
    items.push(request.body.title)
    return { items }
  })
</script>
```

### Dynamic params

Name a file with `$` prefix — `$id.hzml` matches `/blog/anything` and exposes `request.params.id`:

```html
<script>
  get((request) => {
    return { id: request.params.id }
  })
</script>

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

Two built-in components ship with the framework: **`Link`** and **`Form`**. These exist because of how HTMZ works under the hood.

HTMZ uses a hidden `<iframe name="htmz">` for navigation. When a link or form targets that iframe, the browser loads the response into it. The iframe's `onload` handler then swaps the response HTML into the page's `#content` div and updates the URL via `history.pushState`. No client-side JavaScript framework, no fetch calls — just native browser behavior.

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
hzml(3000);
```

Works with Bun, Deno, and Node.js.

## Dependencies

- [HTMZ](https://github.com/Kalabasa/htmz) — the world's greatest reactive framework, and the main inspiration for this project. One hidden iframe, zero JavaScript.
- [HTM](https://github.com/developit/htm) — tagged template literals
- [tailwindcss](https://tailwindcss.com) — ❤️
