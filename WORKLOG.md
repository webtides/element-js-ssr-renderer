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

## 2026-06-10 — Examples consume element-library's `./catalog` (T-003.2.2 → T-003 done)

**Tasks:** T-003, T-003.2, T-003.2.2

- Converted all three examples' SSR resolution to the wrapper-free, library-ships-its-own-catalog pattern: deleted the eager `import Button/Notification` + `{ "el-button": Button, … }` blocks and replaced them with `import catalog from "@webtides/element-library/catalog"` → `resolve: [catalog, <own components>]`. Astro/SvelteKit use the static `import` (Vite `ssr.noExternal` preserves order); Nuxt uses a dynamic `import()` inside the Nitro plugin (eval-order), keeping its generated local catalog for its own `./elements`. Bumped each example's `@webtides/element-library` to `^0.2.0`.
- **Verified end-to-end** — installed 0.2.0, built, and SSR-served each example, curling the output: Astro 9 / SvelteKit 9 / Nuxt 8 DSD templates, with `el-button` (from the library catalog) and `x-counter` (local) both rendering. The Nuxt/Nitro pass confirms rollup traces the catalog's package-internal `() => import("./src/components/…")` specifiers.
- Docs: new "A library can ship its own catalog" section + "Who owns which source" responsibility-split table in `docs/resolving-components.md`; reframed the generator's `--manifest` example as the path for libraries that _don't_ ship a catalog; updated `examples/README.md`. Closes **T-003** (consume element-library under SSR with no hand-built registry / no codegen).

## 2026-06-10 — element-library `0.2.0` ships `./catalog` (T-003.2.1 done; T-003.2.2 unblocked)

**Tasks:** T-003.2, T-003.2.1

- Completed T-003.2.1 in the **element-library** repo (commit `cddffe1`): `prepack` now runs `analyze → build:types → gen:catalog` so `catalog.js` regenerates on every release; added `test/catalog.smoke.mjs` — a plain-Node SSR smoke test (kept out of the browser-mode Playwright suite) that imports the renderer's `dom-shim` + `renderToString`, passes the imported catalog straight to `resolve`, and asserts `el-button` → DSD; exposed as `test:catalog` and wired into both CI workflows. Added `@webtides/element-js-ssr-renderer ^0.1.0` devDep.
- **Released `@webtides/element-library@0.2.0`** (minor — new `./catalog` public export): merged `feat/ssr-catalog-export` → `main` (fast-forward), bumped version, finalized CHANGELOG (`## [0.2.0]`), tagged `v0.2.0`, pushed → OIDC publish workflow. First run red on a **flaky** `scroll-to-top` browser test (`expected 661 to be 0`, unrelated to the catalog); a `--failed` re-run went green → published tokenless + GitHub Release created. Verified the published tarball ships `catalog.js` and `exports["./catalog"]` resolves.
- **Unblocks T-003.2.2** (this repo): the examples can now consume `import catalog from "@webtides/element-library/catalog"` and drop their eager element-library import blocks.

## 2026-06-10 — Published `@webtides/element-js-ssr-renderer@0.1.0` to npm (follow-up)

**Tasks:** T-003.2.1

- First release is **live on npm** (`0.1.0`, public). Done as a **manual bootstrap publish** (`npm login` + `npm publish --otp`), because npm trusted publishing can't attach to a package that doesn't exist yet — the package had to exist before the OIDC trusted-publisher could be configured. Corrects the prior entry's assumption that the first release would go via tag push.
- Benign publish-time warnings (`bin … removed`, `repository` string→object) confirmed cosmetic: the tarball's `package.json` retains the correct `bin`, and the CLI runs — so `npx @webtides/element-js-ssr-renderer catalog …` (element-library's `gen:catalog`) works.
- **Next:** configure the npmjs.com trusted publisher now that the package exists → all future releases are tokenless OIDC via `v*` tag push. **Do not** push a `v0.1.0` tag (the workflow would try to republish 0.1.0 and fail on the duplicate version) — the first tag-driven release should be the next version bump. Unblocks T-003.2.1 (element-library `./catalog` `prepack` + smoke-test).

## 2026-06-10 — npm publish setup: OIDC trusted publishing (unblocks T-003.2.1)

**Tasks:** T-003.2.1

- Prepared the package for its first npm release (`0.0.1` → `0.1.0`): added `publishConfig.access: "public"` (the `@webtides` scope defaults to restricted), `prepublishOnly: "npm test"` as a red-suite guard, and an MIT `LICENSE` file (now shipped in the tarball — 14 files). `npm pack --dry-run` clean.
- Added `.github/workflows/npm-publish.yml` — tag-triggered (`v*`) **OIDC trusted publishing** (no token, no 2FA), mirroring element-library's workflow: `test` job (`npm ci` + `npm test`, no Playwright since this suite is plain vitest) → `publish` job (`id-token: write`, `npm install -g npm@latest` for npm ≥ 11.5.1, `npm publish --access public`) → `github-release` job (`--generate-notes`, so no CHANGELOG dependency). Added `.nvmrc` (`22`) to match the org.
- **Still manual:** configure the trusted publisher on npmjs.com (repo `webtides/element-js-ssr-renderer`, workflow `npm-publish.yml`), then push tag `v0.1.0`. Publishing unblocks element-library's `./catalog` `prepack` + smoke-test (T-003.2.1) and the example conversions (T-003.2.2).

## 2026-06-08 — Plain Vite adapter `./vite` + example (T-015.8)

**Tasks:** T-015.8

- Added `src/adapters/vite.js` (`./vite` export): a Vite plugin that hooks the **stable `transformIndexHtml`** hook to pre-render element-js custom elements **at build (and dev) time** — the server-less, static-HTML/MPA bucket (vs. the per-request meta-framework adapters). `elementSSR(options)` returns `{ name, transformIndexHtml: { order: "pre", handler } }`; the handler runs the HTML through `renderToString`. Same `resolve`/`onUnresolved`/`serializeState` options as every other adapter. Deliberately **not** built on Vite's experimental Environment API. `order: "pre"` so we only ever parse/serialize the authored document and Vite layers its injected tags on top of our output.
- `examples/vite/` (new): a plain-Vite MPA. Elements authored as markup in `index.html`; client hydration via `src/client.js` (`<script type="module">`); local components resolved through a **generated** static Catalog (`src/catalog.js` via `gen:catalog` + `predev`/`prebuild`), element-library via an eager `{ tag: Class }` map. Reuses the shared `x-counter`/`x-greeting` components for parity with the other examples. The generated catalog is committed (mirrors the Nuxt example).
- **Two documented caveats** (the whole reason this adapter is its own thing): (1) only **authored markup** is pre-rendered — a JS-mounted SPA has nothing in the document to transform, so the example is MPA-style; (2) **no `import.meta.glob` in `vite.config.js`** (esbuild loads the config, doesn't transform the sugar) → use the generated Catalog, which pairs with the plugin precisely for this.
- `test/vite.test.js` (4): plugin shape, static-catalog render → DSD, lazy load-only-what's-present, no-custom-elements document left structurally intact. Verified the example catalog renders end-to-end through the plugin (DSD counter, light-DOM greeting, attribute-seeded props). Suite green at 62.
- Docs: `docs/frameworks/vite.md` + sidebar entry; `examples/README.md` framework/adapter tables + a note that this one is build-time, not request-time. Added `./vite` to package `exports`.

## 2026-06-05 — Node/Connect adapter `./node` (T-015.1, partial — adapter + test)

**Tasks:** T-015.1

- Added `src/adapters/node.js` (`./node` export): a Connect-style `(req, res, next)` middleware for plain Node servers (Express/Connect/raw `http`) — the widest-reach adapter, no streaming concern. Buffers the response (overriding `res.write`/`res.end`), transforms `text/html` once via `renderToString`, and fixes `Content-Length`. Non-HTML passes through; if headers were already flushed or the transform throws, the original body is sent unchanged (graceful degradation). Takes the same `resolve`/`onUnresolved`/`serializeState` options as the other adapters. Unrelated to the removed `./resolve/node` filesystem resolver (T-017) — this is HTTP plumbing, not tag resolution; the name collision is only the word "node".
- `test/node.test.js` (6): HTML render, lazy load-only-what's-present, multi-`write()` assembly, Content-Length update, non-HTML pass-through, headers-already-flushed pass-through. Suite green at 58.
- **Still open for T-015.1:** the runnable Express example (`examples/express/`) + docs (`frameworks/node.md`, README/API tables), per the "adapter lands with its example" rule. Deferred.

## 2026-06-05 — element-library `./catalog` scaffolding (T-003.2, cross-repo, parked)

**Tasks:** T-003.2, T-003.2.1

- **Cross-repo:** prepared in the sibling `@webtides/element-library` checkout, on branch `feat/ssr-catalog-export` (commit `cfec47e`) — **parked, not merged/published**. Logged here because the parent T-003 lives in this repo.
- Prepared the **`@webtides/element-library/catalog`** export: `exports` + `files` add `./catalog` → `catalog.js`; a `gen:catalog` script generates it (`element-js-ssr-renderer catalog --manifest custom-elements.json` via `npx`, then `prettier --write` so output matches element-library's 4-space/single-quote house style). Documented `./catalog` vs `./all` (server/lazy/value vs client/eager/side-effect) in element-library's CLAUDE.md + CHANGELOG. The recipe was **verified against the real CEM** — a generated catalog resolves `el-button` → DSD through `renderToString`.
- **`catalog.js` is gitignored, not committed** — matching how element-library already handles `custom-elements.json`/`web-types.json` (generated by `analyze`/`prepack`, shipped via `files`, never in git). _(An earlier commit in this session wrongly committed the generated file; corrected here.)_
- **Why it's parked (T-003.2.1):** the `prepack` regen hook + an automated smoke test are **blocked on publishing this renderer to npm**. element-library's release/test workflow runs `npm ci` in an isolated checkout, so a `file:../element-js-ssr-renderer` devDep — or an `npx` fetch of an unpublished package — breaks the pipeline; and its `npm test` is browser-mode (Playwright/Chromium), so a Node SSR smoke test can't join that suite. With `catalog.js` gitignored and prepack unwired, a clean checkout has no `catalog.js`, so the export can't fully land until the renderer is on npm.
- **Next:** publish the renderer → wire `prepack` + smoke test in element-library → then T-003.2.2 here (convert examples to `resolve: [catalog, import.meta.glob(...)]` once a published element-library exposes `./catalog`).

## 2026-06-05 — Resolution-surface redesign shipped: one `Catalog` type, no wrapper (T-018)

**Tasks:** T-018, T-018.1, T-018.2, T-018.3, T-018.4, T-018.5

- **Collapsed the resolution vocabulary to a single named type, `Catalog`** = `Record<string, CustomElementConstructor | (() => Promise<unknown>)>`. Retired `Source` / `ImporterMap` / `ResolveFn` (the type) / `Registry` from the JSDoc surface; the eager value is the platform's `CustomElementConstructor`, the lazy value is Vite's exact `() => Promise<unknown>` thunk, and the `(tag) => …` resolver-function form stays accepted by `resolve` but is described inline, not named. (T-018.1)
- **Auto-detecting normalization (`catalogToResolver` + `isElementClass`)** — the renderer now inspects each `Catalog` entry instead of demanding a wrapper: **class vs loader** via `value.prototype instanceof HTMLElement` (eager class extends HTMLElement through the dom-shim; a `() => import()` loader has no such prototype, guarded so it stays `false` if the shim isn't installed), **tag-key vs path-key** via `/` presence (path keys → tag by basename; loader modules get `.default` picked). Net: a hand-written `Catalog` **and** raw `import.meta.glob("./x/*.js")` both drop straight into `resolve`. (T-018.2)
- **Deleted `lazy()`** (no alias; pre-release) and replaced it with `glob(map, { pathToTag, pick })` — a thin **optional** escape hatch for only what auto-detection can't infer (filename ≠ tag, non-`default` export). It returns a resolver function, itself a valid `resolve` value. `index.js` now exports `{ renderToString, glob }`. (T-018.3)
- **Renamed the CLI + generator to match the package.** Bin `element-ssr` → `element-js-ssr-renderer` with a `catalog` subcommand (was `gen`), emitting `catalog.js`. `src/generate-lazy-map.js` → `src/generate-catalog.js`; `generateLazyMap` → `buildCatalog`, `entriesFrom{Directory,Manifest}` → `catalogEntriesFrom{Directory,Manifest}`, `renderLazyMapModule` → `renderCatalogModule`. The generated module is now a `Catalog` consumed with no wrapper; `package.json` `bin`/`exports` updated (`./generate` → `generate-catalog.js`). (T-018.4)
- **Propagated everywhere:** all three adapters' JSDoc, the astro/nuxt/sveltekit examples (dropped every `lazy()`; Nuxt regen'd `server/components.generated.js` → `server/catalog.js`, `gen:components` → `gen:catalog`), the test suite (`test/generate-lazy-map.test.js` → `test/generate-catalog.test.js`; added an "auto-detects eager + lazy in one catalog" test), and all docs (resolving-components rewritten around the single type, API reference, framework pages, installation, README, example READMEs). Breaking; pre-release (0.0.1). Suite green at 52; docs build clean. **Unblocks T-003.2** (element-library can now ship `./catalog`). (T-018.5)

## 2026-06-05 — Follow-up: resolution-surface redesign supersedes the naming tweak (T-018)

**Tasks:** T-018, T-003.2, T-003.3

- Refines the entry below. The `ImporterMap`→`LazyElementMap` rename (old T-003.3) grew, through design discussion, into a full resolution-surface redesign promoted to top-level **T-018**; T-003.3 retired as superseded.
- **Vocabulary collapsed to one named type.** Vite names none of this data (`import.meta.glob` returns an anonymous `Record<string, () => Promise<unknown>>`), so we align by not over-naming: a single **`Catalog`** = `Record<string, CustomElementConstructor | (() => Promise<unknown>)>`. The eager class reuses the platform's `CustomElementConstructor` (not a coined `Definition`); the lazy value is Vite's inline thunk (so `import.meta.glob()` output is directly assignable); the `(tag) => …` function form stays accepted but unnamed. Retires `Source` / `ImporterMap` / `ResolveFn` / `Registry`.
  - Name path: rejected `registry` (like `CustomElementRegistry`, it implies elements _already defined_ — ours is a list still to be defined), `./elements`/`loaders`/`modules` (collide with element-library's `./all`, or read as a list when the value is an object, or mis-describe eager classes). **`catalog`** — singular collective, neutral about eager-vs-lazy, honest that nothing's registered yet.
- **`lazy()` is being removed**, not renamed. The renderer will **auto-detect** each `Catalog` entry: class-vs-loader by `prototype instanceof HTMLElement`, tag-key-vs-path-key by `/` presence (→ basename). So a plain `Catalog` and raw `import.meta.glob()` both go straight into `resolve` with no wrapper. A thin optional `glob(map, { pathToTag, pick })` remains only for filename≠tag / non-default exports.
- **Library export** is `@webtides/element-library/catalog` (was `./ssr`), **CLI** is `element-js-ssr-renderer catalog` — bin named for the package (not a truncation like `element-ssr`/`element-registry` that matches nothing), with `catalog` as the subcommand. T-003.2 rewritten to this vocabulary and marked `blocked by: T-018`.

## 2026-06-05 — Decided the canonical third-party-library SSR path: the library ships its own map (T-003.2, T-003.3)

**Tasks:** T-003.2, T-003.3

- **Decision:** the recommended way to consume a CEM-shipping component library (element-library) under SSR is for **the library to ship its own lazy element map** (`./ssr`), not for the consumer to codegen or hand-import. Rationale: a map that ships _inside_ the package uses package-internal relative specifiers (`() => import("./src/components/button/button.js")`) that resolve in any consumer's bundle regardless of node_modules layout — bundler-traceable on every target (Node/Nitro/edge/webpack/Vite), zero consumer codegen, one-line consume (`lazy(elements)`). The renderer can't produce this itself (no module graph or public-export knowledge at runtime); only the package can. The renderer's contribution is already shipped — `element-ssr gen --manifest` (T-013) generates exactly this when run at the package root. Settles the "this feels manual" thread on the examples' eager `import Button/Notification` blocks: they're manual only because element-library hasn't run the generator on itself yet.
- Rewrote **T-003.2** from "optional bundled/edge fallback" → the canonical path, with a concrete element-library recipe (`gen:ssr` + `prepack`, `./ssr` export) and two sub-tasks (T-003.2.1 release wiring; T-003.2.2 convert examples + document the responsibility split once published).
- Added **T-003.3** (renderer-side naming precursor): rename `ImporterMap` → `LazyElementMap` (the old name collides with the browser **import map** standard, an unrelated specifier→URL mechanism) and name the thunk type `ElementLoader`. Pre-release, no deprecation alias. Note: the `tag → () => import()` shape is not invented here — it's the standard dynamic-import thunk idiom (same shape as `import.meta.glob`), over CEM data, with a thin tag-keyed convention.

## 2026-06-04 — Collapse resolution API: delete runtime resolvers, single async `renderToString` (T-017)

**Tasks:** T-017

- **Deleted the runtime Node resolvers** `fromDirectory` / `fromManifest` and the entire `./resolve/node` entry point (`src/resolve/node.js`, `test/resolve-node.test.js`, the package export). Rationale: in the bundled-JS-SSR world this package targets, runtime filesystem resolution is almost never the right tool — bundler users get `lazy(import.meta.glob(...))` for free, edge/bundled targets need the static `element-ssr gen` map anyway, and `fromManifest` was strictly dominated by `gen --manifest` (a CEM is a build artifact, so "runtime" bought nothing). The genuine niche (bundler-less Node server discovering components at runtime) didn't justify a maintained entry point carrying a path-traversal guard, `file:`-URL handling, and "never bundle for the edge" caveats. Producers drop from ~7 to 2: `lazy(import.meta.glob())` and `lazy(generatedMap)`.
- **Collapsed `renderToString` + `renderToStringAsync` into one async `renderToString`**, and **dropped the separate `registry` option** — a `{ tag: Class }` map is already a valid `Source`, so it's passed via `resolve` like everything else. The whole surface is now: one `await renderToString(html, { resolve, onUnresolved, serializeState })`, where `resolve` is a `Source | Source[]` (static map · `lazy()` · `ResolveFn` · array, later-wins). All four adapters already ran on the async path; their option bags lose `registry` in lockstep. Breaking, done now while pre-release (0.0.1) keeps it cheap.
- Updated all three example apps (`registry: {...}, resolve: lazy(...)` → `resolve: [{...}, lazy(...)]`), the test suite (sync `render` helper → async + `resolve`; merged the two render describes), and all docs (resolving-components, API reference, quick-start, installation, concepts, the three framework pages, README, example READMEs). Suite green at 51 (was 59 — the 8 resolve-node tests removed).

## 2026-06-04 — T-014 fixed upstream in element-library 0.1.2; full Nuxt build green

**Tasks:** T-014

- `@webtides/element-library@0.1.2` ships the previously-missing runtime `src/utils/` (`npm pack` confirms `package/src/utils/transitions.js` + `body-scroll.js`), closing the packaging omission that blocked `el-notification`. Bumped the dependency to `^0.1.2` in the root and `examples/nuxt` `package.json`s and reinstalled.
- **Unblocked the full Nuxt build:** `npm run build` in `examples/nuxt` now succeeds, and the built server (`node .output/server/index.mjs`) SSRs the whole page — 9 DSD `<template shadowrootmode>` blocks, and all components render incl. the previously-failing `el-notification` (plus 5×`el-button`, 2×`x-counter`, light-DOM `x-greeting`). T-014 done.

## 2026-06-04 — Verified T-014 still unfixed in element-library 0.1.1

**Tasks:** T-014

- `@webtides/element-library@0.1.1` released (fixes the patch-package postinstall gotcha) but does **not** fix the Nuxt blocker. Inspected the 0.1.1 tarball (`npm pack @webtides/element-library@0.1.1`): `src/utils/` appears only as TypeScript declarations under `types/` (`types/src/utils/transitions.d.ts`, `body-scroll.d.ts`) — no runtime `.js` anywhere under `utils/`. So `notification.js`'s `import '../../utils/transitions.js'` still fails to resolve, and `el-notification` still can't build/import from the published package.
- Two distinct bugs: 0.1.1 closed the patch-package one; the missing-runtime-`src/utils` one (T-014) is untouched. The `.d.ts` files being emitted for those modules confirms the source exists in the repo — this is a pure `files`/packaging omission dropping the `.js`, fixable by adding `src/utils/*.js` to the published allowlist. Fix still belongs upstream.

## 2026-06-04 — Static lazy-map generator + Nuxt example conversion (T-013)

**Tasks:** T-013, T-014

- Added a build-time generator (`src/generate-lazy-map.js`, exported as `./generate`) and an `element-ssr gen` CLI (`bin/element-ssr.js`) that emit a **static, bundler-traceable** lazy importer map — the no-hand-writing answer for targets where the runtime resolvers can't reach files: bundled servers (Nuxt/Nitro, webpack) and the edge. Two input modes mirror the runtime resolvers: **directory** (flat scan, `x-counter.js` → `x-counter`, hyphen-required so helper files are skipped) and **manifest** (a CEM, handles nested layouts like element-library). Output is a default-exported `{ tag: () => import("./rel.js") }` module with specifiers relative to the output file, tags sorted, duplicate-tag guarded; `generateLazyMap` also `mkdir -p`s the output dir. Added `bin` + `./generate` to package.json and `bin/` to `files`. 8 tests (`test/generate-lazy-map.test.js`), incl. a generate→import→`lazy()`→render round-trip for both modes. Suite green at 66 (was 58).
- **Converted the Nuxt example** off its hand-written `lazy({...})` map: the plugin now imports a generated `server/components.generated.js`, produced by `npm run gen:components` (wired as `predev`/`prebuild`). This kills the last hand-written registry across all three examples (Astro/SvelteKit already use `import.meta.glob`). Verified the generated map renders both local components in isolation (`x-counter` shadow DSD seeded from attributes, `x-greeting` light-DOM `Hello, <strong>Nuxt</strong>`).
- **Reframed T-003.2:** the element-library `./ssr` map isn't ergonomic sugar — it's the _bundled/edge_ answer for element-library (static map = bundler-traceable; `fromManifest` = Node-server-only), and it's generatable with this same engine (`element-ssr gen --manifest`).
- **Found an upstream blocker (T-014):** a full `nuxt build` fails because `@webtides/element-library@0.1.0`'s npm tarball is missing `src/utils/` — `notification.js` imports `../../utils/transitions.js`, which isn't shipped, so the eagerly-registered `el-notification` can't build. Independent of this work (it's in code the example didn't change); distinct from the known `patch-package` postinstall gotcha. Fix belongs in the element-library repo.

## 2026-06-04 — `fromManifest` CEM resolver (T-003)

**Tasks:** T-003.1

- Added `fromManifest(manifest, { base, pick })` to `src/resolve/node.js`: turns a parsed `custom-elements.json` (Custom Elements Manifest) into a lazy `ResolveFn`, importing each tag's class module on demand and caching per tag. Any CEM-shipping package — notably `@webtides/element-library`, which exports its own `./custom-elements.json` — becomes an SSR source with no hand-built `{ tag: Class }` registry. Node-only (builds runtime import specifiers), so it lives beside `fromDirectory` behind `…/resolve/node`. 6 new tests (`resolve-node.test.js`), suite green at 58.
- **Reframed T-003.** The original task ("ship `all.server.js` in element-library — an eager `{ tag: Class }` map") had the wrong shape: `.server` conflates server/client with value-vs-side-effect (cf. the existing side-effecting `all.js`), and an eager "all" map loads every component up front, fighting the renderer's lazy design. Solving it renderer-side via the CEM is lazy by construction, generalizes to any manifest-shipping package, and needs no change/release in element-library. An optional library-side `./ssr` lazy map remains as T-003.2 if shorter ergonomics are wanted later.
- **`base` gotcha (documented):** the manifest's module paths are package-relative, so `base` must be the package root — but `import.meta.resolve('<pkg>/')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED` unless the package declares a `"./"` export (element-library doesn't). Anchor to an exported subpath and strip the filename instead: `new URL('.', import.meta.resolve('<pkg>/package.json'))`. `fromManifest` imports by direct file URL, bypassing the exports map, so internal `src/...` paths resolve fine. Verified end-to-end: `<el-button>` SSR'd to DSD against the real element-library manifest.

## 2026-06-04 — Consume `@webtides/element-library` from npm

**Tasks:** —

- Switched `@webtides/element-library` from a `file:` sibling link to the published `^0.1.0` (now on npm) in the root `devDependencies` and all three example `package.json`s (astro/sveltekit/nuxt); regenerated lockfiles so they resolve the registry tarball instead of the local symlink. Root test suite green at 52. Updated `examples/README.md` + each example README to drop the "sibling element-library must be present" note (renderer itself stays `file:../..`).
- **Consumer-install gotcha:** `@webtides/element-library@0.1.0` ships `"postinstall": "patch-package"` without depending on `patch-package`, so a plain `npm install` fails with `patch-package: command not found`. Installed with `--ignore-scripts` here — the only patch it carries is for `@glidejs/glide` (carousel), which SSR never touches. Upstream fix needed: add `patch-package` as a dependency (or gate the script).

## 2026-06-04 — Nuxt example + `./nuxt` adapter (T-010)

**Tasks:** T-010

- Added the `./nuxt` adapter (`src/adapters/nuxt.js`, new package export): `elementSSR(options)` returns a Nitro `render:response` handler. Nitro's hook hands a plain `{ body, headers, statusCode }` object (not a web `Response`) that you mutate in place, so the adapter wraps `response.body` in a `Response`, runs it through the shared `transformHtmlResponse` kernel (same one Astro uses), and writes the transformed HTML back — non-HTML and non-string bodies pass through untouched. `test/nuxt.test.js` mirrors `test/astro.test.js` over the Nitro response shape (registry, lazy-only-loads-what's-present, non-HTML passthrough, non-string body). Suite green at 52 (was 48).
- Added the runnable example under `examples/nuxt/` (Nuxt 3 + Nitro): a server plugin registers the hook; `app.vue` authors the same `x-counter`/`x-greeting` + `el-button`/`el-notification` markup as Astro/SvelteKit; a `.client.js` plugin loads each `define`; global tokens are injected inline via `useHead` so the renderer can adopt them into shadow roots. `nuxt.config.ts` sets `vue.compilerOptions.isCustomElement` (so Vue passes the tags through) and `nitro.externals.inline` (self-contained bundle of the `file:`-linked packages).
- **Two Nitro-specific gotchas, documented in the example + docs:** (1) Nitro reorders top-level module evaluation, so a static `import '…/dom-shim'` is _not_ guaranteed to run before element-js' `extends HTMLElement` (it didn't — `ReferenceError: HTMLElement is not defined` at startup). Fixed by loading the shim and all element-js imports via _ordered dynamic `import()`_ inside the plugin, which evaluates in call order. (2) `import.meta.glob` is Vite-only and Nuxt's server is Nitro/rollup, so the lazy source is a hand-written `lazy({ 'x-counter': () => import(...) })` map.
- Verified end-to-end: `nuxt build` + `node .output/server/index.mjs`, then curl'd the page — 8 `shadowrootmode="open"` DSD templates, 34 `template-part` hydration markers, light-DOM greeting rendered in place (`Hello, <strong>Nuxt</strong>`), adopted `--el-*` global tokens inside shadow roots, attribute-seeded counters (`Apples: 3`, `Pears: 0`). Updated `examples/README.md` (3 tables), `docs/frameworks/nuxt.md` (planned → shipped), the API reference (third `elementSSR` variant + subpath row), `docs/index.md`, `docs/reference/limitations.md` (dropped the Nuxt roadmap item), `docs/resolving-components.md` (moved Nuxt out of the Vite-glob row), and the top-level `README.md`. `docs:build` clean.

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
- Quarantined in its own module on purpose: it constructs a _runtime_ import specifier, which a bundler can't analyze — fine in a long-running Node server, but it must never enter an edge bundle, so edge builds that don't import this path never see the dynamic import. Docs point bundled/edge targets to `lazy(import.meta.glob(...))`.
- Accepts a path or `file:` URL base (URL recommended for ESM, since relative paths resolve from `cwd`); caches each found module's import; guards against path traversal in attacker-influenced tags; treats a missing file as a pass-through miss but lets errors _inside_ a found module propagate (a broken component fails loudly instead of looking unregistered).
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
