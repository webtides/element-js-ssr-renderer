# Limitations & roadmap

## Limitations & notes

- **Declarative Shadow DOM support.** All current evergreen browsers parse `<template shadowrootmode>`. For
  legacy browsers, ship a small DSD polyfill.
- **No lifecycle on the server.** Only `template()` runs (purely, from properties); `connected()`, watchers,
  effects and DOM measurement do not. Components whose initial markup depends on runtime state beyond their
  declared properties will render that state's default until the client hydrates. See
  [Rendering & hydration](/concepts/).
- **State transport.** element-js' `ejs:key` / `serializeState` plumbing can carry server state to the
  client; wiring it through this transformer is on the roadmap (see below).

## Roadmap

Tracked in the repo's
[`TASKS.md`](https://github.com/webtides/element-js-ssr-renderer/blob/main/TASKS.md). Highlights:

- **State transport** (T-007) — assign each rendered component a stable, deterministic `ejs:key`, collect
  each component's `serializeState()` output into a single `<script type="ejs/json">`, and handle shared
  `Store` references, so stateful components hydrate with their server-rendered state instead of re-deriving
  it from property defaults.
- **Async per-component property provider** (T-009) — an optional hook to supply server-fetched / async props
  for a component before its SSR render, merged ahead of HTML attributes over element defaults.
