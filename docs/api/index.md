# API reference

All signatures below are the public surface exported from the package's subpaths. See
[Installation](/guide/installation#subpath-exports) for the export map.

## `renderToString(html, options?)`

From `@webtides/element-js-ssr-renderer`. The **synchronous**, registry-only path: every component must
already be loaded.

```ts
renderToString(
  html: string,
  options?: {
    registry?: Registry,
    onUnresolved?: (tag: string) => void,
    serializeState?: boolean,
  },
): string
```

| Param                     | Description                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `html`                    | An HTML document or fragment (e.g. a framework's rendered response).                             |
| `options.registry`        | A [`Registry`](#registry) of already-loaded components. Defaults to `{}`.                        |
| `options.onUnresolved`    | Called for each custom-element-looking tag (contains `-`) not in `registry`. See [below](#onunresolved). |
| `options.serializeState`  | Opt into [client state transport](#serializestate). Defaults to `false`.                         |

**Returns** the HTML with every registered custom element pre-rendered in place.

For lazily-loaded or multi-source components, use [`renderToStringAsync`](#rendertostringasync-html-options).

## `renderToStringAsync(html, options?)`

From `@webtides/element-js-ssr-renderer`. Like `renderToString`, but resolves components lazily from one or
more [`Source`](#source)s, so only the components actually on the page are ever loaded — the cold-start /
serverless / edge path. Required whenever resolution is lazy.

```ts
renderToStringAsync(
  html: string,
  options?: {
    registry?: Registry,
    resolve?: Source | Source[],
    onUnresolved?: (tag: string) => void,
    serializeState?: boolean,
  },
): Promise<string>
```

| Param                    | Description                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `html`                   | An HTML document or fragment.                                                                         |
| `options.registry`       | Lowest-precedence [`Registry`](#registry) source.                                                    |
| `options.resolve`        | One [`Source`](#source) or an array of them. `resolve` sources override `registry`; within the array, **later wins**. |
| `options.onUnresolved`   | Called once per custom-element tag no source could resolve. See [below](#onunresolved).               |
| `options.serializeState` | Opt into [client state transport](#serializestate). Defaults to `false`.                              |

**Returns** a `Promise` of the pre-rendered HTML.

Resolution and rendering interleave as a fixpoint: each pass renders with the registry resolved so far and
reports unresolved tags; those are resolved in parallel (each module imported once) and the pass repeats
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

| Param                | Default                                            | Description                                                            |
| -------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| `map`                | —                                                  | An [`ImporterMap`](#importermap) — e.g. the output of `import.meta.glob`. |
| `options.pathToTag`  | basename without extension (`./x/el-button.js` → `el-button`) | Derives a tag from each map key. Leaves already-tag keys untouched.    |
| `options.pick`       | the module's `default` export                      | Selects the class from a resolved module.                              |

## `fromDirectory(dir, options?)`

From `@webtides/element-js-ssr-renderer/resolve/node` — a **Node-only** entry point. Returns a
[`ResolveFn`](#resolvefn) that imports a tag's module from a directory on demand
(`<el-button>` → `<dir>/el-button.js`).

```ts
fromDirectory(
  dir: string | URL,
  options?: {
    tagToPath?: (tag: string) => string,
    pick?: (mod: object, tag: string) => CustomElementConstructor,
  },
): ResolveFn
```

| Param               | Description                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `dir`               | Base directory: a path, a `file:` URL string, or a `URL` instance.                                 |
| `options.tagToPath` | Maps a tag to a module path relative to `dir`. Default appends `.js`.                              |
| `options.pick`      | Selects the class from a resolved module. Default: the `default` export.                          |

It builds the import path from the tag at runtime, caches per-tag imports, guards against path traversal, and
propagates module errors but treats a missing file as a pass-through miss (the tag stays unresolved).

::: warning Node only
Runtime-string imports can't be statically analyzed by a bundler — never bundle this for the edge. For
bundled / edge targets use `lazy(import.meta.glob(...))`. See
[Resolving components](/resolving-components#_3-resolver-function).
:::

## `elementSSR(options?)`

A framework adapter that does the HTML plumbing for you, over `renderToStringAsync`. Two variants, both
taking the same options.

```ts
// from @webtides/element-js-ssr-renderer/astro
elementSSR(options?): (context, next) => Promise<Response>

// from @webtides/element-js-ssr-renderer/sveltekit
elementSSR(options?): handle hook (transformPageChunk)
```

```ts
options?: {
  registry?: Registry,
  resolve?: Source | Source[],
  onUnresolved?: (tag: string) => void,
}
```

- **Astro** — returns an `onRequest` middleware. See [Astro](/frameworks/astro).
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
type ResolveFn = (tag: string) =>
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

Anything [`renderToStringAsync`](#rendertostringasync-html-options) can resolve a tag through: a static
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
[Astro](/frameworks/astro) and [SvelteKit](/frameworks/sveltekit) `elementSSR` adapters.

## Subpath exports

| Import                                              | Exports                                          |
| --------------------------------------------------- | ------------------------------------------------ |
| `@webtides/element-js-ssr-renderer`                 | `renderToString`, `renderToStringAsync`, `lazy`  |
| `@webtides/element-js-ssr-renderer/dom-shim`        | DOM globals shim (side-effect import)            |
| `@webtides/element-js-ssr-renderer/astro`           | `elementSSR` (Astro middleware)                  |
| `@webtides/element-js-ssr-renderer/sveltekit`       | `elementSSR` (SvelteKit `handle` hook)           |
| `@webtides/element-js-ssr-renderer/resolve/node`    | `fromDirectory` (Node-only)                      |
