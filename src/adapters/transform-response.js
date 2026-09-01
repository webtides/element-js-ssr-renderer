import { renderToString } from "../render-to-string.js";

/**
 * Run an HTML HTTP `Response` through the renderer, preserving its status, status text and
 * headers; non-HTML responses pass through untouched.
 *
 * This is the shared kernel for **Response-based** framework adapters — any framework whose SSR
 * hook hands you (or lets you return) a `Response`, e.g. Astro's `onRequest` middleware. A new
 * such adapter is typically a one-liner over this helper (see {@link ./astro.js}); frameworks that
 * instead give you the HTML *string* directly (e.g. SvelteKit's `transformPageChunk`) should call
 * {@link renderToString} on that string and skip this entirely.
 *
 * @param {Response} response - the framework's rendered response
 * @param {{
 *   resolve?: import('../render-to-string.js').Catalog | ((tag: string) => *) | Array<import('../render-to-string.js').Catalog | ((tag: string) => *)>,
 *   onUnresolved?: (tag: string) => void,
 *   exclude?: string[] | ((tag: string) => boolean),
 *   onError?: (tag: string, error: Error) => void,
 *   serializeState?: boolean,
 *   transforms?: { pre?: import("../render-to-string.js").PageTransform | import("../render-to-string.js").PageTransform[], post?: import("../render-to-string.js").PageTransform | import("../render-to-string.js").PageTransform[] },
 *   properties?: import("../render-to-string.js").PropertyProvider,
 *   context?: *,
 * }} [options] - forwarded to {@link renderToString}; the calling adapter sets `context` to its
 *   framework's native per-request object for the `properties` provider
 * @return {Promise<Response>} the original response if non-HTML, else a new one with the same
 *   status/headers and the custom elements pre-rendered
 */
export async function transformHtmlResponse(response, options) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const transformed = await renderToString(html, options);

  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
