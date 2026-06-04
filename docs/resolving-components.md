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

## Multiple sources

`resolve` also accepts an **array** of sources, so library and project components compose. **Later sources
win** (like `{ ...a, ...b }`), so your own components can override a library's on a tag clash:

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
present on the page are resolved, so a 200-component library costs **nothing** on a page that uses three of
them.

## Which source for which environment

| Deployment                                    | Supply `resolve` / `registry` as              | Tooling   |
| --------------------------------------------- | --------------------------------------------- | --------- |
| Anything, zero-config                         | static `{ tag: Class }` registry              | none      |
| Plain Node server                             | `fromDirectory(...)` or a hand-written map    | none      |
| Vite meta-framework (Astro, SvelteKit, Nuxt)  | `lazy(import.meta.glob("./components/*.js"))` | Vite      |
| webpack                                       | `lazy()` over a `require.context`-shaped map  | webpack   |
| Bundled edge (Workers, Deno, Vercel Edge)     | `lazy(...)` with static-literal importers     | a bundler |

The static registry always works with no tooling; the lazy modes are opt-in cold-start wins for wherever you
can produce static-specifier imports. The package itself depends on no bundler and never calls `import()` —
your sources do.

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
