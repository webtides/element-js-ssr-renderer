import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  ssr: {
    // Bundle the element-js packages into the server build (rather than leaving
    // them as hoisted external imports). This keeps the DOM shim's side effect
    // ordered ahead of the component classes' `extends HTMLElement` evaluation —
    // see src/hooks.server.js for why order matters. (The equivalent escape
    // hatch is preloading the shim: `node --import
    // @webtides/element-js-ssr-renderer/dom-shim build`.)
    noExternal: [
      "@webtides/element-js",
      "@webtides/element-js-ssr-renderer",
      "@webtides/element-library",
    ],
  },
});
