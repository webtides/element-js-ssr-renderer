# Vite example — `@webtides/element-js-ssr-renderer`

A minimal, runnable **plain-Vite** app that pre-renders `@webtides/element-js`
custom elements **at build time** and hydrates them in the browser. Unlike the
meta-framework examples (Astro/Nuxt/SvelteKit), there's no server: the
`elementSSR` Vite plugin hooks the stable `transformIndexHtml` hook, so the
elements authored in `index.html` are expanded into Declarative Shadow DOM when
Vite builds (or serves) the page. The output `dist/index.html` is fully
rendered, static HTML.

It exercises **both component sources at once**:

- **element-library components** (`el-button`, `el-notification`) — loaded
  eagerly into a static `{ tag: Class }` catalog;
- **local components** (`x-counter`, `x-greeting`) — authored in
  `src/components/` and resolved **lazily** via a **generated** static Catalog
  (`src/catalog.js`), so only the ones on a page are loaded.

…and both render paths:

- **shadow** components (`el-button`, `el-notification`, `x-counter`) emit
  Declarative Shadow DOM (`<template shadowrootmode="open">`) with their styles
  and adopted global styles inlined;
- **light-DOM** components (`x-greeting`) render their template in place.

> [!IMPORTANT]
> This plugin pre-renders **only custom elements authored as markup in your
> HTML**. A JS-mounted SPA (everything injected into an empty `<div id="app">`
> at runtime) has nothing in the document to transform, so there'd be nothing to
> pre-render. This example is therefore **MPA / static-HTML style** — the
> elements are written as tags in `index.html`. That's the use case this adapter
> is for.

## Run it

From this `examples/vite/` directory:

```bash
npm install
npm run dev
```

Then open the printed URL (default <http://localhost:5173>).

> `npm install` links the renderer (`file:../..`) from this monorepo, so make sure that
> sibling package is present; `@webtides/element-library` is pulled from npm.

For a production-style run — the real point of this example:

```bash
npm run build && npm run preview
```

…then look at `dist/index.html`: the custom elements are already fully rendered
in the static file.

## What to look for

1. **Open `dist/index.html`** (after `npm run build`) or **view source** in
   `dev`/`preview`. The custom elements are already fully rendered — shadow ones
   as `<template shadowrootmode="open">…</template>`, with styles inlined. That's
   the build-time output, before any client JS.
2. **Disable JavaScript and reload.** Everything still shows, styled — no flash
   of empty/unstyled content. (The counter buttons just won't do anything yet.)
3. **Re-enable JavaScript.** Click the counter's **+ / −** buttons: they update.
   That's element-js _hydrating_ the pre-rendered DSD (matching the
   `<!--template-part-->` markers in the output) rather than re-rendering from
   scratch.

## How it's wired

| File                  | Role                                                                            |
| --------------------- | ------------------------------------------------------------------------------- |
| `vite.config.js`      | Imports the DOM shim first, then registers `elementSSR(...)` with both sources. |
| `index.html`          | Authors the custom elements as plain HTML; global styles/tokens; client entry.  |
| `src/client.js`       | Loads each component's `define` so the pre-rendered elements hydrate.           |
| `src/components/*.js` | Local element-js components (default-export the class + a `define()`).          |
| `src/catalog.js`      | **Generated** lazy Catalog of the local components (`npm run gen:catalog`).     |

### Why a generated catalog (not `import.meta.glob`)?

`import.meta.glob('./src/components/*.js')` is Vite sugar that's transformed only
in **app** code — not in `vite.config.js`, which Vite loads with esbuild. So the
config can't glob its own components. Instead, the `gen:catalog` script
(wired to `predev`/`prebuild`) runs the renderer's CLI:

```bash
element-js-ssr-renderer catalog ./src/components -o ./src/catalog.js
```

…emitting a static `{ tag: () => import('./components/x-*.js') }` Catalog that
Vite can trace and code-split. It drops straight into `resolve` — no wrapper.
Re-run it (or just `npm run dev` / `npm run build`) whenever you add or remove a
component.
