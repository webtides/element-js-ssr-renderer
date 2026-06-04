# Resolving components

The renderer's one real choice is how you turn a tag like `<el-button>` into its element-js class. That
choice decides whether unused components load at all. You supply one or more **sources**; there are three
kinds, and one rule for combining them.

## Three kinds of source

### 1. Static registry

A `{ tag: Class }` map. Everything is imported and listed up front: zero tooling, works in every runtime,
fully synchronous. This is the floor, and what the [quick start](/guide/quick-start) uses:

```js
renderToString("<el-button>Save</el-button>", {
  registry: { "el-button": Button },
});
```

### 2. Lazy importer map

`{ tag: () => import(...) }`, wrapped in `lazy()`. Each component imports **on demand**, so only the
components actually on the page are ever loaded. `() => import("<literal>")` is plain ESM that bundlers
code-split and bare Node runs — and it's exactly what Vite's `import.meta.glob` produces:

```js
import { renderToStringAsync, lazy } from "@webtides/element-js-ssr-renderer";

const components = import.meta.glob("./components/*.js");
// Vite expands this to { "./components/el-button.js": () => import("./components/el-button.js"), … }

await renderToStringAsync("<el-button>Save</el-button>", {
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
against a static registry.
:::

### 3. Resolver function

`(tag) => Class | Promise<Class> | undefined`, the escape hatch for any custom logic (a remote lookup, a
naming scheme, …). A bare function passed to `resolve` is treated as one. For a filesystem convention on a
**Node server**, one ships ready-made behind a Node-only entry point:

```js
import { fromDirectory } from "@webtides/element-js-ssr-renderer/resolve/node";

await renderToStringAsync(html, {
  resolve: fromDirectory(new URL("./components/", import.meta.url)),
  // <el-button> → ./components/el-button.js, imported on demand
});
```

::: warning Node only
`fromDirectory` builds the import path from the tag at runtime, which a bundler can't statically analyze.
That's fine on a long-running Node server but **must not be bundled for the edge** — which is why it lives in
its own `…/resolve/node` module, so edge builds that don't import it never pull in the dynamic import. For
bundled / edge targets, use `lazy(import.meta.glob(...))`.
:::

### From a `custom-elements.json` manifest

Any component package that ships a [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest) — including `@webtides/element-library`, which exports its own `./custom-elements.json` — resolves with **no hand-built registry**: `fromManifest` reads each tag's class module from the manifest and imports it on demand.

```js
import cem from "@webtides/element-library/custom-elements.json" with { type: "json" };
import { fromManifest } from "@webtides/element-js-ssr-renderer/resolve/node";

// Anchor `base` to the package root via an *exported* subpath, then strip the filename —
// a bare `<pkg>/` specifier isn't resolvable unless the package declares a `"./"` export.
const base = new URL(
  ".",
  import.meta.resolve("@webtides/element-library/package.json"),
);

await renderToStringAsync(html, {
  resolve: fromManifest(cem, { base }),
});
```

Like `fromDirectory`, it builds runtime import specifiers and lives behind `…/resolve/node` — Node servers, **not** edge bundles.

## Multiple sources

`resolve` also accepts an **array** of sources, so library and project components compose. **Later sources
win** (like `{ ...a, ...b }`), so your own components can override a library's on a tag clash:

```js
import { renderToStringAsync, lazy } from "@webtides/element-js-ssr-renderer";
import { fromManifest } from "@webtides/element-js-ssr-renderer/resolve/node";
import cem from "@webtides/element-library/custom-elements.json" with { type: "json" };

const base = new URL(
  ".",
  import.meta.resolve("@webtides/element-library/package.json"),
);

await renderToStringAsync(html, {
  resolve: [
    fromManifest(cem, { base }), // base components, straight from the library's manifest
    lazy(import.meta.glob("./components/*.js")), // this project's — overrides the library
  ],
});
```

A plain `registry`, if also passed, is the lowest-precedence source. Either way only the tags actually
present on the page are resolved, so a 200-component library costs **nothing** on a page that uses three of
them.

## Generate a static map — never hand-write one

`fromDirectory` and `fromManifest` build import specifiers _at runtime_, so they need a real filesystem and
resolver — perfect on a long-running Node server, useless once a bundler seals your server into one graph
(Nuxt/Nitro, webpack, the edge). There, every `import()` must be a literal the bundler can trace. Rather than
hand-write that map, **generate it** with the bundled CLI:

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

| Deployment                                                              | Supply `resolve` / `registry` as                         | Tooling     |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ----------- |
| Anything, zero-config                                                   | static `{ tag: Class }` registry                         | none        |
| Long-running Node server (real FS)                                      | `fromDirectory(...)` or `fromManifest(cem)`              | none        |
| Vite meta-framework (Astro, SvelteKit)                                  | `lazy(import.meta.glob("./components/*.js"))`            | Vite        |
| Bundled server / edge (Nuxt/Nitro, webpack, Workers, Deno, Vercel Edge) | `lazy(map)` from a **generated** map (`element-ssr gen`) | the bundler |

The static registry always works with no tooling; the lazy modes are opt-in cold-start wins. Either you let a
runtime resolver reach the files (Node) or you bake a static map at build time (bundled/edge) — but you never
hand-maintain a registry. The package itself depends on no bundler and never calls `import()` — your sources do.

## Sync vs. async

`renderToString` is **synchronous** and registry-only: every component must already be loaded.
`renderToStringAsync` accepts any source (plus an optional `registry`) and is required whenever resolution is
lazy. Framework middleware is already async, so use `renderToStringAsync` there.

## Unresolved tags

A custom-element-looking tag (one containing `-`) that no source resolves is **left untouched** — it still
upgrades and hydrates on the client if defined there. In development the renderer `console.warn`s once per
such tag (naming it), to catch a forgotten source or a typo; it is silent in production (`NODE_ENV`). Pass
your own `onUnresolved` to handle it, or `() => {}` to silence it for intentionally client-only / third-party
tags:

```js
renderToString(html, { registry, onUnresolved: (tag) => {} });
```
