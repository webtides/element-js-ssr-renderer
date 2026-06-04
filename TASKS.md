# Tasks

Hierarchical task list for this project. Both the user and any agents read and update this file.

## Conventions

- **IDs are stable.** Once assigned, never reuse. Format: top-level `T-001`, sub-tasks `T-001.1`, `T-001.2`. Increment monotonically.
- **Status checkboxes:**
  - `[ ]` open
  - `[~]` in progress
  - `[x]` done
  - `[!]` blocked (note the blocker inline)
- **Don't delete completed tasks** — leave them checked off for history. Move them under `## Done` when convenient; archive only if the file gets unwieldy.
- One line per task, imperative mood. Sub-tasks indent by 2 spaces.
- Optional inline metadata in parentheses: `(owner: @name)`, `(due: YYYY-MM-DD)`, `(blocked by: T-003)`, `(ref: WORKLOG#YYYY-MM-DD)`.
- Sub-tasks may have their own sub-tasks (`T-001.1.1`), but prefer flat structure where possible.

## Open

- [x] T-012 Documentation site — present the docs with VitePress and prepare GitHub Pages hosting. Reorganize the monolithic `README.md` into structured pages (single source of truth), add net-new API reference + Core Concepts pages, slim the README to overview/install/quickstart + a docs link, and ship a Pages deploy workflow (push to `main`, no-ops until Pages is enabled in repo settings). (ref: WORKLOG#2026-06-04)
  - [x] T-012.1 Scaffold VitePress under `docs/` (`.vitepress/config.mjs`, home page, nav/sidebar, `base: '/element-js-ssr-renderer/'`, local search); add `vitepress` devDep + `docs:dev/build/preview` scripts; gitignore `dist`/`cache`
  - [x] T-012.2 Migrate README prose into guide/concepts/resolving/frameworks/limitations pages
  - [x] T-012.3 New API reference page (renderToString/Async, lazy, fromDirectory, elementSSR, types, subpath exports)
  - [x] T-012.4 Slim `README.md` to overview + install + quickstart + docs link
  - [x] T-012.5 GitHub Actions `deploy-docs.yml` (build + deploy to Pages on push to `main`)
- [ ] T-001 Fix `SpreadAttributesDirective.stringify()` in `@webtides/element-js` to skip `undefined`/`null`/`NaN` like its `update()` does (SSR currently leaks `name='undefined'`)
  - [ ] T-001.1 Mirror the `update()` guard in `stringify()` (directives.js)
  - [ ] T-001.2 Add a test covering the SSR omit-attribute case
- [ ] T-003 Add `all.server.js` to `@webtides/element-library` — a `{ tag: Class }` registry derived from `custom-elements.json` so consumers don't hand-build the registry
- [x] T-007 Implement server→client state transport (element-js `serializeState` / `ejs:key`) so stateful components hydrate with their server-rendered state instead of re-deriving from property defaults (ref: WORKLOG#2026-06-04)
  - [x] T-007.1 Assign each rendered component a **stable, deterministic** `ejs:key` and stamp it on the host element — must match between server output and client hydration, so it can't use element-js' `randomUUID()` (derive from tag + document position/order)
  - [x] T-007.2 Collect each component's `serializeState()` output into one merged state map and emit it as a single `<script type="ejs/json">…</script>` in the body — the exact location/format element-js reads on the client (avoid element-js' DOM-based helpers, which need `document.scripts`/`createElement`/`body`; build the JSON directly)
  - [x] T-007.3 Handle `Store` references — serialize stores as `Store/<uuid>` with their state under that uuid, and de-duplicate stores shared across components, mirroring element-js' replacer/reviver (SerializeStateHelper.js)
  - [x] T-007.4 Add an opt-in surface (e.g. a `serializeState` option on `renderToString` / `elementSSR`) that sets `globalThis.elementJsConfig.serializeState`; document the import-order/SSR caveats
  - [x] T-007.5 Tests: round-trip a component with non-default state — assert `ejs:key` on the host, presence/shape of the `ejs/json` script, and that restored values match the server state (incl. a shared-`Store` case)
- [ ] T-009 Optional async per-component property provider — let consumers supply server-fetched / async props for a component before its SSR render, merged ahead of HTML attributes over element defaults. The renderer currently derives props only from attributes + defaults; add a hook (e.g. a `properties(tag, node)` option, or a `<tag>.properties.js` convention) for data-backed components. Salvaged from the old Magnolia renderer's `<tag>.properties.js` + CMS-content pattern; distinct from T-007 (which transports already-rendered state to the client, not server-side prop seeding).

## Done

<!-- Move completed top-level tasks here when convenient. -->

- [x] T-010 Add a Nuxt example under `examples/nuxt/` — integrated via a Nitro `render:response` hook from a server plugin (`server/plugins/element-ssr.js`), reusing the `x-counter`/`x-greeting` components for parity with Astro. Shipped `src/adapters/nuxt.js` (export `./nuxt`): it wraps the Nitro response's `body` in a web `Response`, runs it through the shared `transformHtmlResponse` kernel, and writes the transformed HTML back in place. `test/nuxt.test.js` mirrors `test/astro.test.js` over the Nitro response-object shape (registry, lazy, non-HTML, non-string body). **Nitro import-order gotcha:** unlike Vite's `ssr.noExternal` (Astro/SvelteKit), Nitro reorders top-level module eval, so a static `import '…/dom-shim'` is NOT guaranteed before element-js' `extends HTMLElement` — the plugin loads the shim + all element-js imports via *ordered dynamic `import()`* instead. Server-side lazy resolution uses a hand-written `lazy({...})` map, not `import.meta.glob` (Nitro isn't Vite). Verified: `nuxt build` + `node .output/server/index.mjs` emits 8 DSD templates, light-DOM greeting in place, global styles adopted, attribute-seeded props (`Apples: 3` / `Pears: 0`). Docs/README/examples tables updated. (ref: WORKLOG#2026-06-04, T-002.1, T-008)

- [x] T-011 Add a SvelteKit example under `examples/sveltekit/` — integrated via the `handle` server hook's `transformPageChunk` (which hands the HTML string directly, so the `./sveltekit` adapter calls `renderToStringAsync` and needs no Response kernel; the adapter buffers chunks and transforms the whole document on the final `done` chunk). Reuses the same `x-counter`/`x-greeting` local components for parity with Astro; `@sveltejs/adapter-node` app, `ssr.noExternal` for import-order. Shipped `src/adapters/sveltekit.js` (export `./sveltekit`) + `test/sveltekit.test.js`. Verified: `npm run build` + `node build` emits 9 DSD templates with adopted global styles. (ref: WORKLOG#2026-06-03, T-002.1, T-008)

- [x] T-002 Stand up a runnable Astro example wired to the `elementSSR` middleware, verifying end-to-end Declarative Shadow DOM hydration (ref: WORKLOG#2026-06-03). Lives in `examples/astro/`: a `@astrojs/node` SSR app whose middleware composes element-library components (eager static `registry`) with the project's own components (lazy `import.meta.glob`), covering both the shadow (DSD) and light-DOM render paths plus nested/composed resolution. The `examples/` dir is structured for more frameworks (Nuxt/SvelteKit) — see `examples/README.md` for the shared pattern (T-002.1).
  - [x] T-002.1 Reorganize into `examples/<framework>/` with a top-level index documenting the framework-agnostic integration pattern (shim-first → wrap HTML response → load `define` on client) and a per-framework hook mapping, so Nuxt/SvelteKit examples can be added alongside Astro (ref: WORKLOG#2026-06-03)

- [x] T-008 Pluggable component resolution — consumers can supply lazily-loaded, multi-source component sources instead of (or alongside) the static `registry`, so unused components never load (cold-start / serverless / edge) and projects stop hand-maintaining a registry. Core stays bundler/runtime-agnostic: it never calls `import()` itself, only the resolvers handed to it. (ref: T-002, T-003)
  - [x] T-008.1 Define the `Source` model + `resolve` option: static registry (sync), importer map (lazy), and bare `(tag) => …` resolver; normalize each to a uniform `(tag) => Class | Promise<Class> | undefined` (ref: WORKLOG#2026-06-03)
  - [x] T-008.2 Async render via a resolve→render fixpoint over the existing sync transform: each pass renders with the registry resolved so far and reports unresolved tags (new `onUnresolved` hook); the wrapper resolves those in parallel (each module once) and re-runs until stable. Also catches custom elements nested in _generated_ templates, not just the input. Added `renderToStringAsync`; sync `renderToString` (registry-only) unchanged (ref: WORKLOG#2026-06-03)
  - [x] T-008.3 Multiple sources + precedence: `resolve` accepts an array of sources; later sources win (`{...a, ...b}` semantics) so a project can override `@webtides/element-library`. Implemented in `composeSources`; tested + documented (ref: WORKLOG#2026-06-03)
  - [x] T-008.4 Importer ergonomics: `lazy(map, { pathToTag, pick })` — map keyed by tag _or_ module path; default `pathToTag` = basename, default `pick` = `module.default`; works with `import.meta.glob` output _and_ hand-written maps, no bundler required. Default + override paths tested (ref: WORKLOG#2026-06-03)
  - [x] T-008.5 Opt-in Node-only convention resolver behind a separate `…/resolve/node` entry point (filesystem `import(./components/${tag}.js)`), so its runtime-string import never lands in an edge bundle; documented as Node-server-only. `fromDirectory(dir, { tagToPath, pick })` → `ResolveFn`; accepts path / `file:` URL base, per-tag import cache, path-traversal guard, propagates module errors but treats missing files as a pass-through miss (ref: WORKLOG#2026-06-03)
  - [x] T-008.6 Dev-mode warning when a hyphenated (custom-element-looking) tag resolves to nothing — catches the "forgot to add the source / typo'd the tag" case the static registry silently swallows. Default `onUnresolved` warns once per tag, non-production only (`NODE_ENV`-gated, edge-safe), suppressible via a custom `onUnresolved`; wired into both sync and async paths (ref: WORKLOG#2026-06-03)
  - [x] T-008.7 Wire `elementSSR` (astro) onto `renderToStringAsync` + accept `resolve`/`onUnresolved`; JSDoc shows static-registry and lazy `import.meta.glob` + library composition. (The runnable example that exercises this end-to-end is T-002.) (ref: WORKLOG#2026-06-03)
  - [x] T-008.8 Docs: README "Loading & resolving components" section (three source kinds, multi-source precedence, environment matrix, cold-start rationale, sync-vs-async, unresolved-tag warning); JSDoc on the new typedefs/options; `registry` noted as still supported (ref: WORKLOG#2026-06-03)

- [x] T-006 De-duplicate emitted `<style>` blocks — light-DOM component styles now emit once per `TAGNAME{index}` id across the document (id'd like element-js so the client de-dupes on hydration); adopted global styles are de-duped within each shadow root. Cross-instance shadow duplication is inherent to shadow isolation and left as-is. (ref: WORKLOG#2026-06-03)

- [x] T-005 Honor element-js' `adoptGlobalStyles` option — collect the input document's global `<style>`/`<link rel="stylesheet">` (anywhere, excluding template-scoped) and inline matching ones into each shadow template ahead of the component's own styles, respecting `true | false | string | string[]` (`'document'` token skipped) (ref: WORKLOG#2026-06-03)
- [x] T-004 Emit light-DOM component styles in SSR output — `renderComponent` computed `_styles` but the light-DOM branch dropped them; now inlined ahead of the markup (ref: WORKLOG#2026-06-03)
