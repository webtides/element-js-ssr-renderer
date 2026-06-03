import adapter from "@sveltejs/adapter-node";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // Node adapter so the `handle` hook runs per request and can post-process
    // each page's HTML — `npm run build` then `npm run preview` (node build).
    adapter: adapter(),
  },
};

export default config;
