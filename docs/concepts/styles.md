# Style handling

The renderer reproduces element-js' SSR style behavior: each component's own styles are inlined, shadow
components adopt the document's global stylesheets, and emitted `<style>` blocks are de-duplicated the way
element-js de-dupes them on hydration.

## Component-own styles

A component's styles are emitted as id'd `<style>` tags, mirroring element-js' `TAGNAME{index}` identifiers
(e.g. `<style id="EL-BUTTON0">`). Reusing those exact ids means the client de-dupes against them on
hydration instead of appending duplicate copies.

- **Shadow components** — own styles go inside the shadow `<template>`, after any adopted global styles.
- **Light-DOM components** — own styles are inlined ahead of the markup, but only **once per id across the
  whole document**, since light-DOM styles are global and element-js de-dupes them by id on hydration anyway.

## Adopting global styles

Shadow components adopt the document's global stylesheets into their shadow root, mirroring element-js'
`adoptGlobalStyles` option. "Global stylesheets" means every `<style>` and `<link rel="stylesheet">` in the
**input** document, wherever it sits — not just `<head>`. Sources already scoped inside a `<template>` (an
existing shadow root) are skipped, since those aren't global.

The component's `adoptGlobalStyles` option decides which of them it adopts:

| `adoptGlobalStyles`        | Adopts                                                        |
| -------------------------- | ------------------------------------------------------------- |
| `true` (element-js default) | all global stylesheets                                        |
| `false`                    | none                                                          |
| a selector string          | only global sources whose node matches that selector          |
| an array of selectors      | only global sources matching any selector in the array        |

The special `'document'` token (element-js' runtime `adoptedStyleSheets`) has no static-HTML representation
and is ignored.

Global styles are collected **up front**, before any generated shadow templates are spliced in, so only the
input document's own stylesheets are ever adopted — never markup the renderer itself produced.

## De-duplication

| Scope                        | Behavior                                                                 |
| ---------------------------- | ------------------------------------------------------------------------ |
| Light-DOM component styles   | emitted once per `TAGNAME{index}` id across the document                 |
| Adopted global styles        | de-duped **within** each shadow root (a global may match more than once) |
| Same shadow component, many instances | each instance carries its own copy — inherent to shadow isolation, left as-is |

Cross-instance duplication of shadow styles is a property of shadow DOM (each root is isolated), so it stays;
within a single shadow root the renderer drops repeats.

## Theme tokens cross the boundary

CSS custom properties inherit through the shadow boundary, so theme tokens (`--el-*` custom properties on
`:root`) defined as global styles still apply inside every shadow component — even when a component adopts no
other global styles.
