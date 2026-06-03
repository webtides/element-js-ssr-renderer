import { renderToStringAsync } from "../render-to-string.js";

/**
 * Run an HTML HTTP `Response` through the renderer, preserving its status, status text and
 * headers; non-HTML responses pass through untouched.
 *
 * This is the shared kernel for **Response-based** framework adapters — any framework whose SSR
 * hook hands you (or lets you return) a `Response`, e.g. Astro's `onRequest` middleware. A new
 * such adapter is typically a one-liner over this helper (see {@link ./astro.js}); frameworks that
 * instead give you the HTML *string* directly (e.g. SvelteKit's `transformPageChunk`) should call
 * {@link renderToStringAsync} on that string and skip this entirely.
 *
 * @param {Response} response - the framework's rendered response
 * @param {{
 *   registry?: import('../render-to-string.js').Registry,
 *   resolve?: import('../render-to-string.js').Source | import('../render-to-string.js').Source[],
 *   onUnresolved?: (tag: string) => void,
 * }} [options] - forwarded to {@link renderToStringAsync}
 * @return {Promise<Response>} the original response if non-HTML, else a new one with the same
 *   status/headers and the custom elements pre-rendered
 */
export async function transformHtmlResponse(response, options) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const transformed = await renderToStringAsync(html, options);

  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
