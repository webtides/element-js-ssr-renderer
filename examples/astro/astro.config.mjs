import { defineConfig } from "astro/config";
import node from "@astrojs/node";

// On-demand (SSR) rendering so the elementSSR middleware can post-process every
// page's HTML response and pre-render the custom elements it contains.
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  vite: {
    ssr: {
      // Bundle the element-js packages into the server build (rather than
      // leaving them as hoisted external imports). This keeps the DOM shim's
      // side effect ordered ahead of the component classes' `extends
      // HTMLElement` evaluation — see src/middleware.js for why order matters.
      noExternal: [
        "@webtides/element-js",
        "@webtides/element-js-ssr-renderer",
        "@webtides/element-library",
      ],
    },
  },
});
