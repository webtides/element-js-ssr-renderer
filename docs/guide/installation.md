# Installation

```bash
npm install @webtides/element-js-ssr-renderer
```

Requires `@webtides/element-js >= 1.2.11` (peer dependency) and Node `>= 20.19`.

## Import order matters

Component classes are `class … extends HTMLElement`, evaluated at import time, so
`@webtides/element-js-ssr-renderer/dom-shim` **must be imported before any component module** — it installs
`HTMLElement` and friends into the Node global scope.

```js
import "@webtides/element-js-ssr-renderer/dom-shim"; // MUST be first
import { renderToString } from "@webtides/element-js-ssr-renderer";
import Button from "@webtides/element-library/button";
```

::: warning Bundled servers
When a meta-framework bundles the server (Astro / SvelteKit / Nuxt all can), a bundler may hoist element-js'
import above the inlined DOM-shim side effect. Fix it with `vite.ssr.noExternal` for the element-js packages
(as the [Astro](/frameworks/astro) and [SvelteKit](/frameworks/sveltekit) examples do), or preload the shim:
`node --import @webtides/element-js-ssr-renderer/dom-shim …`.
:::

## On the client

The renderer only produces markup. To make the pre-rendered elements upgrade and **hydrate**, import the
matching `…/define` (or `…/all`) on the client:

```js
import "@webtides/element-library/button/define";
```

Because the SSR output carries element-js' `<!--template-part-->` markers, the client updates the elements in
place rather than re-rendering them — no flash of empty/unstyled content.

## Subpath exports

| Import                                           | What it is                                            |
| ------------------------------------------------ | ----------------------------------------------------- |
| `@webtides/element-js-ssr-renderer`              | `renderToString`, `renderToStringAsync`, `lazy`       |
| `@webtides/element-js-ssr-renderer/dom-shim`     | DOM globals shim — import first                       |
| `@webtides/element-js-ssr-renderer/astro`        | `elementSSR` Astro middleware                         |
| `@webtides/element-js-ssr-renderer/sveltekit`    | `elementSSR` SvelteKit `handle` hook                  |
| `@webtides/element-js-ssr-renderer/resolve/node` | `fromDirectory`, `fromManifest` — Node-only resolvers |
| `@webtides/element-js-ssr-renderer/generate`     | `generateLazyMap` — build-time static-map generator   |

The package also installs an `element-ssr` CLI (`element-ssr gen`) for generating a static lazy map at
build time. See the [API reference](/api/) for full signatures.
