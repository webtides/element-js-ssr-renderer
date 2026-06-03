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
 * @return {{ markup: string, shadow: boolean, styles: string }}
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

  return {
    markup,
    shadow: Boolean(instance._options?.shadowRender),
    styles: (instance._styles ?? []).filter(Boolean).join("\n"),
  };
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
 * Recursively walk a node-html-parser tree, pre-rendering every registered custom element in place.
 * @param {import('node-html-parser').Node} node
 * @param {Registry} registry
 */
function transformNode(node, registry) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType !== NodeType.ELEMENT_NODE) continue;

    const tag = child.rawTagName?.toLowerCase();
    const Constructor = tag ? registry[tag] : undefined;

    if (Constructor) {
      const { markup, shadow, styles } = renderComponent(
        Constructor,
        child.attributes ?? {},
      );

      if (!isEmptyTemplate(markup)) {
        if (shadow) {
          // Declarative Shadow DOM: the component's chrome + inlined styles live inside a
          // <template shadowrootmode>, while the authored slot content stays in light DOM
          // after it. CSS custom properties (theme tokens) inherit through the boundary.
          const styleTag = styles ? `<style>${styles}</style>` : "";
          const shadowFragment = parse(
            `<template shadowrootmode="open">${styleTag}${markup}</template>`,
            PARSE_OPTIONS,
          );
          const templateNode = shadowFragment.childNodes[0];
          transformNode(templateNode, registry);
          templateNode.parentNode = child;

          // Transform any custom elements in the authored slot content while it is still
          // `child`'s children, then move it after the shadow template.
          transformNode(child, registry);
          const slotted = child.childNodes;
          child.childNodes = [templateNode, ...slotted];
          continue;
        }

        // Light DOM: replace children with the rendered template. The <!--template-part-->
        // markers it carries make the client hydrate (update in place) instead of re-rendering.
        const fragment = parse(markup, PARSE_OPTIONS);
        transformNode(fragment, registry);
        for (const fragmentChild of fragment.childNodes)
          fragmentChild.parentNode = child;
        child.childNodes = fragment.childNodes;
        continue;
      }
    }

    transformNode(child, registry);
  }
}

/**
 * Pre-render every registered custom element found in an HTML string.
 *
 * Shadow-DOM components are emitted as Declarative Shadow DOM (`<template shadowrootmode="open">`)
 * with their styles inlined; light-DOM components have their template rendered into place. Both
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
  transformNode(root, registry);
  return root.toString();
}
