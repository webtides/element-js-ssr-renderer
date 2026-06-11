import path from "node:path";
import { pathToFileURL } from "node:url";
import { renderToString } from "../render-to-string.js";
import { catalogEntriesFromDirectory } from "../generate-catalog.js";

/** True if `file` is `dir` itself excluded — i.e. `file` sits somewhere under `dir`. */
function isInside(dir, file) {
  const rel = path.relative(dir, file);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

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
 * ## `components`: auto-resolve this project's own components
 *
 * Pass a `components` **directory** and the plugin discovers this project's element-js components
 * from it (by the same flat `x-foo.js` → `x-foo` filename convention as the
 * [generator](/api/#cli)) and merges them into `resolve` for you — **own components last, so they
 * win** a tag clash with anything in `resolve`. So you never hand-run the
 * `element-js-ssr-renderer catalog` CLI and there's no generated file to commit; the catalog is
 * built in memory at startup. (Eleventy/Nuxt and other non-Vite targets still use the CLI — there's
 * no Vite plugin to do it for them.)
 *
 * This is the *resolution* half of the "deep Vite" angle, distinct from the rendering above: it's
 * sourced from the **filesystem**, not Vite's module graph, on purpose — the module graph only holds
 * modules your JS imports, but the catalog must resolve components referenced **only as authored
 * tags** in your HTML (never imported), so a directory scan is the correct source.
 *
 * ```js
 * elementSSR({
 *   components: "./src/components",   // discovered + watched — no CLI run, no committed catalog
 *   resolve: [catalog],               // still compose other sources (e.g. a library's catalog)
 * });
 * ```
 *
 * In `vite dev` the directory is **watched**: adding or removing a component changes the catalog's
 * tags, and editing one changes its rendered output — either way the plugin rebuilds the catalog and
 * triggers a full reload so the page re-renders (a per-change cache-buster on the loader's `import()`
 * makes Node pick up the edited module). `components` is independent of `resolve`; use either or both.
 *
 * @param {{
 *   resolve?: import('../render-to-string.js').Catalog | ((tag: string) => *) | Array<import('../render-to-string.js').Catalog | ((tag: string) => *)>,
 *   components?: string,
 *   onUnresolved?: (tag: string) => void,
 *   serializeState?: boolean,
 * }} [options]
 * @return {import('vite').Plugin} a Vite plugin
 */
export function elementSSR({
  resolve,
  components,
  onUnresolved,
  serializeState = false,
} = {}) {
  // The auto-discovered catalog of this project's own components — rebuilt from `components` on
  // startup and, in dev, whenever a file there is added/removed/edited. A mutable holder so the
  // render handler always composes the latest version without the plugin being re-created.
  let autoCatalog = {};
  let componentsDir; // absolute, resolved against the Vite config root
  let isDev = false;
  let version = 0; // dev cache-buster: bumped on every change so the loader's import() re-evaluates

  /** Scan `componentsDir` and rebuild `autoCatalog` as `{ tag: () => import(fileURL[?v]) }`. */
  function rebuild() {
    if (!componentsDir) return;
    const next = {};
    for (const { tag, file } of catalogEntriesFromDirectory(componentsDir)) {
      // In dev the `?v=` query busts Node's ESM module cache so a component's edits show on the next
      // render; at build time there's no query (the module is imported once).
      const href = pathToFileURL(file).href + (isDev ? `?v=${version}` : "");
      next[tag] = () => import(href);
    }
    autoCatalog = next;
  }

  /** Compose the user's `resolve` with the auto-catalog — own components last, so they win. */
  function resolveSources() {
    if (!componentsDir) return resolve;
    const user =
      resolve == null ? [] : Array.isArray(resolve) ? resolve : [resolve];
    return [...user, autoCatalog];
  }

  return {
    name: "@webtides/element-js-ssr-renderer",

    // Resolve `components` against the project root and do the initial scan. Runs for `vite build`
    // and `vite dev` alike.
    configResolved(config) {
      isDev = config.command === "serve";
      if (components != null) {
        componentsDir = path.resolve(config.root ?? process.cwd(), components);
        rebuild();
      }
    },

    // Dev only: watch the components directory and re-render on any change to a component module.
    configureServer(server) {
      if (!componentsDir) return;
      server.watcher.add(componentsDir);
      const onChange = (file) => {
        if (!isInside(componentsDir, file) || !/\.[cm]?js$/.test(file)) return;
        version++;
        rebuild();
        server.ws.send({ type: "full-reload", path: "*" });
      };
      for (const event of ["add", "unlink", "change"])
        server.watcher.on(event, onChange);
    },

    // Stable, long-supported hook (unaffected by the experimental Environment API). Runs for every
    // processed HTML entry in both `vite dev` and `vite build`. `order: "pre"` runs us before Vite
    // injects its own tags (the dev client, module preloads), so we only ever parse/serialize the
    // authored document, and Vite's injections layer on top of our output afterwards.
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        renderToString(html, {
          resolve: resolveSources(),
          onUnresolved,
          serializeState,
        }),
    },
  };
}
