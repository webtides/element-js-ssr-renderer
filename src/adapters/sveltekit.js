import { renderToStringAsync } from "../render-to-string.js";

/**
 * SvelteKit `handle` hook that pre-renders @webtides/element-js custom elements in every page's
 * HTML. Unlike the Response-based adapters (Astro, Nuxt), SvelteKit hands you the rendered HTML as
 * a **string** through `transformPageChunk`, so this calls {@link renderToStringAsync} directly and
 * needs no Response kernel.
 *
 * Use it from your `src/hooks.server.{js,ts}` so you control import order — the DOM shim must be
 * imported there first, before any component module is evaluated:
 *
 * ```js
 * // src/hooks.server.js
 * import '@webtides/element-js-ssr-renderer/dom-shim';        // must come first: installs HTMLElement etc.
 * import { elementSSR } from '@webtides/element-js-ssr-renderer/sveltekit';
 * import { lazy } from '@webtides/element-js-ssr-renderer';
 * import Button from '@webtides/element-library/button';
 *
 * export const handle = elementSSR({
 *     registry: { 'el-button': Button },                       // eager element-library components
 *     resolve: lazy(import.meta.glob('./components/*.js')),    // this project's — loaded on demand
 * });
 * ```
 *
 * `transformPageChunk` is invoked once per chunk of the rendered document (more than once only when
 * a page streams promises). The renderer parses the whole document tree, so this **buffers** every
 * chunk and transforms once, on the final (`done`) chunk — preserving output order: earlier chunks
 * return an empty string, the last returns the full pre-rendered document.
 *
 * On the client, load each component's `…/define` (or `…/all`) so the elements upgrade and hydrate
 * from the Declarative Shadow DOM this emits.
 *
 * @param {{
 *   registry?: import('../render-to-string.js').Registry,
 *   resolve?: import('../render-to-string.js').Source | import('../render-to-string.js').Source[],
 *   onUnresolved?: (tag: string) => void,
 * }} [options]
 * @return {(input: { event: any, resolve: (event: any, opts: { transformPageChunk: (chunk: { html: string, done: boolean }) => Promise<string> }) => any }) => any}
 */
export function elementSSR({ registry = {}, resolve, onUnresolved } = {}) {
  const options = { registry, resolve, onUnresolved };
  return ({ event, resolve: resolveEvent }) => {
    let buffer = "";
    return resolveEvent(event, {
      transformPageChunk: async ({ html, done }) => {
        buffer += html;
        if (!done) return "";
        return renderToStringAsync(buffer, options);
      },
    });
  };
}
