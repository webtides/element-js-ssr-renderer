# Introduction

Server-side rendering for [`@webtides/element-js`](https://github.com/webtides/element-js) custom elements.

Give it an HTML string (typically the rendered output of Astro / SvelteKit / Nuxt) and it recursively
pre-renders every custom element it can resolve **in place** — eagerly from a static catalog, or
lazily so only the components actually on the page ever load (see
[Resolving components](/resolving-components)):

- **Shadow-DOM components** are emitted as [Declarative Shadow DOM](https://web.dev/articles/declarative-shadow-dom)
  (`<template shadowrootmode="open">`) with the global styles they adopt — honoring element-js'
  [`adoptGlobalStyles`](https://github.com/webtides/element-js) option — plus their own styles inlined.
- **Light-DOM components** have their template rendered directly into the element.
- **Behavioral wrappers** (components with an empty `template()`, e.g. `accordion-group`) and unresolved
  tags are left untouched.

Both output paths carry element-js' `<!--template-part-->` hydration markers, so on the client the elements
**hydrate** (update in place) rather than re-render from scratch — no flash of empty/unstyled content.

## How it works

element-js does the heavy lifting: `` html`…` `` produces a `TemplateResult` whose `.toString()` is a complete,
DOM-free SSR renderer, and `TemplateResult.renderInto()` detects pre-rendered markup and hydrates it. This
package is the glue: it parses your HTML, and for each registered tag it constructs the component, maps
attributes to properties, calls `template().toString()`, and splices the result back in — wrapping shadow
components in Declarative Shadow DOM and inlining their styles.

Shadow components also adopt the document's global stylesheets (every `<style>` / `<link rel="stylesheet">`
in the input, wherever it sits) into their shadow root, mirroring element-js' `adoptGlobalStyles` option:
`true` (default) adopts all, `false` adopts none, and a selector / array of selectors adopts only matching
sources. On top of that, theme tokens (`--el-*` custom properties on `:root`) inherit **through** the shadow
boundary.

For a deeper look at the render paths and how hydration markers work, see
[Rendering & hydration](/concepts/); for the style rules, see [Style handling](/concepts/styles).

## Next steps

- [Installation](/guide/installation) — install the package and the import-order rule.
- [Quick start](/guide/quick-start) — render your first component.
- [Resolving components](/resolving-components) — eager vs. lazy loading, multiple sources.
