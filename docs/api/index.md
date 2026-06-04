# API reference

All signatures below are the public surface exported from the package's subpaths. See
[Installation](/guide/installation#subpath-exports) for the export map.

## `renderToString(html, options?)`

From `@webtides/element-js-ssr-renderer`. **Async.** Pre-renders every custom element in `html`, resolving
each tag through the [`Source`](#source)(s) you pass as `resolve`, so only the components actually on the page
are ever loaded — the cold-start / serverless / edge path.

```ts
renderToString(
  html: string,
  options?: {
    resolve?: Source | Source[],
    onUnresolved?: (tag: string) => void,
    serializeState?: boolean,
  },
): Promise<string>
```

| Param                    | Description                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `html`                   | An HTML document or fragment (e.g. a framework's rendered response).                                                                                                                             |
| `options.resolve`        | One [`Source`](#source) or an array of them — a static `{ tag: Class }` map, a [`lazy`](#lazy-map-options) importer map, or a [`ResolveFn`](#resolvefn). Composed **later-wins** on a tag clash. |
| `options.onUnresolved`   | Called once per custom-element-looking tag (contains `-`) that no source resolves. See [below](#onunresolved).                                                                                   |
| `options.serializeState` | Opt into [client state transport](#serializestate). Defaults to `false`.                                                                                                                         |

**Returns** a `Promise` of the HTML with every resolved custom element pre-rendered in place.

Resolution and rendering interleave as a fixpoint: each pass renders with the tags resolved so far and reports
the ones it couldn't resolve; those are resolved in parallel (each module imported once) and the pass repeats
until nothing new appears. Because it re-renders, it also catches custom elements that appear only inside a
component's **generated** template, not just in the input.

## `lazy(map, options?)`

From `@webtides/element-js-ssr-renderer`. Wraps a lazy [`ImporterMap`](#importermap) as a
[`Source`](#source). Needed because a component class and an importer thunk are both `typeof "function"`, so
a bare object can't be told apart from a static registry — `lazy()` makes the intent explicit. Each module is
imported at most once.

```ts
lazy(
  map: ImporterMap,
  options?: {
    pathToTag?: (key: string) => string,
    pick?: (mod: object, tag: string) => CustomElementConstructor,
  },
): Source
```

| Param               | Default                                                       | Description                                                               |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `map`               | —                                                             | An [`ImporterMap`](#importermap) — e.g. the output of `import.meta.glob`. |
| `options.pathToTag` | basename without extension (`./x/el-button.js` → `el-button`) | Derives a tag from each map key. Leaves already-tag keys untouched.       |
| `options.pick`      | the module's `default` export                                 | Selects the class from a resolved module.                                 |

## `elementSSR(options?)`

A framework adapter that does the HTML plumbing for you, over `renderToString`. Three variants, all
taking the same options.

```ts
// from @webtides/element-js-ssr-renderer/astro
elementSSR(options?): (context, next) => Promise<Response>

// from @webtides/element-js-ssr-renderer/nuxt
elementSSR(options?): render:response hook handler (mutates response.body)

// from @webtides/element-js-ssr-renderer/sveltekit
elementSSR(options?): handle hook (transformPageChunk)
```

```ts
options?: {
  resolve?: Source | Source[],
  onUnresolved?: (tag: string) => void,
  serializeState?: boolean,
}
```

- **Astro** — returns an `onRequest` middleware. See [Astro](/frameworks/astro).
- **Nuxt** — returns a Nitro `render:response` handler that transforms `response.body` in place. See
  [Nuxt](/frameworks/nuxt).
- **SvelteKit** — returns a `handle` hook that buffers `transformPageChunk` and transforms the whole document
  on the final chunk. See [SvelteKit](/frameworks/sveltekit).

## Types

### `Registry`

```ts
type Registry = { [tag: string]: CustomElementConstructor };
```

A map of lower-case custom element tag names to their element-js classes, e.g.
`{ "el-button": Button, "el-input-field": InputField }`.

### `ImporterMap`

```ts
type ImporterMap = {
  [key: string]: () => Promise<object> | object | CustomElementConstructor;
};
```

A lazily-loaded component map. Each value imports its module (or returns a class) on demand;
`() => import("<literal>")` is exactly what `import.meta.glob("./components/*.js")` produces. Keys may be
tags or module paths — see [`lazy`](#lazy-map-options)'s `pathToTag`.

### `ResolveFn`

```ts
type ResolveFn = (
  tag: string,
) =>
  | CustomElementConstructor
  | Promise<CustomElementConstructor | undefined>
  | undefined;
```

Arbitrary tag → class resolution, sync or async — the escape hatch when neither a static map nor an importer
map fits (a custom convention, a remote lookup, etc.).

### `Source`

```ts
type Source = Registry | ReturnType<typeof lazy> | ResolveFn;
```

Anything [`renderToString`](#rendertostring-html-options) can resolve a tag through: a static
`Registry`, an importer map wrapped in [`lazy`](#lazy-map-options), or a `ResolveFn`.

### `onUnresolved`

`(tag: string) => void`, called for each custom-element-looking tag (contains `-`) that no source resolves.
The default handler warns once per distinct tag in non-production only (`NODE_ENV`-gated, edge-safe), to
catch a forgotten source or a typo; it is silent in production. Pass your own to handle it, or `() => {}` to
silence it for intentionally client-only / third-party tags.

### `serializeState`

`boolean` (default `false`). When enabled, each rendered component is stamped with a deterministic `ejs:key`
attribute and its state is collected into a single `<script type="ejs/json">` appended to the body, so the
client restores the server's state on hydration instead of re-deriving from property defaults. `Store` values
are emitted as `Store/<key>` references and a shared store is serialized once. Requires element-js' matching
`serializeState` config to be enabled on the client too. See
[State transport](/concepts/#state-transport) for the format and caveats. The same option is accepted by the
[Astro](/frameworks/astro), [Nuxt](/frameworks/nuxt) and [SvelteKit](/frameworks/sveltekit) `elementSSR`
adapters.

## Subpath exports

| Import                                        | Exports                                                              |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `@webtides/element-js-ssr-renderer`           | `renderToString`, `lazy`                                             |
| `@webtides/element-js-ssr-renderer/dom-shim`  | DOM globals shim (side-effect import)                                |
| `@webtides/element-js-ssr-renderer/astro`     | `elementSSR` (Astro middleware)                                      |
| `@webtides/element-js-ssr-renderer/nuxt`      | `elementSSR` (Nitro `render:response` handler)                       |
| `@webtides/element-js-ssr-renderer/sveltekit` | `elementSSR` (SvelteKit `handle` hook)                               |
| `@webtides/element-js-ssr-renderer/generate`  | `generateLazyMap`, `entriesFromDirectory`, … (build-time, Node-only) |

## `element-ssr` CLI

A build-time helper that generates a static, bundler-traceable lazy importer map — the no-hand-writing
answer for bundled / edge targets (Nuxt/Nitro, webpack, Workers). See
[Resolving components](/resolving-components#generate-a-static-map-never-hand-write-one).

```sh
element-ssr gen <dir> -o <out.js>                                  # directory convention
element-ssr gen --manifest <custom-elements.json> [--base <dir>] -o <out.js>  # from a CEM
```

| Flag          | Description                                                                      |
| ------------- | -------------------------------------------------------------------------------- |
| `-o`, `--out` | Output module path (required).                                                   |
| `--manifest`  | Read tags from a `custom-elements.json` instead of scanning a directory.         |
| `--base`      | Package root the manifest's paths resolve against (default: the manifest's dir). |

Emits a module exporting `{ tag: () => import("./tag.js") }`; wrap it in [`lazy`](#lazy-map-options).
The same logic is available programmatically as `generateLazyMap` from `…/generate`.
