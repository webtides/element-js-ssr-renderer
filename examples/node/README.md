# Node example — `@webtides/element-js-ssr-renderer`

A minimal, runnable **plain-Node** app (Express) that pre-renders
`@webtides/element-js` custom elements on the server. It uses the package's
Connect-style middleware — `elementSSR((req, res, next))` from
[`@webtides/element-js-ssr-renderer/node`](../../src/adapters/node.js) — which
works on **any** server that speaks the `(req, res, next)` contract (Express,
Connect, raw `http`, Fastify via `@fastify/middie`, Koa via `koa-connect`,
Hono-node). See [the Node framework docs](../../docs/frameworks/node.md) for
mounting it on each of those; this example shows Express.

It exercises **both component sources at once**:

- **element-library components** (`el-button`, `el-notification`) — resolved via
  the library's own shipped `@webtides/element-library/catalog`, dropped straight
  into `resolve` (no eager imports, no hand-written map);
- **local components** (`x-counter`, `x-greeting`) — authored in
  `src/components/` and resolved **lazily** via a hand-written `{ tag: () => import(…) }`
  Catalog (plain Node has no Vite `import.meta.glob`), so only the ones on a page
  are loaded.

…and both render paths:

- **shadow** components (`el-button`, `el-notification`, `x-counter`) emit
  Declarative Shadow DOM (`<template shadowrootmode="open">`) with their styles
  and adopted global styles inlined;
- **light-DOM** components (`x-greeting`) render their template in place.

> [!NOTE]
> This example is deliberately **SSR-only** — it proves the adapter's server
> output. Client hydration is identical to the other examples and not the new
> thing here, so it's omitted to keep the focus on the HTTP middleware. To add
> it, bundle a client entry that loads each component's `define` (browsers can't
> resolve bare specifiers like `@webtides/element-js`, so a plain `<script>`
> won't do without a bundler or import map) — see
> [`examples/astro`](../astro) for the client `<script>` and
> [the Node docs](../../docs/frameworks/node.md#client-side-hydration) for the
> plain-Node options.

## Run it

From this `examples/node/` directory:

```bash
npm install
npm start          # or: npm run dev  (restarts on change)
```

Then open <http://localhost:3000> (set `PORT` to change it).

> `npm install` links the renderer (`file:../..`) from this monorepo, so make sure
> that sibling package is present; `@webtides/element-library` and `express` are
> pulled from npm.

## What to look for

1. **View source**, or `curl http://localhost:3000`. The custom elements are
   already fully rendered — shadow ones as
   `<template shadowrootmode="open">…</template>`, with styles inlined. That's the
   server output, before any client JS.
2. **Disable JavaScript and reload.** Everything still shows, styled — no flash of
   empty/unstyled content. (Being SSR-only, the counter buttons don't do anything
   here; the other examples demonstrate hydration.)

## How it's wired

| File                  | Role                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| `server.js`           | Imports the DOM shim first, mounts `elementSSR(...)` before the routes. |
| `src/components/*.js` | Local element-js components (default-export the class + a `define()`).  |

The whole integration is one line — `app.use(elementSSR({ resolve }))`, mounted
**before** your routes so it can wrap their HTML output. Non-HTML responses
(JSON, assets, redirects) pass through untouched.
