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

- [ ] T-001 Fix `SpreadAttributesDirective.stringify()` in `@webtides/element-js` to skip `undefined`/`null`/`NaN` like its `update()` does (SSR currently leaks `name='undefined'`)
  - [ ] T-001.1 Mirror the `update()` guard in `stringify()` (directives.js)
  - [ ] T-001.2 Add a test covering the SSR omit-attribute case
- [ ] T-002 Stand up a runnable Astro example wired to the `elementSSR` middleware, verifying end-to-end Declarative Shadow DOM hydration in a browser
- [ ] T-003 Add `all.server.js` to `@webtides/element-library` — a `{ tag: Class }` registry derived from `custom-elements.json` so consumers don't hand-build the registry
- [ ] T-007 Implement server→client state transport (element-js `serializeState` / `ejs:key`) so stateful components hydrate with their server-rendered state instead of re-deriving from property defaults
  - [ ] T-007.1 Assign each rendered component a **stable, deterministic** `ejs:key` and stamp it on the host element — must match between server output and client hydration, so it can't use element-js' `randomUUID()` (derive from tag + document position/order)
  - [ ] T-007.2 Collect each component's `serializeState()` output into one merged state map and emit it as a single `<script type="ejs/json">…</script>` in the body — the exact location/format element-js reads on the client (avoid element-js' DOM-based helpers, which need `document.scripts`/`createElement`/`body`; build the JSON directly)
  - [ ] T-007.3 Handle `Store` references — serialize stores as `Store/<uuid>` with their state under that uuid, and de-duplicate stores shared across components, mirroring element-js' replacer/reviver (SerializeStateHelper.js)
  - [ ] T-007.4 Add an opt-in surface (e.g. a `serializeState` option on `renderToString` / `elementSSR`) that sets `globalThis.elementJsConfig.serializeState`; document the import-order/SSR caveats
  - [ ] T-007.5 Tests: round-trip a component with non-default state — assert `ejs:key` on the host, presence/shape of the `ejs/json` script, and that restored values match the server state (incl. a shared-`Store` case)

## Done

<!-- Move completed top-level tasks here when convenient. -->

- [x] T-006 De-duplicate emitted `<style>` blocks — light-DOM component styles now emit once per `TAGNAME{index}` id across the document (id'd like element-js so the client de-dupes on hydration); adopted global styles are de-duped within each shadow root. Cross-instance shadow duplication is inherent to shadow isolation and left as-is. (ref: WORKLOG#2026-06-03)

- [x] T-005 Honor element-js' `adoptGlobalStyles` option — collect the input document's global `<style>`/`<link rel="stylesheet">` (anywhere, excluding template-scoped) and inline matching ones into each shadow template ahead of the component's own styles, respecting `true | false | string | string[]` (`'document'` token skipped) (ref: WORKLOG#2026-06-03)
- [x] T-004 Emit light-DOM component styles in SSR output — `renderComponent` computed `_styles` but the light-DOM branch dropped them; now inlined ahead of the markup (ref: WORKLOG#2026-06-03)
