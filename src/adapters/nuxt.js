import { transformHtmlResponse } from "./transform-response.js";

/**
 * Nitro `render:response` handler that pre-renders @webtides/element-js custom elements in every
 * page's HTML. Register it from a Nitro server plugin so you control import order — the DOM shim
 * must be imported there first, before any component module is evaluated:
 *
 * ```js
 * // server/plugins/element-ssr.js
 * import '@webtides/element-js-ssr-renderer/dom-shim';        // must come first: installs HTMLElement etc.
 * import { elementSSR } from '@webtides/element-js-ssr-renderer/nuxt';
 * import { lazy } from '@webtides/element-js-ssr-renderer';
 * import Button from '@webtides/element-library/button';
 *
 * export default defineNitroPlugin((nitroApp) => {
 *     nitroApp.hooks.hook('render:response', elementSSR({
 *         registry: { 'el-button': Button },                  // eager element-library components
 *         // Nitro is not Vite, so `import.meta.glob` is unavailable — hand-write the importer map:
 *         resolve: lazy({ 'x-counter': () => import('../../elements/x-counter.js') }),
 *     }));
 * });
 * ```
 *
 * Nitro's `render:response` hook hands you a plain response object (`{ body, headers, statusCode }`)
 * rather than a web `Response`, and you mutate it in place. So this wraps `response.body` in a web
 * `Response` to run it through the shared {@link transformHtmlResponse} kernel — the same one Astro
 * uses — then writes the transformed HTML back onto `response.body`. Non-HTML responses (and ones
 * whose body isn't a string) are left untouched.
 *
 * On the client, load each component's `…/define` (or `…/all`) so the elements upgrade and hydrate
 * from the Declarative Shadow DOM this emits.
 *
 * Pass `serializeState: true` to transport each component's server-rendered state to the client (an
 * `ejs/json` script + per-host `ejs:key`s) so it hydrates with that state instead of property
 * defaults; enable element-js' matching `serializeState` config on the client too.
 *
 * @param {{
 *   registry?: import('../render-to-string.js').Registry,
 *   resolve?: import('../render-to-string.js').Source | import('../render-to-string.js').Source[],
 *   onUnresolved?: (tag: string) => void,
 *   serializeState?: boolean,
 * }} [options]
 * @return {(response: { body: unknown, headers?: Record<string, string>, statusCode?: number }) => Promise<void>}
 *   a `render:response` hook handler
 */
export function elementSSR({
  registry = {},
  resolve,
  onUnresolved,
  serializeState = false,
} = {}) {
  const options = { registry, resolve, onUnresolved, serializeState };
  return async (response) => {
    // Only HTML page bodies (a string) are renderable; skip streams, buffers, etc.
    if (typeof response?.body !== "string") return;

    const webResponse = new Response(response.body, {
      status: response.statusCode ?? 200,
      headers: response.headers ?? {},
    });
    const transformed = await transformHtmlResponse(webResponse, options);

    // transformHtmlResponse returns the *same* object on a non-HTML content type — nothing to do.
    if (transformed === webResponse) return;
    response.body = await transformed.text();
  };
}
