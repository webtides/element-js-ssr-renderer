// The DOM shim MUST be imported first — element-js component classes are
// `class … extends HTMLElement`, evaluated at import time, so HTMLElement (and
// friends) have to exist on globalThis before any component module is loaded.
import "@webtides/element-js-ssr-renderer/dom-shim";

import { elementSSR } from "@webtides/element-js-ssr-renderer/astro";
import { lazy } from "@webtides/element-js-ssr-renderer";

// element-library components, loaded eagerly into a static registry. These are
// imported up front (as the class, never the `/define` module — that's
// client-only), so they're always available to the renderer.
import Button from "@webtides/element-library/button";
import Notification from "@webtides/element-library/notification";

// This example composes two component sources to show the headline resolution
// feature (T-008) — `resolve` takes an array, later sources win on a tag clash:
//
//   • a static `{ tag: Class }` source — element-library components, eagerly
//     imported above;
//   • a lazy source — this project's own components under `./components/*.js`,
//     code-split by Vite's `import.meta.glob` and imported on demand, so only the
//     ones actually on a page are ever loaded.
//
// `lazy` derives each tag from the file's basename (`x-counter.js` → `x-counter`)
// and picks the class from the module's default export.
export const onRequest = elementSSR({
  resolve: [
    {
      "el-button": Button,
      "el-notification": Notification,
    },
    lazy(import.meta.glob("./components/*.js")),
  ],
});
