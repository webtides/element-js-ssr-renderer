# @webtides/element-js-ssr-renderer

Server-side rendering for [`@webtides/element-js`](https://github.com/webtides/element-js) custom elements.

Give it an HTML string (typically the rendered output of Astro / SvelteKit / Nuxt) and it recursively
pre-renders every custom element it can resolve **in place** — eagerly from a static registry, or
lazily so only the components actually on the page ever load (see
[Loading & resolving components](#loading--resolving-components)):

- **Shadow-DOM components** are emitted as [Declarative Shadow DOM](https://web.dev/articles/declarative-shadow-dom)
  (`<template shadowrootmode="open">`) with the global styles they adopt — honoring element-js'
  [`adoptGlobalStyles`](https://github.com/webtides/element-js) option — plus their own styles inlined.
- **Light-DOM components** have their template rendered directly into the element.
- **Behavioral wrappers** (components with an empty `template()`, e.g. `accordion-group`) and unresolved
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

That's the simplest setup — every component imported and listed up front. To load components lazily
(so only what's on the page loads, which matters for cold-start / serverless / edge) or to compose
several component sources, read on.

## Loading & resolving components

The renderer's one real choice is how you turn a tag like `<el-button>` into its element-js class.
That choice decides whether unused components load at all. You supply one or more **sources**; there
are three kinds, and one rule for combining them.

### Three kinds of source

**1. Static registry** — a `{ tag: Class }` map. Everything is imported and listed up front: zero
tooling, works in every runtime, fully synchronous. This is the floor, and what the quickstart above
uses:

```js
renderToString("<el-button>Save</el-button>", {
  registry: { "el-button": Button },
});
```

**2. Lazy importer map** — `{ tag: () => import(...) }`, wrapped in `lazy()`. Each component imports
**on demand**, so only the components actually on the page are ever loaded. `() => import("<literal>")`
is plain ESM that bundlers code-split and bare Node runs — and it's exactly what Vite's
`import.meta.glob` produces:

```js
import { renderToStringAsync, lazy } from "@webtides/element-js-ssr-renderer";

const components = import.meta.glob("./components/*.js");
// Vite expands this to { "./components/el-button.js": () => import("./components/el-button.js"), … }

await renderToStringAsync("<el-button>Save</el-button>", {
  resolve: lazy(components),
});
```

Keys may be tags **or** module paths: `lazy` derives the tag from a path's basename by default
(`./components/el-button.js` → `el-button`) and picks the class from the module's `default` export.
Override either when your layout or exports differ:

```js
lazy(components, {
  pathToTag: (path) => path.match(/([^/]+)\.js$/)[1],
  pick: (mod, tag) => mod.SomeNamedExport,
});
```

(The `lazy()` wrapper is required because a component class and an importer thunk are both
`typeof "function"` — wrapping makes the intent unambiguous against a static registry.)

**3. Resolver function** — `(tag) => Class | Promise<Class> | undefined`, the escape hatch for any
custom logic (a remote lookup, a naming scheme, …). A bare function passed to `resolve` is treated as
one. For a filesystem convention on a **Node server**, one ships ready-made behind a Node-only entry
point:

```js
import { fromDirectory } from "@webtides/element-js-ssr-renderer/resolve/node";

await renderToStringAsync(html, {
  resolve: fromDirectory(new URL("./components/", import.meta.url)),
  // <el-button> → ./components/el-button.js, imported on demand
});
```

> **Node only.** `fromDirectory` builds the import path from the tag at runtime, which a bundler can't
> statically analyze. That's fine on a long-running Node server but **must not be bundled for the
> edge** — which is why it lives in its own `…/resolve/node` module, so edge builds that don't import
> it never pull in the dynamic import. For bundled / edge targets, use `lazy(import.meta.glob(...))`.

### Multiple sources

`resolve` also accepts an **array** of sources, so library and project components compose. **Later
sources win** (like `{ ...a, ...b }`), so your own components can override a library's on a tag clash:

```js
import { renderToStringAsync, lazy } from "@webtides/element-js-ssr-renderer";
import libraryComponents from "@webtides/element-library/all.server.js"; // library-provided source

await renderToStringAsync(html, {
  resolve: [
    lazy(libraryComponents), // base components
    lazy(import.meta.glob("./components/*.js")), // this project's — overrides the library
  ],
});
```

A plain `registry`, if also passed, is the lowest-precedence source. Either way only the tags actually
present on the page are resolved, so a 200-component library costs **nothing** on a page that uses
three of them.

### Which source for which environment

| Deployment                                    | Supply `resolve` / `registry` as              | Tooling   |
| --------------------------------------------- | --------------------------------------------- | --------- |
| Anything, zero-config                         | static `{ tag: Class }` registry              | none      |
| Plain Node server                             | `fromDirectory(...)` or a hand-written map     | none      |
| Vite meta-framework (Astro, SvelteKit, Nuxt)  | `lazy(import.meta.glob("./components/*.js"))`  | Vite      |
| webpack                                       | `lazy()` over a `require.context`-shaped map   | webpack   |
| Bundled edge (Workers, Deno, Vercel Edge)     | `lazy(...)` with static-literal importers      | a bundler |

The static registry always works with no tooling; the lazy modes are opt-in cold-start wins for
wherever you can produce static-specifier imports. The package itself depends on no bundler and never
calls `import()` — your sources do.

### Sync vs. async

`renderToString` is **synchronous** and registry-only: every component must already be loaded.
`renderToStringAsync` accepts any source (plus an optional `registry`) and is required whenever
resolution is lazy. Framework middleware is already async, so use `renderToStringAsync` there.

### Unresolved tags

A custom-element-looking tag (one containing `-`) that no source resolves is **left untouched** — it
still upgrades and hydrates on the client if defined there. In development the renderer `console.warn`s
once per such tag (naming it), to catch a forgotten source or a typo; it is silent in production
(`NODE_ENV`). Pass your own `onUnresolved` to handle it, or `() => {}` to silence it for intentionally
client-only / third-party tags:

```js
renderToString(html, { registry, onUnresolved: (tag) => {} });
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

`elementSSR` runs on `renderToStringAsync`, so it takes the same sources (see
[Loading & resolving components](#loading--resolving-components)). To load only the components a page
uses — the serverless / edge win — resolve lazily with `import.meta.glob` (Astro is Vite-based) and
compose the library with your own components:

```js
// src/middleware.js
import "@webtides/element-js-ssr-renderer/dom-shim";
import { elementSSR } from "@webtides/element-js-ssr-renderer/astro";
import { lazy } from "@webtides/element-js-ssr-renderer";
import libraryComponents from "@webtides/element-library/all.server.js";

export const onRequest = elementSSR({
  resolve: [
    lazy(libraryComponents),
    lazy(import.meta.glob("../components/*.js")), // overrides the library on a tag clash
  ],
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
