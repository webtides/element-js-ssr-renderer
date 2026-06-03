/**
 * Minimal DOM globals so that @webtides/element-js component classes can be *constructed* in Node.
 *
 * We never run the custom-element lifecycle on the server — no `connectedCallback`, no
 * `attachShadow`, no `adoptedStyleSheets`. We only need `new SomeElement()` to succeed so we can
 * read its options/styles and call `template()`, whose `TemplateResult.toString()` is pure string
 * work and needs no DOM at all.
 *
 * Two globals are referenced before any lifecycle runs and must exist:
 *   - `HTMLElement` — evaluated when a component class is *defined* (`class Foo extends HTMLElement`),
 *     i.e. at module-import time. This file MUST be imported before any component module.
 *   - `customElements` — only touched if `define()` is called; harmless to stub.
 *
 * `BaseElement`'s constructor also calls `this.attachInternals()` and expects `_internals.states`
 * to be a Set, so the shim provides that.
 *
 * Importing this module is a one-time, idempotent side effect.
 */

if (typeof globalThis.HTMLElement === "undefined") {
  globalThis.HTMLElement = class HTMLElement {
    attachInternals() {
      return { states: new Set() };
    }
    setAttribute() {}
    getAttribute() {
      return null;
    }
    hasAttribute() {
      return false;
    }
    removeAttribute() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return true;
    }
    attachShadow() {
      return null;
    }
  };
}

if (typeof globalThis.document === "undefined") {
  // element-js' GlobalStylesStore instantiates at import time and does
  // `Array.from(globalThis.document?.styleSheets)`, so this must be iterable.
  globalThis.document = {
    styleSheets: [],
    scripts: [],
  };
}

if (typeof globalThis.customElements === "undefined") {
  globalThis.customElements = {
    define() {},
    get() {
      return undefined;
    },
    getName() {
      return null;
    },
    whenDefined() {
      return Promise.resolve();
    },
    upgrade() {},
  };
}
