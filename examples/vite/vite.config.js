// The DOM shim MUST be imported first — element-js component classes are
// `class … extends HTMLElement`, evaluated the moment a component module loads
// (here, when the catalog's lazy `import()` thunks run during rendering). So
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

// This project's own components, as a generated static Catalog. Plain Vite config
// can't use `import.meta.glob('./src/components/*.js')` — that sugar is transformed
// only in *app* code, not in the config file (esbuild loads this) — so we generate
// the lazy `{ tag: () => import() }` map at build time instead: `npm run gen:catalog`
// runs `element-js-ssr-renderer catalog ./src/components -o ./src/catalog.js`,
// emitting literal `() => import('./components/x-*.js')` thunks Vite can trace and
// code-split. It drops straight into `resolve` (no wrapper); re-run the generator
// whenever you add/remove a component.
import localComponents from "./src/catalog.js";

// `elementSSR` returns a Vite plugin that hooks `transformIndexHtml` (the stable
// HTML-transform hook), so it pre-renders the custom elements authored in
// `index.html` at build/dev time — see src/adapters/vite.js. `resolve` composes two
// sources (later wins on a tag clash): the library's own catalog and this project's
// generated one.
export default defineConfig({
  plugins: [
    elementSSR({
      resolve: [catalog, localComponents],
    }),
  ],
});
