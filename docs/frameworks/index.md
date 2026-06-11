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
| 4   | **Build-time / SSG**     | A build/transform step rewrites HTML files, no server                     | [`/vite`](/frameworks/vite), [`/eleventy`](/frameworks/eleventy)           |

## Support matrix

Frameworks that share a shape share its adapter — so most need no code of their own, just the right
hook. The rows below have a dedicated page where one exists, and an inline snippet otherwise.

| Framework                                      | Shape | Adapter / hook                                    | Status                                     |
| ---------------------------------------------- | :---: | ------------------------------------------------- | ------------------------------------------ |
| Express / Connect / Fastify / Koa / raw `http` |   3   | `./node` middleware                               | ✅ [Docs](/frameworks/node) + example      |
| Astro                                          |   1   | `./astro` `onRequest` middleware                  | ✅ [Docs](/frameworks/astro) + example     |
| Nuxt                                           |   1   | `./nuxt` on the Nitro `render:response` hook      | ✅ [Docs](/frameworks/nuxt) + example      |
| SvelteKit                                      |   2   | `./sveltekit` `handle` → `transformPageChunk`     | ✅ [Docs](/frameworks/sveltekit) + example |
| Vite (MPA / static HTML)                       |   4   | `./vite` `transformIndexHtml` plugin              | ✅ [Docs](/frameworks/vite) + example      |
| Eleventy (11ty)                                |   4   | `./eleventy` `addTransform` hook                  | ✅ [Docs](/frameworks/eleventy) + example  |
| TanStack Start                                 |   1   | `./nuxt` adapter on Nitro's `render:response`     | 📝 Documented below                        |
| SolidStart                                     |   1   | `./nuxt` adapter on Nitro's `render:response`     | 📝 Documented below                        |
| Analog (Angular)                               |   1   | `./nuxt` adapter on Nitro's `render:response`     | 📝 Documented below                        |
| Remix v3 (beta)                                | 2 / 1 | `renderToString()` string → ours; or the Response | 📝 Documented below (provisional)          |
| Next.js (App Router)                           |  1?   | `middleware.ts` (edge — needs a static catalog)   | 🚧 Deferred                                |

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

## Remix v3 (beta — provisional)

Target the **ground-up Remix v3** (the Preact-based rewrite), _not_ React Router 7 (which absorbed
Remix v2). Remix v3 is built entirely on Web Standards: routes are **Fetch controllers that return a
`Response`**, and `remix/ui/server` exposes both `renderToString()` (→ an HTML **string**) and
`renderToStream()` (streaming). That gives us a clean **string boundary (shape 2)**: render the
document to a string, run it through our renderer, then wrap it in a response.

```js
// a server route/controller (Remix v3 routes are Fetch controllers returning a Response)
import "@webtides/element-js-ssr-renderer/dom-shim"; // must come first: installs HTMLElement etc.
import { renderToString } from "remix/ui/server"; // Remix's own — app → HTML string
import { createHtmlResponse } from "remix/response";
import { renderToString as expandElements } from "@webtides/element-js-ssr-renderer"; // note: name clash, aliased
import catalog from "@webtides/element-library/catalog";

export async function loader({ request }) {
  const html = await renderToString(<App />); // Remix renders the document to a string
  const expanded = await expandElements(html, { resolve: [catalog] }); // we pre-render the custom elements
  return createHtmlResponse(expanded);
}
```

::: warning Provisional — Remix v3 is pre-release
Remix v3 is in **beta** and its API is still moving. The names above (`remix/ui/server`,
`renderToString`, `createHtmlResponse`) are from the current Remix 3 beta API docs and may change
before the stable release — verify against the [Remix 3 docs](https://api.remix.run/) before relying
on this. There's no example app for it yet for that reason.
:::

A few specifics:

- **Author custom elements as markup.** Remix v3 uses a Preact fork, but like any JSX framework it
  passes hyphenated lowercase tags straight through to HTML — so `<el-button>` in your JSX appears in
  the rendered string for us to expand.
- **Use the non-streaming `renderToString` path** so the whole document is in hand before we transform
  it. If you stream the document with `renderToStream()`, the [streaming concern](#the-four-shapes)
  (parked) applies — don't transform a half-streamed document; buffer to done first.
- Alternatively this fits **shape 1**: if you already hold the final `Response`, run it through the
  same content-type-gated kernel the Astro/Nuxt adapters use rather than transforming the string by
  hand.

## Frameworks not yet pinned

- **Next.js (App Router)** — the hardest fit: it streams RSC with no clean document-transform hook,
  pushing the work into `middleware.ts`, which runs on the edge and so needs a static catalog (no
  runtime FS). Deferred until there's concrete demand.
