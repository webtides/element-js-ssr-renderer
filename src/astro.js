import { renderToString } from "./render-to-string.js";

/**
 * Astro middleware that pre-renders @webtides/element-js custom elements in every HTML response.
 *
 * Use this from your `src/middleware.{js,ts}` so you control import order — the DOM shim and your
 * component modules must be imported there, before the registry is built:
 *
 * ```js
 * // src/middleware.js
 * import '@webtides/element-js-ssr-renderer/dom-shim';        // must come first: installs HTMLElement etc.
 * import { elementSSR } from '@webtides/element-js-ssr-renderer/astro';
 * import Button from '@webtides/element-library/button';
 * import InputField from '@webtides/element-library/input-field';
 *
 * export const onRequest = elementSSR({
 *     registry: { 'el-button': Button, 'el-input-field': InputField },
 * });
 * ```
 *
 * On the client, import the matching `…/define` (or `…/all`) so the elements upgrade and hydrate
 * from the Declarative Shadow DOM this emits.
 *
 * @param {{ registry?: import('./render-to-string.js').Registry }} [options]
 * @return {(context: any, next: () => Promise<Response>) => Promise<Response>}
 */
export function elementSSR({ registry = {} } = {}) {
  return async (context, next) => {
    const response = await next();

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return response;

    const html = await response.text();
    const transformed = renderToString(html, { registry });

    return new Response(transformed, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}
