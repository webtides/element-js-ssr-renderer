# Node (Express / Connect / any `(req, res, next)` server)

The widest-reach adapter: a **Connect-style middleware** for plain Node servers that have no
meta-framework of their own. If your server speaks the `(req, res, next)` contract — Express,
Connect, raw `http` (with a middleware shim), Fastify, Koa — this is the integration.

It buffers each response and, for `text/html` only, runs the body through `renderToString` once
before it's flushed, fixing `Content-Length`. Everything else (JSON, assets, redirects) passes
through untouched, as does any response whose headers were already sent or whose transform throws —
the page still works, it just isn't pre-rendered.

```js
// server.js
import "@webtides/element-js-ssr-renderer/dom-shim"; // must come first: installs HTMLElement etc.
import express from "express";
import { elementSSR } from "@webtides/element-js-ssr-renderer/node";
import catalog from "@webtides/element-library/catalog";

const app = express();

// Mount it BEFORE your routes so it can wrap their output.
app.use(
  elementSSR({
    resolve: [
      catalog, // a third-party library's shipped catalog
      // your own components — a hand-written lazy Catalog (no `import.meta.glob` here):
      { "x-counter": () => import("./src/components/x-counter.js") },
    ],
  }),
);

app.get("/", (_req, res) =>
  res.type("html").send("<x-counter count='3'></x-counter>"),
);
app.listen(3000);
```

`elementSSR` takes the same sources as every other adapter (see
[Resolving components](/resolving-components)). There's **no Vite `import.meta.glob`** in a plain
Node server, so resolve your own components with a hand-written `{ tag: () => import(…) }` Catalog,
or generate one with the CLI:

```bash
element-js-ssr-renderer catalog ./src/components -o ./src/catalog.js
```

::: tip Mount order matters
The middleware overrides `res.write`/`res.end` to buffer the body. Register it **before** the
routes (or other body-writing middleware) whose output you want to transform. If a route flushes
headers itself (a raw `res.writeHead(...)` before any body), that response is passed through
unchanged.
:::

## Other servers — same middleware, different mount

The adapter is a standard `(req, res, next)` function, so it drops into anything that accepts
Connect-style middleware. Only the **mounting** line differs:

### Connect

```js
import connect from "connect";
const app = connect();
app.use(elementSSR({ resolve: [catalog] }));
```

### Raw `node:http`

No native middleware concept — wrap it with [`connect`](https://github.com/senchalabs/connect) (or
call the returned function yourself with a `next` that runs your handler):

```js
import http from "node:http";
const ssr = elementSSR({ resolve: [catalog] });
http
  .createServer((req, res) => {
    ssr(req, res, () => {
      res.setHeader("content-type", "text/html");
      res.end("<x-counter></x-counter>");
    });
  })
  .listen(3000);
```

### Fastify

Fastify isn't Connect-native; add [`@fastify/middie`](https://github.com/fastify/middie) (or
`@fastify/express`) to register `(req, res, next)` middleware:

```js
import Fastify from "fastify";
import middie from "@fastify/middie";

const app = Fastify();
await app.register(middie);
app.use(elementSSR({ resolve: [catalog] }));
```

### Koa

Koa's middleware signature is `(ctx, next)`, not `(req, res, next)`. Adapt with
[`koa-connect`](https://github.com/wexpo/koa-connect):

```js
import Koa from "koa";
import c2k from "koa-connect";

const app = new Koa();
app.use(c2k(elementSSR({ resolve: [catalog] })));
```

### Hono (Node)

On the Node runtime, use Hono's Node server and bridge the request through the same middleware via
`koa-connect`-style adapters, or transform the HTML directly with
[`renderToString`](/api/#rendertostring) in a Hono middleware — for an edge/Workers deployment the
runtime-FS caveats apply, so resolve with a static catalog.

## Streaming

This adapter **buffers the whole response**, then transforms once. That's correct for the ordinary
"render the page, send it" servers it targets. If you stream a response incrementally
(`res.write` chunk-by-chunk to the client as you go), buffering defeats the streaming — that's the
streaming-first concern tracked separately for the streaming meta-frameworks, not something this
plain-Node adapter solves.

## Client-side hydration

A plain Node server has no bundler, and **browsers can't resolve bare specifiers** like
`@webtides/element-js`. So a naïve `<script type="module">import "@webtides/element-library/button/define"</script>`
won't load in the browser. Two ways to ship the client `define`s:

1. **Bundle a client entry** (esbuild/Rollup/Vite) that imports each component's `define` (or calls
   your local `define()`), and serve the output as a static file — the most robust option.
2. **Import map** — serve `node_modules` statically and add a `<script type="importmap">` mapping
   the bare specifiers to those paths. No build step, but fiddly with packages that have many
   internal imports.

Either way, the SSR output already carries element-js' `<!--template-part-->` markers, so once the
`define`s run the elements **hydrate in place** rather than re-rendering.

## Runnable example

A complete, runnable Express version lives in
[`examples/node/`](https://github.com/webtides/element-js-ssr-renderer/tree/main/examples/node) —
it composes element-library's shipped catalog with its own components (a hand-written lazy Catalog),
covering both the shadow (DSD) and light-DOM paths. It's deliberately **SSR-only** to isolate the
adapter; see above for adding hydration.

```bash
cd examples/node && npm install && npm start
# → http://localhost:3000  (curl it or view source to see the pre-rendered DSD)
```
