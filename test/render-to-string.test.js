import "../src/dom-shim.js"; // must precede any component import
import { describe, it, expect, vi } from "vitest";
import { renderToString, renderToStringAsync, lazy } from "../src/index.js";

import Button from "@webtides/element-library/button";
import InputField from "@webtides/element-library/input-field";
import AccordionGroup from "@webtides/element-library/accordion-group";
import { TemplateElement, html } from "@webtides/element-js";

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

const registry = {
  "el-button": Button,
  "el-input-field": InputField,
  "el-accordion-group": AccordionGroup,
  "el-adopt-all": AdoptAll,
  "el-adopt-none": AdoptNone,
  "el-adopt-selector": AdoptSelector,
};

const render = (html) => renderToString(html, { registry });

/** Extract the contents of the first declarative shadow root in `out`. */
const shadowOf = (out) =>
  out.slice(out.indexOf("shadowrootmode"), out.indexOf("</template>"));

describe("renderToString", () => {
  it("emits Declarative Shadow DOM for a shadow component", () => {
    const out = render('<el-button variant="primary">Save</el-button>');
    expect(out).toContain('<template shadowrootmode="open">');
    expect(out).toContain("<style");
    // the element-js hydration marker must be present so the client hydrates, not re-renders
    expect(out).toContain("<!--template-part-->");
  });

  it("keeps slotted light-DOM content after the shadow template", () => {
    const out = render("<el-button>Save</el-button>");
    const closeTemplate = out.indexOf("</template>");
    expect(closeTemplate).toBeGreaterThan(-1);
    // "Save" appears in light DOM, after the </template>
    expect(out.indexOf("Save", closeTemplate)).toBeGreaterThan(closeTemplate);
  });

  it("reflects attributes into the rendered output", () => {
    const out = render(
      '<el-button variant="danger" disabled>Delete</el-button>',
    );
    const shadow = out.slice(
      out.indexOf("shadowrootmode"),
      out.indexOf("</template>"),
    );
    // variant/disabled drive the internal <button>'s attributes/classes
    expect(shadow.toLowerCase()).toContain("disabled");
  });

  it("renders a light-DOM component in place (no shadow template)", () => {
    const out = render(
      '<el-input-field name="email" label="Email"></el-input-field>',
    );
    expect(out).not.toContain("shadowrootmode");
    expect(out).toContain("<!--template-part-->");
    expect(out).toContain("Email");
  });

  it("inlines a light-DOM component's styles", () => {
    const out = render(
      '<el-input-field name="email" label="Email"></el-input-field>',
    );
    expect(out).not.toContain("shadowrootmode");
    // a light-DOM component with styles must still emit them, id'd like element-js (T-004/T-006)
    expect(out).toContain('<style id="EL-INPUT-FIELD0">');
  });

  it("emits a light-DOM component's styles once across repeated instances", () => {
    const out = render(
      '<el-input-field name="a"></el-input-field><el-input-field name="b"></el-input-field>',
    );
    // both instances render, but the shared style block is emitted a single time (T-006)
    expect(out).toContain('name="a"');
    expect(out).toContain('name="b"');
    expect(out.match(/<style id="EL-INPUT-FIELD0">/g)?.length).toBe(1);
  });

  it("de-dupes identical adopted global styles within one shadow root", () => {
    const out = render(
      '<style class="theme">.dup{}</style><style class="theme">.dup{}</style>' +
        "<el-adopt-selector></el-adopt-selector>",
    );
    const shadow = shadowOf(out);
    expect(shadow.match(/\.dup\{\}/g)?.length).toBe(1);
  });

  it("leaves behavioral wrappers (empty template) untouched", () => {
    const input = "<el-accordion-group><div>child</div></el-accordion-group>";
    const out = render(input);
    expect(out).not.toContain("shadowrootmode");
    expect(out).toContain("<div>child</div>");
  });

  it("leaves unregistered tags untouched", () => {
    const input = '<my-widget foo="bar"><span>hi</span></my-widget>';
    expect(render(input)).toBe(input);
  });

  it("adopts global styles into a shadow root (adoptGlobalStyles: true)", () => {
    const out = render(
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

  it("does not adopt global styles when adoptGlobalStyles is false", () => {
    const out = render(
      "<style>.theme{color:red}</style><el-adopt-none></el-adopt-none>",
    );
    expect(shadowOf(out)).not.toContain(".theme{color:red}");
  });

  it("adopts only matching global styles for a selector", () => {
    const out = render(
      '<style class="theme">.themed{}</style><style class="other">.skipme{}</style>' +
        "<el-adopt-selector></el-adopt-selector>",
    );
    const shadow = shadowOf(out);
    expect(shadow).toContain(".themed{}");
    expect(shadow).not.toContain(".skipme{}");
  });

  it("does not adopt styles scoped inside an existing template/shadow root", () => {
    const out = render(
      "<template><style>.scoped{}</style></template><el-adopt-all></el-adopt-all>",
    );
    expect(shadowOf(out)).not.toContain(".scoped{}");
  });

  it("recurses into slotted custom elements", () => {
    const out = render("<el-button><el-button>nested</el-button></el-button>");
    // two shadow templates: outer + nested
    expect(out.match(/shadowrootmode/g)?.length).toBe(2);
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

describe("renderToStringAsync", () => {
  it("renders identically to the sync path for the same components", async () => {
    const input = '<el-button variant="primary">Save</el-button>';
    const sync = renderToString(input, { registry });
    const out = await renderToStringAsync(input, { resolve: registry });
    expect(out).toBe(sync);
  });

  it("resolves a component from a bare resolver function", async () => {
    const out = await renderToStringAsync("<el-button>x</el-button>", {
      resolve: (tag) => (tag === "el-button" ? Button : undefined),
    });
    expect(out).toContain('<template shadowrootmode="open">');
  });

  it("imports only the components actually present on the page", async () => {
    const buttonImporter = vi.fn(() => Promise.resolve({ default: Button }));
    const inputImporter = vi.fn(() => Promise.resolve({ default: InputField }));
    const source = lazy({
      "el-button": buttonImporter,
      "el-input-field": inputImporter,
    });

    const out = await renderToStringAsync("<el-button>x</el-button>", {
      resolve: source,
    });

    expect(out).toContain("shadowrootmode");
    expect(buttonImporter).toHaveBeenCalledTimes(1);
    expect(inputImporter).not.toHaveBeenCalled(); // not on the page → never loaded
  });

  it("derives tags from module-path keys (import.meta.glob shape)", async () => {
    const source = lazy({
      "./components/el-button.js": () => Promise.resolve({ default: Button }),
    });
    const out = await renderToStringAsync("<el-button>x</el-button>", {
      resolve: source,
    });
    expect(out).toContain("shadowrootmode");
  });

  it("honors lazy() pathToTag and pick overrides", async () => {
    const out = await renderToStringAsync("<el-button>x</el-button>", {
      resolve: lazy(
        { "buttons/Btn.entry": () => Promise.resolve({ Btn: Button }) },
        { pathToTag: () => "el-button", pick: (mod) => mod.Btn },
      ),
    });
    expect(out).toContain("shadowrootmode");
  });

  it("lets a later source override an earlier one on a tag clash", async () => {
    const out = await renderToStringAsync("<el-clash></el-clash>", {
      resolve: [{ "el-clash": Red }, { "el-clash": Blue }],
    });
    const shadow = shadowOf(out);
    expect(shadow).toContain("BLUE");
    expect(shadow).not.toContain("RED");
  });

  it("resolves custom elements that appear only in generated templates", async () => {
    const out = await renderToStringAsync("<el-wrapper></el-wrapper>", {
      resolve: lazy({
        "el-wrapper": () => Promise.resolve({ default: Wrapper }),
        "el-button": () => Promise.resolve({ default: Button }),
      }),
    });
    // wrapper's shadow + the button it renders inside that shadow → two declarative shadow roots
    expect(out.match(/shadowrootmode/g)?.length).toBe(2);
  });

  it("reports genuinely unresolved tags once, but not resolved ones", async () => {
    const onUnresolved = vi.fn();
    await renderToStringAsync(
      "<my-widget></my-widget><el-button>x</el-button>",
      { resolve: { "el-button": Button }, onUnresolved },
    );
    expect(onUnresolved).toHaveBeenCalledWith("my-widget");
    expect(onUnresolved).not.toHaveBeenCalledWith("el-button");
    expect(onUnresolved).toHaveBeenCalledTimes(1);
  });
});

describe("unresolved-tag warning (dev)", () => {
  it("warns once for an unresolved custom-element tag, naming it", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render("<el-button>x</el-button><my-unknown></my-unknown>");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("<my-unknown>");
    spy.mockRestore();
  });

  it("warns once per tag even across repeated instances", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render("<my-unknown></my-unknown><my-unknown></my-unknown>");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("does not warn for resolved tags or plain elements", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render("<el-button>x</el-button><div></div>");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("can be silenced with a custom onUnresolved", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderToString("<my-unknown></my-unknown>", {
      registry,
      onUnresolved: () => {},
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("stays silent in production", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      render("<my-unknown></my-unknown>");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prev;
      spy.mockRestore();
    }
  });

  it("warns through the async path too", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await renderToStringAsync("<my-unknown></my-unknown>", {
      resolve: { "el-button": Button },
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("<my-unknown>");
    spy.mockRestore();
  });
});
