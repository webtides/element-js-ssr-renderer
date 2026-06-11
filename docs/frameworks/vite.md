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
import catalog from "@webtides/element-library/catalog";

export default defineConfig({
  plugins: [
    elementSSR({
      components: "./src/components", // this project's components — discovered + watched
      resolve: [catalog], // other sources, e.g. a library's own catalog
    }),
  ],
});
```

Author components as plain HTML in your `.html` files, keep document-global styles in a `<style>` (so
the renderer can adopt them into shadow roots), and load each component's `define` from a
`<script type="module">` on the client.

::: warning Only authored markup is pre-rendered
This plugin expands custom-element tags **written in your HTML**. A JS-mounted SPA (everything injected
into an empty `<div id="app">` at runtime) has nothing in the document to transform. Use this for
**multi-page / static-HTML (MPA)** sites where the elements appear as tags in your `.html` files.
:::

## Resolving your own components

`elementSSR` takes the same `resolve` sources as every other adapter (see
[Resolving components](/resolving-components)) — but for **this project's own** components, prefer the
`components` option over building a catalog by hand:

```js
elementSSR({ components: "./src/components" });
```

The plugin scans that directory (the `x-foo.js` → `x-foo` filename convention) and merges the
discovered components into `resolve` for you — **own components last, so they win** a tag clash with
anything you also pass in `resolve`. There's no `element-js-ssr-renderer catalog` run and no generated
file to commit; the catalog is built in memory at startup.

This is sourced from the **filesystem on purpose**, not Vite's module graph: the module graph only
holds modules your JS imports, but the catalog has to resolve components referenced **only as tags** in
your HTML (never imported in JS) — so a directory scan is the correct source.

::: tip Dev watch
In `vite dev` the `components` directory is **watched**. Add or remove a component (the catalog's tags
change) or edit one (its rendered output changes) and the plugin rebuilds the catalog and triggers a
full reload, so the page re-renders with the change — no restart.
:::

::: info When to use the CLI generator instead
`components` is the Vite-native path. The standalone generator (`element-js-ssr-renderer catalog <dir>
-o catalog.js`) still has its place: non-Vite targets (Eleventy, Nuxt/Nitro) that need a committed,
bundler-traceable catalog file, or when you'd rather check the map into source control. (`import.meta.glob`
is _not_ an option here — it's transformed only in app code, not in `vite.config.js`, which esbuild loads.)
:::

## Runnable example

A complete, runnable version lives in
[`examples/vite/`](https://github.com/webtides/element-js-ssr-renderer/tree/main/examples/vite) — a
plain-Vite MPA composing element-library components (via the library's shipped catalog) with its own
(via the `components` option), covering both the shadow (DSD) and light-DOM paths.

```bash
cd examples/vite && npm install && npm run build && npm run preview
```
