# SvelteKit

Wire the `handle` hook from your `src/hooks.server.{js,ts}` so you control import order. Unlike Astro,
SvelteKit hands the adapter the rendered HTML **string** (via `transformPageChunk`), so it calls
`renderToStringAsync` directly — buffering the page's chunks and transforming the whole document once, on the
final chunk:

```js
// src/hooks.server.js
import "@webtides/element-js-ssr-renderer/dom-shim";
import { elementSSR } from "@webtides/element-js-ssr-renderer/sveltekit";
import { lazy } from "@webtides/element-js-ssr-renderer";
import Button from "@webtides/element-library/button";

export const handle = elementSSR({
  registry: { "el-button": Button }, // eager element-library components
  resolve: lazy(import.meta.glob("./components/*.js")), // this project's — loaded on demand
});
```

`elementSSR` takes the same sources as everywhere else (see [Resolving components](/resolving-components)).
Author components as plain HTML in your `+page.svelte` / `+layout.svelte`, keep document-global styles in
`app.html` (so the renderer can adopt them into shadow roots), and load each component's `define` on the
client (e.g. from a layout's `onMount`).

::: tip Svelte `<style>` is scoped
Svelte component `<style>` blocks are scoped, so they aren't picked up as global styles. Put styles you want
shadow components to adopt in `app.html` as plain CSS. See [Style handling](/concepts/styles).
:::

## Runnable example

A complete, runnable version lives in
[`examples/sveltekit/`](https://github.com/webtides/element-js-ssr-renderer/tree/main/examples/sveltekit) —
an `@sveltejs/adapter-node` app composing element-library components (eager registry) with its own
(`lazy(import.meta.glob(...))`), covering both the shadow (DSD) and light-DOM paths.

```bash
cd examples/sveltekit && npm install && npm run dev
```
