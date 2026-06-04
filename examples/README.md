# Examples

Runnable, self-contained apps that wire `@webtides/element-js-ssr-renderer` into a
specific meta-framework. Each one SSRs the same kinds of `@webtides/element-js` custom
elements — some authored locally, some from `@webtides/element-library` — to Declarative
Shadow DOM (and light DOM), then hydrates them in the browser.

| Framework | Directory                   | Status       | SSR hook used                               |
| --------- | --------------------------- | ------------ | ------------------------------------------- |
| Astro     | [`astro/`](./astro)         | ✅ available | `onRequest` middleware (`elementSSR`)       |
| Nuxt      | [`nuxt/`](./nuxt)           | ✅ available | Nitro `render:response` hook (`elementSSR`) |
| SvelteKit | [`sveltekit/`](./sveltekit) | ✅ available | `handle` hook (`transformPageChunk`)        |

Each example is **fully self-contained** — its own `package.json`, its own copy of the
local components, its own framework wiring — so it doubles as a copy-pasteable blueprint.
They link the renderer from this monorepo via a relative `file:` dependency (so the
sibling package must be present), and pull `@webtides/element-library` from npm.

## The shape every example shares

The renderer is framework-agnostic: it takes an HTML string and returns one with the
custom elements pre-rendered. So integrating it into any framework is always the same
three moves — only the _names_ of the hooks differ:

1. **Install the DOM shim first.** Import `@webtides/element-js-ssr-renderer/dom-shim`
   before any component module loads (component classes are `class … extends HTMLElement`,
   evaluated at import time). In each example this is the first import in the file that
   owns the SSR hook.
2. **Wrap the framework's HTML response.** Take the rendered HTML the framework hands you
   and run it through `await renderToString(html, { resolve })`, then return the transformed
   HTML. Resolution composes component sources — typically element-library via an eager
   `{ tag: Class }` map plus the project's own components via `lazy(import.meta.glob(...))`
   (see the package README's _Loading & resolving components_).
3. **Load `define` on the client.** Ship a `<script>` that imports each component's
   `…/define` (or calls a local `define()`), so the pre-rendered elements upgrade and
   hydrate in place rather than re-rendering.

Where each framework exposes those:

| Step                | Astro                          | Nuxt (Nitro)                    | SvelteKit                      |
| ------------------- | ------------------------------ | ------------------------------- | ------------------------------ |
| Owns the SSR hook   | `src/middleware.js`            | `server/plugins/element-ssr.js` | `src/hooks.server.js`          |
| Gets the HTML       | `(await next()).text()`        | `render:response` body          | `transformPageChunk({ html })` |
| Returns transformed | new `Response(transformed, …)` | mutate `response.body`          | return the transformed chunk   |

### Framework adapters

Step 2 is small and repetitive, so the package ships a thin **adapter** per framework that does
it for you, published as a stable subpath export and living under
[`src/adapters/`](../src/adapters):

| Adapter export | Status       | What it gives you                                              |
| -------------- | ------------ | -------------------------------------------------------------- |
| `…/astro`      | ✅ available | `elementSSR(options)` → an `onRequest` middleware              |
| `…/nuxt`       | ✅ available | `elementSSR(options)` → a Nitro `render:response` handler      |
| `…/sveltekit`  | ✅ available | `elementSSR(options)` → a `handle` hook (`transformPageChunk`) |

Adapters that deal in `Response` objects (Astro, Nuxt) share one internal kernel,
[`transformHtmlResponse`](../src/adapters/transform-response.js) — content-type gate, read the
body, `renderToString`, re-wrap preserving status/headers. SvelteKit's `transformPageChunk`
hands you the HTML **string** directly, so its adapter just calls `renderToString(html, opts)`
and needs no Response kernel. New adapters land **with** their example and a test — see the
checklist below.

## Adding a new example

1. Create `examples/<framework>/` with its own `package.json`; depend on the renderer
   (`file:../..`), `@webtides/element-library` (from npm), `@webtides/element-js`, and
   the framework.
2. Add the framework adapter under `src/adapters/<framework>.js`, export it as `./<framework>`
   in the package `exports`, and cover it with a test (mirror `test/astro.test.js`). Reuse
   `transformHtmlResponse` if the framework is `Response`-based; otherwise call
   `renderToString` directly. Then implement the three moves above in the example's SSR hook,
   using that adapter.
3. Reuse the two local components from `astro/src/components` (`x-counter`, a shadow/DSD
   component, and `x-greeting`, a light-DOM one) so every example demonstrates both render
   paths and stays comparable.
4. Add a short `README.md` (run steps + "what to look for") and a row to both tables above.
5. If the framework bundles the server (Astro/SvelteKit/Nuxt all can), watch for the
   import-order gotcha the Astro example documents: a bundler may hoist element-js' import
   above the inlined DOM-shim side effect. The Astro example fixes it with
   `vite.ssr.noExternal`; the equivalent escape hatch is preloading the shim
   (`node --import @webtides/element-js-ssr-renderer/dom-shim …`).
