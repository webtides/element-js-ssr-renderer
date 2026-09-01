# Progressive hydration

With SSR in place, most components are visually and functionally **complete** after the server render —
their JS never needs to load. Only the genuinely interactive ones (accordions, sliders, modals, forms) need
client code, and few of those need it _immediately_. Progressive hydration is the package's answer, in two
halves:

1. **A per-component `loading` declaration**, stamped by the renderer as an `ejs-loading` attribute on each
   host element in the SSR output.
2. **A client autoloader** (`…/autoloader`) that discovers undefined custom elements and acts on the
   attribute — never loading `server` components, loading `client` ones immediately, and deferring
   `hydrate:` ones until their trigger fires.

The vocabulary follows the community
[Progressive Hydration Protocol proposal](https://github.com/webcomponents-cg/community-protocols/issues/30)
(`server` | `client` | `hydrate:<trigger>`), so the declarations stay compatible if it ever standardizes.

## Loading states

| Value                    | Meaning                                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client` (default)       | Load and define immediately — today's behavior for every component.                                                                                                         |
| `server`                 | The SSR output **is** the output: ship no JS for this tag. For purely presentational components.                                                                            |
| `hydrate:onIdle`         | Load when the main thread is idle (`requestIdleCallback`; timeout fallback where unsupported).                                                                              |
| `hydrate:onVisible`      | Load when an instance scrolls into view (one shared `IntersectionObserver`).                                                                                                |
| `hydrate:onDelay(ms)`    | Load after a timeout, e.g. `hydrate:onDelay(2000)`.                                                                                                                         |
| `hydrate:onMedia(query)` | Load when the media query matches (now or later), e.g. `hydrate:onMedia((min-width: 1024px))`. Pass a full, valid media query — an invalid one warns and loads immediately. |

Deliberately out of scope for now: `&&` / `||` trigger combinators and `hydrate:onInteraction` with event
replay (capture/redispatch is the hairy part; the four base triggers cover the practical cases).

## Declaring a loading strategy

Three places, most specific wins — **HTML attribute > `ComponentConfig` > `static loading`** (no
declaration = `client`):

**On the component class** — readable without instantiation:

```js
import { TemplateElement, html } from "@webtides/element-js";

export default class ImageGallery extends TemplateElement {
  static loading = "hydrate:onVisible";
  // …
}
```

**From outside, per catalog entry** — a [`ComponentConfig`](/api/#componentconfig)'s `loading` field, for
components you don't own (the same philosophy as `exclude` and `adoptGlobalStyles`):

```js
const catalog = {
  "el-accordion-group": {
    component: () => import("./el-accordion-group.js"),
    loading: "hydrate:onVisible",
  },
  "el-footer-nav": { component: ElFooterNav, loading: "server" },
};
```

**Per element, in the authored HTML** — an `ejs-loading` attribute in the source markup always wins, so one
above-the-fold instance can opt out of its class's deferral:

```html
<image-gallery ejs-loading="client">…</image-gallery>
```

### What the renderer does

Exactly one thing: when a rendered component carries a declaration, the host element is stamped with
`ejs-loading="<value>"` — unless the source markup already has the attribute. That's it. The attribute is
**advisory**: triggers are client territory, and consumers with fallback modes may override or ignore it
(see the `eager` gate below). No declaration → no attribute. This adds no render option — the declaration
travels with the component through `resolve`.

An invalid declared value (not `server` / `client` / `hydrate:<anything>`) is isolated like a
[resolve failure](/api/#onerror): the tag's elements are left untouched and the error reports through
`onError`. The trigger itself is _not_ validated server-side — the autoloader owns trigger vocabulary and
fails open on unknown ones.

## The autoloader

The client mirror of `resolve`: [`autoload`](/api/#autoload-options) takes the **same catalog** the server
uses — the generated catalog file, raw `import.meta.glob()` output, a hand-written map — so the tag→module
knowledge lives once.

```js
// client entry
import { autoload } from "@webtides/element-js-ssr-renderer/autoloader";

autoload({
  resolve: import.meta.glob("./components/*.js"),
  // Fallback gate: a page rendered WITHOUT SSR carries no ejs-loading attributes
  // and nothing is pre-rendered — everything must load immediately.
  eager: !document.documentElement.hasAttribute("data-ssr"),
});
```

It discovers the catalog's tags on the page (initial scan + `MutationObserver` for later-inserted markup),
reads each element's `ejs-loading` (missing = `client`), and loads each tag at most once — the first trigger
of any instance wins, and `customElements.define` upgrades all instances at once. Loading is all it does:
the elements already stand fully rendered as Declarative Shadow DOM, so element-js hydrates them on upgrade
by itself.

### The `eager` gate

`ejs-loading` describes what a **server-rendered** page needs. A page rendered client-side — your CMS's
fallback mode when the SSR service is down, a static preview — needs _everything_, immediately, including
`server`-declared components. The autoloader can't know which case it's in, so the signal stays yours:
stamp a page-level marker when SSR actually ran, and pass its absence as `eager`.

The marker is one [`post` transform](/api/#transforms) away on the server:

```js
transforms: {
  post: (html, context) =>
    context.tags.resolved.length > 0 ? html.replace("<html", "<html data-ssr") : html,
},
```

Neither the marker's name (`data-ssr` is a recipe, on a standard element where `data-*` is the correct
convention) nor the gate logic is baked into the autoloader — `eager` is just a boolean you compute.

## Typed declarations

The autoloader subpath exports a `Loading` type (template-literal typed), so `static loading` gets code
completion and typo checking in JS via JSDoc:

```js
export default class ImageGallery extends TemplateElement {
  /** @type {import("@webtides/element-js-ssr-renderer/autoloader").Loading} */
  static loading = "hydrate:onVisible";
}
```

The fixed values complete; the parameterized ones (`hydrate:onDelay(…)`, `hydrate:onMedia(…)`) validate
their shape.

## Interplay with other features

- **`serializeState`** — a `hydrate:` component upgrades late but hydrates from the DSD markup and its
  `ejs:key` state like any other; provider-seeded properties on hydrating components still need
  [`serializeState: true`](/api/#properties).
- **`exclude`** — `exclude` is the _server-side_ opt-out (never import/render on the server);
  `loading: 'server'` is the _client-side_ opt-out (never load in the browser). A purely decorative
  component wants `loading: 'server'`; a client-only overlay wants `exclude`.
- **Errors** — a component whose SSR render failed still gets its declared attribute stamped: its JS loads
  per declaration and the element client-renders on upgrade, which is exactly the fallback story.
