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

### What the shim provides

Beyond the core (`HTMLElement`, `document`, `customElements`), the shim stubs the browser APIs real-world
component files and their vendor libraries commonly touch at module scope or in constructors: `window`,
`matchMedia`, `IntersectionObserver`/`ResizeObserver`/`MutationObserver`, `requestAnimationFrame`,
`CSSStyleSheet`, `localStorage`/`sessionStorage`, `navigator`, `location`, and global/document event and
query methods — so importing a real component library on the server works without a hand-rolled stub file.

All stubs are **inert** (queries return `null`/empty, storage reads return `null`, media queries never
match, `requestAnimationFrame` callbacks never fire) and installed only where the environment doesn't
already provide the API — a real DOM (browser, happy-dom, jsdom) is never touched. Code needing real
behavior from these APIs belongs behind `connected()` — it runs on the client only.

## On the client

The renderer only produces markup. To make the pre-rendered elements upgrade and **hydrate**, import the
matching `…/define` (or `…/all`) on the client:

```js
import "@webtides/element-library/button/define";
```

Because the SSR output carries element-js' `<!--template-part-->` markers, the client updates the elements in
place rather than re-rendering them — no flash of empty/unstyled content.

## Subpath exports

| Import                                        | What it is                                    |
| --------------------------------------------- | --------------------------------------------- |
| `@webtides/element-js-ssr-renderer`           | `renderToString`, `glob`                      |
| `@webtides/element-js-ssr-renderer/dom-shim`  | DOM globals shim — import first               |
| `@webtides/element-js-ssr-renderer/astro`     | `elementSSR` Astro middleware                 |
| `@webtides/element-js-ssr-renderer/nuxt`      | `elementSSR` Nitro `render:response` handler  |
| `@webtides/element-js-ssr-renderer/sveltekit` | `elementSSR` SvelteKit `handle` hook          |
| `@webtides/element-js-ssr-renderer/generate`  | `buildCatalog` — build-time catalog generator |

The package also installs an `element-js-ssr-renderer` CLI (`element-js-ssr-renderer catalog`) for generating
a static catalog at build time. See the [API reference](/api/) for full signatures.
