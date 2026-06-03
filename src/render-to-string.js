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

    transformNode(child, ctx);
  }
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
 * @param {string} html - an HTML document or fragment (e.g. a framework's rendered response)
 * @param {{ registry?: Registry }} [options]
 * @return {string} the HTML with custom elements pre-rendered
 */
export function renderToString(html, { registry = {} } = {}) {
  const root = parse(html, PARSE_OPTIONS);
  // Collect global styles up front, before any generated shadow templates are spliced in, so we
  // only ever adopt the input document's own stylesheets.
  const globalStyles = collectGlobalStyles(root);
  transformNode(root, { registry, globalStyles, lightStyleIds: new Set() });
  return root.toString();
}
