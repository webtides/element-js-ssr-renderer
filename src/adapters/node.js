import { renderToString } from "../render-to-string.js";

/**
 * Connect-style Node middleware (`(req, res, next)`) that pre-renders @webtides/element-js custom
 * elements in every HTML response. This is the adapter for **plain Node servers** — Express, Connect,
 * raw `http`, or anything that speaks the `(req, res, next)` middleware contract — i.e. servers that
 * are *not* one of the meta-frameworks with their own adapter (Astro, Nuxt, SvelteKit).
 *
 * It does no component resolution of its own: you hand it a `resolve` {@link import('../render-to-string.js').Catalog}
 * (or array of them) exactly like every other adapter, and it forwards to {@link renderToString}. (It
 * is unrelated to the removed `./resolve/node` filesystem resolver — this is HTTP plumbing, not tag
 * resolution.)
 *
 * Mount it **before** your routes so it can wrap their output:
 *
 * ```js
 * // server.js
 * import '@webtides/element-js-ssr-renderer/dom-shim';        // must come first: installs HTMLElement etc.
 * import express from 'express';
 * import { elementSSR } from '@webtides/element-js-ssr-renderer/node';
 * import Button from '@webtides/element-library/button';
 *
 * const app = express();
 * app.use(elementSSR({
 *     resolve: [
 *         { 'el-button': Button },                          // eager element-library components
 *         // a hand-written / generated lazy Catalog also works (no Vite import.meta.glob here):
 *         { 'x-counter': () => import('./components/x-counter.js') },
 *     ],
 * }));
 * app.get('/', (req, res) => res.type('html').send('<el-button>Save</el-button>'));
 * ```
 *
 * How it works: it buffers the response body (overriding `res.write` / `res.end`), and on `end`
 * transforms the buffered HTML once, fixing `Content-Length`. Only `text/html` responses are touched;
 * anything else (JSON, assets, redirects) passes through untouched. If headers were already flushed
 * (e.g. a raw `res.writeHead(...)` before any body), or if the transform throws, the original body is
 * sent unchanged — the page still works, it just isn't pre-rendered.
 *
 * On the client, import each component's `…/define` (or `…/all`) so the elements upgrade and hydrate
 * from the Declarative Shadow DOM this emits.
 *
 * Pass `serializeState: true` to transport each component's server-rendered state to the client (an
 * `ejs/json` script + per-host `ejs:key`s) so it hydrates with that state instead of property
 * defaults; enable element-js' matching `serializeState` config on the client too.
 *
 * A `properties` provider (see {@link import('../render-to-string.js').PropertyProvider}) receives
 * `{ request, response }` — the middleware's own `req`/`res` — as its `context`, so it can read the
 * request while fetching per-instance properties.
 *
 * @param {{
 *   resolve?: import('../render-to-string.js').Catalog | ((tag: string) => *) | Array<import('../render-to-string.js').Catalog | ((tag: string) => *)>,
 *   onUnresolved?: (tag: string) => void,
 *   exclude?: string[] | ((tag: string) => boolean),
 *   onError?: (tag: string, error: Error) => void,
 *   serializeState?: boolean,
 *   transforms?: { pre?: import("../render-to-string.js").PageTransform | import("../render-to-string.js").PageTransform[], post?: import("../render-to-string.js").PageTransform | import("../render-to-string.js").PageTransform[] },
 *   properties?: import("../render-to-string.js").PropertyProvider,
 * }} [options]
 * @return {(req: any, res: any, next: () => void) => void} a Connect-style middleware
 */
export function elementSSR({
  resolve,
  onUnresolved,
  exclude,
  onError,
  serializeState = false,
  transforms,
  properties,
} = {}) {
  const options = {
    resolve,
    exclude,
    onUnresolved,
    onError,
    serializeState,
    transforms,
    properties,
  };

  return (req, res, next) => {
    const originalWrite = res.write;
    const originalEnd = res.end;
    /** @type {Buffer[]} */
    const chunks = [];

    /** Normalize a write/end `chunk` argument to a Buffer (or null). */
    const toBuffer = (chunk, encoding) =>
      chunk == null
        ? null
        : Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(
              chunk,
              typeof encoding === "string" ? encoding : "utf8",
            );

    // Buffer (and swallow) writes — we replay a single transformed body from `end`.
    res.write = function (chunk, encoding, callback) {
      const buf = toBuffer(chunk, encoding);
      if (buf) chunks.push(buf);
      const cb =
        typeof encoding === "function"
          ? encoding
          : typeof callback === "function"
            ? callback
            : undefined;
      cb?.();
      return true;
    };

    res.end = function (chunk, encoding, callback) {
      // res.end has overloaded signatures: (cb) / (chunk, cb) / (chunk, encoding, cb).
      if (typeof chunk === "function") {
        callback = chunk;
        chunk = undefined;
        encoding = undefined;
      } else if (typeof encoding === "function") {
        callback = encoding;
        encoding = undefined;
      }
      const buf = toBuffer(chunk, encoding);
      if (buf) chunks.push(buf);

      // Restore the real methods before we emit, so our final write/end go straight through.
      res.write = originalWrite;
      res.end = originalEnd;

      const body = Buffer.concat(chunks).toString("utf8");
      const contentType = String(res.getHeader?.("content-type") ?? "");

      // Pass through untouched: non-HTML, or headers already flushed (can't safely rewrite length).
      if (!contentType.includes("text/html") || res.headersSent) {
        return originalEnd.call(res, body, callback);
      }

      // The property provider's per-request `context` carries the middleware's own req/res.
      renderToString(body, {
        ...options,
        context: { request: req, response: res },
      }).then(
        (html) => {
          if (res.getHeader?.("content-length") != null)
            res.setHeader("content-length", Buffer.byteLength(html));
          originalEnd.call(res, html, callback);
        },
        () => {
          // Transform failed — degrade gracefully to the untransformed page.
          originalEnd.call(res, body, callback);
        },
      );

      return res;
    };

    next();
  };
}
