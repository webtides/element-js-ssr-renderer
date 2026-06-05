# @webtides/element-js-ssr-renderer

Server-side rendering for [`@webtides/element-js`](https://github.com/webtides/element-js) custom elements.

Give it an HTML string (typically the rendered output of Astro / SvelteKit / Nuxt) and it recursively
pre-renders every custom element it can resolve **in place** — emitting [Declarative Shadow
DOM](https://web.dev/articles/declarative-shadow-dom) for shadow components, rendering light-DOM components
into the element, and carrying element-js' `<!--template-part-->` markers so the elements **hydrate** on the
client instead of rendering from scratch. Components load eagerly from a static catalog, or lazily so only
the components actually on the page ever load.

## 📖 Documentation

Full documentation lives at **<https://webtides.github.io/element-js-ssr-renderer/>**:

- [Introduction & how it works](https://webtides.github.io/element-js-ssr-renderer/guide/introduction)
- [Resolving components](https://webtides.github.io/element-js-ssr-renderer/resolving-components) — eager vs. lazy, multiple sources
- [Framework integrations](https://webtides.github.io/element-js-ssr-renderer/frameworks/astro) — Astro, SvelteKit, Nuxt
- [API reference](https://webtides.github.io/element-js-ssr-renderer/api/)

## Install

```bash
npm install @webtides/element-js-ssr-renderer
```

Requires `@webtides/element-js >= 1.2.11` (peer dependency) and Node `>= 20.19`.

## Quick start

```js
import "@webtides/element-js-ssr-renderer/dom-shim"; // MUST be first — installs HTMLElement etc. for Node
import { renderToString } from "@webtides/element-js-ssr-renderer";
import Button from "@webtides/element-library/button";
import InputField from "@webtides/element-library/input-field";

const html = await renderToString(
  '<el-button variant="primary">Save</el-button>',
  {
    resolve: { "el-button": Button, "el-input-field": InputField },
  },
);
```

> **Import order matters.** Component classes are `class … extends HTMLElement`, evaluated at import time,
> so `@webtides/element-js-ssr-renderer/dom-shim` must be imported before any component module.

On the client, import the matching `…/define` (or `…/all`) so the elements upgrade and hydrate:

```js
import "@webtides/element-library/button/define";
```

That's the floor — every component imported and listed up front. To load components lazily (the cold-start /
serverless / edge win), compose multiple sources, or wire the renderer into a meta-framework, see the
[documentation](https://webtides.github.io/element-js-ssr-renderer/).

## Examples

Runnable, self-contained apps per framework live under [`examples/`](./examples) (Astro, Nuxt, and
SvelteKit). Each SSRs the same components to Declarative Shadow DOM and hydrates them in the browser,
doubling as a copy-pasteable blueprint.

## License

MIT
