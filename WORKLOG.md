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
