# Nuxt

Nuxt's server runs on Nitro, which exposes a `render:response` hook. Register the adapter from a
Nitro server plugin so you control import order — the DOM shim must be imported there first, before
any component module is evaluated:

```js
// server/plugins/element-ssr.js
import "@webtides/element-js-ssr-renderer/dom-shim";
import { elementSSR } from "@webtides/element-js-ssr-renderer/nuxt";
import { lazy } from "@webtides/element-js-ssr-renderer";
import Button from "@webtides/element-library/button";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook(
    "render:response",
    elementSSR({
      registry: { "el-button": Button }, // eager element-library components
      // Nitro isn't Vite, so `import.meta.glob` is unavailable — hand-write the importer map:
      resolve: lazy({
        "x-counter": () => import("../../elements/x-counter.js"),
      }),
    }),
  );
});
```

`elementSSR` runs on `renderToStringAsync`, so it takes the same sources as everywhere else (see
[Resolving components](/resolving-components)). The `render:response` hook hands you a plain response
object (`{ body, headers, statusCode }`) rather than a web `Response` and you mutate it in place, so
the adapter wraps `response.body`, runs it through the same internal `transformHtmlResponse` kernel
the [Astro](/frameworks/astro) adapter uses, and writes the transformed HTML back.

Author components as plain HTML in your pages, and load each component's `define` on the client (e.g.
from a `.client.js` Nuxt plugin).

::: tip Tell Vue your tags are custom elements
Vue's template compiler warns about hyphenated tags it can't resolve as Vue components. Mark them as
native custom elements in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  vue: { compilerOptions: { isCustomElement: (tag) => tag.includes("-") } },
});
```

:::

## Runnable example

A complete, runnable version lives in
[`examples/nuxt/`](https://github.com/webtides/element-js-ssr-renderer/tree/main/examples/nuxt) — a
Nuxt app composing element-library components (eager registry) with its own (`lazy({...})`), covering
both the shadow (DSD) and light-DOM paths.

```bash
cd examples/nuxt && npm install && npm run dev
```

::: warning Import-order gotcha
Nuxt bundles the server (Nitro/rollup), so a bundler may hoist element-js' import above the inlined
DOM-shim side effect. The example fixes it with `nitro.externals.inline` for the element-js packages.
See [Installation](/guide/installation#import-order-matters).
:::

::: info No `import.meta.glob` on the server
`import.meta.glob` is a Vite feature, but Nuxt's server runs on Nitro (rollup), so the lazy source is
a hand-written `lazy({ 'x-counter': () => import('…') })` map rather than
`lazy(import.meta.glob('./elements/*.js'))`. Same behavior — a module is only imported when its tag
appears on the page.
:::
