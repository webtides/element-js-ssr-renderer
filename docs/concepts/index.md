# Rendering & hydration

This page explains what the renderer does to each custom element it finds, and how the output hydrates on
the client. For the style-specific rules, see [Style handling](/concepts/styles).

## The render loop

The renderer parses your HTML into a tree and walks it. For every element whose tag resolves to an
element-js class, it builds an instance **without running the lifecycle** — it constructs the component,
merges the parsed HTML attributes over the component's property defaults, then calls `template()` and
stringifies the resulting `TemplateResult`. The rendered markup is spliced back into the tree in place.
Walking is recursive, so custom elements nested in slotted content **and** in a component's own generated
template are rendered too.

Attribute → property mapping mirrors element-js: dashed attribute names become camelCase properties, values
are coerced the way element-js coerces them, and a bare boolean attribute (`<el-button outline>`) becomes
`true`.

## Three outcomes per element

| The element is…                               | What happens                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A **shadow-DOM** component                    | Rendered into `<template shadowrootmode="open">`; authored children stay in light DOM after it as slot content |
| A **light-DOM** component                     | Its rendered template replaces the element's children                                                          |
| A **behavioral wrapper** (empty `template()`) | Left untouched, so its authored light-DOM children survive                                                     |
| An **unresolved** custom-element tag          | Left untouched (and reported — see [unresolved tags](/resolving-components#unresolved-tags))                   |

A "behavioral wrapper" is a component that inherits the empty ` html` ``template (e.g.`accordion-group`,
`tab-group`) — it has no markup of its own and only attaches behavior on the client, so the server leaves its
children alone.

### Shadow components

For a shadow component the renderer emits a Declarative Shadow DOM template:

```html
<el-card>
  <template shadowrootmode="open">
    <!-- adopted global styles, then the component's own styles, then its markup -->
  </template>
  <!-- authored slot content stays here, in light DOM -->
</el-card>
```

Adopted global styles come first (matching element-js' order), then the component's own styles, then the
template markup. CSS custom properties (theme tokens) inherit **through** the shadow boundary, so
`--el-*` variables defined on `:root` still apply inside. See [Style handling](/concepts/styles) for which
global styles get adopted.

### Light-DOM components

A light-DOM component's rendered template (with its own styles inlined ahead of it) simply replaces the
element's children. There's no shadow root, so its styles are global; the renderer emits each one once per id
across the document (element-js de-dupes them by id on hydration anyway).

## How hydration works

element-js' `` html`…` `` is a dual-purpose template: `.toString()` is a complete, DOM-free SSR renderer, and
`TemplateResult.renderInto()` **detects pre-rendered markup and hydrates it** rather than rebuilding it. The
bridge between the two is a set of `<!--template-part-->` comment markers the SSR output carries.

So when the matching `…/define` runs on the client and the element upgrades, element-js finds those markers,
recognizes the existing DOM as its own output, and **updates it in place** — binding event listeners and
reactive state without throwing away and re-creating the markup. The result: no flash of empty or unstyled
content between server paint and client hydration.

::: info No lifecycle on the server
Only `template()` runs on the server, purely from properties. `connected()`, watchers, effects, and DOM
measurement do not. A component whose initial markup depends on runtime state beyond its declared properties
renders that state's default until the client hydrates. See [Limitations](/reference/limitations).
:::

## State transport

By default the client hydrates the server-rendered _markup_, but each component still derives its _state_ from
its property defaults on upgrade. That's fine when the markup already reflects the state — but if the server
rendered a component with non-default values (a seeded counter, a pre-filled form, a shared store), you want the
client to start from **those** values, not the defaults.

Opt in with `serializeState: true` (on `renderToString`, or the framework adapters):

```js
await renderToString(html, { resolve, serializeState: true });
```

With it enabled, the renderer mirrors element-js' own serialization format so the client restores state on
upgrade:

- Every rendered component is stamped with a deterministic **`ejs:key`** attribute (derived from its tag and
  document order — stable across renders, so it diffs and caches cleanly).
- Each component's state — what element-js' `serializeState()` returns, i.e. its property values — is collected
  into a single `<script type="ejs/json">` appended to the document body.
- [`Store`](https://github.com/webtides/element-js) values are emitted as a `Store/<key>` reference, with the
  store's own state stored once under that key. A store shared across components is therefore serialized **once**
  and every referencing component points at it.

On the client, element-js reads the `ejs:key` on connect, looks its entry up in the `ejs/json` script, and
calls `restoreState()` — hydrating with the server's values.

::: warning Two caveats
**Import order.** The DOM shim must be imported before any component module (the same rule as SSR generally) —
the adapters' docs show where. State transport additionally needs element-js' own `serializeState` config
enabled **on the client**, so set `globalThis.elementJsConfig = { serializeState: true }` before your
components `define`.

**Server helpers stay inert.** element-js' `SerializeStateHelper` reaches for `document.scripts`/`createElement`/
`body`, which don't meaningfully exist on the server. The renderer never routes through it — it builds the
`ejs/json` script directly — and the DOM shim stubs those just enough that a component touching them during
construction (e.g. a `Store`) won't throw.
:::
