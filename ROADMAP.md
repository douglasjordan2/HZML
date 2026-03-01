# HZML Roadmap

## Done
- Runtime-agnostic handler (Bun/Deno/Node)
- File-based routing with nested directories
- Dynamic params ($id)
- Nested layouts (layout.hzml at any level)
- htm templating with server-side string rendering
- get()/post() handlers in route scripts
- Form body parsing
- .hzml components (Link, Form, Swap)
- Tailwind CSS build step
- HTMZ iframe navigation with Sec-Fetch-Dest detection
- Multi-target element swapping (real HTMZ pattern — any element with a matching ID gets replaced)
- Swap component for explicit cross-page reactivity
- Route context caching (server block state persists across requests)
- Static file serving from public/
- redirect() works end-to-end (full page + HTMZ iframe, 302 preserves Sec-Fetch-Dest)

## Next
- SSE: stream() for progressive/chunked responses
- Head tag architecture (per-route title, meta — full page only, title updates on HTMZ nav)
- SQLite as default database
- Plugin system for injected modules (hzml.config.js)
- Import resolution in script blocks (currently stripped)

## Package as a real framework
- Separate framework from demo (move routes/, public/, app.css, index.ts into examples/)
- Publish hzml/ as an npm package
- npx create-hzml scaffolding (generates starter routes, layout, app.css, index.ts)
- CLI commands (hzml dev, hzml build, hzml start)
- Resolve import.meta.dirname to work from node_modules

## Future
- Scoped component loading (opt-in per-route imports if global injection becomes a scaling problem)
- URL param support on request object (query strings)
- Error boundaries (what renders when a script throws?)
- 404/500 route files
- Hot reload in dev mode
- Production build (single binary via bun build --compile or deno compile)
- Document event delegation pattern for client interactivity
- Web component integration for stateful client-side components
- Middleware (auth, logging, etc.)
