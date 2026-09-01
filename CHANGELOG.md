# Changelog

All notable changes to `@webtides/element-js-ssr-renderer` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/) (0.x: minor
bumps may contain behavior changes).

## [0.4.0] — 2026-09-01

The last two production-integration issues (#7, #8): components get their data before the render, and their
JS only when they need it.

### Added

- **Progressive hydration** (T-029, #8) — a per-component loading declaration plus a companion client
  autoloader. Declare `static loading = 'server' | 'client' | 'hydrate:<trigger>'` on the class (or a
  `loading` field on a `ComponentConfig`, which wins); the renderer stamps it as an advisory `ejs-loading`
  attribute on each host element — unless the source markup already carries the attribute (HTML wins). The
  new `@webtides/element-js-ssr-renderer/autoloader` subpath (client code, zero dependencies) is the client
  mirror of `resolve`: `autoload({ resolve, eager? })` takes the same Catalog shapes, discovers the
  catalog's elements (initial scan + MutationObserver), never loads `server` tags, defines `client` tags
  immediately, and defers `hydrate:onIdle | onVisible | onDelay(ms) | onMedia(query)` tags until their
  trigger fires — each tag at most once, failures isolated per tag, unknown values failing open (warn +
  load). `eager: true` loads everything immediately (the non-SSR fallback gate, e.g.
  `!document.documentElement.hasAttribute("data-ssr")`, stays consumer-side). Also exports a
  template-literal `Loading` type for typed `static loading` declarations via JSDoc.
- **Async property provider** (T-009, #7) — `properties: ({ tag, node, context }) => object | Promise<object>`
  on `renderToString` and all adapters: seed server-fetched properties (CMS content, database rows, API
  responses) into components before they render, merged over element defaults and under HTML attributes.
  Called once per distinct instance (identical instances share the call), in parallel per resolution
  pass; components that only appear in generated templates are provided too. Failures are isolated per
  instance and report through `onError`. The new `context` option rides along to every provider call —
  the adapters set it to their framework's native request object (Astro `APIContext`, SvelteKit
  `RequestEvent`, Nitro `H3Event`, Node `{ request, response }`, Eleventy `this.page`, Vite's
  `transformIndexHtml` context).

## [0.3.0] — 2026-09-01

The second wave of production-integration issues (#9–#12), in one release.

### Added

- **Resolver failure isolation** (T-025, #9) — a rejected `resolve()` (a lazy loader whose dynamic import
  fails, a throwing resolver function, an invalid `ComponentConfig`) no longer fails the whole page: the
  tag's elements are left untouched, siblings still render, and the failure reports through the existing
  `onError(tag, error)` hook (with its own default log noting that a resolve failure hits every page
  containing the tag). `onUnresolved` is not called for such tags; rethrow from `onError` to fail fast.
- **`<html lang>` adoption** (T-026, #10) — `renderToString` adopts the input document's `<html lang>` onto
  the dom-shim's `document.documentElement.lang` for the duration of the render (restored afterwards), so
  lang-dependent components (`Intl` formatting, i18n lookups) render the page's language instead of the
  shim's `'en'` default. No new option: an input without the attribute keeps the current value (pre-set it
  to define your own default), and a real DOM's document is never touched.
- **`lockdownFetch` — opt-in network egress lockdown** (T-027, #11) — exported from
  `…/dom-shim`: locks the global `fetch` down to an origin allowlist (`lockdownFetch()` blocks everything,
  `{ allowOrigins }` opens exceptions), before any request leaves the process. Blocked calls reject fast
  with `code: "SSR_FETCH_BLOCKED"` on a pre-handled promise (fire-and-forget fetches never surface as
  unhandled rejections); relative URLs are blocked; each blocked origin warns once by default
  (`onBlocked(origin, url)` to override). Repeated calls replace the policy; the returned function restores
  the previous `fetch`. Deliberately opt-in — importing the dom-shim alone changes nothing.
- **Page-level transform pipeline** (T-028, #12) — `transforms: { pre?, post? }` on `renderToString` and
  all adapters: the canonical place for the HTML-processing glue every integration wraps around the render
  (strip cloaking, extract config / inline sprites, stamp `<html data-ssr>`). Each transform is
  `(html, ctx) => string | Promise<string>`, run in array order — `pre` once on the input before component
  rendering, `post` once on the final output. `ctx` is shared per render; the renderer sets `ctx.tags`
  (`resolved`/`unresolved`/`excluded`/`failed`) before the first `post` transform. Loud by design: a
  throwing transform, a non-string return, or a typo'd key fails the render instead of silently doing
  nothing.

### Changed

- An invalid `ComponentConfig` (a `component` that is not, and does not resolve to, an element class)
  previously rejected the whole `renderToString` call; it is now isolated like any other resolve failure
  (see above).

## [0.2.0] — 2026-08-28

All six issues from the first production integrations, in one release.

### Added

- **`exclude` option** (T-023, #2) — declare tags client-only from outside the component:
  `exclude: string[] | ((tag) => boolean)` on `renderToString` and all adapters. Excluded tags are
  unresolved-by-choice: left untouched, no `onUnresolved`, and their modules are **never imported** on the
  server.
- **Per-component error isolation + `onError` hook** (T-020, #3) — a component whose constructor,
  `properties()`, `template()` or `serializeState()` throws no longer fails the page: the element is left
  untouched (hydrates client-side), siblings still render, and `onError(tag, error)` reports it (default:
  `console.error`, also in production; rethrow to fail fast).
- **`ComponentConfig` resolve values** (T-021, #4) — a catalog value (or resolver return) may be
  `{ component, styles?, adoptGlobalStyles? }`: inject build-time per-component CSS (critical CSS, Tailwind
  subsets) into DSD templates and override `adoptGlobalStyles` at render time — no more poking element-js
  internals. Injected styles live in a renderer-owned `TAGNAME-SSR{index}` id-space, so element-js'
  hydration ids stay untouched.
- **Light-DOM introspection during SSR** (T-019, #1) — instances are backed by their parsed node before
  `properties()` runs: `children`, `childNodes`, `innerHTML`, `textContent`, `querySelector(All)`,
  `getAttribute`/`hasAttribute` etc. now see the authored light DOM, matching the browser's first render.
- **Broader dom-shim coverage** (T-022, #6) — real-world component modules import cleanly out of the box:
  `window`, `matchMedia`, Intersection/Resize/MutationObserver, `requestAnimationFrame` (a deliberate
  no-op — callbacks never fire during SSR), `CSSStyleSheet`, `localStorage`/`sessionStorage`, `navigator`,
  `location`, global/document event and query surfaces. All inert and guarded — real DOM environments are
  never touched.
- **Catalog generator: recursive mode + `tag` hook** (T-024, #5) — `recursive: true` (CLI:
  `-r`/`--recursive`) walks nested layouts; the programmatic `tag({ path, relativePath, basename, source })`
  hook overrides the filename→tag convention per file (e.g. read the tag out of a
  `defineElement('mb-icon', …)` call). Invalid returned tags are skipped with a warning, never silently.

### Changed

- A throwing component previously rejected the whole `renderToString` call; it is now isolated per
  component (see `onError` above — rethrow from it to restore fail-fast).
- Components whose templates read their light DOM or attributes now render that content on the server
  instead of the dom-shim's empty defaults — output changes where templates depend on it (that's the fix).

## [0.1.0] — 2026-06-10

Initial release: `renderToString` (Declarative Shadow DOM, hydration markers, lazy resolution fixpoint),
catalogs and resolver functions, `glob` escape hatch, state transport (`serializeState`), dom-shim,
framework adapters (Astro, Nuxt, SvelteKit, Vite, Eleventy, Node), catalog generator + CLI.

[0.4.0]: https://github.com/webtides/element-js-ssr-renderer/releases/tag/v0.4.0
[0.3.0]: https://github.com/webtides/element-js-ssr-renderer/releases/tag/v0.3.0
[0.2.0]: https://github.com/webtides/element-js-ssr-renderer/releases/tag/v0.2.0
[0.1.0]: https://www.npmjs.com/package/@webtides/element-js-ssr-renderer/v/0.1.0
