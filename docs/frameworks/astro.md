# Astro

Wire the middleware from your `src/middleware.{js,ts}` so you control import order:

```js
// src/middleware.js
import "@webtides/element-js-ssr-renderer/dom-shim";
import { elementSSR } from "@webtides/element-js-ssr-renderer/astro";
import Button from "@webtides/element-library/button";
import InputField from "@webtides/element-library/input-field";

export const onRequest = elementSSR({
  resolve: { "el-button": Button, "el-input-field": InputField },
});
```

`elementSSR` runs on `renderToString`, so it takes the same sources (see
[Resolving components](/resolving-components)). To load only the components a page uses — the serverless /
edge win — resolve lazily with `import.meta.glob` (Astro is Vite-based) and compose the library with your own
components:

```js
// src/middleware.js
import "@webtides/element-js-ssr-renderer/dom-shim";
import { elementSSR } from "@webtides/element-js-ssr-renderer/astro";
import Button from "@webtides/element-library/button";

export const onRequest = elementSSR({
  resolve: [
    { "el-button": Button }, // eager base components
    import.meta.glob("../components/*.js"), // overrides the above on a tag clash
  ],
});
```

Then author components normally in `.astro` files and load their `define` modules in a client `<script>`.

## Runnable example

A complete, runnable version of this setup lives in
[`examples/astro/`](https://github.com/webtides/element-js-ssr-renderer/tree/main/examples/astro) — a
`@astrojs/node` app that composes element-library components (an eager static catalog) with its own components
(`import.meta.glob(...)`), covering both the shadow (DSD) and light-DOM paths.

```bash
cd examples/astro && npm install && npm run dev
```

::: warning Import-order gotcha
Astro bundles the server, so a bundler may hoist element-js' import above the inlined DOM-shim side effect.
The example fixes it with `vite.ssr.noExternal` for the element-js packages. See
[Installation](/guide/installation#import-order-matters).
:::
