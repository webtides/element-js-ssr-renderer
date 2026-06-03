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

## 2026-06-03 — Initialized agent workflow

**Tasks:** —

- Scaffolded `TASKS.md` and `WORKLOG.md` via `/my-init`.
- Documented workflow conventions in agent rule files.
