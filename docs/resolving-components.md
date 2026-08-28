# Resolving components

The renderer's one real choice is how you turn a tag like `<el-button>` into its element-js class. That
choice decides whether unused components load at all. You supply it through a single option — `resolve` —
and there is just **one shape to learn**: a `Catalog`.

`renderToString` is **async**: resolution can import modules on demand, so always `await` it.

## The `Catalog`

A [`Catalog`](/api/#catalog) is a `{ tag: … }` map whose values are either an **eager class** or a **lazy
loader** (`() => import(...)`). You can mix both in one map — the renderer auto-detects which each value is,
so there is no wrapper to remember.

```js
import { renderToString } from "@webtides/element-js-ssr-renderer";
import Button from "@webtides/element-library/button";

await renderToString("<el-button>Save</el-button><x-counter></x-counter>", {
  resolve: {
    "el-button": Button, // eager: imported up front, always available
    "x-counter": () => import("./components/x-counter.js"), // lazy: imported only if present
  },
});
```

How the auto-detection works (you rarely need to think about it):

- **class vs loader** — an eager class extends `HTMLElement` (through the dom-shim), so it carries a
  `prototype instanceof HTMLElement`; a `() => import()` loader thunk does not.
- **tag key vs path key** — a custom-element tag can't contain `/`, but an `import.meta.glob` key always
  does, so a `/`-bearing key is read as a module path and mapped to a tag by its basename
  (`./components/el-button.js` → `el-button`). A resolved loader module has its `default` export picked.

A **fully eager** catalog (every value a class) is the floor: zero tooling, works in every runtime, and is
what the [quick start](/guide/quick-start) uses. A **lazy** catalog imports each component only when its tag
is actually on the page — the cold-start / serverless / edge win.

### Per-component SSR overrides: `ComponentConfig`

A Catalog value can also be a [`ComponentConfig`](/api/#componentconfig) — an object wrapping the class (or
lazy loader) with per-component SSR overrides, detected by its `component` key:

```js
await renderToString(html, {
  resolve: {
    "el-button": {
      component: () => import("./components/el-button.js"),
      // injected ahead of the component's own styles — into the DSD template for shadow
      // components, inlined before the markup for light-DOM ones
      styles: buttonUtilities, // string | string[]
      // overrides the element-js instance option at render time
      adoptGlobalStyles: false,
    },
  },
});
```

This is the supported way to bake **build-time per-component CSS** into Declarative Shadow DOM — a minified
Tailwind utility subset, critical CSS — so shadow content is styled at first paint without copying the full
global sheets into every template, and without subclassing components to poke element-js internals
(`_styles` / `_options`). Injected styles are emitted under a renderer-owned `TAGNAME-SSR{index}` id-space,
so element-js' own `TAGNAME{index}` hydration ids and their client-side de-dup stay untouched.

### `import.meta.glob` is already a Catalog

Vite's `import.meta.glob('./components/*.js')` returns `{ "./components/x.js": () => import(...) }` — a lazy
`Catalog` as-is. Drop it straight into `resolve`, no wrapper:

```js
await renderToString(html, {
  resolve: import.meta.glob("./components/*.js"),
});
```

## Multiple sources

`resolve` also accepts an **array**, so library and project components compose. **Later sources win** (like
`{ ...a, ...b }`), so your own components can override a library's on a tag clash:

```js
import { renderToString } from "@webtides/element-js-ssr-renderer";
import Button from "@webtides/element-library/button";

await renderToString(html, {
  resolve: [
    { "el-button": Button }, // eager base components
    import.meta.glob("./components/*.js"), // this project's — overrides the above
  ],
});
```

Only the tags actually present on the page are resolved, so a 200-component library costs **nothing** on a
page that uses three of them.

## A library can ship its own catalog

The cleanest source is one you don't assemble at all: a library can publish its **own** `Catalog` as a subpath
export, so you import it and drop it straight into `resolve` — no codegen, no hand-written map, no knowledge of
the library's internal file layout. `@webtides/element-library` does exactly this, at
`@webtides/element-library/catalog`:

```js
import { renderToString } from "@webtides/element-js-ssr-renderer";
import catalog from "@webtides/element-library/catalog"; // the library's own lazy Catalog

await renderToString(html, {
  resolve: [
    catalog, // third-party components — the library ships this
    import.meta.glob("./components/*.js"), // your own components
  ],
});
```

This works because the catalog ships **inside** the package: its loaders are package-internal relative
specifiers (`() => import("./src/components/button/button.js")`), so they resolve in any consumer's bundle
regardless of `node_modules` layout — npm, pnpm, Vite, webpack, edge/Workers all fine — and only the
components actually on the page load. **Only the package itself can publish this:** at runtime the renderer
has neither the bundler's module graph nor the package's public-export map, so it can't synthesize
package-internal specifiers — but the package can, because it ships alongside the source it points at. (This is
the same output as the [generated catalog](#generate-a-catalog-never-hand-write-one) below, just sourced
automatically by the library instead of by you.)

### Who owns which source

| Component source                         | Who provides the catalog           | How you consume it                                        |
| ---------------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| Third-party library that **ships** one   | the library (a `./catalog` export) | `import catalog from "lib/catalog"` → drop into `resolve` |
| Your own components, under Vite          | you                                | `import.meta.glob("./components/*.js")`                   |
| Your own components, bundled server/edge | you                                | generate one — `element-js-ssr-renderer catalog` (below)  |
| Third-party library that ships **none**  | you                                | generate from its manifest — `… catalog --manifest <cem>` |

The three example apps ([astro](https://github.com/webtides/element-js-ssr-renderer/tree/main/examples/astro),
[nuxt](https://github.com/webtides/element-js-ssr-renderer/tree/main/examples/nuxt),
[sveltekit](https://github.com/webtides/element-js-ssr-renderer/tree/main/examples/sveltekit)) each compose
exactly these two rows: the library's own `catalog` plus their own components.

## Resolver function (escape hatch)

For arbitrary logic — a remote lookup, a naming scheme, a fallback — pass a function
`(tag) => Class | Promise<Class> | undefined` instead of (or in the array alongside) a catalog:

```js
await renderToString(html, {
  resolve: (tag) => (tag === "el-button" ? Button : undefined),
});
```

### `glob()` — for loader maps auto-detection can't read

The rare loader map whose keys don't map to tags by basename, or whose modules don't export the component as
`default`, can be adapted with `glob(map, { pathToTag, pick })`. It returns a resolver function, so it slots
into `resolve` like any other source. **You usually don't need it** — a plain catalog or raw
`import.meta.glob()` output works without it.

```js
import { renderToString, glob } from "@webtides/element-js-ssr-renderer";

await renderToString(html, {
  resolve: glob(
    { "buttons/Btn.entry": () => import("./buttons/Btn.entry.js") },
    {
      pathToTag: (path) => path.match(/([^/]+)\.entry$/)[1], // → "Btn"… map however you like
      pick: (mod) => mod.SomeNamedExport, // non-default export
    },
  ),
});
```

## Generate a catalog — never hand-write one

A lazy catalog is perfect when a bundler is in play (Vite — Astro, SvelteKit — gives you `import.meta.glob`).
But once a bundler seals your server into one graph (Nuxt/Nitro, webpack, the edge), every `import()` must be
a literal the bundler can trace, and you have no folder to glob at runtime. Rather than hand-write that map,
**generate it** with the bundled CLI:

```sh
# directory convention (x-counter.js → x-counter)
element-js-ssr-renderer catalog ./components -o ./catalog.js

# or from a custom-elements.json — for a third-party library that does NOT ship
# its own ./catalog (one that does, like element-library, you just import; see above)
element-js-ssr-renderer catalog --manifest node_modules/some-lib/custom-elements.json \
  -o ./library.catalog.js
```

It emits a static, bundler-traceable `Catalog` of `() => import("./x-counter.js")` thunks — import it and
pass it straight to `resolve`, no wrapper:

```js
import catalog from "./catalog.js"; // generated, do not edit
elementSSR({ resolve: catalog });
```

Wire it into your build (`"prebuild": "element-js-ssr-renderer catalog ./components -o ./catalog.js"`) so it
stays in sync. The same engine is available programmatically as `buildCatalog` from
`@webtides/element-js-ssr-renderer/generate` if you'd rather drive it from a Vite/rollup plugin. The Nuxt
example uses exactly this — see [its plugin](https://github.com/webtides/element-js-ssr-renderer/tree/main/examples/nuxt).

### Nested folders and tags that don't match the filename

Directory mode is flat by default. For nested layouts (`components/<name>/<name>.js`), pass
`--recursive` / `-r` on the CLI or `recursive: true` programmatically.

When the tag doesn't match the basename at all — element-js projects registering via
`defineElement('mb-icon', Icon)` in `icon.js` — the programmatic `tag` hook overrides the convention per
file. It receives `{ path, relativePath, basename, source }` (`source` reads the file lazily) and returns
the tag, an array of tags for a multi-element file, `[]` to skip the file, or `null`/`undefined` to fall
back to the basename convention:

```js
import { buildCatalog } from "@webtides/element-js-ssr-renderer/generate";

buildCatalog({
  dir: "./src/components",
  out: "./catalog.js",
  recursive: true,
  // read the tag out of the framework's own registration call
  tag: ({ source }) =>
    source.match(/defineElement\(["']([^"']+)["']/)?.[1] ?? null,
});
```

The hook keeps the decision in your build script — the generator itself never guesses at source contents.
Whatever the hook returns is validated (a custom-element name is lower-case and contains a hyphen); an
invalid tag is skipped **with a warning**, never silently.

## Which catalog for which environment

| Deployment                                                              | Supply `resolve` as                                         | Tooling     |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- | ----------- |
| Anything, zero-config                                                   | a fully eager `{ tag: Class }` catalog                      | none        |
| Vite meta-framework (Astro, SvelteKit)                                  | `import.meta.glob("./components/*.js")`                     | Vite        |
| Bundled server / edge (Nuxt/Nitro, webpack, Workers, Deno, Vercel Edge) | a **generated** catalog (`element-js-ssr-renderer catalog`) | the bundler |

The eager catalog always works with no tooling; the lazy modes are opt-in cold-start wins. The package itself
depends on no bundler and never calls `import()` — your catalog's loaders do.

## Unresolved tags

A custom-element-looking tag (one containing `-`) that no source resolves is **left untouched** — it still
upgrades and hydrates on the client if defined there. In development the renderer `console.warn`s once per
such tag (naming it), to catch a forgotten source or a typo; it is silent in production (`NODE_ENV`). Pass
your own `onUnresolved` to handle it, or `() => {}` to silence it for intentionally client-only / third-party
tags:

```js
await renderToString(html, { resolve, onUnresolved: (tag) => {} });
```
