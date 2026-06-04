# Worklog

Append-only log of significant project changes. **Newest entries at the top.**

## Conventions

- **One entry per significant change.** Skip trivia (typos, formatting, no-op refactors, routine dependency bumps).
- **Format:**

  ```
  ## YYYY-MM-DD — <short title>
  **Tasks:** T-001, T-002.1   <!-- or "—" if no task ref -->

  - one-line summary of what changed and why
  - one-line summary
  ```

- Reference task IDs from `TASKS.md` so each change traces back to its task.
- **Never edit past entries.** If something needs correction, append a follow-up entry referencing the original date.
- Keep entries terse — this is a log, not a narrative.

---

## 2026-06-04 — Server→client state transport (T-007)

**Tasks:** T-007

- Added an opt-in `serializeState` option to `renderToString` / `renderToStringAsync` (and threaded it through the Astro + SvelteKit `elementSSR` adapters via `transformHtmlResponse`). When off (default), output is byte-for-byte unchanged — the existing 41 tests stay green.
- When on, every rendered component (non-empty template, non-empty state) is stamped with a **deterministic** `ejs:key` (`<tag>-<n>`, `n` advancing in document order via a per-pass counter — no `randomUUID`, so identical input yields identical output) and its `serializeState()` output is collected into a single `<script type="ejs/json">` appended to `<body>` (falls back to the root for fragments). Built directly with `JSON.stringify` + a Store replacer — never routed through element-js' `SerializeStateHelper`, which needs `document.scripts`/`createElement`/`body`. `<` is escaped to `<` so embedded markup can't close the script early.
- `Store` handling mirrors element-js' replacer/reviver: a store value serializes to a `Store/<key>` reference, with the store's own `serializeState()` stored once under that key; `collectStores` walks state trees recursively and de-dupes via a key set, so a store shared across components is emitted a single time and every host points at it.
- `serializeState: true` also flips `globalThis.elementJsConfig.serializeState` for the process (per element-js' own config). Hardened `dom-shim` with no-op `document.createElement`/`document.body.appendChild` so a `Store` touching `SerializeStateHelper` during server construction stays inert instead of throwing. Import path quirk: element-js' `exports` map turns `src/util/*` into `*.js`, so the Store import is extension-less (`…/util/Store`).
- Tests: 7 new cases in `render-to-string.test.js` (default-off guard, deterministic per-host `ejs:key`s, identical-output determinism, `ejs/json` shape + server values, `Object.assign` round-trip, shared-`Store` single emission, async path). Suite green at 48. Documented the format + import-order/SSR caveats in `docs/concepts/` and the `serializeState` option in `docs/api/`; `docs:build` clean (no dead links).

## 2026-06-04 — VitePress docs site + GitHub Pages prep (T-012)

**Tasks:** T-012

- Stood up a VitePress docs site under `docs/` as the **single source of truth** for the deep docs: `.vitepress/config.mjs` (nav + grouped sidebar, local search, `base: '/element-js-ssr-renderer/'` for the Pages project site, `cleanUrls`, editLink). Added `vitepress` devDep and `docs:dev`/`docs:build`/`docs:preview` scripts; gitignored `docs/.vitepress/{dist,cache}`. `files` stays `["src"]` so docs aren't published to npm.
- Migrated the monolithic `README.md` into structured pages: guide (introduction/how-it-works, installation, quick-start), core concepts (NEW rendering & hydration page synthesized from `render-to-string.js`; style handling), resolving-components (the eager-vs-lazy / multi-source section), framework integrations (Astro, SvelteKit, Nuxt-planned), and limitations & roadmap. Added a NEW API reference page (`api/index.md`) with verified signatures for `renderToString`/`renderToStringAsync`/`lazy`/`fromDirectory`/`elementSSR`, the type defs (`Registry`/`ImporterMap`/`ResolveFn`/`Source`/`onUnresolved`), and the subpath-export table.
- Slimmed `README.md` to overview + install + quickstart + a prominent docs link (`https://webtides.github.io/element-js-ssr-renderer/`) + examples pointer; the npm landing page no longer duplicates the deep content.
- Added `.github/workflows/deploy-docs.yml` — builds + deploys to Pages on push to `main` (path-filtered) and `workflow_dispatch`; inert until the user enables **Settings → Pages → Source = GitHub Actions** (documented in a header comment).
- Verified: `npm run docs:build` clean (VitePress fails on dead links, so all internal links resolve); 41/41 Vitest still green; `dist/` emitted under the configured base.

## 2026-06-03 — SvelteKit example + `./sveltekit` adapter (T-011)

**Tasks:** T-011

- Added `src/adapters/sveltekit.js` (`elementSSR(options)` → a SvelteKit `handle` hook), exported as `./sveltekit`. SvelteKit's `transformPageChunk` hands over the rendered HTML **string** (not a `Response`), so the adapter skips the `transformHtmlResponse` kernel and calls `renderToStringAsync` directly — buffering every chunk and transforming the whole document once on the final (`done`) chunk, returning `""` for earlier chunks to preserve order. Covered by `test/sveltekit.test.js` (static registry, lazy resolve loads once, and a split-across-chunks buffering case); full suite green at 41 tests.
- Added the runnable example under `examples/sveltekit/` (`@sveltejs/adapter-node`): `hooks.server.js` imports the DOM shim first then composes an eager element-library `registry` with `lazy(import.meta.glob("./components/*.js"))`; reuses the Astro `x-counter`/`x-greeting` components verbatim for parity. Global styles/tokens live in `app.html` (plain CSS the renderer can adopt into shadow roots, since Svelte component `<style>` is scoped); client hydration loads each `define` from `+layout.svelte`'s `onMount`. `vite.config.js` sets `ssr.noExternal` for the element-js packages — the same import-order fix as the Astro example.
- Verified end-to-end: `npm run build && node build`, fetched `/` → 9 `<template shadowrootmode="open">` blocks, seeded `count="3"` rendered (`Apples: 3`), light-DOM greeting in place, both component-own and adopted global styles inlined per shadow root, hydration markers present.
- Flipped the `examples/README.md` + package README adapter/status tables to "available" and added a `## SvelteKit` README section mirroring `## Astro`. `vite-plugin-svelte` does not export `sveltekit`; the Vite plugin comes from `@sveltejs/kit/vite`.

## 2026-06-03 — Group framework adapters under src/adapters

**Tasks:** — (prep for T-010 / T-011)

- Moved `src/astro.js` → `src/adapters/astro.js` and pointed the `./astro` export at it — the public subpath is unchanged, so consumers and the example are unaffected (verified: 38 tests green, example still emits 9 DSD templates). Updated `test/astro.test.js`'s internal import.
- Extracted the repeated "transform an HTML `Response`" logic into `src/adapters/transform-response.js` (`transformHtmlResponse`: content-type gate → `renderToStringAsync` → re-wrap preserving status/headers). `elementSSR` is now a one-liner over it; future `Response`-based adapters (Nuxt) reuse it, while string-based ones (SvelteKit's `transformPageChunk`) call `renderToStringAsync` directly.
- Established the adapter convention so frameworks can be added in parallel: one `src/adapters/<framework>.js`, published as `./<framework>`, landing together with its example + a test. Documented in `examples/README.md` (adapter table + checklist). No `nuxt`/`sveltekit` stubs added — adapters ship with working examples (T-010/T-011), not as empty exports.

## 2026-06-03 — Restructure examples for multiple frameworks (T-002.1)

**Tasks:** T-002.1

- Moved `example/` → `examples/astro/` and bumped its relative `file:` deps (`file:../..` for the renderer, `file:../../../element-library`); reinstalled + rebuilt to confirm byte-identical SSR output after the move.
- Added `examples/README.md` as the index: a framework status table (Astro available; Nuxt + SvelteKit planned), the three framework-agnostic integration moves (shim-first → wrap the HTML response through `renderToStringAsync` → load `define` on the client), a hook-mapping table across Astro/Nuxt/SvelteKit, and an "adding a new example" checklist (incl. the bundler import-order gotcha).
- Filed the next frameworks as open tasks T-010 (Nuxt, Nitro `render:response`) and T-011 (SvelteKit, `handle`/`transformPageChunk`), both set to reuse the Astro example's `x-counter` / `x-greeting` for parity. Updated the package README link to `examples/astro/`.

## 2026-06-03 — Runnable Astro example (T-002)

**Tasks:** T-002

- Added `example/` — a `@astrojs/node` (`output: "server"`) Astro app that wires the `elementSSR` middleware and SSRs custom elements end-to-end. The middleware composes two sources to exercise T-008: element-library components (`el-button`, `el-notification`) via an eager static `registry`, and the project's own components (`x-counter`, `x-greeting`) via `lazy(import.meta.glob("./components/*.js"))`.
- New local components cover both render paths and reactivity: `x-counter` (shadow → DSD, interactive — buttons mutate a reactive `count`, seedable from a `count` attribute) and `x-greeting` (light DOM). The page also nests `el-button` inside `el-notification` to show recursive/slotted resolution. A global `<style is:global>` (with `--el-*` tokens) demonstrates `adoptGlobalStyles` into shadow roots.
- Verified both paths: `astro dev` and the production build both emit 9 DSD templates, the light-DOM template, 5 SSR'd `el-button`s (incl. the nested one), 34 `<!--template-part-->` hydration markers, and the seeded `count="3"` rendered as `3`. Client `<script>` loads each component's `define` so the elements hydrate in place.
- Build gotcha fixed via `vite.ssr.noExternal` for the three `@webtides/*` packages: by default Rollup hoisted element-js' `import` above the inlined DOM-shim side effect, so `HTMLElement` was undefined when component classes evaluated; bundling them keeps the shim ordered first. (`astro dev`, being unbundled, was already fine.) Documented in `astro.config.mjs` and `example/README.md`.

## 2026-06-03 — Document component resolution; close out T-008

**Tasks:** T-008.8, T-008.3, T-008.4

- Added a "Loading & resolving components" section to the README: the three source kinds (static registry, `lazy()` importer map, resolver function incl. `fromDirectory`), multiple-source composition with later-wins precedence, an environment matrix (zero-config / Node / Vite / webpack / edge), a sync-vs-async note, and the dev unresolved-tag warning. Refreshed the intro and Astro section with the lazy `import.meta.glob` + library-composition variant.
- Closed T-008.3 (precedence) and T-008.4 (`lazy` `pathToTag`/`pick`) — both implemented earlier in T-008.1/.2 and now documented; added a test for the `pathToTag`/`pick` override path. Suite: 38 tests. T-008 complete.

## 2026-06-03 — Node-only convention resolver (`resolve/node`)

**Tasks:** T-008.5

- Added `fromDirectory(dir, { tagToPath, pick })` behind a new `@webtides/element-js-ssr-renderer/resolve/node` export — a `ResolveFn` that maps a tag to a file on disk (`<el-button>` → `<dir>/el-button.js`) and imports it on demand, so a project's components resolve by filename with no registry and no bundler. Usable as a `resolve` source alone or in an array.
- Quarantined in its own module on purpose: it constructs a *runtime* import specifier, which a bundler can't analyze — fine in a long-running Node server, but it must never enter an edge bundle, so edge builds that don't import this path never see the dynamic import. Docs point bundled/edge targets to `lazy(import.meta.glob(...))`.
- Accepts a path or `file:` URL base (URL recommended for ESM, since relative paths resolve from `cwd`); caches each found module's import; guards against path traversal in attacker-influenced tags; treats a missing file as a pass-through miss but lets errors *inside* a found module propagate (a broken component fails loudly instead of looking unregistered).
- Added `test/resolve-node.test.js` (6 tests) + an `el-fixture` component fixture: convention render, `file:` URL base, missing-file pass-through, per-module-once import, traversal refusal, and the missing-arg guard. Suite: 37 tests across 3 files.

## 2026-06-03 — Dev-mode warning for unresolved custom-element tags

**Tasks:** T-008.6

- `onUnresolved` now defaults to a dev-only `console.warn` (once per distinct tag, naming it) when a hyphenated tag matches no component — surfacing the "forgot to register / typo'd the tag" mistake the static registry used to swallow silently. Wired into both `renderToString` (which gained the `onUnresolved` option) and `renderToStringAsync`, so the Astro middleware gets it for free.
- Gated to non-production via `NODE_ENV` and `typeof process` (edge-safe; bundlers inline the value). Suppressible by passing a custom `onUnresolved` (e.g. `() => {}`) for intentionally client-only / third-party tags. Output is otherwise unchanged — unresolved tags still pass through untouched.
- Added 6 tests: warns + names the tag, per-tag dedup across instances, no warning for resolved/plain tags, custom-handler silencing, production silence, and the async path. Suite: 31 tests.

## 2026-06-03 — Astro middleware on the async resolution path

**Tasks:** T-008.7

- `elementSSR` now pre-renders via `renderToStringAsync` and accepts `resolve` / `onUnresolved` alongside the existing `registry`, so the middleware can load components lazily (only those on a page) instead of enumerating them all up front. Output is unchanged for the static-registry case (sync/async parity).
- JSDoc documents both styles: a static registry, and a lazy `[lazy(libraryComponents), lazy(import.meta.glob('../components/*.js'))]` composition where the project source overrides the library on a tag clash.
- Added `test/astro.test.js`: static-registry render, lazy render that loads only the present component, and pass-through of status/headers and non-HTML responses. Suite: 25 tests across 2 files.

## 2026-06-03 — Lazy, multi-source component resolution (`renderToStringAsync`)

**Tasks:** T-008.1, T-008.2

- Added `renderToStringAsync(html, { registry, resolve, onUnresolved })` plus a `lazy()` helper, so components can be resolved on demand from one or more sources instead of a fully-enumerated static `registry`. Only the components actually present on a page are ever loaded — the cold-start / serverless / edge path. The core never calls `import()` itself; sources do.
- A `Source` is a static `{ tag: Class }` registry, a `lazy()`-wrapped importer map (`{ key: () => import() }`, the `import.meta.glob` shape; keys may be tags or module paths via `pathToTag`, class picked via `pick`/`.default`), or a bare `(tag) => Class|Promise` resolver. `resolve` accepts one or an array; later sources win (`{...a,...b}`), so a project source overrides `@webtides/element-library`.
- Implemented as a resolve→render fixpoint over the **unchanged** sync `transformNode` (no async fork of the transform): each pass renders with the registry resolved so far and reports custom-element tags it couldn't resolve through a new `onUnresolved` context hook; the wrapper resolves those in parallel and re-runs until stable. Side benefit: catches custom elements that appear only inside a component's generated template, not just the input HTML.
- `renderToString` stays synchronous and registry-only (extracted a shared `runTransform`); existing behaviour/tests untouched. Added 8 tests covering sync/async parity, bare-fn resolver, present-only loading, glob-path keys, source precedence, generated-template nesting, and `onUnresolved`.

## 2026-06-03 — De-duplicate emitted `<style>` blocks

**Tasks:** T-006

- Light-DOM component styles are now emitted as id'd `<style id="TAGNAME{index}">` tags (matching element-js' `appendStyleSheets` identifiers) and only once per id across the whole document, so N instances of a component no longer repeat the same CSS. The id also lets the client de-dupe against the SSR output on hydration instead of appending a copy.
- Adopted global styles are de-duped within each shadow root (a selector can match the same source more than once). Cross-instance shadow duplication is inherent to shadow-root isolation and intentionally kept.
- `renderComponent` now returns per-style entries; `transformNode` takes a context object (`registry`, `globalStyles`, `lightStyleIds`). Added tests for light dedup and shadow within-root dedup; updated the T-004 light-styles test for the new id'd output.

## 2026-06-03 — Honor `adoptGlobalStyles` for shadow components

**Tasks:** T-005

- `renderToString` now collects the input document's global stylesheets (`<style>` / `<link rel="stylesheet">`, anywhere in the input, excluding sources scoped inside an existing `<template>`) and inlines the ones each shadow component adopts into its declarative shadow root, ahead of the component's own styles.
- Adoption mirrors element-js' option: `false` → none, `true` (default) → all, selector / selector array → only matching sources (`node.matches`); the runtime-only `'document'` token is ignored (no static-HTML equivalent).
- Added tests for all three modes plus template-scoped exclusion; updated README/JSDoc (previously claimed only custom-property inheritance).

## 2026-06-03 — Fix dropped light-DOM component styles

**Tasks:** T-004

- `renderComponent` produced `_styles` but `transformNode`'s light-DOM branch never emitted them, so light-DOM components lost their CSS in SSR output. Now inlined as a `<style>` ahead of the rendered markup.
- Added a test asserting a light-DOM component (`el-input-field`) emits its styles.
- Surfaced two follow-ups from reviewing `example-from-the-past/`: T-005 (`adoptGlobalStyles`) and T-006 (style de-dup).

## 2026-06-03 — Initialized agent workflow

**Tasks:** —

- Scaffolded `TASKS.md` and `WORKLOG.md` via `/my-init`.
- Documented workflow conventions in agent rule files.
