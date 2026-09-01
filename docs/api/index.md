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
    exclude?: string[] | ((tag: string) => boolean),
    onUnresolved?: (tag: string) => void,
    onError?: (tag: string, error: Error) => void,
    serializeState?: boolean,
  },
): Promise<string>
```

| Param                    | Description                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `html`                   | An HTML document or fragment (e.g. a framework's rendered response).                                                                                                                                   |
| `options.resolve`        | A [`Catalog`](#catalog) (a `{ tag: … }` map of eager classes and/or lazy loaders, auto-detected) or a [resolver function](#resolvefn) — or an array of either, composed **later-wins** on a tag clash. |
| `options.exclude`        | Tags to leave client-only: a list (case-insensitive) or a `(tag) => boolean` predicate. See [below](#exclude).                                                                                         |
| `options.onUnresolved`   | Called once per custom-element-looking tag (contains `-`) that no source resolves. See [below](#onunresolved).                                                                                         |
| `options.onError`        | Called once per tag whose component threw while rendering or whose resolution failed; the element is left untouched. See [below](#onerror).                                                            |
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
  exclude?: string[] | ((tag: string) => boolean),
  onUnresolved?: (tag: string) => void,
  onError?: (tag: string, error: Error) => void,
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
  [tag: string]:
    CustomElementConstructor | (() => Promise<unknown>) | ComponentConfig;
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
- a value may also be a [`ComponentConfig`](#componentconfig) — an object wrapping the class or loader with
  per-component SSR overrides, detected by its `component` key.

### `ComponentConfig`

```ts
type ComponentConfig = {
  component: CustomElementConstructor | (() => Promise<unknown>);
  styles?: string | string[];
  adoptGlobalStyles?: boolean | string | string[];
};
```

Wraps a Catalog value with per-component SSR overrides — the supported alternative to subclassing a
component and poking element-js internals (`_styles` / `_options`). Also valid as a
[resolver function's](#resolvefn) return value.

| Field               | Description                                                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `component`         | The eager class or lazy loader, exactly like a bare Catalog value. The key is deliberately **not** `constructor` — every plain object already resolves `constructor` through its prototype chain, which would make detection (and a forgotten key) ambiguous.                                                       |
| `styles`            | CSS injected **ahead of the component's own styles**: into the Declarative Shadow DOM template (after adopted globals) for shadow components, inlined before the markup for light-DOM ones. The hook for build-time per-component CSS (Tailwind utility subsets, critical CSS), styling DSD content at first paint. |
| `adoptGlobalStyles` | Overrides the instance's element-js option at render time (`true` \| `false` \| selector \| selectors).                                                                                                                                                                                                             |

Injected styles are emitted under a renderer-owned `TAGNAME-SSR{index}` id-space (e.g. `EL-BUTTON-SSR0`), so
element-js' own `TAGNAME{index}` hydration ids — and their client-side de-dup — stay untouched. For light-DOM
components they de-dupe document-wide across instances, like own styles.

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

### `exclude`

`string[] | ((tag: string) => boolean)`. Declares tags as **client-only** — overlays like modals or
cookie-consent banners whose content must stay inert until their JS runs. An excluded tag is treated as
unresolved-by-choice: the element is left untouched (its authored markup survives and the component still
upgrades client-side), and `onUnresolved` is **not** called — it's intentional, not a miss.

Exclusion is checked **before** resolution, so an excluded tag's module is never resolved or imported on the
server — even when the tag is present in `resolve`. Module-scope side effects of client-only components never
run. A list matches tags case-insensitively; a predicate receives the lower-cased tag (e.g.
`(tag) => tag.startsWith("overlay-")`).

```js
await renderToString(html, {
  resolve: catalog,
  exclude: ["my-modal", "cookie-consent"],
});
```

The decision deliberately lives here — outside the component — not as a flag on the class: where a component
renders is its environment's call, and the renderer never has to load the module just to find out.

### `onUnresolved`

`(tag: string) => void`, called for each custom-element-looking tag (contains `-`) that no source resolves.
The default handler warns once per distinct tag in non-production only (`NODE_ENV`-gated, edge-safe), to
catch a forgotten source or a typo; it is silent in production. Pass your own to handle it, or `() => {}` to
silence it wholesale. For intentionally client-only tags, prefer [`exclude`](#exclude) — it silences only
those tags and keeps the warning for genuine misses.

### `onError`

`(tag: string, error: Error) => void`, called once per tag whose component threw while rendering —
in its constructor, `properties()`, `template()` or `serializeState()`. The failure is isolated to the
component: the element is left untouched (like an unresolved tag), so its authored markup survives, its
siblings and nested elements still pre-render, and it can still hydrate client-side. The default handler
logs each failing tag via `console.error` — **not** dev-only, since with the element silently left
unrendered a log line is a production page's only trace of the failure. Pass your own to route or silence
it — or **rethrow inside it to fail the whole render** instead (fail-fast, e.g. during development or tests).

The same channel covers **resolution failures**: a lazy loader whose dynamic import rejects (syntax error,
missing dependency, bad path in a catalog), a throwing resolver function, or an invalid
[`ComponentConfig`](#componentconfig). The tag's elements are left untouched exactly as above, and
`onUnresolved` is **not** called — the tag is known, its module is just broken. The two classes differ in
reach (a render error can be content-dependent; a resolve failure hits every page containing the tag — the
default log says so), and your handler can tell them apart by the error itself. One broken component module
never takes down the pages that contain its tag.

### `serializeState`

`boolean` (default `false`). When enabled, each rendered component is stamped with a deterministic `ejs:key`
attribute and its state is collected into a single `<script type="ejs/json">` appended to the body, so the
client restores the server's state on hydration instead of re-deriving from property defaults. `Store` values
are emitted as `Store/<key>` references and a shared store is serialized once. Requires element-js' matching
`serializeState` config to be enabled on the client too. See
[State transport](/concepts/#state-transport) for the format and caveats. The same option is accepted by the
[Astro](/frameworks/astro), [Nuxt](/frameworks/nuxt) and [SvelteKit](/frameworks/sveltekit) `elementSSR`
adapters.

## `lockdownFetch(options?)`

```ts
import { lockdownFetch } from "@webtides/element-js-ssr-renderer/dom-shim";

function lockdownFetch(options?: {
  allowOrigins?: string[];
  onBlocked?: (origin: string, url: string) => void;
}): () => void; // restores the previous fetch
```

Opt-in network egress lockdown for SSR. Component code written for the browser does fetch things — data,
sprites, third-party endpoints — and on the server each such call is wasted latency inside the render path
at best and an **SSRF surface** at worst: the render service typically runs inside the network perimeter,
so a component fetching a URL derived from page content can reach things a browser never could.

```js
import { lockdownFetch } from "@webtides/element-js-ssr-renderer/dom-shim";

lockdownFetch(); // block everything — a render pass shouldn't do network I/O
lockdownFetch({ allowOrigins: ["http://localhost:8080"] }); // …with deliberate exceptions
```

- Blocking happens **before** the real `fetch` — no request, DNS lookup or socket leaves the process.
- A blocked call rejects fast with an `Error` carrying `code: "SSR_FETCH_BLOCKED"`. The promise is
  pre-handled, so fire-and-forget fetches from module scope or constructors never surface as unhandled
  rejections — code that `await`s still sees the rejection. (A module-scope `await fetch(…)` that fails at
  import time lands in [resolver failure isolation](#onerror): the tag is left untouched, the page renders.)
- Relative URLs are blocked too — the shim has no base origin, so they could never mean what the component
  thinks. `allowOrigins` entries are normalized via `new URL(entry).origin` (a full URL is fine); an invalid
  entry throws at setup.
- Each blocked origin is reported once via `console.warn` by default — not dev-gated, for the same reason as
  [`onError`](#onerror). Pass `onBlocked(origin, url)` to route or silence it.
- Calling `lockdownFetch` again **replaces** the active policy (wrappers never stack); the returned function
  restores the `fetch` that was active before the call.

It is deliberately **opt-in** and unrelated to importing the dom-shim itself — `fetch` is a real, working
Node global, and replacing it is a policy decision the consumer makes explicitly, typically once in the
server entry right after the shim import.

## Subpath exports

| Import                                        | Exports                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `@webtides/element-js-ssr-renderer`           | `renderToString`, `glob`                                                 |
| `@webtides/element-js-ssr-renderer/dom-shim`  | DOM globals shim (side-effect import); `lockdownFetch`                   |
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

| Flag                | Description                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| `-o`, `--out`       | Output module path (required).                                                   |
| `-r`, `--recursive` | Also scan nested directories (directory mode).                                   |
| `--manifest`        | Read tags from a `custom-elements.json` instead of scanning a directory.         |
| `--base`            | Package root the manifest's paths resolve against (default: the manifest's dir). |

Emits a module default-exporting a `Catalog` of `{ tag: () => import("./tag.js") }` — pass it straight to
`resolve`, no wrapper. The same logic is available programmatically as `buildCatalog` from `…/generate`,
which additionally accepts a `tag` hook to override the filename→tag convention per file — see
[Resolving components](/resolving-components#nested-folders-and-tags-that-don-t-match-the-filename).
