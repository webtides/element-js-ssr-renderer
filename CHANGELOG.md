# Changelog

All notable changes to `@webtides/element-js-ssr-renderer` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/) (0.x: minor
bumps may contain behavior changes).

## [Unreleased]

### Added

- **Resolver failure isolation** (T-025, #9) — a rejected `resolve()` (a lazy loader whose dynamic import
  fails, a throwing resolver function, an invalid `ComponentConfig`) no longer fails the whole page: the
  tag's elements are left untouched, siblings still render, and the failure reports through the existing
  `onError(tag, error)` hook (with its own default log noting that a resolve failure hits every page
  containing the tag). `onUnresolved` is not called for such tags; rethrow from `onError` to fail fast.

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

[unreleased]: https://github.com/webtides/element-js-ssr-renderer/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/webtides/element-js-ssr-renderer/releases/tag/v0.2.0
[0.1.0]: https://www.npmjs.com/package/@webtides/element-js-ssr-renderer/v/0.1.0
