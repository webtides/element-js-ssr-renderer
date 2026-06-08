import { renderToString } from "../render-to-string.js";

/**
 * Vite plugin that pre-renders @webtides/element-js custom elements **authored as markup in your
 * HTML** into Declarative Shadow DOM, at build (and dev) time — no server. It hooks Vite's stable
 * `transformIndexHtml`, which hands the plugin each processed `index.html` (and any other `*.html`
 * entry) as a string; the plugin runs it through {@link renderToString} and returns the transformed
 * HTML, which Vite writes to `dist/` (or serves in dev).
 *
 * This is the adapter for the **build-time / static-HTML** bucket — plain Vite multi-page or static
 * sites — as opposed to the request-time meta-framework adapters (Astro, Nuxt, SvelteKit). The output
 * is a fully pre-rendered static document: the elements show (styled) before any JS runs, and hydrate
 * in place once their `…/define` modules load.
 *
 * ```js
 * // vite.config.js
 * import "@webtides/element-js-ssr-renderer/dom-shim";       // must come first: installs HTMLElement etc.
 * import { defineConfig } from "vite";
 * import { elementSSR } from "@webtides/element-js-ssr-renderer/vite";
 * import Button from "@webtides/element-library/button";
 * import localComponents from "./src/catalog.js";            // generated lazy Catalog (see below)
 *
 * export default defineConfig({
 *   plugins: [
 *     elementSSR({
 *       resolve: [
 *         { "el-button": Button },                            // eager element-library components
 *         localComponents,                                    // this project's — loaded on demand
 *       ],
 *     }),
 *   ],
 * });
 * ```
 *
 * It does no component resolution of its own: you hand it a `resolve`
 * {@link import('../render-to-string.js').Catalog} (or array of them) exactly like every other adapter.
 *
 * ::: Two caveats specific to this plugin :::
 *
 * 1. **Only authored markup is pre-rendered.** The renderer expands custom-element tags that are
 *    *written in your HTML*. A JS-mounted SPA (everything injected into an empty `<div id="app">` at
 *    runtime) has nothing in the document to transform — this plugin is for **multi-page / static-HTML
 *    (MPA)** sites where the elements appear as tags in your `.html` files.
 * 2. **No `import.meta.glob` in the config.** That sugar is transformed only in *app* code, not in
 *    `vite.config.js` (esbuild loads the config). So resolve this project's own components with a
 *    **generated** static Catalog — `element-js-ssr-renderer catalog <dir> -o catalog.js` (it pairs
 *    with this plugin exactly for this reason) — and import that file in the config. element-library
 *    classes can be imported eagerly as usual.
 *
 * The DOM shim must be imported **first** in `vite.config.js` (before element-library or the catalog),
 * so `HTMLElement` exists before any component class is evaluated. Vite loads the config with esbuild,
 * which preserves this file's import order, so a static top-level import is enough (no dynamic-import
 * dance like the Nitro/Nuxt example needs).
 *
 * On the client, import each component's `…/define` (or `…/all`) — typically from a module entry
 * referenced by a `<script type="module">` in the HTML — so the pre-rendered elements upgrade and
 * hydrate from the Declarative Shadow DOM this emits.
 *
 * Pass `serializeState: true` to transport each component's server-rendered state to the client (an
 * `ejs/json` script + per-host `ejs:key`s) so it hydrates with that state instead of property
 * defaults; enable element-js' matching `serializeState` config on the client too.
 *
 * @param {{
 *   resolve?: import('../render-to-string.js').Catalog | ((tag: string) => *) | Array<import('../render-to-string.js').Catalog | ((tag: string) => *)>,
 *   onUnresolved?: (tag: string) => void,
 *   serializeState?: boolean,
 * }} [options]
 * @return {{ name: string, transformIndexHtml: { order: "pre", handler: (html: string) => Promise<string> } }} a Vite plugin
 */
export function elementSSR({
  resolve,
  onUnresolved,
  serializeState = false,
} = {}) {
  const options = { resolve, onUnresolved, serializeState };
  return {
    name: "@webtides/element-js-ssr-renderer",
    // Stable, long-supported hook (unaffected by the experimental Environment API). Runs for every
    // processed HTML entry in both `vite dev` and `vite build`. `order: "pre"` runs us before Vite
    // injects its own tags (the dev client, module preloads), so we only ever parse/serialize the
    // authored document, and Vite's injections layer on top of our output afterwards.
    transformIndexHtml: {
      order: "pre",
      handler: (html) => renderToString(html, options),
    },
  };
}
