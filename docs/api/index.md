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
    transforms?: {
      pre?: PageTransform | PageTransform[],
      post?: PageTransform | PageTransform[],
    },
    properties?: PropertyProvider,
    context?: unknown,
  },
): Promise<string>
```

| Param                    | Description                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `html`                   | An HTML document or fragment (e.g. a framework's rendered response).                                                                                                                                   |
| `options.resolve`        | A [`Catalog`](#catalog) (a `{ tag: … }` map of eager classes and/or lazy loaders, auto-detected) or a [resolver function](#resolvefn) — or an array of either, composed **later-wins** on a tag clash. |
| `options.exclude`        | Tags to leave client-only: a list (case-insensitive) or a `(tag) => boolean` predicate. See [below](#exclude).                                                                                         |
| `options.onUnresolved`   | Called once per custom-element-looking tag (contains `-`) that no source resolves. See [below](#onunresolved).                                                                                         |
| `options.onError`        | Called once per tag whose component threw while rendering, whose resolution failed, or whose property provider failed; the element is left untouched. See [below](#onerror).                           |
| `options.serializeState` | Opt into [client state transport](#serializestate). Defaults to `false`.                                                                                                                               |
| `options.transforms`     | Page-level `pre`/`post` transform pipeline around the render. See [below](#transforms).                                                                                                                |
| `options.properties`     | Async per-instance property provider — seed server-fetched properties before components render. See [below](#properties).                                                                              |
| `options.context`        | Opaque per-render value handed to every `properties` call; the adapters set their framework's native request object. See [below](#properties).                                                         |

**Returns** a `Promise` of the HTML with every resolved custom element pre-rendered in place.

Resolution and rendering interleave as a fixpoint: each pass renders with the tags resolved so far and reports
the ones it couldn't resolve; those are resolved in parallel (each module imported once, and
[property-provider](#properties) calls for newly discovered instances run in the same parallel phase) and the
pass repeats until nothing new appears. Because it re-renders, it also catches custom elements that appear
only inside a component's **generated** template, not just in the input.

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
    pick?: (module: object, tag: string) => CustomElementConstructor,
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
  transforms?: {
    pre?: PageTransform | PageTransform[],
    post?: PageTransform | PageTransform[],
  },
  properties?: PropertyProvider,
}
```

There is no `context` option on the adapters — each one sets it to its framework's native per-request
object for you (see the [table under `properties`](#properties)).

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
  loading?: Loading;
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
| `loading`           | The component's [progressive-hydration loading declaration](/progressive-hydration) (`'server'` \| `'client'` \| `'hydrate:<trigger>'`), stamped as `ejs-loading` on each host element; overrides the class's own `static loading`.                                                                                 |

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

And it covers **property-provider failures** (see [`properties`](#properties)): a throwing or rejecting
provider call leaves that instance's element untouched — rendering with partial data would bake broken
output — while other instances of the same tag (and everything else) still render. Reported once per tag,
with its own default log.

### `serializeState`

`boolean` (default `false`). When enabled, each rendered component is stamped with a deterministic `ejs:key`
attribute and its state is collected into a single `<script type="ejs/json">` appended to the body, so the
client restores the server's state on hydration instead of re-deriving from property defaults. `Store` values
are emitted as `Store/<key>` references and a shared store is serialized once. Requires element-js' matching
`serializeState` config to be enabled on the client too. See
[State transport](/concepts/#state-transport) for the format and caveats. The same option is accepted by the
[Astro](/frameworks/astro), [Nuxt](/frameworks/nuxt) and [SvelteKit](/frameworks/sveltekit) `elementSSR`
adapters.

### `properties`

```ts
type PropertyProvider = (input: {
  tag: string; // the element's lower-cased tag name
  node: Element; // its parsed element (node-html-parser) — read attributes / light DOM, treat as read-only
  context: unknown; // the `context` option — the adapters set their native request object
}) => object | null | undefined | Promise<object | null | undefined>;

properties?: PropertyProvider;
context?: unknown;
```

The **input side** of SSR: seed server-fetched properties — CMS content, database rows, API responses —
into components before they render, when the source markup only carries a reference (a content path, an
id). Without it, every data need has to be squeezed through attribute serialization by whoever produces
the HTML. The provider is called once per component instance: read the instance off `node`, fetch, and
return an object of properties (or `null`/`undefined` for none).

```js
await renderToString(html, {
  resolve: catalog,
  properties: async ({ tag, node, context }) => {
    if (tag !== "x-teaser") return null;
    return fetchTeaserContent(
      node.getAttribute("content-path"),
      context.locale,
    );
  },
});
```

**Merge order** (as in every integration that shipped): `element defaults < provider properties < HTML
attributes` — attributes win because they are explicit in the source markup.

- **Once per distinct instance.** Instances are identified by tag + parsed markup, so two identical
  elements share one provider call (and its result) — a de-duplication, not a limitation: keep providers
  deterministic over their input. Calls run **in parallel** per fixpoint pass, so per-instance fetches
  never serialize, and components that only appear in another component's generated template get provided
  too.
- **Failures are isolated** like a throwing `template()`: the instance's element is left untouched and the
  failure reports through [`onError`](#onerror) once per tag. A non-object return (or a bare
  non-function `properties` value) fails loudly instead of silently providing nothing.
- **Hydration needs state transport.** The client cannot re-derive provider-seeded properties from
  attributes — enable [`serializeState`](#serializestate) for components that hydrate with them.

`context` is an opaque per-render value handed to every provider call. The adapters set it to their
framework's native per-request (or per-page) object — pass it yourself only when calling `renderToString`
directly:

| Adapter   | `context` value                                                             |
| --------- | --------------------------------------------------------------------------- |
| Astro     | the `APIContext` (request, params, locals, …)                               |
| Nuxt      | Nitro's `H3Event`                                                           |
| SvelteKit | the `RequestEvent`                                                          |
| Node      | `{ request, response }` — the middleware's own `req`/`res`                  |
| Eleventy  | `this.page` (url, inputPath, outputPath, …) — build time, no request exists |
| Vite      | the `transformIndexHtml` context (path, filename, …) — build time           |

File conventions from earlier renderer generations are one provider away — e.g. a
`<tag>.properties.js` sidecar next to each component:

```js
// Node servers (Express, Eleventy, Nitro): resolve the sidecar by convention
properties: async ({ tag, node, context }) => {
  const module = await import(`./components/${tag}.properties.js`).catch(() => null);
  return module ? module.default(node, context) : null;
},
```

```js
// Vite (config / SvelteKit / Astro): variable dynamic imports need import.meta.glob
const providers = import.meta.glob("./components/*.properties.js");

properties: async ({ tag, node, context }) => {
  const load = providers[`./components/${tag}.properties.js`];
  return load ? (await load()).default(node, context) : null;
},
```

### `transforms`

```ts
type PageTransform = (html: string, context: object) => string | Promise<string>;

transforms?: { pre?: PageTransform | PageTransform[], post?: PageTransform | PageTransform[] };
```

Every real integration ends up wrapping `renderToString` with page-level HTML processing — stripping an
anti-FOUC cloaking block, extracting an inline config, inlining SVG sprite symbols, stamping an
`<html data-ssr>` marker. None of it belongs in the renderer (it's project protocol), but the **shape** is
always the same, so the renderer provides the pipeline: `pre` transforms run once on the input **before**
any component rendering, `post` transforms once on the final output **after** the resolution fixpoint —
each `(html, context) => html`, sync or async, in array order. This matters most with the
[adapters](#elementssr-options), where you don't control the render call site: `transforms` is the one
canonical place to hang that glue, portable across frameworks.

```js
await renderToString(html, {
  resolve: catalog,
  transforms: {
    pre: [stripCloaking, extractAppConfig],
    post: [inlineSpriteSymbols, markSsr],
  },
});
```

`context` is a shared per-render plain object: transforms stash values on it for one another and read what the
renderer publishes. The renderer owns one key — before the first `post` transform runs it sets `context.tags`
to what the render did:

```ts
context.tags: {
  resolved: string[];   // tags rendered on this page
  unresolved: string[]; // custom-element-looking tags no source resolved
  excluded: string[];   // tags declared client-only via `exclude`
  failed: string[];     // tags whose resolution or render failed (reported via onError)
}
```

```js
// e.g. stamp the page only when SSR actually did something — the client can
// tell a transformed page from a fallback
const markSsr = (html, context) =>
  context.tags.resolved.length > 0
    ? html.replace("<html", "<html data-ssr")
    : html;
```

Two guarantees, both deliberate:

- **String in, string out.** No AST or DOM API is promised — every transform of this kind is happy on
  strings, and the renderer shouldn't promise a parse tree.
- **Loud failure.** Unlike per-component errors, a throwing transform (or one returning a non-string — a
  forgotten `return`) fails the whole render: broken page-level glue means broken output, and callers have
  a fallback path for exactly that case. A typo'd key (`posts`) throws instead of silently doing nothing.

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

## `autoload(options?)`

From `@webtides/element-js-ssr-renderer/autoloader` — **client code**, the only browser-side export of the
package (zero dependencies, tree-shakes away from server bundles). The client mirror of `resolve`: it takes
the same [`Catalog`](#catalog) shapes, discovers the catalog's custom elements on the page, and defines each
tag according to its `ejs-loading` attribute — the marker the renderer stamps from a component's `loading`
declaration. See [Progressive hydration](/progressive-hydration) for the full picture.

```ts
autoload(options: {
  resolve: Catalog | Catalog[],
  eager?: boolean,
  root?: Element | Document,
}): { load: (tag: string) => Promise<void>, stop: () => void }
```

| Param             | Description                                                                                                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options.resolve` | The same [`Catalog`](#catalog) shapes the server takes — tag or path keys, eager classes or lazy loaders, [`ComponentConfig`](#componentconfig) values unwrapped — or an array (later wins). **Not** a resolver function: discovery needs an enumerable tag set. |
| `options.eager`   | Load every discovered tag immediately, ignoring `ejs-loading` (including `server` — on a page that was **not** server-rendered, nothing pre-rendered exists, so everything must load). Default `false`.                                                          |
| `options.root`    | The subtree to discover and observe. Default `document`.                                                                                                                                                                                                         |

**Returns** `{ load, stop }`: `load(tag)` triggers a tag's load by hand (cached; resolves after define, also
on a failed load — failures are reported, not thrown); `stop()` disconnects discovery and the trigger
observers (already-scheduled timers and idle callbacks still fire).

- Discovery is an initial scan plus a `MutationObserver`, so elements parsed or inserted later (streaming
  HTML, client-side navigation, re-rendered CMS markup) are picked up too.
- Each tag loads **at most once** — the first trigger of any instance wins, `customElements.define` then
  upgrades every instance at once. Already-defined tags are never touched.
- Loading a tag = call its catalog loader, then `customElements.define(tag, module.default)` — unless the
  module already defined the tag itself (a `define`-style side-effect module).
- A failing loader is isolated per tag: reported via `console.error`, never retried, other tags unaffected.
- An unknown `ejs-loading` value (or an invalid `onMedia` query) **fails open** — warn and load
  immediately: a typo must degrade to eager loading, never to a component that silently never loads.
- Hydration is not its job: the elements already stand fully rendered as Declarative Shadow DOM; element-js
  hydrates them on upgrade. The autoloader only decides **when** each tag's module loads.

The subpath also exports the `Loading` type for typed `static loading` declarations — see
[Progressive hydration](/progressive-hydration#typed-declarations).

## Subpath exports

| Import                                         | Exports                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `@webtides/element-js-ssr-renderer`            | `renderToString`, `glob`                                                 |
| `@webtides/element-js-ssr-renderer/autoloader` | `autoload`, `Loading` type (client-side, zero dependencies)              |
| `@webtides/element-js-ssr-renderer/dom-shim`   | DOM globals shim (side-effect import); `lockdownFetch`                   |
| `@webtides/element-js-ssr-renderer/astro`      | `elementSSR` (Astro middleware)                                          |
| `@webtides/element-js-ssr-renderer/nuxt`       | `elementSSR` (Nitro `render:response` handler)                           |
| `@webtides/element-js-ssr-renderer/sveltekit`  | `elementSSR` (SvelteKit `handle` hook)                                   |
| `@webtides/element-js-ssr-renderer/node`       | `elementSSR` (Node `(req, res, next)` middleware)                        |
| `@webtides/element-js-ssr-renderer/vite`       | `elementSSR` (Vite plugin, `transformIndexHtml`)                         |
| `@webtides/element-js-ssr-renderer/eleventy`   | `elementSSR` (Eleventy transform)                                        |
| `@webtides/element-js-ssr-renderer/generate`   | `buildCatalog`, `catalogEntriesFromDirectory`, … (build-time, Node-only) |

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
