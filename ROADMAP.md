# HZML Roadmap

## Done
- Runtime-agnostic handler (Bun/Deno/Node)
- File-based routing with nested directories
- Dynamic params ($id)
- Nested layouts (layout.hzml at any level)
- htm templating with server-side string rendering
- get()/post() handlers in route scripts
- Form body parsing
- .hzml components (Link, Form)
- Tailwind CSS build step
- HTMZ iframe navigation with Sec-Fetch-Dest detection
- Static file serving from public/

## Next
- SSE: refresh() for stale sibling updates after POST
- SSE: stream() for progressive/chunked responses
- Head tag architecture (per-route title, meta — full page only, title updates on HTMZ nav)
- redirect() verified end-to-end in browser
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
- npx create-hzml scaffolding
- Production build (single binary via bun build --compile or deno compile)
- Document event delegation pattern for client interactivity
- Web component integration for stateful client-side components
- Middleware (auth, logging, etc.)
