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
