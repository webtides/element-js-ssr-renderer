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

## Done

<!-- Move completed top-level tasks here when convenient. -->
