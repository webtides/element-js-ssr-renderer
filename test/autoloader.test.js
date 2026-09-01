// @vitest-environment happy-dom
//
// The autoloader is client code — these tests run in happy-dom (real customElements,
// MutationObserver, DOM), not against the dom-shim like the rest of the suite. The shared
// custom-element registry persists across tests, so every test uses its own tag names.
import { describe, it, expect, vi, afterEach } from "vitest";
import { autoload } from "../src/autoloader.js";

let handles = [];
const start = (options) => {
  const handle = autoload(options);
  handles.push(handle);
  return handle;
};

/** One macrotask — lets MutationObserver callbacks and pending loads settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

afterEach(() => {
  for (const handle of handles) handle.stop();
  handles = [];
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("autoload", () => {
  it("defines a present catalog tag immediately when no ejs-loading attribute is set", async () => {
    document.body.innerHTML = "<x-load-now></x-load-now>";
    const Widget = class extends HTMLElement {};
    start({ resolve: { "x-load-now": Widget } });
    await settle();
    expect(customElements.get("x-load-now")).toBe(Widget);
  });

  it("calls a lazy loader once for many instances and defines module.default", async () => {
    document.body.innerHTML =
      "<x-lazy-one></x-lazy-one><x-lazy-one></x-lazy-one>";
    const Widget = class extends HTMLElement {};
    const loader = vi.fn(async () => ({ default: Widget }));
    const handle = start({ resolve: { "x-lazy-one": loader } });
    await handle.load("x-lazy-one");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(customElements.get("x-lazy-one")).toBe(Widget);
  });

  it("does not load a tag that is absent from the page", async () => {
    document.body.innerHTML = "<div></div>";
    const loader = vi.fn(async () => ({
      default: class extends HTMLElement {},
    }));
    start({ resolve: { "x-absent": loader } });
    await settle();
    expect(loader).not.toHaveBeenCalled();
  });

  it("maps import.meta.glob path keys to tags by basename", async () => {
    document.body.innerHTML = "<x-glob-key></x-glob-key>";
    const Widget = class extends HTMLElement {};
    start({
      resolve: {
        "./components/x-glob-key.js": async () => ({ default: Widget }),
      },
    });
    await settle();
    expect(customElements.get("x-glob-key")).toBe(Widget);
  });

  it("unwraps ComponentConfig values, so one catalog file serves server and client", async () => {
    document.body.innerHTML = "<x-config-value></x-config-value>";
    const Widget = class extends HTMLElement {};
    start({
      resolve: {
        "x-config-value": {
          component: async () => ({ default: Widget }),
          styles: [".ssr-only{}"],
        },
      },
    });
    await settle();
    expect(customElements.get("x-config-value")).toBe(Widget);
  });

  it("composes multiple catalogs later-wins, like the server's resolve", async () => {
    document.body.innerHTML = "<x-later-wins></x-later-wins>";
    const LibraryWidget = class extends HTMLElement {};
    const ProjectWidget = class extends HTMLElement {};
    start({
      resolve: [
        { "x-later-wins": LibraryWidget },
        { "x-later-wins": ProjectWidget },
      ],
    });
    await settle();
    expect(customElements.get("x-later-wins")).toBe(ProjectWidget);
  });

  it('never loads a tag marked ejs-loading="server"', async () => {
    document.body.innerHTML =
      '<x-server-only ejs-loading="server"></x-server-only>';
    const loader = vi.fn(async () => ({
      default: class extends HTMLElement {},
    }));
    start({ resolve: { "x-server-only": loader } });
    await settle();
    expect(loader).not.toHaveBeenCalled();
    expect(customElements.get("x-server-only")).toBeUndefined();
  });

  it("eager mode loads everything immediately, server-marked tags included", async () => {
    document.body.innerHTML =
      '<x-eager-server ejs-loading="server"></x-eager-server>' +
      '<x-eager-idle ejs-loading="hydrate:onIdle"></x-eager-idle>';
    const serverLoader = vi.fn(async () => ({
      default: class extends HTMLElement {},
    }));
    const idleLoader = vi.fn(async () => ({
      default: class extends HTMLElement {},
    }));
    start({
      resolve: { "x-eager-server": serverLoader, "x-eager-idle": idleLoader },
      eager: true,
    });
    await settle();
    expect(serverLoader).toHaveBeenCalledTimes(1);
    expect(idleLoader).toHaveBeenCalledTimes(1);
  });

  it("hydrate:onIdle defers loading until the idle callback fires", async () => {
    let idleCallback;
    vi.stubGlobal("requestIdleCallback", (callback) => {
      idleCallback = callback;
    });
    document.body.innerHTML =
      '<x-on-idle ejs-loading="hydrate:onIdle"></x-on-idle>';
    const loader = vi.fn(async () => ({
      default: class extends HTMLElement {},
    }));
    start({ resolve: { "x-on-idle": loader } });
    await settle();
    expect(loader).not.toHaveBeenCalled();
    idleCallback();
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(customElements.get("x-on-idle")).toBeDefined();
  });

  it("hydrate:onVisible defers loading until an instance intersects", async () => {
    let intersectionCallback;
    const observed = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback) {
          intersectionCallback = callback;
        }
        observe(element) {
          observed.push(element);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    document.body.innerHTML =
      '<x-on-visible ejs-loading="hydrate:onVisible"></x-on-visible>';
    const loader = vi.fn(async () => ({
      default: class extends HTMLElement {},
    }));
    start({ resolve: { "x-on-visible": loader } });
    await settle();
    expect(observed).toHaveLength(1);
    expect(loader).not.toHaveBeenCalled();
    intersectionCallback([{ isIntersecting: false, target: observed[0] }]);
    expect(loader).not.toHaveBeenCalled();
    intersectionCallback([{ isIntersecting: true, target: observed[0] }]);
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(customElements.get("x-on-visible")).toBeDefined();
  });

  it("hydrate:onDelay(ms) loads after the timeout", async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<x-on-delay ejs-loading="hydrate:onDelay(50)"></x-on-delay>';
    const loader = vi.fn(async () => ({
      default: class extends HTMLElement {},
    }));
    start({ resolve: { "x-on-delay": loader } });
    vi.advanceTimersByTime(49);
    expect(loader).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("hydrate:onMedia(query) loads once the media query matches", async () => {
    let mediaListener;
    const mediaQueryList = {
      media: "(min-width: 600px)",
      matches: false,
      addEventListener: (type, listener) => {
        mediaListener = listener;
      },
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQueryList),
    );
    document.body.innerHTML =
      '<x-on-media ejs-loading="hydrate:onMedia((min-width: 600px))"></x-on-media>';
    const loader = vi.fn(async () => ({
      default: class extends HTMLElement {},
    }));
    start({ resolve: { "x-on-media": loader } });
    await settle();
    expect(matchMedia).toHaveBeenCalledWith("(min-width: 600px)");
    expect(loader).not.toHaveBeenCalled();
    mediaListener({ matches: false });
    expect(loader).not.toHaveBeenCalled();
    mediaListener({ matches: true });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(mediaQueryList.removeEventListener).toHaveBeenCalled();
  });

  it("fails open on an invalid media query: warns and loads immediately", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ media: "not all", matches: false })),
    );
    document.body.innerHTML =
      '<x-bad-media ejs-loading="hydrate:onMedia(min-width: 600px)"></x-bad-media>';
    const loader = vi.fn(async () => ({
      default: class extends HTMLElement {},
    }));
    start({ resolve: { "x-bad-media": loader } });
    await settle();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("invalid media query"),
    );
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("fails open on an unknown ejs-loading value: warns and loads immediately", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = '<x-typo ejs-loading="hydrate:onIdel"></x-typo>';
    const loader = vi.fn(async () => ({
      default: class extends HTMLElement {},
    }));
    start({ resolve: { "x-typo": loader } });
    await settle();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('unknown ejs-loading value "hydrate:onIdel"'),
    );
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("picks up elements inserted after the initial scan (MutationObserver)", async () => {
    const Widget = class extends HTMLElement {};
    const loader = vi.fn(async () => ({ default: Widget }));
    start({ resolve: { "x-mutated": loader } });
    await settle();
    expect(loader).not.toHaveBeenCalled();
    const element = document.createElement("x-mutated");
    document.body.appendChild(element);
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(customElements.get("x-mutated")).toBe(Widget);
  });

  it("tolerates side-effect modules that define the tag themselves", async () => {
    document.body.innerHTML = "<x-side-effect></x-side-effect>";
    const Widget = class extends HTMLElement {};
    const loader = vi.fn(async () => {
      customElements.define("x-side-effect", Widget);
      return {};
    });
    const handle = start({ resolve: { "x-side-effect": loader } });
    await handle.load("x-side-effect");
    expect(customElements.get("x-side-effect")).toBe(Widget);
  });

  it("isolates a failing loader per tag: reported, never retried, others load", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = "<x-broken></x-broken><x-fine></x-fine>";
    const brokenLoader = vi.fn(async () => {
      throw new Error("import failed");
    });
    const FineWidget = class extends HTMLElement {};
    const handle = start({
      resolve: {
        "x-broken": brokenLoader,
        "x-fine": async () => ({ default: FineWidget }),
      },
    });
    await settle();
    expect(customElements.get("x-broken")).toBeUndefined();
    expect(customElements.get("x-fine")).toBe(FineWidget);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("<x-broken>"),
      expect.any(Error),
    );
    await handle.load("x-broken");
    expect(brokenLoader).toHaveBeenCalledTimes(1);
  });

  it("stop() disconnects discovery — later inserts load nothing", async () => {
    const loader = vi.fn(async () => ({
      default: class extends HTMLElement {},
    }));
    const handle = start({ resolve: { "x-stopped": loader } });
    await settle();
    handle.stop();
    document.body.appendChild(document.createElement("x-stopped"));
    await settle();
    expect(loader).not.toHaveBeenCalled();
  });

  it("scopes discovery to the given root", async () => {
    document.body.innerHTML =
      "<div id='inside'><x-in-root></x-in-root></div><x-out-of-root></x-out-of-root>";
    const insideLoader = vi.fn(async () => ({
      default: class extends HTMLElement {},
    }));
    const outsideLoader = vi.fn(async () => ({
      default: class extends HTMLElement {},
    }));
    start({
      resolve: { "x-in-root": insideLoader, "x-out-of-root": outsideLoader },
      root: document.querySelector("#inside"),
    });
    await settle();
    expect(insideLoader).toHaveBeenCalledTimes(1);
    expect(outsideLoader).not.toHaveBeenCalled();
  });

  it("requires `resolve` and rejects resolver functions loudly", () => {
    expect(() => autoload()).toThrow(/requires `resolve`/);
    expect(() => autoload({ resolve: (tag) => tag })).toThrow(
      /Catalog objects only/,
    );
  });
});
