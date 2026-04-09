# HZML Roadmap

## Done
- Runtime-agnostic handler (Bun/Deno/Node)
- File-based routing with nested directories
- In-memory route table: filesystem scanned once at startup, Map-based matching per request, rebuilt on file changes
- Dynamic params ($id)
- Nested layouts (layout.hzml at any level)
- htm templating with server-side string rendering
- get()/post() handlers in route scripts
- Form body parsing
- .hzml components (Link, Form, Slot, Fill)
- Tailwind CSS build step
- HTMZ iframe navigation with Sec-Fetch-Dest detection
- Multi-target element swapping (real HTMZ pattern — any element with a matching ID gets replaced)
- Slot/Fill channels for cross-page content projection (no duplicate IDs, multiple slots per channel)
- Route context caching (server block state persists across requests)
- Static file serving from public/
- redirect() works end-to-end (full page + HTMZ iframe, 302 preserves Sec-Fetch-Dest)
- hzml.* namespace injection (single object replaces separate get/post/redirect args)
- SQLite as default database (bun:sqlite, zero dependencies)
- DatabaseAdapter interface for custom providers (async-capable)
- Tree-sitter grammar for .hzml syntax highlighting (Neovim — block boundaries + TypeScript/HTML injection)
- Component `<loader>` blocks for server-side prop logic (derive template vars, early returns)
- Hot reload dev server (SSE file watcher on routes/ + components/, error overlay, component + route cache invalidation)
- Streaming: hzml.defer() + Suspense on both paths (full-page: ReadableStream chunks, partials: NDJSON side-channel via /__hzml/deferred/:id)

## Client Reactivity
- Toggle system: Toggled + Toggler components, hidden checkbox/radio state, CSS :has() reactivity ✓
- Toggled: auto-creates hidden input, ontrue/onfalse class prefixing, tag prop for wrapper element ✓
- Toggler: programmatic component with tag prop (wraps label in container with reactive classes) ✓
- Toggle manifest for Tailwind class discovery (.toggle-manifest, @source in app.css) ✓
- generateToggleCSS: server-side pointer-events rules for directional Togglers (on/off) ✓
- Render-time toggle registry: per-request RenderContext threads through component tree, single input per unique ID ✓
- htmz shell extracted to hzml/htmz.ts ✓
- Dispatcher/Dispatched: onclick + hzml.get()/hzml.set() — 10 lines of client JS in the shell, no generated scripts ✓
- Route `<script>` blocks emitted directly as `<script>` tags for custom client logic ✓
- ID hashing: deterministic collision-free IDs (filepath-based) for component reuse across templates
- Toggled v2: explore limits of :has() — nested state, state combinations, transition choreography
- Research: what patterns genuinely need JS vs. what CSS :has() can handle

## Component Authoring
- Component `<loader>` blocks: synchronous server-side logic for deriving template variables from props ✓
- Loader block scoping: `const` declarations in loaders shadow function params (block-scoped) ✓
- Loaders can return objects (merged into template data) or raw strings (early return / validation) ✓

## Next
- Request-scoped query cache: dedupe identical db queries within a single render pass (Map on RenderContext, dies when request ends — no invalidation needed)
- HTMZ append mode: data-hzml-append="target-id" on response elements appends children instead of replacing (load more, chat, infinite scroll — opt-in, server still authoritative on refresh)
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
- 404/500 route files
- Production build (single binary via bun build --compile or deno compile)
- Middleware (auth, logging, etc.)
- Complex form validation with Zod and other providers
