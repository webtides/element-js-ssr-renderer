# Resolving components

The renderer's one real choice is how you turn a tag like `<el-button>` into its element-js class. That
choice decides whether unused components load at all. You supply one or more **sources** through a single
option — `resolve` — and there are three kinds of source plus one rule for combining them.

`renderToString` is **async**: resolution can import modules on demand, so always `await` it.

## Three kinds of source

### 1. Static map

A `{ tag: Class }` map (the [`Registry`](/api/#registry) type). Everything is imported and listed up front:
zero tooling, works in every runtime. This is the floor, and what the [quick start](/guide/quick-start) uses:

```js
await renderToString("<el-button>Save</el-button>", {
  resolve: { "el-button": Button },
});
```

### 2. Lazy importer map

`{ tag: () => import(...) }`, wrapped in `lazy()`. Each component imports **on demand**, so only the
components actually on the page are ever loaded. `() => import("<literal>")` is plain ESM that bundlers
code-split and bare Node runs — and it's exactly what Vite's `import.meta.glob` produces:

```js
import { renderToString, lazy } from "@webtides/element-js-ssr-renderer";

const components = import.meta.glob("./components/*.js");
// Vite expands this to { "./components/el-button.js": () => import("./components/el-button.js"), … }

await renderToString("<el-button>Save</el-button>", {
  resolve: lazy(components),
});
```

Keys may be tags **or** module paths: `lazy` derives the tag from a path's basename by default
(`./components/el-button.js` → `el-button`) and picks the class from the module's `default` export. Override
either when your layout or exports differ:

```js
lazy(components, {
  pathToTag: (path) => path.match(/([^/]+)\.js$/)[1],
  pick: (mod, tag) => mod.SomeNamedExport,
});
```

::: info Why `lazy()` is required
A component class and an importer thunk are both `typeof "function"` — wrapping makes the intent unambiguous
against a static map.
:::

### 3. Resolver function

`(tag) => Class | Promise<Class> | undefined`, the escape hatch for any custom logic (a remote lookup, a
naming scheme, …). A bare function passed to `resolve` is treated as one:

```js
await renderToString(html, {
  resolve: (tag) => (tag === "el-button" ? Button : undefined),
});
```

## Multiple sources

`resolve` also accepts an **array** of sources, so library and project components compose. **Later sources
win** (like `{ ...a, ...b }`), so your own components can override a library's on a tag clash:

```js
import { renderToString, lazy } from "@webtides/element-js-ssr-renderer";
import Button from "@webtides/element-library/button";

await renderToString(html, {
  resolve: [
    { "el-button": Button }, // eager base components
    lazy(import.meta.glob("./components/*.js")), // this project's — overrides the above
  ],
});
```

Only the tags actually present on the page are resolved, so a 200-component library costs **nothing** on a
page that uses three of them.

## Generate a static map — never hand-write one

`lazy(import.meta.glob(...))` is perfect when a bundler is in play (Vite — Astro, SvelteKit). But once a
bundler seals your server into one graph (Nuxt/Nitro, webpack, the edge), every `import()` must be a literal
the bundler can trace, and you have no folder to glob at runtime. Rather than hand-write that map, **generate
it** with the bundled CLI:

```sh
# directory convention (x-counter.js → x-counter)
element-ssr gen ./components -o ./components.generated.js

# or from a custom-elements.json (handles nested layouts, e.g. element-library)
element-ssr gen --manifest node_modules/@webtides/element-library/custom-elements.json \
  -o ./library.generated.js
```

It emits a static, bundler-traceable module of `() => import("./x-counter.js")` thunks — wrap it in `lazy()`:

```js
import map from "./components.generated.js"; // generated, do not edit
elementSSR({ resolve: lazy(map) });
```

Wire it into your build (`"prebuild": "element-ssr gen ./components -o ./components.generated.js"`) so it
stays in sync. The same engine is available programmatically as `generateLazyMap` from
`@webtides/element-js-ssr-renderer/generate` if you'd rather drive it from a Vite/rollup plugin. The Nuxt
example uses exactly this — see [its plugin](https://github.com/webtides/element-js-ssr-renderer/tree/main/examples/nuxt).

## Which source for which environment

| Deployment                                                              | Supply `resolve` as                                      | Tooling     |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ----------- |
| Anything, zero-config                                                   | a static `{ tag: Class }` map                            | none        |
| Vite meta-framework (Astro, SvelteKit)                                  | `lazy(import.meta.glob("./components/*.js"))`            | Vite        |
| Bundled server / edge (Nuxt/Nitro, webpack, Workers, Deno, Vercel Edge) | `lazy(map)` from a **generated** map (`element-ssr gen`) | the bundler |

The static map always works with no tooling; the lazy modes are opt-in cold-start wins. The package itself
depends on no bundler and never calls `import()` — your sources do.

## Unresolved tags

A custom-element-looking tag (one containing `-`) that no source resolves is **left untouched** — it still
upgrades and hydrates on the client if defined there. In development the renderer `console.warn`s once per
such tag (naming it), to catch a forgotten source or a typo; it is silent in production (`NODE_ENV`). Pass
your own `onUnresolved` to handle it, or `() => {}` to silence it for intentionally client-only / third-party
tags:

```js
await renderToString(html, { resolve, onUnresolved: (tag) => {} });
```
