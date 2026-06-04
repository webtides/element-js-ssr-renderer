// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",

  // SSR is on by default — the Nitro server renders each page to HTML, which the
  // render:response hook (server/plugins/element-ssr.js) then post-processes to
  // pre-render the custom elements it contains.
  ssr: true,

  vue: {
    compilerOptions: {
      // Tell Vue's template compiler that hyphenated tags (x-counter, el-button…)
      // are native custom elements, so it renders them as-is instead of warning
      // about an unresolved Vue component.
      isCustomElement: (tag) => tag.includes("-"),
    },
  },

  nitro: {
    externals: {
      // Bundle the element-js packages into the Nitro server build so this
      // example stays self-contained (they're `file:`-linked from the monorepo).
      // NB: inlining does NOT fix the DOM-shim import order — Nitro reorders
      // top-level module evaluation, so the shim is loaded via ordered dynamic
      // import() inside the server plugin instead. See server/plugins/element-ssr.js.
      inline: [
        "@webtides/element-js",
        "@webtides/element-js-ssr-renderer",
        "@webtides/element-library",
      ],
    },
  },
});
