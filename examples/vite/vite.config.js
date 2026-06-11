// The DOM shim MUST be imported first — element-js component classes are
// `class … extends HTMLElement`, evaluated the moment a component module loads
// (here, when a catalog's lazy `import()` thunk runs during rendering). So
// HTMLElement & friends have to exist on globalThis before that. Vite loads this
// config file with esbuild, which preserves the file's import order, so a static
// top-level import is enough — no dynamic-import dance like the Nitro/Nuxt
// example needs.
import "@webtides/element-js-ssr-renderer/dom-shim";

import { defineConfig } from "vite";
import { elementSSR } from "@webtides/element-js-ssr-renderer/vite";

// A third-party library that ships its OWN catalog: element-library exposes a lazy
// Catalog at `@webtides/element-library/catalog` — a `{ tag: () => import(…) }` map
// of every component, with package-internal specifiers Vite can trace. We just drop
// it into `resolve`: no eager imports, no hand-written `{ tag: Class }` map. Its lazy
// loaders evaluate the component classes at render time, after the dom-shim above.
import catalog from "@webtides/element-library/catalog";

// `elementSSR` returns a Vite plugin that hooks `transformIndexHtml` (the stable
// HTML-transform hook), so it pre-renders the custom elements authored in
// `index.html` at build/dev time — see src/adapters/vite.js.
//
// `components` points the plugin at THIS project's own components: it discovers them
// from the directory (the `x-foo.js` → `x-foo` convention) and merges them into the
// resolve map for us — no `npm run gen:catalog`, no committed `catalog.js`. In
// `vite dev` it also watches that directory, so adding/removing/editing a component
// re-renders the page. `resolve` still composes other sources (here the library's own
// catalog); the auto-discovered own components win a tag clash.
export default defineConfig({
  plugins: [
    elementSSR({
      components: "./src/components",
      resolve: [catalog],
    }),
  ],
});
