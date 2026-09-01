# Limitations & roadmap

## Limitations & notes

- **Declarative Shadow DOM support.** All current evergreen browsers parse `<template shadowrootmode>`. For
  legacy browsers, ship a small DSD polyfill.
- **No lifecycle on the server.** Only `template()` runs (from properties and the element's authored light
  DOM — `this.children`, `this.innerHTML`, `this.querySelector(…)`, `this.getAttribute(…)` etc. are backed by
  the parsed node); `connected()`, watchers, effects and DOM measurement do not. Components whose initial
  markup depends on runtime state beyond that will render that state's default until the client hydrates. See
  [Rendering & hydration](/concepts/).
- **Per-component error isolation.** A component whose constructor, `properties()`, `template()` or
  `serializeState()` throws during SSR does not fail the page: the element is left untouched (its authored
  markup survives and hydrates client-side), and the error surfaces via the `onError` hook — by default a
  `console.error`, also in production. The same holds when a tag's **resolution** fails — a lazy loader whose
  dynamic import rejects, a throwing resolver function, a broken catalog entry — and when a
  [property provider](/api/#properties) call throws or rejects (that instance stays untouched; rendering
  with partial data would bake broken output). Rethrow from your own `onError` to fail fast instead. See
  [API → onError](/api/#onerror).
- **Templates must be deterministic when a property provider is configured.** The provider fixpoint
  identifies component instances by their markup across render passes; a template that mints different
  markup every call (`Math.random()`, `Date.now()` in generated custom-element children) never converges,
  and the render fails with a clear error instead of hanging. Randomness belongs client-side (or in a
  provider, which runs once per instance).
- **The dom-shim is inert.** Browser APIs the shim provides (`matchMedia`, observers, storage, `location`,
  `requestAnimationFrame`, …) exist so real-world component modules import and construct cleanly — but they
  return neutral values: media queries never match, storage reads yield `null`, observers observe nothing
  and `requestAnimationFrame` callbacks never fire. Server output reflects those defaults; branch on real
  values in `connected()`, which runs on the client only. The one page-aware value:
  `document.documentElement.lang` follows the input's `<html lang>` during a render. See
  [Installation → What the shim provides](/guide/installation#what-the-shim-provides).
- **Light-DOM introspection is read-only.** The children/query surface hands the template parsed-HTML nodes —
  a close but not identical Element API, sufficient for the read-only introspection templates do, not for
  mutation or layout measurement.
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
