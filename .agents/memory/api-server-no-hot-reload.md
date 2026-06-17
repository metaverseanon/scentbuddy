---
name: api-server has no hot reload
description: The api-server dev workflow must be restarted to pick up server code edits before testing the live endpoint.
---

# api-server dev = build once, then run (no watch)

The `@workspace/api-server` `dev` script is `build && start` (esbuild bundle to
`dist/`, then `node`). There is **no file watcher** — editing a route/source
file does NOT reload the running server.

**Why it bites:** testing the live endpoint (e.g. `localhost:80/api/...`) right
after an edit silently exercises the OLD bundled code, producing confusing
"my change had no effect" results.

**How to apply:** after editing any api-server source, restart the
`artifacts/api-server: API Server` workflow (which re-runs build) before hitting
the endpoint.
