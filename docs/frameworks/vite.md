# Vite

The odd one out: plain Vite has no per-request server, so this adapter pre-renders **at build time**.
It's a Vite plugin that hooks the stable `transformIndexHtml` hook — Vite hands it each processed
`index.html` as a string, and it runs that through `renderToString`, expanding the custom elements
authored in your markup into Declarative Shadow DOM. The built `dist/index.html` is fully rendered,
static HTML.

```js
// vite.config.js
import "@webtides/element-js-ssr-renderer/dom-shim"; // must come first: installs HTMLElement etc.
import { defineConfig } from "vite";
import { elementSSR } from "@webtides/element-js-ssr-renderer/vite";
import Button from "@webtides/element-library/button";
import localComponents from "./src/catalog.js"; // generated lazy Catalog (see below)

export default defineConfig({
  plugins: [
    elementSSR({
      resolve: [
        { "el-button": Button }, // eager element-library components
        localComponents, // this project's — loaded on demand
      ],
    }),
  ],
});
```

`elementSSR` takes the same sources as everywhere else (see [Resolving components](/resolving-components)).
Author components as plain HTML in your `.html` files, keep document-global styles in a `<style>` (so
the renderer can adopt them into shadow roots), and load each component's `define` from a
`<script type="module">` on the client.

::: warning Only authored markup is pre-rendered
This plugin expands custom-element tags **written in your HTML**. A JS-mounted SPA (everything injected
into an empty `<div id="app">` at runtime) has nothing in the document to transform. Use this for
**multi-page / static-HTML (MPA)** sites where the elements appear as tags in your `.html` files.
:::

::: warning No `import.meta.glob` in the config
`import.meta.glob` is transformed only in _app_ code, not in `vite.config.js` (esbuild loads it). So
resolve your own components with a **generated** static Catalog — it pairs with this plugin precisely
for this reason:

```bash
element-js-ssr-renderer catalog ./src/components -o ./src/catalog.js
```

…then `import` that file in the config. Wire it to `predev`/`prebuild` scripts so it can't drift.
:::

## Runnable example

A complete, runnable version lives in
[`examples/vite/`](https://github.com/webtides/element-js-ssr-renderer/tree/main/examples/vite) — a
plain-Vite MPA composing element-library components (an eager static catalog) with its own (a generated
lazy Catalog), covering both the shadow (DSD) and light-DOM paths.

```bash
cd examples/vite && npm install && npm run build && npm run preview
```
