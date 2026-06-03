import "../src/dom-shim.js"; // must precede any component import
import { describe, it, expect } from "vitest";
import { renderToString } from "../src/index.js";

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
