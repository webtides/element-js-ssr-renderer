import { lockdownFetch } from "../src/dom-shim.js"; // must precede any component import
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "../src/index.js";
import { TemplateElement, html } from "@webtides/element-js";

describe("dom-shim browser-API coverage", () => {
  it("aliases window to globalThis so window.* reaches the same stubs", () => {
    expect(globalThis.window).toBe(globalThis);
    expect(window.matchMedia).toBe(globalThis.matchMedia);
  });

  it("provides an inert matchMedia", () => {
    const mql = matchMedia("(min-width: 600px)");
    expect(mql.matches).toBe(false);
    expect(mql.media).toBe("(min-width: 600px)");
    expect(() => {
      mql.addEventListener("change", () => {});
      mql.removeEventListener("change", () => {});
      mql.addListener(() => {});
      mql.removeListener(() => {});
    }).not.toThrow();
  });

  it("provides inert Intersection/Resize/MutationObserver", () => {
    for (const Observer of [
      IntersectionObserver,
      ResizeObserver,
      MutationObserver,
    ]) {
      const observer = new Observer(() => {});
      expect(() => {
        observer.observe({});
        observer.unobserve({});
        observer.disconnect();
      }).not.toThrow();
      expect(observer.takeRecords()).toEqual([]);
    }
  });

  it("never invokes requestAnimationFrame callbacks (deferred updates must not run against the shim)", async () => {
    let ran = false;
    const handle = requestAnimationFrame(() => {
      ran = true;
    });
    expect(() => cancelAnimationFrame(handle)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(ran).toBe(false);
  });

  it("provides inert localStorage/sessionStorage", () => {
    for (const storage of [localStorage, sessionStorage]) {
      expect(storage.getItem("theme")).toBe(null);
      expect(storage.key(0)).toBe(null);
      expect(() => {
        storage.setItem("theme", "dark");
        storage.removeItem("theme");
        storage.clear();
      }).not.toThrow();
      expect(storage.length).toBe(0);
    }
  });

  it("provides an inert CSSStyleSheet", async () => {
    const sheet = new CSSStyleSheet();
    expect(() => sheet.replaceSync(":host { color: red; }")).not.toThrow();
    await expect(sheet.replace(":host { color: red; }")).resolves.toBe(sheet);
  });

  it("provides navigator and location with neutral values", () => {
    expect(typeof navigator.userAgent).toBe("string");
    expect(location.pathname).toBe("/");
    expect(location.search).toBe("");
    expect(location.hash).toBe("");
    expect(typeof location.origin).toBe("string");
  });

  it("provides global and document event/query surfaces", () => {
    expect(() => {
      addEventListener("resize", () => {});
      removeEventListener("resize", () => {});
    }).not.toThrow();
    expect(dispatchEvent({})).toBe(true);

    expect(document.querySelector("#nope")).toBe(null);
    expect(document.querySelectorAll(".nope")).toEqual([]);
    expect(document.getElementsByTagName("style")).toEqual([]);
    expect(document.adoptedStyleSheets).toEqual([]);
    expect(document.createTextNode("hi").textContent).toBe("hi");
    expect(() => {
      document.addEventListener("click", () => {});
      document.removeEventListener("click", () => {});
      document.documentElement.setAttribute("lang", "de");
      document.head.appendChild({});
    }).not.toThrow();
    expect(document.documentElement.getAttribute("lang")).toBe(null);
    expect(document.head.querySelector("style")).toBe(null);
  });

  it("renders a component whose constructor touches the stubbed APIs", async () => {
    class MediaAware extends TemplateElement {
      constructor() {
        super();
        // typical real-world constructor code: feature checks, observers, storage reads
        this.reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        this.storedTheme = localStorage.getItem("theme") ?? "light";
        new ResizeObserver(() => {}).observe(this);
        requestAnimationFrame(() => {
          throw new Error("must never run during SSR");
        });
      }
      template() {
        return html`<p>${this.storedTheme}:${this.reducedMotion}</p>`;
      }
    }

    const out = await renderToString(`<media-aware></media-aware>`, {
      resolve: { "media-aware": MediaAware },
    });
    const text = out.replace(/<!--[\s\S]*?-->/g, "");
    expect(text).toContain("light:false");
  });
});
// Opt-in network egress lockdown (T-027, issue #11): during SSR, component fetches are wasted
// latency at best and an SSRF surface at worst — lockdownFetch blocks everything outside an
// origin allowlist, before any request leaves the process.
describe("lockdownFetch", () => {
  const originalFetch = globalThis.fetch;
  let realFetch;
  let restore;

  const lockdown = (options) => {
    realFetch = vi.fn(() => Promise.resolve("real-response"));
    globalThis.fetch = realFetch;
    restore = lockdownFetch({ onBlocked: () => {}, ...options });
  };

  afterEach(() => {
    restore?.();
    restore = undefined;
    globalThis.fetch = originalFetch;
  });

  it("blocks every origin by default, before the real fetch is reached", async () => {
    lockdown();
    await expect(fetch("https://api.example.com/data")).rejects.toMatchObject({
      code: "SSR_FETCH_BLOCKED",
    });
    expect(realFetch).not.toHaveBeenCalled();
  });

  it("lets allowlisted origins through to the real fetch", async () => {
    // a full URL as the entry is fine — it is normalized to its origin
    lockdown({ allowOrigins: ["https://api.example.com/some/deep/path"] });
    const init = { method: "POST" };
    await expect(fetch("https://api.example.com/data", init)).resolves.toBe(
      "real-response",
    );
    expect(realFetch).toHaveBeenCalledWith(
      "https://api.example.com/data",
      init,
    );
    // Request-like inputs are matched by their .url
    await fetch({ url: "https://api.example.com/other" });
    expect(realFetch).toHaveBeenCalledTimes(2);
    // same origin, different scheme/port = different origin
    await expect(fetch("http://api.example.com/data")).rejects.toMatchObject({
      code: "SSR_FETCH_BLOCKED",
    });
  });

  it("blocks relative URLs (no base origin exists on the server)", async () => {
    lockdown({ allowOrigins: ["https://api.example.com"] });
    await expect(fetch("/api/data")).rejects.toMatchObject({
      code: "SSR_FETCH_BLOCKED",
    });
    expect(realFetch).not.toHaveBeenCalled();
  });

  it("reports blocked calls through onBlocked with origin and url", async () => {
    const onBlocked = vi.fn();
    lockdown({ onBlocked });
    await fetch("https://evil.example/steal?x=1").catch(() => {});
    expect(onBlocked).toHaveBeenCalledWith(
      "https://evil.example",
      "https://evil.example/steal?x=1",
    );
  });

  it("warns once per blocked origin by default", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      realFetch = vi.fn();
      globalThis.fetch = realFetch;
      restore = lockdownFetch(); // no onBlocked — default reporter
      await fetch("https://a.example/1").catch(() => {});
      await fetch("https://a.example/2").catch(() => {});
      await fetch("https://b.example/1").catch(() => {});
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls[0][0]).toContain("https://a.example");
    } finally {
      spy.mockRestore();
    }
  });

  it("never surfaces blocked fire-and-forget calls as unhandled rejections", async () => {
    lockdown();
    const events = [];
    const listener = (reason) => events.push(reason);
    process.on("unhandledRejection", listener);
    try {
      fetch("https://blocked.example/ping"); // deliberately not awaited or caught
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(events).toEqual([]);
    } finally {
      process.off("unhandledRejection", listener);
    }
  });

  it("restore() reinstates the exact previous fetch", () => {
    lockdown();
    expect(globalThis.fetch).not.toBe(realFetch);
    restore();
    expect(globalThis.fetch).toBe(realFetch);
  });

  it("a repeated call replaces the policy instead of stacking wrappers", async () => {
    lockdown(); // block everything
    restore = lockdownFetch({
      allowOrigins: ["https://api.example.com"],
      onBlocked: () => {},
    });
    // were the wrappers stacked, the inner block-all policy would still reject this
    await expect(fetch("https://api.example.com/data")).resolves.toBe(
      "real-response",
    );
    restore();
    expect(globalThis.fetch).toBe(realFetch);
  });

  it("throws on an invalid allowOrigins entry without touching fetch", () => {
    realFetch = vi.fn();
    globalThis.fetch = realFetch;
    expect(() => lockdownFetch({ allowOrigins: ["not a url"] })).toThrow();
    expect(globalThis.fetch).toBe(realFetch);
  });
});
