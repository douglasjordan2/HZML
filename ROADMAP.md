# HZML Roadmap

## Done
- Runtime-agnostic handler (Bun/Deno/Node)
- File-based routing with nested directories
- Dynamic params ($id)
- Nested layouts (layout.hzml at any level)
- htm templating with server-side string rendering
- get()/post() handlers in route scripts
- Form body parsing
- .hzml components (Link, Form, Slot, Fill)
- Tailwind CSS build step
- HTMZ iframe navigation with Sec-Fetch-Dest detection
- Multi-target element swapping (real HTMZ pattern — any element with a matching ID gets replaced)
- Slot/Fill channels for cross-page content projection (replaces Swap — no duplicate IDs, multiple slots per channel)
- Route context caching (server block state persists across requests)
- Static file serving from public/
- redirect() works end-to-end (full page + HTMZ iframe, 302 preserves Sec-Fetch-Dest)
- hzml.* namespace injection (single object replaces separate get/post/redirect args)
- SQLite as default database (bun:sqlite, zero dependencies)
- DatabaseAdapter interface for custom providers (async-capable)
- Tree-sitter grammar for .hzml syntax highlighting (Neovim — block boundaries + TypeScript/HTML injection)

## Client Reactivity
- Toggle system v1: Toggled + Toggler components, hidden checkbox/radio state, CSS :has() reactivity ✓
- Toggled: auto-creates hidden input, ontrue/onfalse class prefixing, tag prop for wrapper element ✓
- Toggler: programmatic component with tag prop (wraps label in container with reactive classes) ✓
- Toggle manifest for Tailwind class discovery (.toggle-manifest, @source in app.css) ✓
- generateToggleCSS: server-side pointer-events rules for directional Togglers (on/off) ✓
- Render-time toggle registry: per-request RenderContext threads through component tree, single input per unique ID — no dedup pass ✓
- Toggled as programmatic component: register-then-emit replaces inline input + regex cleanup ✓
- htmz shell extracted to hzml/htmz.ts: upstream dev pattern (<script> tag + window.htmz(this)), setTimeout wrapper, extensible function ✓
- hzml.on() + Dispatcher/Dispatched: generalized client-side state via compiler-aware handler registration, noop iframe dispatch table, Dispatcher triggers and Dispatched subscribes ✓
- ID hashing: deterministic collision-free IDs (filepath-based) for component reuse across templates
- Toggled v2: explore limits of :has() — nested state, state combinations, transition choreography
- Research: what patterns genuinely need JS vs. what CSS :has() can handle

## Component Server Blocks
.hzml templates compile into tagged template literals via string concatenation. This works for most components — a single element with props and children. But components that need structural branching (render different DOM trees based on props) hit a wall: nested html`` calls collide with the outer template literal's backticks.

Toggler was the first case (tag prop requires wrapping a label in a container OR rendering a bare label). Currently solved by registering it as a programmatic component in router.ts. This works for framework internals but isn't available to authors.

The fix: support `<server>` blocks in component .hzml files. parseRoute already extracts them — they're just ignored for components today. The server block would export a render function that replaces template-based rendering when structural branching is needed.

- Simple components stay as they are: just a `<template>` block, no ceremony
- Complex components add a `<server>` block with a render function for full JS control
- Both live in .hzml files — no second file format, no context switch
- The template block could serve as the default/fallback, with the server block overriding when present

Alternatives considered:
- .ts component files: works but breaks the single-file-format principle
- Fixing the template engine to avoid backtick collision: most correct, biggest lift — worth revisiting when the engine is more mature

## Next
- SSE / streaming: deferred data with resolveData seam (Remix-style defer pattern)
- Head tag architecture (per-route title, meta — full page only, title updates on HTMZ nav)
- Plugin system for injected modules (hzml.config.js)
- Import resolution in script blocks (currently stripped)
- Tree-sitter v2: custom template parsing for HTM syntax (${expr}, <${Component}>, <//> highlighting)

## Package as a real framework
- Separate framework from demo (move routes/, public/, app.css, index.ts into examples/)
- Publish hzml/ as an npm package
- npx create-hzml scaffolding (generates starter routes, layout, app.css, index.ts)
- CLI commands (hzml dev, hzml build, hzml start)
- Resolve import.meta.dirname to work from node_modules
- Create documentation website using HZML

## Future
- Scoped component loading (opt-in per-route imports if global injection becomes a scaling problem)
- URL param support on request object (query strings)
- Error boundaries (what renders when a script throws?)
- 404/500 route files
- Hot reload in dev mode
- Component hot reload: file watcher on component directories (built-in + user) that invalidates componentCache and re-runs loadFromDir on change — currently any .hzml component edit requires full server restart
- Production build (single binary via bun build --compile or deno compile)
- Document event delegation pattern for client interactivity
- Web component integration for stateful client-side components
- Middleware (auth, logging, etc.)
- Complex form validation with Zod and other providers
