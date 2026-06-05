# API reference

All signatures below are the public surface exported from the package's subpaths. See
[Installation](/guide/installation#subpath-exports) for the export map.

## `renderToString(html, options?)`

From `@webtides/element-js-ssr-renderer`. **Async.** Pre-renders every custom element in `html`, resolving
each tag through the [`Catalog`](#catalog)(s) you pass as `resolve`, so only the components actually on the
page are ever loaded — the cold-start / serverless / edge path.

```ts
renderToString(
  html: string,
  options?: {
    resolve?: Catalog | ResolveFn | Array<Catalog | ResolveFn>,
    onUnresolved?: (tag: string) => void,
    serializeState?: boolean,
  },
): Promise<string>
```

| Param                    | Description                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `html`                   | An HTML document or fragment (e.g. a framework's rendered response).                                                                                                                                   |
| `options.resolve`        | A [`Catalog`](#catalog) (a `{ tag: … }` map of eager classes and/or lazy loaders, auto-detected) or a [resolver function](#resolvefn) — or an array of either, composed **later-wins** on a tag clash. |
| `options.onUnresolved`   | Called once per custom-element-looking tag (contains `-`) that no source resolves. See [below](#onunresolved).                                                                                         |
| `options.serializeState` | Opt into [client state transport](#serializestate). Defaults to `false`.                                                                                                                               |

**Returns** a `Promise` of the HTML with every resolved custom element pre-rendered in place.

Resolution and rendering interleave as a fixpoint: each pass renders with the tags resolved so far and reports
the ones it couldn't resolve; those are resolved in parallel (each module imported once) and the pass repeats
until nothing new appears. Because it re-renders, it also catches custom elements that appear only inside a
component's **generated** template, not just in the input.

## `glob(map, options?)`

From `@webtides/element-js-ssr-renderer`. An **optional escape hatch** for a loader map that
[`Catalog`](#catalog) auto-detection can't read: keys that don't map to tags by basename, or modules that
don't export the component as `default`. Re-keys the map by tag and applies `pick` to each resolved module,
returning a [resolver function](#resolvefn) (a valid `resolve` value). Each module is imported at most once.

**Rarely needed**: a plain catalog or raw `import.meta.glob()` output goes straight into `resolve` without it.

```ts
glob(
  map: { [key: string]: () => Promise<unknown> },
  options?: {
    pathToTag?: (key: string) => string,
    pick?: (mod: object, tag: string) => CustomElementConstructor,
  },
): ResolveFn
```

| Param               | Default                                                       | Description                                                         |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `map`               | —                                                             | A map of `key → () => import(...)` loader thunks.                   |
| `options.pathToTag` | basename without extension (`./x/el-button.js` → `el-button`) | Derives a tag from each map key. Leaves already-tag keys untouched. |
| `options.pick`      | the module's `default` export                                 | Selects the class from a resolved module.                           |

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
  resolve?: Catalog | ResolveFn | Array<Catalog | ResolveFn>,
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

### `Catalog`

```ts
type Catalog = {
  [tag: string]: CustomElementConstructor | (() => Promise<unknown>);
};
```

The one shape `resolve` understands: a `{ tag: … }` map whose values are either an **eager class**
(`CustomElementConstructor`) or a **lazy loader** (`() => Promise<unknown>` — the exact shape
`import.meta.glob("./x/*.js")` produces). The renderer auto-detects which each value is, so a hand-written
catalog **and** raw `import.meta.glob()` output both drop straight into `resolve` with no wrapper:

- **class vs loader** — an eager class extends `HTMLElement` (through the dom-shim), so its
  `prototype instanceof HTMLElement`; a `() => import()` loader thunk has no such prototype.
- **tag key vs path key** — a custom-element tag can't contain `/`, but an `import.meta.glob` key always
  does, so a `/`-bearing key is read as a module path and mapped to a tag by basename
  (`./components/el-button.js` → `el-button`). A resolved loader module has its `default` picked.

### `ResolveFn`

```ts
type ResolveFn = (
  tag: string,
) =>
  | CustomElementConstructor
  | Promise<CustomElementConstructor | undefined>
  | undefined;
```

Arbitrary tag → class resolution, sync or async — the function form `resolve` accepts (and what
[`glob`](#glob-map-options) returns), for when a plain `Catalog` doesn't fit: a custom convention, a remote
lookup, etc.

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

| Import                                        | Exports                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `@webtides/element-js-ssr-renderer`           | `renderToString`, `glob`                                                 |
| `@webtides/element-js-ssr-renderer/dom-shim`  | DOM globals shim (side-effect import)                                    |
| `@webtides/element-js-ssr-renderer/astro`     | `elementSSR` (Astro middleware)                                          |
| `@webtides/element-js-ssr-renderer/nuxt`      | `elementSSR` (Nitro `render:response` handler)                           |
| `@webtides/element-js-ssr-renderer/sveltekit` | `elementSSR` (SvelteKit `handle` hook)                                   |
| `@webtides/element-js-ssr-renderer/generate`  | `buildCatalog`, `catalogEntriesFromDirectory`, … (build-time, Node-only) |

## `element-js-ssr-renderer` CLI

A build-time helper that generates a static, bundler-traceable [`Catalog`](#catalog) — the no-hand-writing
answer for bundled / edge targets (Nuxt/Nitro, webpack, Workers). See
[Resolving components](/resolving-components#generate-a-catalog-never-hand-write-one).

```sh
element-js-ssr-renderer catalog <dir> -o <catalog.js>                                  # directory convention
element-js-ssr-renderer catalog --manifest <custom-elements.json> [--base <dir>] -o <catalog.js>  # from a CEM
```

| Flag          | Description                                                                      |
| ------------- | -------------------------------------------------------------------------------- |
| `-o`, `--out` | Output module path (required).                                                   |
| `--manifest`  | Read tags from a `custom-elements.json` instead of scanning a directory.         |
| `--base`      | Package root the manifest's paths resolve against (default: the manifest's dir). |

Emits a module default-exporting a `Catalog` of `{ tag: () => import("./tag.js") }` — pass it straight to
`resolve`, no wrapper. The same logic is available programmatically as `buildCatalog` from `…/generate`.
