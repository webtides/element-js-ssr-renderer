import "../src/dom-shim.js"; // must precede any component import
import { describe, it, expect, vi } from "vitest";
import { renderToString, glob } from "../src/index.js";

import Button from "@webtides/element-library/button";
import InputField from "@webtides/element-library/input-field";
import AccordionGroup from "@webtides/element-library/accordion-group";
import { TemplateElement, html, Store } from "@webtides/element-js";

// Inline shadow components exercising each `adoptGlobalStyles` mode.
class AdoptAll extends TemplateElement {
  constructor() {
    super({ shadowRender: true, styles: [".own{}"] });
  }
  template() {
    return html`<span>all</span>`;
  }
}
class AdoptNone extends TemplateElement {
  constructor() {
    super({ shadowRender: true, styles: [".own{}"], adoptGlobalStyles: false });
  }
  template() {
    return html`<span>none</span>`;
  }
}
class AdoptSelector extends TemplateElement {
  constructor() {
    super({ shadowRender: true, adoptGlobalStyles: ".theme" });
  }
  template() {
    return html`<span>selector</span>`;
  }
}

const catalog = {
  "el-button": Button,
  "el-input-field": InputField,
  "el-accordion-group": AccordionGroup,
  "el-adopt-all": AdoptAll,
  "el-adopt-none": AdoptNone,
  "el-adopt-selector": AdoptSelector,
};

const render = (html) => renderToString(html, { resolve: catalog });

/** Extract the contents of the first declarative shadow root in `out`. */
const shadowOf = (out) =>
  out.slice(out.indexOf("shadowrootmode"), out.indexOf("</template>"));

describe("renderToString", () => {
  it("emits Declarative Shadow DOM for a shadow component", async () => {
    const out = await render('<el-button variant="primary">Save</el-button>');
    expect(out).toContain('<template shadowrootmode="open">');
    expect(out).toContain("<style");
    // the element-js hydration marker must be present so the client hydrates, not re-renders
    expect(out).toContain("<!--template-part-->");
  });

  it("keeps slotted light-DOM content after the shadow template", async () => {
    const out = await render("<el-button>Save</el-button>");
    const closeTemplate = out.indexOf("</template>");
    expect(closeTemplate).toBeGreaterThan(-1);
    // "Save" appears in light DOM, after the </template>
    expect(out.indexOf("Save", closeTemplate)).toBeGreaterThan(closeTemplate);
  });

  it("reflects attributes into the rendered output", async () => {
    const out = await render(
      '<el-button variant="danger" disabled>Delete</el-button>',
    );
    const shadow = out.slice(
      out.indexOf("shadowrootmode"),
      out.indexOf("</template>"),
    );
    // variant/disabled drive the internal <button>'s attributes/classes
    expect(shadow.toLowerCase()).toContain("disabled");
  });

  it("renders a light-DOM component in place (no shadow template)", async () => {
    const out = await render(
      '<el-input-field name="email" label="Email"></el-input-field>',
    );
    expect(out).not.toContain("shadowrootmode");
    expect(out).toContain("<!--template-part-->");
    expect(out).toContain("Email");
  });

  it("inlines a light-DOM component's styles", async () => {
    const out = await render(
      '<el-input-field name="email" label="Email"></el-input-field>',
    );
    expect(out).not.toContain("shadowrootmode");
    // a light-DOM component with styles must still emit them, id'd like element-js (T-004/T-006)
    expect(out).toContain('<style id="EL-INPUT-FIELD0">');
  });

  it("emits a light-DOM component's styles once across repeated instances", async () => {
    const out = await render(
      '<el-input-field name="a"></el-input-field><el-input-field name="b"></el-input-field>',
    );
    // both instances render, but the shared style block is emitted a single time (T-006)
    expect(out).toContain('name="a"');
    expect(out).toContain('name="b"');
    expect(out.match(/<style id="EL-INPUT-FIELD0">/g)?.length).toBe(1);
  });

  it("de-dupes identical adopted global styles within one shadow root", async () => {
    const out = await render(
      '<style class="theme">.dup{}</style><style class="theme">.dup{}</style>' +
        "<el-adopt-selector></el-adopt-selector>",
    );
    const shadow = shadowOf(out);
    expect(shadow.match(/\.dup\{\}/g)?.length).toBe(1);
  });

  it("leaves behavioral wrappers (empty template) untouched", async () => {
    const input = "<el-accordion-group><div>child</div></el-accordion-group>";
    const out = await render(input);
    expect(out).not.toContain("shadowrootmode");
    expect(out).toContain("<div>child</div>");
  });

  it("leaves unresolved tags untouched", async () => {
    const input = '<my-widget foo="bar"><span>hi</span></my-widget>';
    expect(await render(input)).toBe(input);
  });

  it("adopts global styles into a shadow root (adoptGlobalStyles: true)", async () => {
    const out = await render(
      '<style class="theme">.theme{color:red}</style><el-adopt-all></el-adopt-all>',
    );
    const shadow = shadowOf(out);
    // global style inlined, before the component's own styles, and original kept in the document
    expect(shadow).toContain(".theme{color:red}");
    expect(shadow.indexOf(".theme{color:red}")).toBeLessThan(
      shadow.indexOf(".own{}"),
    );
    expect(out.indexOf('<style class="theme">')).toBeGreaterThan(-1);
  });

  it("does not adopt global styles when adoptGlobalStyles is false", async () => {
    const out = await render(
      "<style>.theme{color:red}</style><el-adopt-none></el-adopt-none>",
    );
    expect(shadowOf(out)).not.toContain(".theme{color:red}");
  });

  it("adopts only matching global styles for a selector", async () => {
    const out = await render(
      '<style class="theme">.themed{}</style><style class="other">.skipme{}</style>' +
        "<el-adopt-selector></el-adopt-selector>",
    );
    const shadow = shadowOf(out);
    expect(shadow).toContain(".themed{}");
    expect(shadow).not.toContain(".skipme{}");
  });

  it("does not adopt styles scoped inside an existing template/shadow root", async () => {
    const out = await render(
      "<template><style>.scoped{}</style></template><el-adopt-all></el-adopt-all>",
    );
    expect(shadowOf(out)).not.toContain(".scoped{}");
  });

  it("recurses into slotted custom elements", async () => {
    const out = await render(
      "<el-button><el-button>nested</el-button></el-button>",
    );
    // two shadow templates: outer + nested
    expect(out.match(/shadowrootmode/g)?.length).toBe(2);
  });
});

// Components deriving markup from their authored light DOM — the instance must be backed by the
// parsed node so the server render matches the browser's first render (issue #1).
class SliderPagination extends TemplateElement {
  constructor() {
    super({ shadowRender: true });
  }
  template() {
    const bullets = [...this.children].map(
      (_, i) => html`<button class="bullet">${i + 1}</button>`,
    );
    return html`<div class="track"><slot></slot></div>
      <nav>${bullets}</nav>`;
  }
}
class EchoContent extends TemplateElement {
  template() {
    return html`<p class="echo">${this.textContent.trim()}</p>
      <p class="count">${this.childElementCount}</p>`;
  }
}
class QueryReader extends TemplateElement {
  template() {
    const heading = this.querySelector("h2");
    return html`<header>${heading ? heading.textContent : "untitled"}</header>
      <span>${this.getAttribute("label") ?? "no-label"}</span>
      <span>${this.hasAttribute("featured") ? "featured" : "plain"}</span>`;
  }
}
class AttrProperties extends TemplateElement {
  properties() {
    // properties() may read the DOM surface too — in the browser it runs at upgrade time
    return { greeting: this.getAttribute("greeting") ?? "Hello" };
  }
  template() {
    return html`<p>${this.greeting}</p>`;
  }
}

describe("light-DOM introspection during SSR", () => {
  const introspectionCatalog = {
    "x-slider": SliderPagination,
    "x-echo": EchoContent,
    "x-query": QueryReader,
    "x-attr-props": AttrProperties,
  };
  // Render and strip the hydration comment markers, so assertions read like plain markup.
  const renderWith = async (html) => {
    const out = await renderToString(html, { resolve: introspectionCatalog });
    return out.replace(/<!--[\s\S]*?-->/g, "");
  };

  it("counts authored children (this.children) — slider pagination", async () => {
    const out = await renderWith(
      '<x-slider><div class="slide">a</div><div class="slide">b</div><div class="slide">c</div></x-slider>',
    );
    expect(out.match(/class="bullet"/g)?.length).toBe(3);
    // the authored slides survive as slotted light DOM
    expect(out).toContain('<div class="slide">a</div>');
  });

  it("re-slots authored content via textContent / childElementCount", async () => {
    const out = await renderWith("<x-echo><b>Hi</b> there</x-echo>");
    expect(out).toContain('<p class="echo">Hi there</p>');
    expect(out).toContain('<p class="count">1</p>');
  });

  it("supports querySelector / getAttribute / hasAttribute in template()", async () => {
    const out = await renderWith(
      '<x-query label="News" featured><h2>Breaking</h2></x-query>',
    );
    expect(out).toContain("<header>Breaking</header>");
    expect(out).toContain("<span>News</span>");
    expect(out).toContain("<span>featured</span>");
  });

  it("falls back like the browser when the light DOM lacks the queried parts", async () => {
    const out = await renderWith("<x-query>plain text</x-query>");
    expect(out).toContain("<header>untitled</header>");
    expect(out).toContain("<span>no-label</span>");
    expect(out).toContain("<span>plain</span>");
  });

  it("lets properties() read attributes off the parsed node", async () => {
    const out = await renderWith(
      '<x-attr-props greeting="Servus"></x-attr-props>',
    );
    expect(out).toContain("<p>Servus</p>");
  });
});

// A shadow component whose generated template itself contains another custom element — exercises
// resolution of tags that appear only in generated output, not in the input HTML.
class Wrapper extends TemplateElement {
  constructor() {
    super({ shadowRender: true });
  }
  template() {
    return html`<el-button>wrapped</el-button>`;
  }
}
// Two classes for the same tag, to assert source precedence.
class Red extends TemplateElement {
  constructor() {
    super({ shadowRender: true });
  }
  template() {
    return html`<span>RED</span>`;
  }
}
class Blue extends TemplateElement {
  constructor() {
    super({ shadowRender: true });
  }
  template() {
    return html`<span>BLUE</span>`;
  }
}

describe("renderToString — resolution sources", () => {
  it("resolves a component from a bare resolver function", async () => {
    const out = await renderToString("<el-button>x</el-button>", {
      resolve: (tag) => (tag === "el-button" ? Button : undefined),
    });
    expect(out).toContain('<template shadowrootmode="open">');
  });

  it("auto-detects eager classes and lazy loaders within one catalog", async () => {
    const loaded = vi.fn(() => Promise.resolve({ default: InputField }));
    const out = await renderToString(
      "<el-button>x</el-button><el-input-field></el-input-field>",
      // a single Catalog mixing an eager class (Button) and a lazy loader (InputField),
      // no wrapper — the renderer tells them apart via prototype instanceof HTMLElement
      { resolve: { "el-button": Button, "el-input-field": loaded } },
    );
    expect(out.match(/shadowrootmode/g)?.length).toBe(1); // Button (shadow)
    expect(out).toContain("<!--template-part-->"); // InputField (light) rendered
    expect(loaded).toHaveBeenCalledTimes(1);
  });

  it("imports only the components actually present on the page", async () => {
    const buttonImporter = vi.fn(() => Promise.resolve({ default: Button }));
    const inputImporter = vi.fn(() => Promise.resolve({ default: InputField }));

    const out = await renderToString("<el-button>x</el-button>", {
      // a lazy-loader Catalog dropped straight into resolve — no wrapper
      resolve: {
        "el-button": buttonImporter,
        "el-input-field": inputImporter,
      },
    });

    expect(out).toContain("shadowrootmode");
    expect(buttonImporter).toHaveBeenCalledTimes(1);
    expect(inputImporter).not.toHaveBeenCalled(); // not on the page → never loaded
  });

  it("derives tags from module-path keys (raw import.meta.glob shape)", async () => {
    const out = await renderToString("<el-button>x</el-button>", {
      // import.meta.glob output is a Catalog as-is — path keys, loader values, no wrapper
      resolve: {
        "./components/el-button.js": () => Promise.resolve({ default: Button }),
      },
    });
    expect(out).toContain("shadowrootmode");
  });

  it("honors glob() pathToTag and pick overrides", async () => {
    const out = await renderToString("<el-button>x</el-button>", {
      resolve: glob(
        { "buttons/Btn.entry": () => Promise.resolve({ Btn: Button }) },
        { pathToTag: () => "el-button", pick: (mod) => mod.Btn },
      ),
    });
    expect(out).toContain("shadowrootmode");
  });

  it("lets a later source override an earlier one on a tag clash", async () => {
    const out = await renderToString("<el-clash></el-clash>", {
      resolve: [{ "el-clash": Red }, { "el-clash": Blue }],
    });
    const shadow = shadowOf(out);
    expect(shadow).toContain("BLUE");
    expect(shadow).not.toContain("RED");
  });

  it("resolves custom elements that appear only in generated templates", async () => {
    const out = await renderToString("<el-wrapper></el-wrapper>", {
      resolve: {
        "el-wrapper": () => Promise.resolve({ default: Wrapper }),
        "el-button": () => Promise.resolve({ default: Button }),
      },
    });
    // wrapper's shadow + the button it renders inside that shadow → two declarative shadow roots
    expect(out.match(/shadowrootmode/g)?.length).toBe(2);
  });

  it("reports genuinely unresolved tags once, but not resolved ones", async () => {
    const onUnresolved = vi.fn();
    await renderToString("<my-widget></my-widget><el-button>x</el-button>", {
      resolve: { "el-button": Button },
      onUnresolved,
    });
    expect(onUnresolved).toHaveBeenCalledWith("my-widget");
    expect(onUnresolved).not.toHaveBeenCalledWith("el-button");
    expect(onUnresolved).toHaveBeenCalledTimes(1);
  });
});

describe("unresolved-tag warning (dev)", () => {
  it("warns once for an unresolved custom-element tag, naming it", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render("<el-button>x</el-button><my-unknown></my-unknown>");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("<my-unknown>");
    spy.mockRestore();
  });

  it("warns once per tag even across repeated instances", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render("<my-unknown></my-unknown><my-unknown></my-unknown>");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("does not warn for resolved tags or plain elements", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render("<el-button>x</el-button><div></div>");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("can be silenced with a custom onUnresolved", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await renderToString("<my-unknown></my-unknown>", {
      resolve: catalog,
      onUnresolved: () => {},
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("stays silent in production", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await render("<my-unknown></my-unknown>");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prev;
      spy.mockRestore();
    }
  });
});

// A ComponentConfig catalog value wraps the class with per-component SSR overrides — injected
// styles and an adoptGlobalStyles override — without poking element-js internals (T-021, issue #4).
class ShadowCard extends TemplateElement {
  constructor() {
    super({ shadowRender: true, styles: [".own { color: red; }"] });
  }
  template() {
    return html`<div class="card"><slot></slot></div>`;
  }
}
class LightNote extends TemplateElement {
  constructor() {
    super({ styles: [".note { color: blue; }"] });
  }
  template() {
    return html`<p class="note">note</p>`;
  }
}

describe("ComponentConfig resolve values", () => {
  it("injects config styles into the DSD template, ahead of the component's own styles", async () => {
    const out = await renderToString("<x-card>hi</x-card>", {
      resolve: {
        "x-card": { component: ShadowCard, styles: ".util { margin: 0; }" },
      },
    });
    const shadow = shadowOf(out);
    expect(shadow).toContain(
      '<style id="X-CARD-SSR0">.util { margin: 0; }</style>',
    );
    // the component's own style keeps its untouched element-js hydration id
    expect(shadow).toContain(
      '<style id="X-CARD0">.own { color: red; }</style>',
    );
    expect(shadow.indexOf("X-CARD-SSR0")).toBeLessThan(
      shadow.indexOf("X-CARD0"),
    );
  });

  it("lets the config override adoptGlobalStyles at render time", async () => {
    const doc =
      "<html><head><style>.global {}</style></head><body><x-card>hi</x-card></body></html>";
    const withGlobals = await renderToString(doc, {
      resolve: { "x-card": ShadowCard },
    });
    expect(shadowOf(withGlobals)).toContain(".global {}");

    const withoutGlobals = await renderToString(doc, {
      resolve: {
        "x-card": { component: ShadowCard, adoptGlobalStyles: false },
      },
    });
    expect(shadowOf(withoutGlobals)).not.toContain(".global {}");
  });

  it("accepts an array of styles and keeps their order", async () => {
    const out = await renderToString("<x-card>hi</x-card>", {
      resolve: {
        "x-card": { component: ShadowCard, styles: [".a {}", ".b {}"] },
      },
    });
    const shadow = shadowOf(out);
    expect(shadow).toContain('<style id="X-CARD-SSR0">.a {}</style>');
    expect(shadow).toContain('<style id="X-CARD-SSR1">.b {}</style>');
  });

  it("inlines injected styles for light-DOM components, once across instances", async () => {
    const out = await renderToString("<x-note></x-note><x-note></x-note>", {
      resolve: {
        "x-note": { component: LightNote, styles: ".crit {}" },
      },
    });
    expect(out.match(/id="X-NOTE-SSR0"/g)?.length).toBe(1);
    expect(out.match(/id="X-NOTE0"/g)?.length).toBe(1);
  });

  it("supports a lazy loader as the config's component", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: ShadowCard }));
    const out = await renderToString("<x-card>a</x-card><x-card>b</x-card>", {
      resolve: {
        "x-card": { component: importer, styles: ".lazy {}" },
      },
    });
    expect(importer).toHaveBeenCalledTimes(1);
    expect(out).toContain(".lazy {}");
    expect(out.match(/shadowrootmode/g)?.length).toBe(2);
  });

  it("accepts a config returned from a resolver function", async () => {
    const out = await renderToString("<x-card>hi</x-card>", {
      resolve: (tag) =>
        tag === "x-card"
          ? {
              component: ShadowCard,
              adoptGlobalStyles: false,
              styles: ".fn {}",
            }
          : undefined,
    });
    expect(shadowOf(out)).toContain(".fn {}");
  });

  it("reports a clear error when component is missing or not a class (isolated, T-025)", async () => {
    const onError = vi.fn();
    const out = await renderToString("<x-card>kept</x-card>", {
      resolve: { "x-card": { styles: ".oops {}", component: {} } },
      onError,
    });
    // an invalid config is a resolve failure: isolated like a rejected import, not a page failure
    expect(out).toContain("<x-card>kept</x-card>");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe("x-card");
    expect(onError.mock.calls[0][1].message).toMatch(/<x-card>.*component/s);
  });
});

// Components that throw at each stage `renderComponent` runs — the page must survive all of them
// with the failing element left untouched (T-020, issue #3).
class ThrowingTemplate extends TemplateElement {
  template() {
    throw new Error("boom-template");
  }
}
class ThrowingProperties extends TemplateElement {
  properties() {
    throw new Error("boom-properties");
  }
  template() {
    return html`<p>never rendered</p>`;
  }
}
class ThrowingConstructor extends TemplateElement {
  constructor() {
    super();
    throw new Error("boom-constructor");
  }
}

describe("per-component error isolation", () => {
  const errorCatalog = {
    ...catalog,
    "x-throws": ThrowingTemplate,
    "x-throws-props": ThrowingProperties,
    "x-throws-ctor": ThrowingConstructor,
  };
  const renderIsolated = (html, options = {}) =>
    renderToString(html, {
      resolve: errorCatalog,
      onError: () => {},
      ...options,
    });

  it("leaves the throwing element untouched and still renders its siblings", async () => {
    const out = await renderIsolated(
      '<x-throws><span class="kept">authored</span></x-throws><el-button>ok</el-button>',
    );
    // the failing element keeps its authored markup, as if unresolved
    expect(out).toContain(
      '<x-throws><span class="kept">authored</span></x-throws>',
    );
    // the healthy sibling still pre-renders
    expect(out).toContain('<template shadowrootmode="open">');
  });

  it("isolates throwing properties() and constructor the same way", async () => {
    const out = await renderIsolated(
      "<x-throws-props>a</x-throws-props><x-throws-ctor>b</x-throws-ctor>",
    );
    expect(out).toContain("<x-throws-props>a</x-throws-props>");
    expect(out).toContain("<x-throws-ctor>b</x-throws-ctor>");
    expect(out).not.toContain("never rendered");
  });

  it("still renders custom elements nested inside a failing one", async () => {
    const out = await renderIsolated(
      "<x-throws><el-button>inner</el-button></x-throws>",
    );
    expect(out).toContain('<template shadowrootmode="open">');
  });

  it("calls onError once per failing tag with the thrown error", async () => {
    const onError = vi.fn();
    await renderIsolated(
      "<x-throws>1</x-throws><x-throws>2</x-throws><x-throws-props>3</x-throws-props>",
      { onError },
    );
    expect(onError).toHaveBeenCalledTimes(2);
    const byTag = Object.fromEntries(onError.mock.calls);
    expect(byTag["x-throws"].message).toBe("boom-template");
    expect(byTag["x-throws-props"].message).toBe("boom-properties");
  });

  it("logs via console.error by default, also in production", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await renderToString("<x-throws></x-throws>", { resolve: errorCatalog });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toContain("<x-throws>");
    } finally {
      process.env.NODE_ENV = prev;
      spy.mockRestore();
    }
  });

  it("fails the whole render when onError rethrows (fail-fast opt-in)", async () => {
    await expect(
      renderIsolated("<x-throws></x-throws>", {
        onError: (_tag, error) => {
          throw error;
        },
      }),
    ).rejects.toThrow("boom-template");
  });
});

// A rejected `resolve()` — a lazy loader whose dynamic import fails, a throwing resolver function,
// a broken catalog entry — is as per-component as a throwing template() and must not take down the
// whole-page render (T-025, issue #9).
describe("resolver failure isolation", () => {
  const failingCatalog = {
    ...catalog,
    "x-broken": () => Promise.reject(new Error("boom-import")),
  };

  it("leaves the failing tag untouched and still renders its siblings", async () => {
    const onError = vi.fn();
    const out = await renderToString(
      '<x-broken><span class="kept">authored</span></x-broken><el-button>ok</el-button>',
      { resolve: failingCatalog, onError },
    );
    expect(out).toContain(
      '<x-broken><span class="kept">authored</span></x-broken>',
    );
    expect(out).toContain('<template shadowrootmode="open">');
  });

  it("reports through onError once per tag, with the rejection error", async () => {
    const onError = vi.fn();
    await renderToString("<x-broken>1</x-broken><x-broken>2</x-broken>", {
      resolve: failingCatalog,
      onError,
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe("x-broken");
    expect(onError.mock.calls[0][1].message).toBe("boom-import");
  });

  it("does not call onUnresolved for a resolve-failed tag", async () => {
    const onUnresolved = vi.fn();
    await renderToString("<x-broken></x-broken><x-unknown></x-unknown>", {
      resolve: failingCatalog,
      onError: () => {},
      onUnresolved,
    });
    // the genuinely unknown tag still warns; the broken one is known, just failed
    expect(onUnresolved).toHaveBeenCalledTimes(1);
    expect(onUnresolved).toHaveBeenCalledWith("x-unknown");
  });

  it("isolates a synchronously throwing resolver function too", async () => {
    const onError = vi.fn();
    const out = await renderToString(
      "<x-sync></x-sync><el-button>ok</el-button>",
      {
        resolve: [
          catalog,
          (tag) => {
            if (tag === "x-sync") throw new Error("boom-sync");
          },
        ],
        onError,
      },
    );
    expect(out).toContain("<x-sync></x-sync>");
    expect(out).toContain('<template shadowrootmode="open">');
    expect(onError).toHaveBeenCalledWith("x-sync", expect.any(Error));
  });

  it("logs via console.error by default, also in production", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await renderToString("<x-broken></x-broken>", {
        resolve: failingCatalog,
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toContain("<x-broken>");
      expect(spy.mock.calls[0][0]).toContain("failed to resolve");
    } finally {
      process.env.NODE_ENV = prev;
      spy.mockRestore();
    }
  });

  it("fails the whole render when onError rethrows (fail-fast opt-in)", async () => {
    await expect(
      renderToString("<x-broken></x-broken>", {
        resolve: failingCatalog,
        onError: (_tag, error) => {
          throw error;
        },
      }),
    ).rejects.toThrow("boom-import");
  });
});

// The input's `<html lang>` is adopted onto the shim's documentElement during the render, so
// lang-dependent components (Intl, i18n) see the page's language instead of the shim's 'en'
// default (T-026, issue #10).
class XLang extends TemplateElement {
  template() {
    return html`<span>${globalThis.document.documentElement.lang}</span>`;
  }
}

describe("document language adoption", () => {
  const langCatalog = { "x-lang": XLang };
  const renderLang = (input) => renderToString(input, { resolve: langCatalog });

  it("renders components with the input document's <html lang>", async () => {
    const out = await renderLang(
      '<html lang="de"><body><x-lang></x-lang></body></html>',
    );
    expect(out).toContain("-->de<!--");
  });

  it("restores the previous shim value after the render", async () => {
    await renderLang('<html lang="fr"><body><x-lang></x-lang></body></html>');
    expect(globalThis.document.documentElement.lang).toBe("en");
  });

  it("leaves the current value alone when the input carries no lang", async () => {
    globalThis.document.documentElement.lang = "es";
    try {
      const noAttr = await renderLang(
        "<html><body><x-lang></x-lang></body></html>",
      );
      expect(noAttr).toContain("-->es<!--");
      const fragment = await renderLang("<x-lang></x-lang>");
      expect(fragment).toContain("-->es<!--");
    } finally {
      globalThis.document.documentElement.lang = "en";
    }
  });

  it("restores even when the render fails fast via a rethrowing onError", async () => {
    await expect(
      renderToString(
        '<html lang="it"><body><x-broken-lang></x-broken-lang></body></html>',
        {
          resolve: { "x-broken-lang": () => Promise.reject(new Error("boom")) },
          onError: (_tag, error) => {
            throw error;
          },
        },
      ),
    ).rejects.toThrow("boom");
    expect(globalThis.document.documentElement.lang).toBe("en");
  });
});

// A plain stateful shadow component: its `count`/`label` properties form its serializable state.
class StateCounter extends TemplateElement {
  constructor() {
    super({ shadowRender: true });
  }
  properties() {
    return { count: 0, label: "Apples" };
  }
  template() {
    return html`<span>${this.label}: ${this.count}</span>`;
  }
}
// A Store subclass whose `items` property is its serializable state.
class CartStore extends Store {
  properties() {
    return { items: 0 };
  }
}
// One shared store instance (keyed) referenced by every CartBadge — the de-duplication case.
const cart = new CartStore({ items: 2 }, { key: "cart" });
class CartBadge extends TemplateElement {
  constructor() {
    super({ shadowRender: true });
  }
  properties() {
    return { cart };
  }
  template() {
    return html`<span>${this.cart.items}</span>`;
  }
}

const stateCatalog = {
  "state-counter": StateCounter,
  "cart-badge": CartBadge,
};

/** Parse the document's single `ejs/json` state script back into an object (or `undefined`). */
const stateOf = (out) => {
  const match = out.match(/<script type="ejs\/json">([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : undefined;
};

describe("state transport (serializeState)", () => {
  it("does not stamp keys or emit a state script by default", async () => {
    const out = await renderToString(
      '<state-counter count="3"></state-counter>',
      { resolve: stateCatalog },
    );
    expect(out).not.toContain("ejs:key");
    expect(out).not.toContain("ejs/json");
  });

  it("stamps a deterministic ejs:key on each rendered host", async () => {
    const out = await renderToString(
      "<state-counter></state-counter><state-counter></state-counter>",
      { resolve: stateCatalog, serializeState: true },
    );
    expect(out).toContain('ejs:key="state-counter-0"');
    expect(out).toContain('ejs:key="state-counter-1"');
  });

  it("is deterministic — identical input yields identical output", async () => {
    const input =
      '<state-counter count="1"></state-counter><state-counter count="2"></state-counter>';
    const a = await renderToString(input, {
      resolve: stateCatalog,
      serializeState: true,
    });
    const b = await renderToString(input, {
      resolve: stateCatalog,
      serializeState: true,
    });
    expect(a).toBe(b);
  });

  it("emits one ejs/json script whose state matches the server values", async () => {
    const out = await renderToString(
      '<state-counter count="3" label="Pears"></state-counter>',
      { resolve: stateCatalog, serializeState: true },
    );
    expect(out.match(/type="ejs\/json"/g)?.length).toBe(1);
    const state = stateOf(out);
    // attribute-overridden count + default label captured under the host's key
    expect(state["state-counter-0"]).toEqual({ count: 3, label: "Pears" });
  });

  it("restores a round-tripped component to its server state", async () => {
    const out = await renderToString(
      '<state-counter count="7"></state-counter>',
      { resolve: stateCatalog, serializeState: true },
    );
    const state = stateOf(out);
    // simulate element-js' restoreState: Object.assign(instance, state[key])
    const restored = Object.assign(
      new StateCounter(),
      state["state-counter-0"],
    );
    expect(restored.count).toBe(7);
    expect(restored.label).toBe("Apples");
  });

  it("serializes a shared Store once, referenced by each host", async () => {
    const out = await renderToString(
      "<cart-badge></cart-badge><cart-badge></cart-badge>",
      { resolve: stateCatalog, serializeState: true },
    );
    const state = stateOf(out);
    // both hosts reference the store by key; the store's state lives once under that key
    expect(state["cart-badge-0"]).toEqual({ cart: "Store/cart" });
    expect(state["cart-badge-1"]).toEqual({ cart: "Store/cart" });
    expect(state.cart).toEqual({ items: 2 });
    // the store body is emitted a single time, not once per referencing host
    expect(out.match(/"items":2/g)?.length).toBe(1);
  });
});

describe("excluding tags from SSR (exclude)", () => {
  class Modal extends TemplateElement {
    template() {
      return html`<p>server-rendered modal</p>`;
    }
  }

  it("leaves an excluded tag untouched while siblings still render", async () => {
    const out = await renderToString(
      "<x-modal><p>authored</p></x-modal><el-button>ok</el-button>",
      {
        resolve: { "x-modal": Modal, "el-button": Button },
        exclude: ["x-modal"],
      },
    );
    // unresolved-by-choice: authored markup survives, nothing server-rendered
    expect(out).toContain("<x-modal><p>authored</p></x-modal>");
    expect(out).not.toContain("server-rendered modal");
    // the non-excluded sibling still pre-renders
    expect(out).toContain('<template shadowrootmode="open">');
  });

  it("does not report an excluded tag as unresolved", async () => {
    const onUnresolved = vi.fn();
    await renderToString("<x-modal></x-modal><x-unknown></x-unknown>", {
      exclude: ["x-modal"],
      onUnresolved,
    });
    // the genuinely unknown tag is still reported; the excluded one is intentional
    expect(onUnresolved).toHaveBeenCalledWith("x-unknown");
    expect(onUnresolved).not.toHaveBeenCalledWith("x-modal");
  });

  it("never resolves or imports an excluded tag's module", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Modal }));
    const out = await renderToString("<x-modal></x-modal>", {
      resolve: { "x-modal": importer },
      exclude: ["x-modal"],
      onUnresolved: () => {},
    });
    expect(importer).not.toHaveBeenCalled();
    expect(out).toContain("<x-modal></x-modal>");
  });

  it("accepts a predicate", async () => {
    const out = await renderToString(
      "<x-modal>a</x-modal><el-button>ok</el-button>",
      {
        resolve: { "x-modal": Modal, "el-button": Button },
        exclude: (tag) => tag.endsWith("-modal"),
      },
    );
    expect(out).toContain("<x-modal>a</x-modal>");
    expect(out).toContain('<template shadowrootmode="open">');
  });

  it("matches listed tags case-insensitively", async () => {
    const out = await renderToString("<x-modal>a</x-modal>", {
      resolve: { "x-modal": Modal },
      exclude: ["X-Modal"],
    });
    expect(out).toContain("<x-modal>a</x-modal>");
    expect(out).not.toContain("server-rendered modal");
  });
});
