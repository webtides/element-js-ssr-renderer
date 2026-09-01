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
 * Importing this module is a one-time, idempotent side effect. The one export, `lockdownFetch`,
 * does nothing until explicitly called — it is the opt-in tool for locking network egress down
 * during SSR (T-027).
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

// ---------------------------------------------------------------------------------------------
// Opt-in network egress lockdown (T-027) — unlike everything above, NOT installed by importing
// this module: `fetch` is a real, working Node global, and replacing it is a policy decision the
// consumer makes explicitly.
// ---------------------------------------------------------------------------------------------

/** The URL string of a `fetch` input — a string, a `URL`, or a `Request`(-like) with a `.url`. */
function urlOf(input) {
  return typeof input === "object" && input !== null && "url" in input
    ? String(input.url)
    : String(input);
}

let activeRestore; // the current lockdown's restore, so a repeated call replaces instead of stacking

/**
 * Lock the global `fetch` down to an origin allowlist (T-027). Component code written for the
 * browser does fetch things — data in `connected()`, sprites, third-party endpoints — and on the
 * server each such call is wasted latency inside the render path at best and an SSRF surface at
 * worst: the render service typically runs inside the network perimeter, so a component fetching
 * a URL derived from page content can reach things a browser never could. A deterministic render
 * pass shouldn't be doing network I/O at all, so `lockdownFetch()` with no arguments blocks
 * everything; `allowOrigins` opens deliberate exceptions.
 *
 * A blocked call rejects fast with an `Error` carrying `code: "SSR_FETCH_BLOCKED"` — but the
 * returned promise is pre-handled, so the fire-and-forget fetches components issue at module
 * scope or in constructors never surface as unhandled rejections; code that does `await` the call
 * still sees the rejection. Relative URLs are blocked as well: the shim has no base origin, so
 * they could never mean what the component thinks. Blocking happens before the real `fetch`, so
 * no request, DNS lookup or socket ever leaves the process.
 *
 * By default each blocked origin is reported once via `console.warn` — not dev-gated, since a
 * component quietly probing the network from the render service is exactly what production logs
 * should show. Pass `onBlocked` to route or silence it.
 *
 * Calling `lockdownFetch` again replaces the active policy (wrappers never stack). The returned
 * `restore()` puts the previous `fetch` back.
 *
 * @param {{ allowOrigins?: string[], onBlocked?: (origin: string, url: string) => void }} [options]
 *   `allowOrigins` entries are normalized to their origin via `new URL(entry).origin` (a full URL
 *   is fine); an invalid entry throws immediately — a config typo must fail setup, not renders.
 *   `onBlocked(origin, url)` observes each blocked call (default: warn once per origin).
 * @return {() => void} restores the `fetch` that was active before this call
 */
export function lockdownFetch({ allowOrigins = [], onBlocked } = {}) {
  const allowed = new Set(allowOrigins.map((entry) => new URL(entry).origin));

  const warned = new Set();
  const report =
    onBlocked ??
    ((origin) => {
      if (warned.has(origin)) return;
      warned.add(origin);
      console.warn(
        `[element-js-ssr-renderer] fetch blocked during SSR: ${origin} — components must not ` +
          `reach the network while rendering (pass it in lockdownFetch({ allowOrigins }) to permit).`,
      );
    });

  activeRestore?.();
  // Kept as the raw reference so `restore()` reinstates exactly what was there; calls go through
  // `.call(globalThis, …)` since some fetch implementations are receiver-sensitive.
  const realFetch =
    typeof globalThis.fetch === "function" ? globalThis.fetch : undefined;

  const wrapper = (input, init) => {
    const url = urlOf(input);
    let origin;
    try {
      origin = new URL(url).origin;
    } catch {
      origin = url; // relative/invalid — can never match a normalized allowlist entry
    }
    if (allowed.has(origin)) {
      if (realFetch) return realFetch.call(globalThis, input, init);
      return Promise.reject(
        new TypeError("global fetch is not available in this runtime"),
      );
    }
    report(origin, url);
    const error = new Error(
      `[element-js-ssr-renderer] fetch blocked during SSR: ${url}`,
    );
    error.code = "SSR_FETCH_BLOCKED";
    const rejection = Promise.reject(error);
    // Mark the rejection handled so fire-and-forget calls don't trip unhandled-rejection
    // handling; every consumer that awaits/chains this promise still receives the error.
    rejection.catch(() => {});
    return rejection;
  };

  globalThis.fetch = wrapper;
  const restore = () => {
    if (globalThis.fetch === wrapper) globalThis.fetch = realFetch;
    if (activeRestore === restore) activeRestore = undefined;
  };
  activeRestore = restore;
  return restore;
}
