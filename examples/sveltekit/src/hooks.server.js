// The DOM shim MUST be imported first — element-js component classes are
// `class … extends HTMLElement`, evaluated at import time, so HTMLElement (and
// friends) have to exist on globalThis before any component module is loaded.
import "@webtides/element-js-ssr-renderer/dom-shim";

import { elementSSR } from "@webtides/element-js-ssr-renderer/sveltekit";

// A third-party library that ships its OWN catalog: element-library exposes a
// lazy Catalog at `@webtides/element-library/catalog` — a `{ tag: () => import(…) }`
// map of every component, with package-internal specifiers that resolve in any
// consumer's bundle. We just drop it into `resolve`: no eager imports, no
// hand-written `{ tag: Class }` map, and only the components actually present on a
// page are ever loaded (the lazy loaders the renderer doesn't call never run).
import catalog from "@webtides/element-library/catalog";

// `resolve` takes an array; later sources win on a tag clash (T-008). This shows
// the responsibility split for the two kinds of source:
//
//   • a third-party library → it ships its catalog, you drop it into `resolve`
//     (element-library, above);
//   • your own components → point a bundler glob at them: this project's
//     components under `./components/*.js`, code-split by Vite's `import.meta.glob`.
//
// `import.meta.glob` returns a lazy Catalog as-is, so it drops straight in — no
// wrapper. The renderer derives each tag from the file's basename (`x-counter.js`
// → `x-counter`) and picks the module's default export.
//
// `elementSSR` returns a SvelteKit `handle` hook. It buffers the rendered page
// chunks and runs the whole document through the renderer on the final chunk —
// see src/adapters/sveltekit.js.
export const handle = elementSSR({
  resolve: [catalog, import.meta.glob("./components/*.js")],
});
