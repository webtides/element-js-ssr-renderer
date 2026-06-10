import { TemplateElement, defineElement, html } from "@webtides/element-js";

/**
 * A light-DOM component — the other SSR output path.
 *
 * With `shadowRender` off (the default), the renderer renders `template()`
 * straight into the element's light DOM instead of a shadow root: no
 * `<template shadowrootmode>`, just the markup in place, still carrying the
 * `<!--template-part-->` hydration markers. Use light DOM when you want the
 * component's output to participate in the page's normal cascade and DOM.
 *
 * @element x-greeting
 * @property {string} name - Who to greet. Seedable from a `name` attribute.
 */
export default class XGreeting extends TemplateElement {
  properties() {
    return { name: "World" };
  }

  template() {
    return html`
      <p class="greeting">
        👋 Hello, <strong>${this.name}</strong>!
        <em>(rendered on the server — light DOM)</em>
      </p>
    `;
  }
}

export function define() {
  defineElement("x-greeting", XGreeting);
}
