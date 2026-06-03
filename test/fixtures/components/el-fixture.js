import { TemplateElement, html } from "@webtides/element-js";

// A minimal shadow component loaded by the node convention resolver in resolve-node.test.js.
export default class extends TemplateElement {
  constructor() {
    super({ shadowRender: true });
  }
  template() {
    return html`<span>fixture</span>`;
  }
}
