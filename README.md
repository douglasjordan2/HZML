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

Two built-in components ship with the framework:

- **`Link`** — `<a>` that targets the HTMZ iframe
- **`Form`** — `<form>` that targets the HTMZ iframe

```html
<${Link} href="/about" class="text-blue-600">About<//>
<${Form} action="/todos">
  <input type="text" name="title" />
  <button type="submit">Add</button>
<//>
```

The `<//>` closing tag is HTM shorthand — it closes the nearest open component.

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

Tailwind CSS is built-in. Write classes directly in templates. The build step scans `.hzml` files automatically.

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

Three production dependencies:

- [HTM](https://github.com/developit/htm) (~500 bytes) — tagged template literals
- [tailwindcss](https://tailwindcss.com) — utility CSS
- [@tailwindcss/cli](https://tailwindcss.com) — CSS build step
