# Nuxt example — `@webtides/element-js-ssr-renderer`

A minimal, runnable Nuxt app that wires the renderer into a Nitro
`render:response` hook and pre-renders `@webtides/element-js` custom elements on
the server, then hydrates them in the browser. It exercises **both component
sources at once**:

- **element-library components** (`el-button`, `el-notification`) — loaded
  eagerly into a static `registry`;
- **local components** (`x-counter`, `x-greeting`) — authored in `elements/` and
  resolved **lazily** via a hand-written `lazy({...})` importer map, so only the
  ones on a page are loaded.

…and both render paths:

- **shadow** components (`el-button`, `el-notification`, `x-counter`) emit
  Declarative Shadow DOM (`<template shadowrootmode="open">`) with their styles
  and adopted global styles inlined;
- **light-DOM** components (`x-greeting`) render their template in place.

## Run it

From this `examples/nuxt/` directory:

```bash
npm install
npm run dev
```

Then open the printed URL (default <http://localhost:3000>).

> `npm install` links the renderer (`file:../..`) from this monorepo, so make sure that
> sibling package is present; `@webtides/element-library` is pulled from npm.

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

| File                                | Role                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `server/plugins/element-ssr.js`     | Imports the DOM shim first, then registers `elementSSR(...)` on `render:response`. |
| `plugins/element-define.client.js`  | Browser-only: loads each component's `define` so the pre-rendered tags hydrate. |
| `elements/*.js`                     | Local element-js components (default-export the class + a `define()`).          |
| `app.vue`                           | Authors the custom elements as plain HTML + injects the global styles/tokens.   |
| `nuxt.config.ts`                    | `isCustomElement` so Vue passes the tags through; `nitro.externals.inline` for import order. |

### Two Nuxt-specific notes

- **`isCustomElement`.** Vue's template compiler would otherwise warn about
  `<x-counter>` / `<el-button>` as unresolved Vue components. `nuxt.config.ts`
  marks any hyphenated tag as a native custom element so it renders verbatim.
- **No `import.meta.glob`.** That's a Vite feature, but Nuxt's server runs on
  Nitro (rollup), so the lazy source is a hand-written `lazy({ 'x-counter': () =>
  import('../../elements/x-counter.js') })` map instead. Same behavior — a
  component module is only imported when its tag appears on the page.
