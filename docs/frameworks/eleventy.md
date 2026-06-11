# Eleventy (11ty)

Pre-render your custom elements to Declarative Shadow DOM **at build time** in an
[Eleventy](https://www.11ty.dev/) site — no server. Eleventy is the **content-driven SSG** member of
the build-time bucket (alongside the [Vite](/frameworks/vite) `transformIndexHtml` plugin): pages
come from content (Markdown / Nunjucks / Liquid) rendered through layouts, and an
[`addTransform`](https://www.11ty.dev/docs/transforms/) hook expands the elements in the final HTML
Eleventy writes.

Register the adapter from your Eleventy config, importing the DOM shim **first** so `HTMLElement`
exists before any component class is evaluated:

```js
// eleventy.config.js  (ESM — set "type": "module" in package.json)
import "@webtides/element-js-ssr-renderer/dom-shim"; // must come first: installs HTMLElement etc.
import { elementSSR } from "@webtides/element-js-ssr-renderer/eleventy";
import catalog from "@webtides/element-library/catalog";
import localComponents from "./_catalog.js"; // generated lazy Catalog (see below)

export default function (eleventyConfig) {
  eleventyConfig.addTransform(
    "element-ssr",
    elementSSR({ resolve: [catalog, localComponents] }),
  );
}
```

Author the elements as plain HTML in your layouts and content (Eleventy enables raw HTML in Markdown
by default), and they're pre-rendered wherever they appear. `elementSSR` takes the same sources as
every other adapter (see [Resolving components](/resolving-components)).

::: tip Only authored markup is pre-rendered
The transform expands custom-element tags **written in your templates/content**. There's no client
runtime injecting elements at build time, so anything that would only appear after JS runs won't be
pre-rendered.
:::

::: info No `import.meta.glob` — generate a catalog
`import.meta.glob` is a Vite feature; Eleventy runs on plain Node. Resolve this project's own
components with a **generated** static Catalog — `element-js-ssr-renderer catalog ./components -o
./_catalog.js` — and import that file in the config. Wire it to `prebuild`/`predev` so it can't
drift:

```bash
element-js-ssr-renderer catalog ./components -o ./_catalog.js
```

:::

## Transform order

Eleventy runs every transform over **every** output file, so the adapter gates on the output path —
only `*.html` output is parsed and transformed; feeds, JSON, sitemaps and `permalink: false` pages
pass through untouched. If you also run an **HTML minifier** transform, register `element-ssr`
**before** it and make sure the minifier preserves `<template shadowrootmode>` — otherwise it can
strip the Declarative Shadow DOM this emits.

## Client-side hydration

A plain Eleventy site has no bundler, and **browsers can't resolve bare specifiers** like
`@webtides/element-js`. The SSR output already carries element-js' `<!--template-part-->` markers, so
once the client `define`s run the elements **hydrate in place** rather than re-rendering — you just
need to get those `define`s to the browser. The two options are the same as for a no-bundler Node
server, covered in detail under [Node → Client-side hydration](/frameworks/node#client-side-hydration):

1. **Bundle a client entry** (esbuild/Rollup/Vite) that imports each component's `define`, and emit
   it into your Eleventy output (e.g. via a passthrough copy) — the most robust option.
2. **Import map** — serve the packages statically and map the bare specifiers; no build step, but
   fiddly with packages that have many internal imports.

## Runnable example

A complete, runnable version lives in
[`examples/eleventy/`](https://github.com/webtides/element-js-ssr-renderer/tree/main/examples/eleventy) —
a Markdown-driven Eleventy site composing element-library's shipped catalog with its own components
(a generated lazy Catalog), covering both the shadow (DSD) and light-DOM paths. It's deliberately
**SSR-only** to isolate the adapter; see above for adding hydration.

```bash
cd examples/eleventy && npm install && npm run build
# → open _site/index.html to see the pre-rendered DSD
```
