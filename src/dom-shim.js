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
 * Beyond that core, the shim stubs the browser APIs that real-world component files (and the
 * vendor libraries they pull in) commonly touch at module scope or in constructors — media
 * queries, observers, storage feature checks, `CSSStyleSheet` — so that importing a real
 * component library on the server works out of the box. Every stub is inert (no-op methods,
 * empty/neutral values) and guarded, so environments that bring a real DOM (browsers, happy-dom,
 * jsdom) are never touched.
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
  // `Array.from(globalThis.document?.styleSheets)` and spreads `document.adoptedStyleSheets`,
  // so both must be iterable.
  globalThis.document = {
    // Marks this document as the shim's own, so the renderer knows it may adjust it per render
    // (e.g. adopting the input page's `<html lang>`, T-026) — a real DOM's document never carries
    // the marker and is never touched.
    [Symbol.for("element-js-ssr-renderer:dom-shim")]: true,
    styleSheets: [],
    scripts: [],
    adoptedStyleSheets: [],
    // With state serialization enabled (T-007), element-js' SerializeStateHelper lazily creates an
    // `ejs/json` <script> in the body the first time a component/store touches its state during
    // construction. The renderer builds that script itself and never reads element-js' copy, so
    // these just need to exist as harmless no-ops to keep construction from throwing on the server.
    createElement() {
      return { setAttribute() {}, textContent: "{}" };
    },
    createTextNode(text) {
      return { textContent: String(text) };
    },
    body: { appendChild() {} },
    documentElement: {
      lang: "en",
      style: {},
      setAttribute() {},
      getAttribute() {
        return null;
      },
      appendChild() {},
    },
    head: {
      appendChild() {},
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getElementsByTagName() {
      return [];
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
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

// ---------------------------------------------------------------------------------------------
// Broader browser-API surface (T-022) — inert stubs for module-scope / constructor code paths.
// All guarded with `??=` so a real implementation (browser, happy-dom, newer Node globals like
// `navigator`) always wins.
// ---------------------------------------------------------------------------------------------

// One inert observer covers all three — construction stores nothing, observing does nothing.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

globalThis.IntersectionObserver ??= ObserverStub;
globalThis.ResizeObserver ??= ObserverStub;
globalThis.MutationObserver ??= ObserverStub;

globalThis.matchMedia ??= (query) => ({
  matches: false,
  media: String(query ?? ""),
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  // legacy API, still feature-checked by older vendor code
  addListener() {},
  removeListener() {},
  dispatchEvent() {
    return true;
  },
});

// Deliberately a no-op, NOT `setTimeout(cb, 0)`: element-js batches `update()` behind
// `requestAnimationFrame`, so an executing stub would run deferred updates against this shim
// *after* the response was rendered — any error there would surface as an uncaught exception
// outside the renderer's per-component error isolation. SSR reads `template()` synchronously
// and never awaits a frame, so callbacks can safely never fire.
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

// element-js' StyledElement / GlobalStylesStore construct these for adopting styles; the server
// only ever serializes CSS strings, so the sheets never need real behavior.
globalThis.CSSStyleSheet ??= class CSSStyleSheet {
  cssRules = [];
  replaceSync() {}
  replace() {
    return Promise.resolve(this);
  }
  insertRule() {
    return 0;
  }
  deleteRule() {}
};

const storageStub = () => ({
  length: 0,
  key() {
    return null;
  },
  getItem() {
    return null;
  },
  setItem() {},
  removeItem() {},
  clear() {},
});

globalThis.localStorage ??= storageStub();
globalThis.sessionStorage ??= storageStub();

globalThis.navigator ??= {
  userAgent: "Node.js (element-js-ssr-renderer)",
  language: "en-US",
  languages: ["en-US"],
};

globalThis.location ??= {
  href: "http://localhost/",
  origin: "http://localhost",
  protocol: "http:",
  host: "localhost",
  hostname: "localhost",
  port: "",
  pathname: "/",
  search: "",
  hash: "",
};

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.dispatchEvent ??= () => true;

// Last, so every stub above is already in place when code reaches them via `window.…`.
// This makes `typeof window !== "undefined"` checks take the browser path — which is the point:
// that path then lands on the inert stubs instead of a ReferenceError.
globalThis.window ??= globalThis;
