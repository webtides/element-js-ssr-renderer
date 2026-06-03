# @webtides/element-js-ssr-renderer

Server-side rendering for `@webtides/element-js` custom elements. See `README.md` for what the package does and how to use it.

## Agent workflow

This project uses a structured workflow that all agents must follow.

- **`TASKS.md`** is the source of truth for open and completed work. Read it before starting any non-trivial change.
  - When you take on a task, flip its status to `[~]` (in progress).
  - When done, flip it to `[x]`. Don't delete completed tasks.
  - If your work spawns sub-work, add sub-tasks (`T-001.1`, `T-001.2`) under the parent rather than creating disconnected top-level tasks.
- **`WORKLOG.md`** records significant changes, newest first. After completing a task or making a substantive edit, prepend a new entry following the format documented in that file. Skip trivia.
- Reference task IDs (`T-001`) in commit messages and worklog entries so changes can be traced.
- Both files use stable IDs — never renumber existing tasks.
