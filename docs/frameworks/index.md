# Framework integrations

The renderer is a string→string engine: HTML in, the same HTML with every custom element
pre-rendered to Declarative Shadow DOM out. An "adapter" is a thin shim that hands a framework's
rendered HTML to [`renderToString`](/api/#rendertostring) and puts the result back. Because every
framework boundary reduces to that, support is organized around **four integration shapes** — not
one bespoke integration per framework.

If your framework matches a shape below, it's supported: use that shape's adapter, even if the
framework isn't named on its own page.

## The four shapes

| #   | Shape                    | How the framework hands you HTML                                          | Adapter                                                                    |
| --- | ------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | **Response in/out**      | An SSR hook gives you (or lets you return) a `Response` / response object | [`/astro`](/frameworks/astro), [`/nuxt`](/frameworks/nuxt) — shared kernel |
| 2   | **HTML string in/out**   | A hook hands you the rendered document as a string                        | [`/sveltekit`](/frameworks/sveltekit), or call `renderToString` directly   |
| 3   | **Node `res` buffering** | A plain `(req, res, next)` server, no meta-framework hook                 | [`/node`](/frameworks/node)                                                |
| 4   | **Build-time / SSG**     | A build/transform step rewrites HTML files, no server                     | [`/vite`](/frameworks/vite), Eleventy (planned)                            |

## Support matrix

Frameworks that share a shape share its adapter — so most need no code of their own, just the right
hook. The rows below have a dedicated page where one exists, and an inline snippet otherwise.

| Framework                                      | Shape | Adapter / hook                                  | Status                                     |
| ---------------------------------------------- | :---: | ----------------------------------------------- | ------------------------------------------ |
| Express / Connect / Fastify / Koa / raw `http` |   3   | `./node` middleware                             | ✅ [Docs](/frameworks/node) + example      |
| Astro                                          |   1   | `./astro` `onRequest` middleware                | ✅ [Docs](/frameworks/astro) + example     |
| Nuxt                                           |   1   | `./nuxt` on the Nitro `render:response` hook    | ✅ [Docs](/frameworks/nuxt) + example      |
| SvelteKit                                      |   2   | `./sveltekit` `handle` → `transformPageChunk`   | ✅ [Docs](/frameworks/sveltekit) + example |
| Vite (MPA / static HTML)                       |   4   | `./vite` `transformIndexHtml` plugin            | ✅ [Docs](/frameworks/vite) + example      |
| TanStack Start                                 |   1   | `./nuxt` adapter on Nitro's `render:response`   | 📝 Documented below                        |
| SolidStart                                     |   1   | `./nuxt` adapter on Nitro's `render:response`   | 📝 Documented below                        |
| Analog (Angular)                               |   1   | `./nuxt` adapter on Nitro's `render:response`   | 📝 Documented below                        |
| Remix v3                                       |   ?   | Boundary not yet pinned                         | 🚧 Planned                                 |
| Eleventy (11ty)                                |   4   | `addTransform` → `renderToString`               | 🚧 Planned                                 |
| Next.js (App Router)                           |  1?   | `middleware.ts` (edge — needs a static catalog) | 🚧 Deferred                                |

::: tip The `./nuxt` adapter is Nitro-generic
Despite the name, the `./nuxt` adapter only knows about **Nitro's `render:response` hook** and the
plain response object it passes — not Nuxt itself. So it works on **any** Nitro-based framework
(TanStack Start, SolidStart, Analog) unchanged. The name reflects the first framework it shipped for.
:::

## Nitro-based frameworks (shape 1)

TanStack Start, SolidStart, and Analog all run their server on **Nitro**, which exposes the same
`render:response` hook Nuxt uses. The integration is identical to [Nuxt](/frameworks/nuxt) — register
the adapter from a Nitro server plugin so you control import order (the DOM shim must load before any
component module):

```js
// server/plugins/element-ssr.js  (or your framework's Nitro-plugin location)
import "@webtides/element-js-ssr-renderer/dom-shim"; // must come first: installs HTMLElement etc.
import { elementSSR } from "@webtides/element-js-ssr-renderer/nuxt";
import catalog from "@webtides/element-library/catalog";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook(
    "render:response",
    elementSSR({
      resolve: [
        catalog, // a library's shipped catalog
        // Nitro isn't Vite — no `import.meta.glob`; use a generated/hand-written lazy catalog:
        { "x-counter": () => import("../../elements/x-counter.js") },
      ],
    }),
  );
});
```

Everything from the [Nuxt page](/frameworks/nuxt) applies — the import-order gotcha, the lack of
`import.meta.glob` on the server (generate a catalog with `element-js-ssr-renderer catalog`), and the
client-side `define` loading. The only thing that differs between these frameworks is **where the
Nitro plugin lives**; consult your framework's docs for its server-plugin directory.

::: info These rows are documented, not example-backed
Per the project's [coverage policy](#the-four-shapes), same-shape frameworks are covered by docs
rather than a full example app each (every example is a maintained app that can rot). The Nuxt
example exercises this exact code path end-to-end. If you hit a framework-specific snag, please open
an issue.
:::

## Frameworks not yet pinned

- **Remix v3** — target the ground-up v3, _not_ React Router 7 (which absorbed Remix v2). Its
  document/response boundary needs to be pinned from the v3 docs before a snippet can be written that
  we'd stand behind; depending on what it exposes it will fall into shape 1 (Response) or shape 2
  (string).
- **Eleventy (11ty)** — a build-time/SSG integration (shape 4): `addTransform` hands the output HTML
  string directly to `renderToString`. Planned as the canonical SSG example.
- **Next.js (App Router)** — the hardest fit: it streams RSC with no clean document-transform hook,
  pushing the work into `middleware.ts`, which runs on the edge and so needs a static catalog (no
  runtime FS). Deferred until there's concrete demand.
