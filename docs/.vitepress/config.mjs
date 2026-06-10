import { defineConfig } from "vitepress";

const repo = "https://github.com/webtides/element-js-ssr-renderer";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "element-js-ssr-renderer",
  description:
    "Server-side rendering for @webtides/element-js custom elements — recursively pre-renders custom elements in an HTML string, emitting Declarative Shadow DOM, so they hydrate in the browser instead of rendering from scratch.",

  // GitHub Pages project site lives at https://webtides.github.io/element-js-ssr-renderer/
  base: "/element-js-ssr-renderer/",
  cleanUrls: true,
  lastUpdated: true,

  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/introduction" },
      { text: "Concepts", link: "/concepts/" },
      { text: "Resolving", link: "/resolving-components" },
      { text: "Frameworks", link: "/frameworks/astro" },
      { text: "API", link: "/api/" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Introduction", link: "/guide/introduction" },
          { text: "Installation", link: "/guide/installation" },
          { text: "Quick start", link: "/guide/quick-start" },
        ],
      },
      {
        text: "Core concepts",
        items: [
          { text: "Rendering & hydration", link: "/concepts/" },
          { text: "Style handling", link: "/concepts/styles" },
        ],
      },
      {
        text: "Loading & resolving",
        items: [
          { text: "Resolving components", link: "/resolving-components" },
        ],
      },
      {
        text: "Framework integrations",
        items: [
          { text: "Node (Express / Connect)", link: "/frameworks/node" },
          { text: "Astro", link: "/frameworks/astro" },
          { text: "SvelteKit", link: "/frameworks/sveltekit" },
          { text: "Nuxt", link: "/frameworks/nuxt" },
          { text: "Vite", link: "/frameworks/vite" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "API", link: "/api/" },
          { text: "Limitations & roadmap", link: "/reference/limitations" },
        ],
      },
    ],

    search: { provider: "local" },

    socialLinks: [{ icon: "github", link: repo }],

    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: `© ${new Date().getFullYear()} webtides`,
    },
  },
});
