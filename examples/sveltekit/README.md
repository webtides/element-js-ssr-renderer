# SvelteKit example — `@webtides/element-js-ssr-renderer`

A minimal, runnable SvelteKit app that wires up the `./sveltekit` adapter's
`handle` hook and pre-renders `@webtides/element-js` custom elements on the
server, then hydrates them in the browser. It exercises **both component sources
at once**:

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

From this `examples/sveltekit/` directory:

```bash
npm install
npm run dev
```

Then open the printed URL (default <http://localhost:5173>).

> `npm install` links the renderer (`file:../..`) from this monorepo, so make sure that
> sibling package is present; `@webtides/element-library` is pulled from npm.

For a production-style run (the Node adapter):

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
   That's element-js _hydrating_ the pre-rendered DSD (matching the
   `<!--template-part-->` markers in the SSR output) rather than re-rendering
   from scratch.

## How it's wired

| File                        | Role                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `src/hooks.server.js`       | Imports the DOM shim first, then `elementSSR(...)` → a `handle` hook with both sources. |
| `src/components/*.js`       | Local element-js components (default-export the class + a `define()`).                  |
| `src/app.html`              | The document shell + global styles/tokens (plain CSS the renderer can adopt).           |
| `src/routes/+layout.svelte` | The client hydration: `onMount` loads each component's `define`.                        |
| `src/routes/+page.svelte`   | Authors the custom elements as plain HTML.                                              |
| `vite.config.js`            | `ssr.noExternal` for the element-js packages (keeps the shim import ordered first).     |
| `svelte.config.js`          | `@sveltejs/adapter-node`, so the `handle` hook runs per request.                        |

Unlike Astro/Nuxt (which hand the adapter a `Response`), SvelteKit's
`transformPageChunk` gives the adapter the rendered HTML **string** directly, so
the adapter calls `renderToString` on it — buffering chunks and transforming
the whole document once, on the final chunk.
