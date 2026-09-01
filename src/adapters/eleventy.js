import { renderToString } from "../render-to-string.js";

/**
 * Eleventy (11ty) **transform** that pre-renders @webtides/element-js custom elements **authored as
 * markup in your templates** into Declarative Shadow DOM, at build time — no server. It's the SSG
 * member of the build-time bucket (alongside the {@link ./vite.js} `transformIndexHtml` plugin): the
 * difference is the authoring model — Eleventy generates pages from *content* (Markdown / Nunjucks /
 * Liquid + layouts + collections), so the elements live in your templates and layouts, and this
 * transform expands them in the final rendered HTML.
 *
 * Register the returned function with `addTransform` from your Eleventy config, importing the DOM
 * shim **first** so `HTMLElement` exists before any component class is evaluated:
 *
 * ```js
 * // eleventy.config.js
 * import "@webtides/element-js-ssr-renderer/dom-shim";   // must come first: installs HTMLElement etc.
 * import { elementSSR } from "@webtides/element-js-ssr-renderer/eleventy";
 * import catalog from "@webtides/element-library/catalog";
 * import localComponents from "./_catalog.js";           // generated lazy Catalog (see below)
 *
 * export default function (eleventyConfig) {
 *   eleventyConfig.addTransform(
 *     "element-ssr",
 *     elementSSR({ resolve: [catalog, localComponents] }),
 *   );
 * }
 * ```
 *
 * Eleventy runs every transform over **every** output file, so this gates on the output path: only
 * `text/html` output (`*.html`) is parsed and transformed; everything else (feeds, JSON, sitemaps),
 * and pages with no output path (`permalink: false`), pass through untouched. The returned function
 * is a **regular function** (not an arrow) on purpose — it reads Eleventy's `this.page.outputPath`,
 * which only a function with its own `this` binding can see.
 *
 * It does no component resolution of its own: hand it a `resolve`
 * {@link import('../render-to-string.js').Catalog} (or array of them) exactly like every other
 * adapter (see [Resolving components](/resolving-components)). Eleventy runs on Node, **not** Vite,
 * so there's no `import.meta.glob` — resolve this project's own components with a **generated** static
 * Catalog (`element-js-ssr-renderer catalog <dir> -o _catalog.js`) and import that file in the config;
 * element-library ships its own `./catalog`.
 *
 * ::: Two things to watch :::
 *
 * 1. **Only authored markup is pre-rendered.** The renderer expands custom-element tags written in
 *    your templates/layouts. Author the elements as plain HTML in your content — there's no client
 *    runtime to inject them at build time.
 * 2. **Transform order.** If you also run an HTML minifier transform, register this one **before** it,
 *    and make sure the minifier preserves `<template shadowrootmode>` (don't let it strip the DSD this
 *    emits).
 *
 * For client-side hydration in a no-bundler Eleventy site, see the same options the
 * [Node guide](/frameworks/node#client-side-hydration) documents (bundle a client entry, or an import
 * map): browsers can't resolve bare specifiers, so the `define`s need bundling or mapping. The SSR
 * output already carries element-js' hydration markers, so once the `define`s run the elements
 * **upgrade in place** rather than re-rendering.
 *
 * Pass `serializeState: true` to transport each component's server-rendered state to the client (an
 * `ejs/json` script + per-host `ejs:key`s) so it hydrates with that state instead of property
 * defaults; enable element-js' matching `serializeState` config on the client too.
 *
 * @param {{
 *   resolve?: import('../render-to-string.js').Catalog | ((tag: string) => *) | Array<import('../render-to-string.js').Catalog | ((tag: string) => *)>,
 *   onUnresolved?: (tag: string) => void,
 *   exclude?: string[] | ((tag: string) => boolean),
 *   onError?: (tag: string, error: Error) => void,
 *   serializeState?: boolean,
 *   transforms?: { pre?: import("../render-to-string.js").PageTransform | import("../render-to-string.js").PageTransform[], post?: import("../render-to-string.js").PageTransform | import("../render-to-string.js").PageTransform[] },
 * }} [options]
 * @return {(this: { page?: { outputPath?: string | false } }, content: string) => string | Promise<string>}
 *   an Eleventy transform — pass it to `eleventyConfig.addTransform(name, fn)`
 */
export function elementSSR({
  resolve,
  onUnresolved,
  exclude,
  onError,
  serializeState = false,
  transforms,
} = {}) {
  const options = {
    resolve,
    exclude,
    onUnresolved,
    onError,
    serializeState,
    transforms,
  };
  // Regular function (not arrow): Eleventy invokes the transform with `this.page` bound, which an
  // arrow function could not read. Runs for every output file, so gate on the .html output path —
  // `outputPath` can be `false` for `permalink: false` pages, hence the `|| ""`.
  return function (content) {
    if (!(this.page?.outputPath || "").endsWith(".html")) return content;
    return renderToString(content, options);
  };
}
