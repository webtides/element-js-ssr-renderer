import "../src/dom-shim.js"; // must precede any component import
import { describe, it, expect } from "vitest";
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
