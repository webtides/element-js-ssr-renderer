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
 * @return {{ markup: string, shadow: boolean, styleEntries: {index: number, css: string}[], adoptGlobalStyles: boolean | string | string[], serializedState: object | undefined }}
 */
function renderComponent(Constructor, attributes, serialize, node) {
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
    // element-js default is `true`; mirror that so plain components adopt global styles.
    adoptGlobalStyles: instance._options?.adoptGlobalStyles ?? true,
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
 * @property {Object<string, CustomElementConstructor>} resolved - tags resolved to their classes so
 *   far; the map this transform pass renders against (grows across the resolution fixpoint).
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
    const Constructor = tag ? ctx.resolved[tag] : undefined;

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
          const styleTags = ownStyleTags(styleEntries, idBase);
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
        const styleTags = ownStyleTags(styleEntries, idBase, ctx.lightStyleIds);
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
 * Parse `html`, pre-render every custom element found in `resolved`, and stringify. Pure over
 * (`html`, `resolved`), so the resolution fixpoint can call it repeatedly with a growing map of
 * resolved tags (see {@link renderToString}).
 * @param {string} html
 * @param {Object<string, CustomElementConstructor>} resolved - tags already resolved to their classes
 * @param {(tag: string) => void} [onUnresolved]
 * @param {boolean} [serializeState] - opt into client state transport (T-007)
 * @param {(tag: string, error: Error) => void} [onError] - render-error recorder (T-020)
 * @return {string}
 */
function runTransform(html, resolved, onUnresolved, serializeState, onError) {
  const root = parse(html, PARSE_OPTIONS);
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
 * @typedef {Object<string, CustomElementConstructor | (() => Promise<unknown>)>} Catalog
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

  const cache = new Map(); // tag -> Promise<class>, so each lazy module imports once
  return (tag) => {
    const value = entries.get(tag);
    if (value === undefined) return undefined;
    if (isElementClass(value)) return value;
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
 *
 * @param {string} html - an HTML document or fragment (e.g. a framework's rendered response)
 * @param {{
 *   resolve?: Catalog | ((tag: string) => *) | Array<Catalog | ((tag: string) => *)>,
 *   onUnresolved?: (tag: string) => void,
 *   onError?: (tag: string, error: Error) => void,
 *   serializeState?: boolean,
 * }} [options]
 *   `resolve` is a {@link Catalog} (a `{ tag: Class }` / `import.meta.glob()` map, eager classes and
 *   lazy loaders auto-detected) or a `(tag) => …` resolver function — or an array of either, composed
 *   later-wins on a tag clash. `onUnresolved` is called once per custom-element tag that no source
 *   could resolve; it defaults to a dev-only warning (pass `() => {}` to silence). `onError` is
 *   called once per tag whose component threw while rendering; it defaults to a `console.error`
 *   (not dev-only), and rethrowing from it fails the whole render. `serializeState`
 *   (default `false`) opts into client state transport.
 * @return {Promise<string>} the HTML with custom elements pre-rendered
 */
export async function renderToString(
  html,
  { resolve, onUnresolved, onError, serializeState = false } = {},
) {
  setSerializeStateConfig(serializeState);
  const sources =
    resolve == null ? [] : Array.isArray(resolve) ? resolve : [resolve];
  const resolver = composeSources(sources);
  const warn = onUnresolved ?? defaultUnresolvedWarning();
  const reportError = onError ?? defaultErrorReport;

  const resolved = {}; // tag -> class; the map handed to each transform pass, growing each time
  const attempted = new Set(); // tags we've already tried, so genuine misses don't loop forever

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const misses = new Set();
    // Render errors are re-collected each pass (passes re-render from the original html); only the
    // converged pass's set is reported, so each failing tag surfaces exactly once (T-020).
    const errors = new Map(); // tag -> first error thrown rendering that tag this pass
    const out = runTransform(
      html,
      resolved,
      (tag) => misses.add(tag),
      serializeState,
      (tag, error) => {
        if (!errors.has(tag)) errors.set(tag, error);
      },
    );

    const fresh = [...misses].filter((tag) => !attempted.has(tag));
    if (fresh.length === 0) {
      // Converged. Anything still missing is genuinely unresolvable — surface it (warn by default).
      if (warn) for (const tag of misses) if (!resolved[tag]) warn(tag);
      for (const [tag, error] of errors) reportError(tag, error);
      return out;
    }

    for (const tag of fresh) attempted.add(tag);
    await Promise.all(
      fresh.map(async (tag) => {
        const cls = await resolver(tag);
        if (cls) resolved[tag] = cls;
      }),
    );
  }
}
