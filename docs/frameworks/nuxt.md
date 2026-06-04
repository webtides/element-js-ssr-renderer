# Nuxt

::: info Planned
The Nuxt adapter (`@webtides/element-js-ssr-renderer/nuxt`) and a runnable example are on the roadmap. This
page will fill in when they land.
:::

Nuxt's server (Nitro) is `Response`-shaped, so the planned adapter will reuse the same internal
`transformHtmlResponse` kernel the Astro adapter uses, wired into Nitro's `render:response` hook.

The integration follows the same three moves as every other framework (see
[Resolving components](/resolving-components) and the existing [Astro](/frameworks/astro) /
[SvelteKit](/frameworks/sveltekit) pages):

1. **Install the DOM shim first**, before any component module loads — in the file that owns the SSR hook.
2. **Wrap the rendered HTML** through `renderToStringAsync(html, { registry, resolve })` — for Nuxt, the
   `render:response` hook's body — and return the transformed HTML.
3. **Load `define` on the client** so the pre-rendered elements upgrade and hydrate.

Until the adapter ships, you can integrate the framework-agnostic core directly in a Nitro plugin: install
the shim, read the response body, run it through `renderToStringAsync`, and write it back.

Track progress in [`examples/README.md`](https://github.com/webtides/element-js-ssr-renderer/tree/main/examples)
(task **T-010**).
