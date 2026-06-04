---
layout: home

hero:
  name: element-js-ssr-renderer
  text: Server-side rendering for element-js
  tagline: >-
    Recursively pre-render @webtides/element-js custom elements in an HTML
    string — emitting Declarative Shadow DOM — so they hydrate in the browser
    instead of rendering from scratch.
  actions:
    - theme: brand
      text: Get started
      link: /guide/introduction
    - theme: alt
      text: Quick start
      link: /guide/quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/webtides/element-js-ssr-renderer

features:
  - title: Declarative Shadow DOM
    details: >-
      Shadow components render to <template shadowrootmode="open"> with their
      own and adopted global styles inlined — no flash of unstyled content.
  - title: Hydrate, don't re-render
    details: >-
      Output carries element-js' <!--template-part--> markers, so on the client
      elements update in place instead of rendering from scratch.
  - title: Load only what's on the page
    details: >-
      Resolve components eagerly from a static registry or lazily from one or
      more sources, so unused components never load — the cold-start / edge win.
  - title: Framework-agnostic core
    details: >-
      Give it an HTML string, get one back with custom elements pre-rendered.
      Thin adapters wire it into Astro and SvelteKit; Nuxt is on the way.
---
