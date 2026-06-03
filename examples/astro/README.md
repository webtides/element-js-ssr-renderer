# Astro example — `@webtides/element-js-ssr-renderer`

A minimal, runnable Astro app that wires up the `elementSSR` middleware and
pre-renders `@webtides/element-js` custom elements on the server, then hydrates
them in the browser. It exercises **both component sources at once**:

- **element-library components** (`el-button`, `el-notification`) — loaded
  eagerly into a static `registry`;
- **local components** (`x-counter`, `x-greeting`) — authored in
  `src/components/` and resolved **lazily** via `lazy(import.meta.glob(...))`,
  so only the ones on a page are loaded.

…and both render paths:

- **shadow** components (`el-button`, `el-notification`, `x-counter`) emit
  Declarative Shadow DOM (`<template shadowrootmode="open">`) with their styles
  and adopted global styles inlined;
- **light-DOM** components (`x-greeting`) render their template in place.

## Run it

From this `examples/astro/` directory:

```bash
npm install
npm run dev
```

Then open the printed URL (default <http://localhost:4321>).

> `npm install` links the renderer (`file:../..`) and `@webtides/element-library`
> (`file:../../../element-library`) from this monorepo, so make sure both sibling
> packages are present.

For a production-style run:

```bash
npm run build && npm run preview
```

## What to look for

1. **View source** (or open DevTools → Network → the document response). The
   custom elements are already fully rendered — shadow ones as
   `<template shadowrootmode="open">…</template>`, with styles inlined. That's
   the server output, before any client JS.
2. **Disable JavaScript and reload.** Everything still shows, styled — no flash
   of empty/unstyled content. (The counter buttons just won't do anything yet.)
3. **Re-enable JavaScript.** Click the counter's **+ / −** buttons: they update.
   That's element-js *hydrating* the pre-rendered DSD (matching the
   `<!--template-part-->` markers in the SSR output) rather than re-rendering
   from scratch.

## How it's wired

| File                      | Role                                                                   |
| ------------------------- | ---------------------------------------------------------------------- |
| `src/middleware.js`       | Imports the DOM shim first, then `elementSSR(...)` with both sources.  |
| `src/components/*.js`     | Local element-js components (default-export the class + a `define()`). |
| `src/layouts/Base.astro`  | Global styles/tokens + the client `<script>` that loads each `define`. |
| `src/pages/index.astro`   | Authors the custom elements as plain HTML.                             |
| `astro.config.mjs`        | `output: "server"` + Node adapter, so middleware runs per request.     |
