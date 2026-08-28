import { transformHtmlResponse } from "./transform-response.js";

/**
 * Astro middleware that pre-renders @webtides/element-js custom elements in every HTML response.
 *
 * Use this from your `src/middleware.{js,ts}` so you control import order — the DOM shim must be
 * imported there first, before any component module is evaluated.
 *
 * Components are resolved through {@link import('../render-to-string.js').renderToString} via the
 * `resolve` option, which takes a {@link import('../render-to-string.js').Catalog} — a `{ tag: … }`
 * map whose values are eager classes and/or lazy `() => import()` loaders, auto-detected. A static
 * `{ tag: Class }` catalog loads everything up front:
 *
 * ```js
 * // src/middleware.js
 * import '@webtides/element-js-ssr-renderer/dom-shim';        // must come first: installs HTMLElement etc.
 * import { elementSSR } from '@webtides/element-js-ssr-renderer/astro';
 * import Button from '@webtides/element-library/button';
 * import InputField from '@webtides/element-library/input-field';
 *
 * export const onRequest = elementSSR({
 *     resolve: { 'el-button': Button, 'el-input-field': InputField },
 * });
 * ```
 *
 * Or resolve lazily so only the components on a given page are ever loaded — the cold-start / edge
 * path. `import.meta.glob` (Vite, which Astro uses) returns a lazy `Catalog` as-is, so it drops
 * straight into `resolve` (no wrapper), and an array of sources composes library + project
 * components (later wins on a tag clash):
 *
 * ```js
 * import '@webtides/element-js-ssr-renderer/dom-shim';
 * import { elementSSR } from '@webtides/element-js-ssr-renderer/astro';
 * import Button from '@webtides/element-library/button';
 *
 * export const onRequest = elementSSR({
 *     resolve: [
 *         { 'el-button': Button },                          // eager base components
 *         import.meta.glob('../components/*.js'),           // this project's — overrides the above
 *     ],
 * });
 * ```
 *
 * On the client, import the matching `…/define` (or `…/all`) so the elements upgrade and hydrate
 * from the Declarative Shadow DOM this emits.
 *
 * Pass `serializeState: true` to transport each component's server-rendered state to the client (an
 * `ejs/json` script + per-host `ejs:key`s) so it hydrates with that state instead of property
 * defaults; enable element-js' matching `serializeState` config on the client too.
 *
 * @param {{
 *   resolve?: import('../render-to-string.js').Catalog | ((tag: string) => *) | Array<import('../render-to-string.js').Catalog | ((tag: string) => *)>,
 *   onUnresolved?: (tag: string) => void,
 *   onError?: (tag: string, error: Error) => void,
 *   serializeState?: boolean,
 * }} [options]
 * @return {(context: any, next: () => Promise<Response>) => Promise<Response>}
 */
export function elementSSR({
  resolve,
  onUnresolved,
  onError,
  serializeState = false,
} = {}) {
  return async (context, next) => {
    const response = await next();
    return transformHtmlResponse(response, {
      resolve,
      onUnresolved,
      onError,
      serializeState,
    });
  };
}
