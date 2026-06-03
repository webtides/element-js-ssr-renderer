# @webtides/element-js-ssr-renderer

Server-side rendering for [`@webtides/element-js`](https://github.com/webtides/element-js) custom elements.

Give it an HTML string (typically the rendered output of Astro / SvelteKit / Nuxt) and it recursively
pre-renders every registered custom element **in place**:

- **Shadow-DOM components** are emitted as [Declarative Shadow DOM](https://web.dev/articles/declarative-shadow-dom)
  (`<template shadowrootmode="open">`) with the global styles they adopt — honoring element-js'
  [`adoptGlobalStyles`](https://github.com/webtides/element-js) option — plus their own styles inlined.
- **Light-DOM components** have their template rendered directly into the element.
- **Behavioral wrappers** (components with an empty `template()`, e.g. `accordion-group`) and unregistered
  tags are left untouched.

Both output paths carry element-js' `<!--template-part-->` hydration markers, so on the client the elements
**hydrate** (update in place) rather than re-render from scratch — no flash of empty/unstyled content.

## How it works

element-js does the heavy lifting: `html\`…\``produces a`TemplateResult`whose`.toString()`is a complete,
DOM-free SSR renderer, and`TemplateResult.renderInto()`detects pre-rendered markup and hydrates it. This
package is the glue: it parses your HTML, and for each registered tag it constructs the component, maps
attributes to properties, calls`template().toString()`, and splices the result back in — wrapping shadow
components in Declarative Shadow DOM and inlining their styles.

Shadow components also adopt the document's global stylesheets (every `<style>` / `<link rel="stylesheet">`
in the input, wherever it sits) into their shadow root, mirroring element-js' `adoptGlobalStyles` option:
`true` (default) adopts all, `false` adopts none, and a selector / array of selectors adopts only matching
sources. On top of that, theme tokens (`--el-*` custom properties on `:root`) inherit **through** the shadow
boundary.

## Install

```bash
npm install @webtides/element-js-ssr-renderer
```

Requires `@webtides/element-js >= 1.2.11` (peer dependency).

## Usage (framework-agnostic core)

```js
import "@webtides/element-js-ssr-renderer/dom-shim"; // MUST be first — installs HTMLElement etc. for Node
import { renderToString } from "@webtides/element-js-ssr-renderer";
import Button from "@webtides/element-library/button";
import InputField from "@webtides/element-library/input-field";

const registry = { "el-button": Button, "el-input-field": InputField };

const html = renderToString('<el-button variant="primary">Save</el-button>', {
  registry,
});
```

> **Import order matters.** Component classes are `class … extends HTMLElement`, evaluated at import time,
> so `@webtides/element-js-ssr-renderer/dom-shim` must be imported before any component module.

On the client, import the matching `…/define` (or `…/all`) so the elements upgrade and hydrate:

```js
import "@webtides/element-library/button/define";
```

## Astro

Wire the middleware from your `src/middleware.{js,ts}` so you control import order:

```js
// src/middleware.js
import "@webtides/element-js-ssr-renderer/dom-shim";
import { elementSSR } from "@webtides/element-js-ssr-renderer/astro";
import Button from "@webtides/element-library/button";
import InputField from "@webtides/element-library/input-field";

export const onRequest = elementSSR({
  registry: { "el-button": Button, "el-input-field": InputField },
});
```

Then author components normally in `.astro` files and load their `define` modules in a client `<script>`.

## Limitations & notes

- **Declarative Shadow DOM support.** All current evergreen browsers parse `<template shadowrootmode>`. For
  legacy browsers, ship a small DSD polyfill.
- **No lifecycle on the server.** Only `template()` runs (purely, from properties); `connected()`,
  watchers, effects and DOM measurement do not. Components whose initial markup depends on runtime state
  beyond their declared properties will render that state's default until the client hydrates.
- **State transport.** element-js' `ejs:key` / `serializeState` plumbing can carry server state to the
  client; wiring it through this transformer is on the roadmap.

## License

MIT
