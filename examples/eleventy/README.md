# Eleventy (11ty) example — `@webtides/element-js-ssr-renderer`

A minimal, runnable **Eleventy** site that pre-renders `@webtides/element-js`
custom elements **at build time** to Declarative Shadow DOM. Like the Vite
example, there's no server — but where Vite transforms a hand-authored
`index.html`, Eleventy is a **content-driven SSG**: pages come from content
(here Markdown) rendered through a Nunjucks layout, and an `addTransform` hook
expands the custom elements in the final HTML Eleventy writes to `_site/`.

It exercises **both component sources at once**:

- **element-library components** (`el-button`, `el-notification`) — resolved via
  the library's own shipped `@webtides/element-library/catalog`, dropped straight
  into `resolve` (no eager imports, no hand-written map);
- **local components** (`x-counter`, `x-greeting`) — authored in `components/`
  and resolved **lazily** via a **generated** static Catalog (`_catalog.js`).

…and both render paths: **shadow** components (`el-button`, `el-notification`,
`x-counter`) emit `<template shadowrootmode="open">` with their styles inlined;
**light-DOM** components (`x-greeting`) render their template in place.

> [!NOTE]
> This example is **SSR-only**, to isolate the build-time adapter — same choice
> as the [Node example](../node). A plain Eleventy site has no bundler, and
> browsers can't resolve bare specifiers like `@webtides/element-js`, so client
> hydration is its own step. See
> [`docs/frameworks/eleventy.md`](../../docs/frameworks/eleventy.md) and the
> [Node client-hydration notes](../../docs/frameworks/node.md#client-side-hydration)
> for the bundle-a-client-entry or import-map options.

## Run it

From this `examples/eleventy/` directory:

```bash
npm install
npm run build
```

Then open `_site/index.html` — the custom elements are already fully rendered in
the static file: shadow ones as `<template shadowrootmode="open">…</template>`
with styles inlined, light-DOM ones in place, all carrying element-js'
`<!--template-part-->` hydration markers. `npm run dev` serves it with live
reload.

> `npm install` links the renderer (`file:../..`) from this monorepo, so make sure
> that sibling package is present; `@webtides/element-library` is pulled from npm.

## What to look for

1. **Open `_site/index.html`** (after `npm run build`). Every custom element is
   pre-rendered — including the `<x-greeting>` written in the **Markdown content**
   (`src/index.md`), proving content-authored elements are transformed too, and
   the `<el-button>` **inside** `<el-notification>` (the renderer walks nested
   elements).
2. **The attribute-seeded counter** shows `Apples: 3` — props are read from the
   authored attributes during the server render.
3. There's no client JS in this example by design; the markup is the build-time
   output. Add hydration per the docs to make the counter buttons interactive.

## How it's wired

| File                     | Role                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `eleventy.config.js`     | Imports the DOM shim first, then `addTransform("element-ssr", elementSSR({...}))`. |
| `src/_includes/base.njk` | Nunjucks layout: global styles/tokens + the showcase elements as plain HTML.       |
| `src/index.md`           | Markdown content (incl. an authored `<x-greeting>`); selects the layout.           |
| `components/*.js`        | Local element-js components (default-export the class + a `define()`).             |
| `_catalog.js`            | **Generated** lazy Catalog of the local components (`npm run gen:catalog`).        |

### Why a generated catalog (not `import.meta.glob`)?

`import.meta.glob` is a Vite feature, and Eleventy runs on plain Node — so this
project's own components are resolved through a **generated** static Catalog. The
`gen:catalog` script (wired to `predev`/`prebuild`) runs the renderer's CLI:

```bash
element-js-ssr-renderer catalog ./components -o ./_catalog.js
```

…emitting a static `{ tag: () => import('./components/x-*.js') }` Catalog that
drops straight into `resolve` — no wrapper. Re-run it (or just `npm run dev` /
`npm run build`) whenever you add or remove a component.

> [!TIP]
> If you add an HTML-minifier transform, register it **after** `element-ssr` and
> make sure it preserves `<template shadowrootmode>` — otherwise it may strip the
> Declarative Shadow DOM this emits.
