import { parse, NodeType } from "node-html-parser";
import {
  dashToCamel,
  parseAttribute,
} from "@webtides/element-js/src/util/AttributeParser";

/**
 * @typedef {Object<string, CustomElementConstructor>} Registry
 * A map of lower-case custom element tag names to their @webtides/element-js classes,
 * e.g. `{ 'el-button': Button, 'el-input-field': InputField }`.
 */

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
 * Build an element-js instance from its class + parsed attributes and render its template to a
 * string. We bypass the element lifecycle entirely: construct, assign default properties merged
 * with the attribute values, then call `template()` and stringify the resulting `TemplateResult`.
 * @param {CustomElementConstructor} Constructor
 * @param {Object<string, string>} attributes
 * @return {{ markup: string, shadow: boolean, styleEntries: {index: number, css: string}[], adoptGlobalStyles: boolean | string | string[] }}
 */
function renderComponent(Constructor, attributes) {
  const instance = new Constructor();

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

  return {
    markup,
    shadow: Boolean(instance._options?.shadowRender),
    styleEntries,
    // element-js default is `true`; mirror that so plain components adopt global styles.
    adoptGlobalStyles: instance._options?.adoptGlobalStyles ?? true,
  };
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
  if (adoptGlobalStyles === true)
    return globalStyles.map(({ html }) => html);

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
 * @property {Registry} registry
 * @property {{ node: import('node-html-parser').HTMLElement, html: string }[]} globalStyles
 * @property {Set<string>} lightStyleIds - ids of light-DOM `<style>`s already emitted, document-wide
 * @property {(tag: string) => void} [onUnresolved] - called with each custom-element-looking tag
 *   (contains `-`) that isn't in `registry`. The async resolver uses this to discover which tags to
 *   load; it also backs the dev-mode "unregistered tag" warning (T-008.6).
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
    const Constructor = tag ? ctx.registry[tag] : undefined;

    if (Constructor) {
      const { markup, shadow, styleEntries, adoptGlobalStyles } =
        renderComponent(Constructor, child.attributes ?? {});
      const idBase = tag.toUpperCase();

      if (!isEmptyTemplate(markup)) {
        if (shadow) {
          // Declarative Shadow DOM: the component's chrome + inlined styles live inside a
          // <template shadowrootmode>, while the authored slot content stays in light DOM
          // after it. Adopted global styles come first (matching element-js' order), then the
          // component's own styles; CSS custom properties also inherit through the boundary.
          // Shadow roots are isolated, so de-dup only *within* this root (a global may match more
          // than once) — repeats across instances are inherent and stay.
          const seen = new Set();
          const adopted = selectAdoptedStyles(ctx.globalStyles, adoptGlobalStyles)
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

    // Reached for plain tags, registered wrappers with an empty template, and unresolved custom
    // elements. Only the last — a hyphenated tag with no constructor — is reported as unresolved.
    if (!Constructor && tag?.includes("-")) ctx.onUnresolved?.(tag);
    transformNode(child, ctx);
  }
}

/** Whether we're in a production build, so the dev-only unresolved-tag warning stays quiet. */
function isProduction() {
  // `process` is absent on some edge runtimes; bundlers (Vite/Rollup) inline the value in prod.
  return typeof process !== "undefined" && process.env?.NODE_ENV === "production";
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
 * Parse `html`, pre-render every custom element found in `registry`, and stringify. Shared by the
 * sync and async entry points; pure over (`html`, `registry`), so the async path can call it
 * repeatedly with a growing registry (see `renderToStringAsync`).
 * @param {string} html
 * @param {Registry} registry
 * @param {(tag: string) => void} [onUnresolved]
 * @return {string}
 */
function runTransform(html, registry, onUnresolved) {
  const root = parse(html, PARSE_OPTIONS);
  // Collect global styles up front, before any generated shadow templates are spliced in, so we
  // only ever adopt the input document's own stylesheets.
  const globalStyles = collectGlobalStyles(root);
  transformNode(root, {
    registry,
    globalStyles,
    lightStyleIds: new Set(),
    onUnresolved,
  });
  return root.toString();
}

/**
 * Pre-render every registered custom element found in an HTML string.
 *
 * Shadow-DOM components are emitted as Declarative Shadow DOM (`<template shadowrootmode="open">`)
 * with the global styles they adopt (per element-js' `adoptGlobalStyles` option) plus their own
 * styles inlined; light-DOM components have their template (and styles) rendered into place. Both
 * carry element-js' `<!--template-part-->` hydration markers, so on the client the elements hydrate
 * rather than render from scratch. Components with an empty template (behavioral wrappers) and
 * unregistered tags are left untouched. Processing is recursive, covering nested custom elements in
 * both slotted content and generated shadow content.
 *
 * This is the synchronous path: every component must already be loaded and listed in `registry`.
 * For lazily-loaded or multi-source components, use {@link renderToStringAsync}.
 *
 * @param {string} html - an HTML document or fragment (e.g. a framework's rendered response)
 * @param {{ registry?: Registry, onUnresolved?: (tag: string) => void }} [options]
 *   `onUnresolved` is called for each custom-element-looking tag (contains `-`) not in `registry`;
 *   it defaults to a dev-only warning. Pass `() => {}` to silence (e.g. for client-only tags).
 * @return {string} the HTML with custom elements pre-rendered
 */
export function renderToString(html, { registry = {}, onUnresolved } = {}) {
  return runTransform(html, registry, onUnresolved ?? defaultUnresolvedWarning());
}

/**
 * A lazily-loaded component map. Each value imports its module (or returns a class) on demand;
 * `() => import('<literal>')` is plain ESM that a bundler can code-split and bare Node ESM can run,
 * and is exactly what Vite's `import.meta.glob('./components/*.js')` produces. Keys may be tags or
 * module paths — see `pathToTag` on {@link lazy}.
 * @typedef {Object<string, () => (Promise<object> | object | CustomElementConstructor)>} ImporterMap
 *
 * Arbitrary tag→class resolution, sync or async — the escape hatch when neither a static map nor an
 * importer map fits (a custom convention, a remote lookup, etc.).
 * @typedef {(tag: string) => (CustomElementConstructor | Promise<CustomElementConstructor | undefined> | undefined)} ResolveFn
 *
 * Anything {@link renderToStringAsync} can resolve a tag through: a static {@link Registry}, an
 * importer map wrapped in {@link lazy}, or a {@link ResolveFn}.
 * @typedef {Registry | ReturnType<typeof lazy> | ResolveFn} Source
 */

/** Brands the object returned by {@link lazy} so {@link toResolver} can tell it from a Registry. */
const LAZY_SOURCE = Symbol("element-js-ssr-renderer/lazy");

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
 * Wrap a lazy {@link ImporterMap} as a {@link Source}. Needed because a component class and an
 * importer thunk are both `typeof 'function'`, so a bare object can't be told apart from a static
 * registry — `lazy()` makes the intent explicit. Each module is imported at most once.
 *
 * @param {ImporterMap} map
 * @param {{ pathToTag?: (key: string) => string, pick?: (mod: object, tag: string) => CustomElementConstructor }} [options]
 *   `pathToTag` derives a tag from each map key (default: basename without extension, which leaves
 *   already-tag keys untouched). `pick` selects the class from a resolved module (default: its
 *   `default` export).
 * @return {{ [LAZY_SOURCE]: true, resolve: ResolveFn }}
 */
export function lazy(
  map,
  { pathToTag = defaultPathToTag, pick = defaultPick } = {},
) {
  const importers = new Map();
  for (const [key, importer] of Object.entries(map))
    importers.set(pathToTag(key), importer);

  const cache = new Map(); // tag -> Promise<class>, so each module imports once
  const resolve = (tag) => {
    const importer = importers.get(tag);
    if (!importer) return undefined;
    if (!cache.has(tag))
      cache.set(
        tag,
        Promise.resolve(importer()).then((mod) => pick(mod, tag)),
      );
    return cache.get(tag);
  };
  return { [LAZY_SOURCE]: true, resolve };
}

/**
 * Normalize a {@link Source} into a uniform `(tag) => class | Promise | undefined` resolver.
 * @param {Source} source
 * @return {ResolveFn}
 */
function toResolver(source) {
  if (typeof source === "function") return source; // ResolveFn
  if (source?.[LAZY_SOURCE]) return source.resolve; // lazy()
  return (tag) => source[tag]; // Registry
}

/**
 * Compose sources into one resolver. Later sources win (`{...a, ...b}` semantics), so a project's
 * own source listed after `@webtides/element-library` overrides it on a tag clash.
 * @param {Source[]} sources
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
 * Like {@link renderToString}, but resolves components lazily from one or more {@link Source}s, so
 * only the components actually present on the page are ever loaded — the cold-start / serverless /
 * edge path. The core never calls `import()` itself; the sources do.
 *
 * Resolution and rendering interleave as a fixpoint over the synchronous transform: each pass
 * renders with the registry resolved so far and reports the custom-element tags it couldn't resolve;
 * those are resolved (in parallel, each module once) and the pass repeats until nothing new appears.
 * This loads only on-page tags, deduplicates resolution, and — because it re-renders — also catches
 * custom elements that appear only inside a component's *generated* template, not just the input.
 *
 * @param {string} html
 * @param {{
 *   registry?: Registry,
 *   resolve?: Source | Source[],
 *   onUnresolved?: (tag: string) => void,
 * }} [options]
 *   `registry` is the lowest-precedence source; `resolve` sources override it, later-wins within the
 *   array. `onUnresolved` is called once per custom-element tag that no source could resolve; it
 *   defaults to a dev-only warning (pass `() => {}` to silence).
 * @return {Promise<string>} the HTML with custom elements pre-rendered
 */
export async function renderToStringAsync(
  html,
  { registry = {}, resolve, onUnresolved } = {},
) {
  const extra = resolve == null ? [] : Array.isArray(resolve) ? resolve : [resolve];
  const resolver = composeSources([registry, ...extra]);
  const warn = onUnresolved ?? defaultUnresolvedWarning();

  const resolved = {}; // tag -> class; the registry handed to each transform pass, growing each time
  const attempted = new Set(); // tags we've already tried, so genuine misses don't loop forever

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const misses = new Set();
    const out = runTransform(html, resolved, (tag) => misses.add(tag));

    const fresh = [...misses].filter((tag) => !attempted.has(tag));
    if (fresh.length === 0) {
      // Converged. Anything still missing is genuinely unresolvable — surface it (warn by default).
      if (warn) for (const tag of misses) if (!resolved[tag]) warn(tag);
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
