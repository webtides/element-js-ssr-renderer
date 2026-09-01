import { parse, NodeType } from "node-html-parser";
import {
  dashToCamel,
  parseAttribute,
} from "@webtides/element-js/src/util/AttributeParser";
import { Store } from "@webtides/element-js/src/util/Store";

const PARSE_OPTIONS = { comment: true };

/** Document-level stylesheets a shadow component may adopt as "global" styles. */
const GLOBAL_STYLE_SELECTOR = 'style, link[rel~="stylesheet"]';

/**
 * Coerce a raw attribute string into the value a property expects, mirroring element-js'
 * attribute parsing. A bare boolean attribute (`<el-button outline>`) becomes `true`.
 * @param {string | null} raw
 * @param {*} fallback - the property's default value, used to detect boolean props
 * @return {*}
 */
function coerceAttribute(raw, fallback) {
  if ((raw === "" || raw === null) && typeof fallback === "boolean")
    return true;
  return parseAttribute(raw);
}

/**
 * Back the instance's DOM-introspection surface with the parsed node it is being rendered for, so
 * templates (and the `properties()` / `serializeState()` calls around them) that derive markup from
 * their authored light DOM — counting slides for pagination bullets, re-slotting `innerHTML`,
 * reading attributes — see the same values on the server as during the browser's first render.
 * Without this, the instance only has the dom-shim's empty defaults and the SSR output diverges.
 *
 * The children/query surface hands out node-html-parser nodes — a close but not identical Element
 * API, sufficient for the read-only introspection templates do.
 * @param {HTMLElement} instance
 * @param {import('node-html-parser').HTMLElement} node
 */
function backWithNode(instance, node) {
  const elementChildren = () =>
    node.childNodes.filter((c) => c.nodeType === NodeType.ELEMENT_NODE);
  Object.defineProperties(instance, {
    childNodes: { get: () => node.childNodes, configurable: true },
    children: { get: () => elementChildren(), configurable: true },
    childElementCount: {
      get: () => elementChildren().length,
      configurable: true,
    },
    firstElementChild: {
      get: () => elementChildren()[0] ?? null,
      configurable: true,
    },
    lastElementChild: {
      get: () => elementChildren().at(-1) ?? null,
      configurable: true,
    },
    innerHTML: { get: () => node.innerHTML, configurable: true },
    textContent: { get: () => node.textContent, configurable: true },
  });
  instance.querySelector = (selector) => node.querySelector(selector);
  instance.querySelectorAll = (selector) => node.querySelectorAll(selector);
  // node-html-parser returns `undefined` for a missing attribute; the DOM contract is `null`.
  instance.getAttribute = (name) => node.getAttribute(name) ?? null;
  instance.hasAttribute = (name) => node.hasAttribute(name);
}

/**
 * Build an element-js instance from its class + parsed attributes and render its template to a
 * string. We bypass the element lifecycle entirely: construct, assign default properties merged
 * with the attribute values, then call `template()` and stringify the resulting `TemplateResult`.
 * @param {CustomElementConstructor} Constructor
 * @param {Object<string, string>} attributes
 * @param {boolean} [serialize] - when true, also capture the instance's `serializeState()` so the
 *   renderer can transport it to the client (T-007). Off by default so the value (and its DOM-touching
 *   side effects) are only computed when state transport is opted in.
 * @param {import('node-html-parser').HTMLElement} [node] - the parsed element this instance is
 *   rendered for; backs the instance's light-DOM introspection (see {@link backWithNode}).
 * @param {ResolvedEntry} [entry] - the resolved catalog entry; its `injected` styles and
 *   `adoptGlobalStyles` override come from a {@link ComponentConfig} (T-021).
 * @return {{ markup: string, shadow: boolean, styleEntries: {index: number, css: string}[], injectedEntries: {index: number, css: string}[], adoptGlobalStyles: boolean | string | string[], serializedState: object | undefined }}
 */
function renderComponent(Constructor, attributes, serialize, node, entry) {
  const instance = new Constructor();

  // Wire the node in before `properties()` runs: in the browser, properties are collected at
  // upgrade time with the authored children and attributes already present.
  if (node) backWithNode(instance, node);

  const defaults =
    typeof instance.properties === "function" ? instance.properties() : {};
  const props = { ...defaults };
  for (const [name, raw] of Object.entries(attributes)) {
    const propName = dashToCamel(name);
    props[propName] = coerceAttribute(raw, defaults[propName]);
  }
  Object.assign(instance, props);

  const template =
    typeof instance.template === "function" ? instance.template() : undefined;
  const markup =
    template && typeof template.toString === "function"
      ? template.toString()
      : "";

  // Keep each style as its own entry with its original index — element-js identifies appended
  // style elements as `TAGNAME{index}`, and we reuse that id for de-duplication (T-006).
  const styleEntries = (instance._styles ?? [])
    .map((css, index) => ({ index, css }))
    .filter(({ css }) => Boolean(css));

  // Capture the component's state exactly as element-js would (`serializeState()` defaults to every
  // property value), so the client can restore it instead of re-deriving from property defaults.
  const serializedState =
    serialize && typeof instance.serializeState === "function"
      ? instance.serializeState()
      : undefined;

  return {
    markup,
    shadow: Boolean(instance._options?.shadowRender),
    styleEntries,
    // Renderer-injected per-component styles from a ComponentConfig (T-021) — emitted ahead of the
    // component's own styles, under a renderer-owned id-space so element-js' own `TAGNAME{index}`
    // hydration ids stay untouched.
    injectedEntries: entry?.injected ?? [],
    // A ComponentConfig override wins over the instance option; element-js default is `true`, so
    // plain components adopt global styles.
    adoptGlobalStyles:
      entry?.adoptGlobalStyles ?? instance._options?.adoptGlobalStyles ?? true,
    serializedState,
  };
}

/**
 * Recursively register every {@link Store} reachable from `value` into `stateMap`, keyed by the
 * store's own `_serializationKey`. This mirrors element-js' deserialize reviver, which resolves a
 * `Store/<key>` reference by looking that key up in the same flat state map. De-duplicated via
 * `seen`, so a store shared across components is serialized exactly once (T-007.3).
 * @param {*} value - a serialized-state value tree (object/array/primitive, possibly holding Stores)
 * @param {Object<string, object>} stateMap - the flat map being assembled for the `ejs/json` script
 * @param {Set<string>} seen - store keys already registered
 */
function collectStores(value, stateMap, seen) {
  if (value instanceof Store) {
    if (!seen.has(value._serializationKey)) {
      seen.add(value._serializationKey);
      const state = value.serializeState();
      stateMap[value._serializationKey] = state;
      collectStores(state, stateMap, seen);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStores(item, stateMap, seen);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value))
      collectStores(item, stateMap, seen);
  }
}

/**
 * JSON replacer mirroring element-js' `serializeState`: a {@link Store} value is emitted as the
 * reference string `Store/<key>` (its actual state lives under that key, via {@link collectStores}).
 * @param {string} _key
 * @param {*} value
 * @return {*}
 */
function storeReplacer(_key, value) {
  return value instanceof Store ? `Store/${value._serializationKey}` : value;
}

/**
 * Append the merged state map as a single `<script type="ejs/json">` to the document body — the exact
 * shape element-js reads on the client (`initGlobalStateObject` finds it by type, hydration restores
 * each `ejs:key` from it). `<` is escaped to `<` so embedded markup can't close the script early.
 * @param {import('node-html-parser').HTMLElement} root
 * @param {Object<string, object>} stateMap
 */
function appendStateScript(root, stateMap) {
  const json = JSON.stringify(stateMap, storeReplacer).replace(/</g, "\\u003c");
  const script = parse(
    `<script type="ejs/json">${json}</script>`,
    PARSE_OPTIONS,
  ).childNodes[0];
  const body = root.querySelector("body") ?? root;
  body.appendChild(script);
}

/**
 * Render a component's own styles as id'd `<style>` tags, mirroring element-js' `TAGNAME{index}`
 * identifiers so the client de-dupes against them on hydration instead of appending copies.
 * @param {{index: number, css: string}[]} styleEntries
 * @param {string} idBase - the element's upper-case tag name, e.g. `EL-BUTTON`
 * @param {Set<string>} [skipIds] - ids already emitted; matching entries are dropped
 * @return {string}
 */
function ownStyleTags(styleEntries, idBase, skipIds) {
  return styleEntries
    .map(({ index, css }) => {
      const id = `${idBase}${index}`;
      if (skipIds) {
        if (skipIds.has(id)) return "";
        skipIds.add(id);
      }
      return `<style id="${id}">${css}</style>`;
    })
    .join("");
}

/**
 * Whether `node` has an ancestor with the given lower-case tag name.
 * @param {import('node-html-parser').Node} node
 * @param {string} tag
 * @return {boolean}
 */
function hasAncestorTag(node, tag) {
  for (let p = node.parentNode; p; p = p.parentNode) {
    if (p.rawTagName?.toLowerCase() === tag) return true;
  }
  return false;
}

/**
 * Gather the document's global stylesheets — every `<style>` / `<link rel="stylesheet">`, wherever
 * it sits in the input (not just `<head>`). Sources already scoped inside a `<template>` (i.e. an
 * existing shadow root) are skipped, since those aren't global.
 * @param {import('node-html-parser').HTMLElement} root
 * @return {{ node: import('node-html-parser').HTMLElement, html: string }[]}
 */
function collectGlobalStyles(root) {
  return root
    .querySelectorAll(GLOBAL_STYLE_SELECTOR)
    .filter((node) => !hasAncestorTag(node, "template"))
    .map((node) => ({ node, html: node.toString() }));
}

/**
 * Resolve which global stylesheets a shadow component adopts, mirroring element-js'
 * `adoptGlobalStyles` option: `false` → none; `true` → all; a selector / array of selectors → only
 * sources whose node matches. The special `'document'` token (runtime `adoptedStyleSheets`) has no
 * static-HTML representation and is ignored.
 * @param {{ node: import('node-html-parser').HTMLElement, html: string }[]} globalStyles
 * @param {boolean | string | string[]} adoptGlobalStyles
 * @return {string[]} stylesheet HTML in document order
 */
function selectAdoptedStyles(globalStyles, adoptGlobalStyles) {
  if (adoptGlobalStyles === false) return [];
  if (adoptGlobalStyles === true) return globalStyles.map(({ html }) => html);

  const selectors = (
    Array.isArray(adoptGlobalStyles) ? adoptGlobalStyles : [adoptGlobalStyles]
  ).filter((selector) => selector !== "document");
  if (selectors.length === 0) return [];

  return globalStyles
    .filter(({ node }) => selectors.some((selector) => node.matches(selector)))
    .map(({ html }) => html);
}

/**
 * A component renders nothing meaningful when its `template()` is the inherited empty `html``
 * (behavioral wrappers like `accordion-group` / `tab-group`). Such elements are left untouched so
 * their authored light-DOM children survive; the client simply attaches behavior on upgrade.
 * @param {string} markup
 * @return {boolean}
 */
function isEmptyTemplate(markup) {
  return markup.replace(/<!--[\s\S]*?-->/g, "").trim() === "";
}

/**
 * @typedef {Object} TransformContext
 * @property {Object<string, ResolvedEntry>} resolved - tags resolved to their entries so far; the
 *   map this transform pass renders against (grows across the resolution fixpoint).
 * @property {{ node: import('node-html-parser').HTMLElement, html: string }[]} globalStyles
 * @property {Set<string>} lightStyleIds - ids of light-DOM `<style>`s already emitted, document-wide
 * @property {(tag: string) => void} [onUnresolved] - called with each custom-element-looking tag
 *   (contains `-`) not yet in `resolved`. The async resolver uses this to discover which tags to
 *   load; it also backs the dev-mode "unresolved tag" warning (T-008.6).
 * @property {(tag: string, error: Error) => void} [onError] - called when rendering a resolved
 *   component throws; the element is left untouched (T-020). `renderToString` records these per
 *   pass and reports each distinct tag once after convergence.
 * @property {boolean} [serializeState] - when true, stamp each rendered component with a deterministic
 *   `ejs:key` and collect its state into `stateMap` for client hydration (T-007).
 * @property {Object<string, object>} stateMap - merged state, keyed by `ejs:key` (and store keys),
 *   emitted once as the `ejs/json` script.
 * @property {Set<string>} storeKeys - store keys already collected into `stateMap`, for de-duplication.
 * @property {{ n: number }} keyCounter - monotonic counter backing the deterministic `ejs:key`s; it
 *   advances in document order, so identical input yields identical keys across renders (T-007.1).
 */

/**
 * Recursively walk a node-html-parser tree, pre-rendering every registered custom element in place.
 * @param {import('node-html-parser').Node} node
 * @param {TransformContext} ctx
 */
function transformNode(node, ctx) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType !== NodeType.ELEMENT_NODE) continue;

    const tag = child.rawTagName?.toLowerCase();
    const entry = tag ? ctx.resolved[tag] : undefined;
    const Constructor = entry?.Constructor;

    if (Constructor) {
      // Per-component error isolation (T-020): a throwing constructor / `properties()` /
      // `template()` / `serializeState()` must not take down the whole-page transform. The failing
      // element is left untouched — like an unresolved tag, its authored markup survives and can
      // still hydrate client-side — and the error is reported per tag (see `onError`).
      let rendered;
      try {
        rendered = renderComponent(
          Constructor,
          child.attributes ?? {},
          ctx.serializeState,
          child,
          entry,
        );
      } catch (error) {
        ctx.onError?.(tag, error);
      }

      // Components with an empty template (behavioral wrappers) fall through untouched, exactly
      // like a failed render above.
      if (rendered && !isEmptyTemplate(rendered.markup)) {
        const {
          markup,
          shadow,
          styleEntries,
          injectedEntries,
          adoptGlobalStyles,
          serializedState,
        } = rendered;
        const idBase = tag.toUpperCase();
        // State transport (T-007): give the host a deterministic `ejs:key` and record its
        // server-rendered state so the client restores it on hydration instead of falling back to
        // property defaults. Done for both render paths below (the attribute stays on `child`).
        // Only components with actual serializable state are stamped — keys stay in lockstep with
        // the state map, and components with nothing to restore add no noise.
        if (
          ctx.serializeState &&
          serializedState &&
          Object.keys(serializedState).length > 0
        ) {
          const key = `${tag}-${ctx.keyCounter.n++}`;
          child.setAttribute("ejs:key", key);
          ctx.stateMap[key] = serializedState;
          collectStores(serializedState, ctx.stateMap, ctx.storeKeys);
        }

        if (shadow) {
          // Declarative Shadow DOM: the component's chrome + inlined styles live inside a
          // <template shadowrootmode>, while the authored slot content stays in light DOM
          // after it. Adopted global styles come first (matching element-js' order), then the
          // component's own styles; CSS custom properties also inherit through the boundary.
          // Shadow roots are isolated, so de-dup only *within* this root (a global may match more
          // than once) — repeats across instances are inherent and stay.
          const seen = new Set();
          const adopted = selectAdoptedStyles(
            ctx.globalStyles,
            adoptGlobalStyles,
          )
            .filter((html) => !seen.has(html) && seen.add(html))
            .join("");
          // Injected ComponentConfig styles sit between adopted globals and the component's own
          // styles (more specific than globals, overridable by the component), under the
          // renderer-owned `TAGNAME-SSR{index}` id-space (T-021).
          const styleTags =
            ownStyleTags(injectedEntries, `${idBase}-SSR`) +
            ownStyleTags(styleEntries, idBase);
          const shadowFragment = parse(
            `<template shadowrootmode="open">${adopted}${styleTags}${markup}</template>`,
            PARSE_OPTIONS,
          );
          const templateNode = shadowFragment.childNodes[0];
          transformNode(templateNode, ctx);
          templateNode.parentNode = child;

          // Transform any custom elements in the authored slot content while it is still
          // `child`'s children, then move it after the shadow template.
          transformNode(child, ctx);
          const slotted = child.childNodes;
          child.childNodes = [templateNode, ...slotted];
          continue;
        }

        // Light DOM: replace children with the rendered template. The <!--template-part-->
        // markers it carries make the client hydrate (update in place) instead of re-rendering.
        // The component's own styles have no shadow root, so inline them (id'd like element-js)
        // ahead of the markup — but only once per id across the document, since light styles are
        // global and element-js de-dupes them by id on hydration anyway.
        const styleTags =
          ownStyleTags(injectedEntries, `${idBase}-SSR`, ctx.lightStyleIds) +
          ownStyleTags(styleEntries, idBase, ctx.lightStyleIds);
        const fragment = parse(styleTags + markup, PARSE_OPTIONS);
        transformNode(fragment, ctx);
        for (const fragmentChild of fragment.childNodes)
          fragmentChild.parentNode = child;
        child.childNodes = fragment.childNodes;
        continue;
      }
    }

    // Reached for plain tags, registered wrappers with an empty template, components whose render
    // threw (isolated above), and unresolved custom elements. Only the last — a hyphenated tag
    // with no constructor — is reported as unresolved.
    if (!Constructor && tag?.includes("-")) ctx.onUnresolved?.(tag);
    transformNode(child, ctx);
  }
}

/**
 * Toggle element-js' own `serializeState` flag for this process so its serialize/deserialize helpers
 * are consistent with the renderer's opt-in (T-007.4). The renderer builds the `ejs/json` script
 * itself rather than going through those DOM-based helpers (see {@link appendStateScript}); the
 * accompanying `dom-shim` keeps the helpers a harmless no-op on the server if a component happens to
 * touch them during construction (e.g. a Store).
 * @param {boolean} enabled
 */
function setSerializeStateConfig(enabled) {
  globalThis.elementJsConfig = {
    ...globalThis.elementJsConfig,
    serializeState: Boolean(enabled),
  };
}

/** Whether we're in a production build, so the dev-only unresolved-tag warning stays quiet. */
function isProduction() {
  // `process` is absent on some edge runtimes; bundlers (Vite/Rollup) inline the value in prod.
  return (
    typeof process !== "undefined" && process.env?.NODE_ENV === "production"
  );
}

/**
 * The default `onUnresolved` handler: warn once per distinct tag, in non-production only. Catches the
 * "forgot to register / typo'd the tag" case that otherwise passes through silently (T-008.6).
 * Returns `undefined` in production so the hook is skipped entirely. Pass your own `onUnresolved`
 * (e.g. `() => {}`) to override or silence — useful for intentionally client-only / third-party tags.
 * @return {((tag: string) => void) | undefined}
 */
function defaultUnresolvedWarning() {
  if (isProduction()) return undefined;
  const warned = new Set();
  return (tag) => {
    if (warned.has(tag)) return;
    warned.add(tag);
    console.warn(
      `[element-js-ssr-renderer] No server component resolved for <${tag}> — left ` +
        `unrendered (it will still hydrate client-side if defined there). Add it to your ` +
        `registry / resolve sources, or pass onUnresolved to silence.`,
    );
  };
}

/**
 * Normalize the `exclude` option — a list of tags or a predicate — into a `(tag) => boolean`
 * filter (T-023). List entries are matched case-insensitively (the transform lower-cases tag
 * names); a predicate receives the lower-cased tag.
 * @param {string[] | ((tag: string) => boolean) | undefined} exclude
 * @return {(tag: string) => boolean}
 */
function toExcludeFilter(exclude) {
  if (exclude == null) return () => false;
  if (typeof exclude === "function") return (tag) => Boolean(exclude(tag));
  const tags = new Set(exclude.map((tag) => tag.toLowerCase()));
  return (tag) => tags.has(tag);
}

/**
 * The default `onError` handler: log each failing tag's error via `console.error`. Unlike the
 * unresolved-tag warning this is NOT dev-only — with the element silently left unrendered, a log
 * line is the only trace a production page has of the failure. Pass your own `onError` to route it
 * elsewhere (or silence it) — or rethrow inside it to fail the whole render instead (fail-fast).
 * @param {string} tag
 * @param {Error} error
 */
function defaultErrorReport(tag, error) {
  console.error(
    `[element-js-ssr-renderer] <${tag}> threw during SSR — left unrendered ` +
      `(it will still hydrate client-side if defined there).`,
    error,
  );
}

/**
 * The default report for a failed resolution (T-025): like {@link defaultErrorReport} it is NOT
 * dev-only — the element is silently left unrendered, so a log line is production's only trace.
 * Unlike a render error, a resolve failure (a rejected dynamic import, a broken catalog entry) is
 * not content-dependent: the same tag will fail on every page that contains it.
 * @param {string} tag
 * @param {Error} error
 */
function defaultResolveErrorReport(tag, error) {
  console.error(
    `[element-js-ssr-renderer] <${tag}> failed to resolve during SSR — left unrendered. ` +
      `Its module or catalog entry is broken (this hits every page with the tag, and likely ` +
      `the client too).`,
    error,
  );
}

/**
 * A **page-level transform** (T-028): `(html, ctx) => html`, sync or async. `pre` transforms run
 * once on the input before any component rendering; `post` transforms run once on the final
 * output after the resolution fixpoint converged. Each receives the previous transform's result
 * (array order) plus the shared per-render {@link PageTransformContext}. String in, string out —
 * no AST or DOM API is promised.
 * @typedef {(html: string, ctx: PageTransformContext) => string | Promise<string>} PageTransform
 */

/**
 * The shared per-render object handed to every page-level transform. A plain mutable object:
 * transforms stash values on it for one another (e.g. what a `pre` extracted, for a `post` to
 * re-insert). The renderer owns one key:
 * @typedef {Object} PageTransformContext
 * @property {{ resolved: string[], unresolved: string[], excluded: string[], failed: string[] }} [tags] -
 *   set by the renderer after rendering, before the first `post` transform runs (absent during
 *   `pre`): the tags that were rendered, the custom-element-looking tags no source resolved, the
 *   tags excluded as client-only, and the tags whose resolution or render failed (reported via
 *   `onError`).
 */

/**
 * Validate and normalize the `transforms` option into `{ pre: fn[], post: fn[] }`. Loud on
 * config mistakes — an unknown key (a typo'd `posts`) or a non-function entry would otherwise
 * silently transform nothing.
 * @param {{ pre?: PageTransform | PageTransform[], post?: PageTransform | PageTransform[] }} [transforms]
 * @return {{ pre: PageTransform[], post: PageTransform[] }}
 */
function normalizeTransforms(transforms) {
  if (transforms == null) return { pre: [], post: [] };
  const unknown = Object.keys(transforms).filter(
    (key) => key !== "pre" && key !== "post",
  );
  if (unknown.length > 0)
    throw new TypeError(
      `[element-js-ssr-renderer] unknown \`transforms\` key(s): ${unknown.join(", ")} — ` +
        `only \`pre\` and \`post\` exist`,
    );
  const toList = (value, phase) => {
    const list = value == null ? [] : Array.isArray(value) ? value : [value];
    for (const transform of list)
      if (typeof transform !== "function")
        throw new TypeError(
          `[element-js-ssr-renderer] \`transforms.${phase}\` must be a function or an array of functions`,
        );
    return list;
  };
  return {
    pre: toList(transforms.pre, "pre"),
    post: toList(transforms.post, "post"),
  };
}

/**
 * Run one transform phase in array order, awaiting each. Unlike per-component errors, a throwing
 * page-level transform fails the whole render loudly — broken page-level glue means broken
 * output, and callers have a fallback path for exactly that. A transform returning anything but
 * a string (usually a forgotten `return`) is caught with a clear error instead of poisoning the
 * pipeline.
 * @param {PageTransform[]} list
 * @param {"pre" | "post"} phase
 * @param {string} html
 * @param {PageTransformContext} ctx
 * @return {Promise<string>}
 */
async function applyTransforms(list, phase, html, ctx) {
  for (const transform of list) {
    const result = await transform(html, ctx);
    if (typeof result !== "string")
      throw new TypeError(
        `[element-js-ssr-renderer] \`transforms.${phase}\` transform ` +
          `"${transform.name || "(anonymous)"}" returned ${result === undefined ? "undefined" : typeof result} — ` +
          `a page-level transform must return the (possibly unchanged) HTML string`,
      );
    html = result;
  }
  return html;
}

/** The dom-shim stamps its own `document` with this marker; a real DOM's document never has it. */
const SHIM_DOCUMENT = Symbol.for("element-js-ssr-renderer:dom-shim");

/** The shim document's `documentElement`, or `undefined` when a real/foreign DOM is present. */
function shimDocumentElement() {
  const doc = globalThis.document;
  return doc?.[SHIM_DOCUMENT] ? doc.documentElement : undefined;
}

/**
 * Adopt the input document's `<html lang>` onto the shim's `documentElement` for this transform
 * pass (T-026): components reading `document.documentElement.lang` during `template()` — `Intl`
 * formatting, i18n lookups — must see the page's language, not the shim's `'en'` default, or
 * every non-English page silently bakes the English variant into its output. Runs at the start of
 * each pass, which is synchronous end-to-end, so even interleaved concurrent renders of different
 * pages each see their own value while their components render. An input without an `<html lang>`
 * leaves the current value alone (pre-set it before rendering to define your own default);
 * `renderToString` restores the previous value after the render. Only the shim's own document is
 * ever touched — a real DOM (browser, happy-dom, jsdom) stays foreign.
 * @param {import('node-html-parser').HTMLElement} root - the parsed input document
 */
function adoptDocumentLang(root) {
  const documentElement = shimDocumentElement();
  if (!documentElement) return;
  const lang = root.querySelector("html")?.getAttribute("lang");
  if (lang) documentElement.lang = lang;
}

/**
 * Parse `html`, pre-render every custom element found in `resolved`, and stringify. Pure over
 * (`html`, `resolved`), so the resolution fixpoint can call it repeatedly with a growing map of
 * resolved tags (see {@link renderToString}).
 * @param {string} html
 * @param {Object<string, ResolvedEntry>} resolved - tags already resolved to their entries
 * @param {(tag: string) => void} [onUnresolved]
 * @param {boolean} [serializeState] - opt into client state transport (T-007)
 * @param {(tag: string, error: Error) => void} [onError] - render-error recorder (T-020)
 * @return {string}
 */
function runTransform(html, resolved, onUnresolved, serializeState, onError) {
  const root = parse(html, PARSE_OPTIONS);
  adoptDocumentLang(root);
  // Collect global styles up front, before any generated shadow templates are spliced in, so we
  // only ever adopt the input document's own stylesheets.
  const globalStyles = collectGlobalStyles(root);
  const stateMap = {};
  transformNode(root, {
    resolved,
    globalStyles,
    lightStyleIds: new Set(),
    onUnresolved,
    onError,
    serializeState,
    stateMap,
    storeKeys: new Set(),
    keyCounter: { n: 0 },
  });
  if (serializeState && Object.keys(stateMap).length > 0) {
    appendStateScript(root, stateMap);
  }
  return root.toString();
}

/**
 * A **`Catalog`** maps custom-element tags to components — the one shape `resolve` understands. Each
 * value is either an **eager class** (a `CustomElementConstructor`) or a **lazy loader**
 * (`() => Promise<unknown>`, the exact shape Vite's `import.meta.glob('./x/*.js')` produces — plain
 * ESM that a bundler code-splits and bare Node runs). The renderer auto-detects which each entry is,
 * so a hand-written catalog **and** raw `import.meta.glob()` output both drop straight into `resolve`
 * with no wrapper:
 *   - **class vs loader** — an eager class extends `HTMLElement` (through the dom-shim), so its
 *     `prototype instanceof HTMLElement`; a `() => import()` loader thunk has no such prototype.
 *   - **tag key vs path key** — a custom-element tag can't contain `/`, but an `import.meta.glob` key
 *     always does, so a `/`-bearing key is read as a module path and mapped to a tag by basename
 *     (`./components/el-button.js` → `el-button`). A resolved loader module has its `default` picked.
 *   - a value may also be a **{@link ComponentConfig}** — an object wrapping the class or loader
 *     with per-component SSR overrides (injected styles, `adoptGlobalStyles`), detected by its
 *     `component` key.
 * @typedef {Object<string, CustomElementConstructor | (() => Promise<unknown>) | ComponentConfig>} Catalog
 */

/**
 * A **`ComponentConfig`** wraps a {@link Catalog} value with per-component SSR overrides (T-021) —
 * the supported alternative to subclassing and poking element-js internals (`_styles`/`_options`):
 *   - **`component`** — the eager class or lazy loader, exactly like a bare Catalog value.
 *   - **`styles`** — CSS injected ahead of the component's own styles: into the Declarative Shadow
 *     DOM template (after adopted globals) for shadow components, inlined before the markup for
 *     light-DOM ones. The build-time critical-CSS / per-component Tailwind-subset hook: DSD content
 *     is styled at first paint without copying the full global sheets into every template. Emitted
 *     under a renderer-owned `TAGNAME-SSR{index}` id-space so element-js' own `TAGNAME{index}`
 *     hydration ids (and their client-side de-dup) stay untouched.
 *   - **`adoptGlobalStyles`** — overrides the instance's element-js option at render time.
 * The key is `component` — deliberately not `constructor`, which every plain object already
 * resolves through its prototype chain, making detection (and forgetting the key) ambiguous.
 * @typedef {{ component: CustomElementConstructor | (() => Promise<unknown>), styles?: string | string[], adoptGlobalStyles?: boolean | string | string[] }} ComponentConfig
 */

/**
 * The uniform shape the transform renders against, normalized from whatever a source yielded.
 * @typedef {{ Constructor: CustomElementConstructor, injected?: {index: number, css: string}[], adoptGlobalStyles?: boolean | string | string[] }} ResolvedEntry
 */

/** Default key→tag mapping: a path's basename without extension (`./x/el-button.js` → `el-button`). */
function defaultPathToTag(key) {
  const base = key.split("/").pop() ?? key;
  return base.replace(/\.[^.]+$/, "");
}

/** Default module→class pick: the `default` export, or the value itself if it's already a class. */
function defaultPick(mod) {
  return mod?.default ?? mod;
}

/**
 * Whether a {@link Catalog} value is an **eager component class** (vs a lazy `() => import()` loader).
 * An element-js class extends `HTMLElement` (through the dom-shim), so it carries a
 * `prototype instanceof HTMLElement`; an arrow loader thunk has no such prototype. Guarded so it
 * stays `false` (rather than throwing) if the dom-shim hasn't installed `HTMLElement` yet.
 * @param {*} value
 * @return {boolean}
 */
function isElementClass(value) {
  return (
    typeof value === "function" &&
    typeof globalThis.HTMLElement === "function" &&
    value.prototype instanceof globalThis.HTMLElement
  );
}

/**
 * Whether a `resolve` value is a {@link ComponentConfig} — a plain object carrying the component
 * plus per-component SSR overrides — rather than a bare class or loader thunk. Keyed on `component`
 * being an OWN property: prototype-chain lookups would make `{}.constructor` (→ `Object`) a false
 * positive, which is exactly why the key isn't named `constructor`.
 * @param {*} value
 * @return {value is ComponentConfig}
 */
function isComponentConfig(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.hasOwn(value, "component")
  );
}

/**
 * Normalize what a source yielded — a bare class or a {@link ComponentConfig} (whose `component`
 * may still be a lazy loader, e.g. when returned from a custom resolver function) — into the
 * uniform {@link ResolvedEntry} the transform renders against. A config whose `component` doesn't
 * resolve to an element class is a programming error and throws, naming the tag — `renderToString`
 * isolates it like any other resolve failure (T-025), so it surfaces via `onError`, not as a page
 * failure; any other unrecognized value resolves to `undefined` (→ the unresolved-tag path).
 * @param {*} value
 * @param {string} tag
 * @return {Promise<ResolvedEntry | undefined>}
 */
async function toResolvedEntry(value, tag) {
  if (value == null) return undefined;
  if (isElementClass(value)) return { Constructor: value };
  if (isComponentConfig(value)) {
    let { component, styles, adoptGlobalStyles } = value;
    if (typeof component === "function" && !isElementClass(component))
      component = defaultPick(await component());
    if (!isElementClass(component))
      throw new TypeError(
        `[element-js-ssr-renderer] resolve entry for <${tag}> has a \`component\` ` +
          `that is not (and does not resolve to) a custom-element class`,
      );
    // Pre-shape injected CSS like style entries, so emission mirrors the component's own styles.
    const injected = (typeof styles === "string" ? [styles] : (styles ?? []))
      .map((css, index) => ({ index, css }))
      .filter(({ css }) => Boolean(css));
    return { Constructor: component, injected, adoptGlobalStyles };
  }
  return undefined;
}

/**
 * Normalize one {@link Catalog} into a uniform `(tag) => class | Promise<class> | undefined` resolver,
 * auto-detecting each entry: class keys resolve to the class directly; loader keys import on demand
 * (each module at most once) and pick the module's `default`. Path keys (containing `/`) map to a tag
 * by basename. See {@link Catalog} for the detection rules.
 * @param {Catalog} catalog
 * @return {(tag: string) => CustomElementConstructor | Promise<CustomElementConstructor | undefined> | undefined}
 */
function catalogToResolver(catalog) {
  const entries = new Map(); // tag -> class | loader thunk
  for (const [key, value] of Object.entries(catalog))
    entries.set(key.includes("/") ? defaultPathToTag(key) : key, value);

  const cache = new Map(); // tag -> Promise<class | config>, so each lazy module imports once
  return (tag) => {
    const value = entries.get(tag);
    if (value === undefined) return undefined;
    if (isElementClass(value)) return value;
    // A ComponentConfig passes through with its `component` resolved (lazy loaders cached like
    // bare ones); normalization into a ResolvedEntry happens in renderToString (T-021).
    if (isComponentConfig(value)) {
      // Only a non-class function is a lazy loader; anything else (an eager class, or an invalid
      // value that toResolvedEntry rejects with a clear error) passes through as-is.
      if (
        typeof value.component !== "function" ||
        isElementClass(value.component)
      )
        return value;
      if (!cache.has(tag))
        cache.set(
          tag,
          Promise.resolve(value.component()).then((mod) => ({
            ...value,
            component: defaultPick(mod),
          })),
        );
      return cache.get(tag);
    }
    if (!cache.has(tag))
      cache.set(tag, Promise.resolve(value()).then(defaultPick));
    return cache.get(tag);
  };
}

/**
 * Escape hatch for the rare loader {@link Catalog} that auto-detection can't read: keys that don't map
 * to tags by basename, or modules that don't export the component as `default`. Re-keys the map by tag
 * and applies `pick` to each resolved module, returning a resolver function — itself a valid `resolve`
 * value. **Rarely needed**: a plain catalog or raw `import.meta.glob()` output goes straight into
 * `resolve` without it.
 *
 * @param {Object<string, () => Promise<unknown>>} map
 * @param {{ pathToTag?: (key: string) => string, pick?: (mod: object, tag: string) => CustomElementConstructor }} [options]
 *   `pathToTag` derives a tag from each map key (default: basename without extension). `pick` selects
 *   the class from a resolved module (default: its `default` export).
 * @return {(tag: string) => Promise<CustomElementConstructor> | undefined}
 */
export function glob(
  map,
  { pathToTag = defaultPathToTag, pick = defaultPick } = {},
) {
  const importers = new Map();
  for (const [key, importer] of Object.entries(map))
    importers.set(pathToTag(key), importer);

  const cache = new Map(); // tag -> Promise<class>, so each module imports once
  return (tag) => {
    const importer = importers.get(tag);
    if (!importer) return undefined;
    if (!cache.has(tag))
      cache.set(
        tag,
        Promise.resolve(importer()).then((mod) => pick(mod, tag)),
      );
    return cache.get(tag);
  };
}

/**
 * Normalize one `resolve` source — a {@link Catalog} or a bare `(tag) => …` resolver function (what
 * {@link glob} returns, or any custom lookup) — into a uniform resolver.
 * @param {Catalog | ((tag: string) => *)} source
 * @return {(tag: string) => CustomElementConstructor | Promise<CustomElementConstructor | undefined> | undefined}
 */
function toResolver(source) {
  if (typeof source === "function") return source; // resolver fn (incl. glob() output)
  return catalogToResolver(source); // a Catalog
}

/**
 * Compose sources into one resolver. Later sources win (`{...a, ...b}` semantics), so a project's
 * own source listed after `@webtides/element-library` overrides it on a tag clash.
 * @param {Array<Catalog | ((tag: string) => *)>} sources
 * @return {(tag: string) => Promise<CustomElementConstructor | undefined>}
 */
function composeSources(sources) {
  const resolvers = sources.map(toResolver);
  return async (tag) => {
    for (let i = resolvers.length - 1; i >= 0; i--) {
      const hit = await resolvers[i](tag);
      if (hit) return hit;
    }
    return undefined;
  };
}

/**
 * Pre-render every custom element found in an HTML string, resolving each tag through the
 * {@link Catalog}(s) you pass as `resolve`.
 *
 * Shadow-DOM components are emitted as Declarative Shadow DOM (`<template shadowrootmode="open">`)
 * with the global styles they adopt (per element-js' `adoptGlobalStyles` option) plus their own
 * styles inlined; light-DOM components have their template (and styles) rendered into place. Both
 * carry element-js' `<!--template-part-->` hydration markers, so on the client the elements hydrate
 * rather than render from scratch. Components with an empty template (behavioral wrappers) and
 * unresolved tags are left untouched. Processing is recursive, covering nested custom elements in
 * both slotted content and generated shadow content.
 *
 * Resolution is lazy: only the components actually present on the page are ever loaded (the
 * cold-start / serverless / edge path), and the core never calls `import()` itself — the sources do.
 * Resolution and rendering interleave as a fixpoint over an internal synchronous transform: each
 * pass renders with the tags resolved so far and reports the ones it couldn't resolve; those are
 * resolved (in parallel, each module once) and the pass repeats until nothing new appears. Because
 * it re-renders, it also catches custom elements that appear only inside a component's *generated*
 * template, not just the input.
 *
 * When `serializeState` is enabled, each rendered component is also stamped with a deterministic
 * `ejs:key` and its state collected into a single `<script type="ejs/json">` appended to the body, so
 * the client restores server state on hydration instead of re-deriving from defaults (T-007). The
 * DOM shim must be imported before any component module for this (and SSR generally) to work.
 *
 * A component whose constructor, `properties()`, `template()` or `serializeState()` throws does
 * not fail the page: the element is left untouched — like an unresolved tag, its authored markup
 * survives and can still hydrate client-side — and `onError` is called once per failing tag
 * (default: a `console.error`). To fail fast instead, rethrow from your own `onError` (T-020).
 * The same isolation covers **resolution** failures (T-025): a lazy loader whose import rejects
 * (syntax error, missing dependency, bad path), a throwing resolver function, or an invalid
 * {@link ComponentConfig} leaves that tag's elements untouched and reports through `onError` too —
 * `onUnresolved` is not called for it (the tag is known, its module is just broken).
 *
 * `exclude` declares tags as **client-only** (T-023): overlays like modals or cookie-consent
 * banners that must stay inert until their JS runs. An excluded tag is unresolved-by-choice — the
 * element is left untouched, `onUnresolved` is not called, and, because exclusion is checked
 * before resolution, its module is never resolved or imported on the server (even when the tag is
 * present in `resolve`). Module-scope side effects of client-only components never run.
 *
 * The input's `<html lang>` is adopted onto the dom-shim's `document.documentElement.lang` for the
 * duration of the render (T-026), so components that read it — `Intl` formatting, i18n lookups —
 * render the page's language instead of the shim's `'en'` default; the previous value is restored
 * afterwards. An input without the attribute leaves the current value alone (pre-set it to define
 * your own default), and a real DOM's document (browser, happy-dom, jsdom) is never touched.
 *
 * `transforms` hangs **page-level** processing onto the render (T-028): `pre` transforms run once
 * on the input before any component rendering (strip a cloaking block, extract config), `post`
 * transforms once on the final output (inline sprite symbols, stamp a page marker) — each
 * `(html, ctx) => html`, sync or async, in array order, sharing one {@link PageTransformContext}
 * per render. The renderer sets `ctx.tags` (resolved/unresolved/excluded/failed) before the first
 * `post` transform. Unlike per-component errors, a throwing transform fails the render loudly —
 * broken page-level glue means broken output, and callers have a fallback path for exactly that.
 *
 * @param {string} html - an HTML document or fragment (e.g. a framework's rendered response)
 * @param {{
 *   resolve?: Catalog | ((tag: string) => *) | Array<Catalog | ((tag: string) => *)>,
 *   exclude?: string[] | ((tag: string) => boolean),
 *   onUnresolved?: (tag: string) => void,
 *   onError?: (tag: string, error: Error) => void,
 *   serializeState?: boolean,
 *   transforms?: { pre?: PageTransform | PageTransform[], post?: PageTransform | PageTransform[] },
 * }} [options]
 *   `resolve` is a {@link Catalog} (a `{ tag: Class }` / `import.meta.glob()` map, eager classes,
 *   lazy loaders and {@link ComponentConfig} objects auto-detected) or a `(tag) => …` resolver
 *   function — or an array of either, composed
 *   later-wins on a tag clash. `exclude` is a list of tags (case-insensitive) or a
 *   `(tag) => boolean` predicate declaring tags client-only: left untouched, never resolved or
 *   imported, no unresolved warning. `onUnresolved` is called once per custom-element tag that no
 *   source could resolve; it defaults to a dev-only warning (pass `() => {}` to silence).
 *   `onError` is called once per tag whose component threw while rendering — or whose resolution
 *   failed (rejected import, throwing resolver, invalid config); it defaults to a
 *   `console.error` (not dev-only), and rethrowing from it fails the whole render.
 *   `serializeState` (default `false`) opts into client state transport. `transforms` is the
 *   page-level pre/post pipeline described above.
 * @return {Promise<string>} the HTML with custom elements pre-rendered
 */
export async function renderToString(
  html,
  {
    resolve,
    exclude,
    onUnresolved,
    onError,
    serializeState = false,
    transforms,
  } = {},
) {
  setSerializeStateConfig(serializeState);
  // Validated up front: a transforms config mistake must fail immediately, not mid-render.
  const { pre, post } = normalizeTransforms(transforms);
  const ctx = {}; // the shared PageTransformContext, one per render
  const sources =
    resolve == null ? [] : Array.isArray(resolve) ? resolve : [resolve];
  const resolver = composeSources(sources);
  const excluded = toExcludeFilter(exclude);
  const warn = onUnresolved ?? defaultUnresolvedWarning();
  const reportError = onError ?? defaultErrorReport;
  // Resolve failures share the render-error channel (one hook to wire, existing `onError` logging
  // covers them for free); only the *default* report differs, flagging the every-page nature.
  const reportResolveError = onError ?? defaultResolveErrorReport;

  const resolved = {}; // tag -> class; the map handed to each transform pass, growing each time
  const attempted = new Set(); // tags we've already tried, so genuine misses don't loop forever
  // Resolution failures (T-025): a rejected loader / resolver or an invalid ComponentConfig is as
  // per-component as a throwing template() — isolated, the tag left untouched like an unresolved
  // one. Each tag resolves at most once (see `attempted`), so this maps tag -> its one error.
  const resolveErrors = new Map();

  // The transform passes adopt the input's `<html lang>` onto the shim document (T-026); restore
  // the pre-render value afterwards so it never leaks into a later render of a different page (an
  // input without a lang attribute keeps whatever the consumer pre-set as their default).
  const documentElement = shimDocumentElement();
  const previousLang = documentElement?.lang;

  try {
    // Page-level `pre` transforms (T-028) run once, on the input — the fixpoint passes below
    // re-render from their result, so injected/stripped markup is what components see.
    html = await applyTransforms(pre, "pre", html, ctx);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const misses = new Set();
      const excludedTags = new Set();
      // Render errors are re-collected each pass (passes re-render from the original html); only the
      // converged pass's set is reported, so each failing tag surfaces exactly once (T-020).
      const errors = new Map(); // tag -> first error thrown rendering that tag this pass
      const out = runTransform(
        html,
        resolved,
        // Excluded tags (T-023) never enter the miss set: they are unresolved-by-choice, so they are
        // neither resolved/imported below nor warned about at convergence.
        (tag) => {
          if (excluded(tag)) excludedTags.add(tag);
          else misses.add(tag);
        },
        serializeState,
        (tag, error) => {
          if (!errors.has(tag)) errors.set(tag, error);
        },
      );

      const fresh = [...misses].filter((tag) => !attempted.has(tag));
      if (fresh.length === 0) {
        // Converged. Anything still missing is genuinely unresolvable — surface it (warn by default).
        // A resolve-failed tag is NOT among them: the consumer knows the tag, its module is just
        // broken — it gets the (louder) resolve-error report below instead of the unresolved warning.
        if (warn)
          for (const tag of misses)
            if (!resolved[tag] && !resolveErrors.has(tag)) warn(tag);
        for (const [tag, error] of resolveErrors)
          reportResolveError(tag, error);
        for (const [tag, error] of errors) reportError(tag, error);

        // What the render did, for the `post` transforms (renderer-owned ctx key, T-028) — e.g.
        // stamp a page marker only if something rendered, emit preloads for resolved tags.
        ctx.tags = {
          resolved: Object.keys(resolved),
          unresolved: [...misses].filter((tag) => !resolveErrors.has(tag)),
          excluded: [...excludedTags],
          failed: [...resolveErrors.keys(), ...errors.keys()],
        };
        return await applyTransforms(post, "post", out, ctx);
      }

      for (const tag of fresh) attempted.add(tag);
      await Promise.all(
        fresh.map(async (tag) => {
          // Isolate resolution failures (T-025): without the catch, one rejected import would fail
          // the whole page render. The tag stays out of `resolved` (and in `attempted`), so the
          // fixpoint neither retries nor loops on it.
          try {
            const entry = await toResolvedEntry(await resolver(tag), tag);
            if (entry) resolved[tag] = entry;
          } catch (error) {
            resolveErrors.set(tag, error);
          }
        }),
      );
    }
  } finally {
    // Runs whether the render returned or threw (a rethrowing onError): the shim must not keep
    // this page's language either way.
    if (documentElement) documentElement.lang = previousLang;
  }
}
