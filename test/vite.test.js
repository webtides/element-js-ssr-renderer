import "../src/dom-shim.js"; // must precede any component import
import { describe, it, expect, vi } from "vitest";
import { elementSSR } from "../src/adapters/vite.js";

import Button from "@webtides/element-library/button";

/** Invoke the plugin's `transformIndexHtml` hook the way Vite would, returning the transformed HTML. */
const transform = (plugin, html) => {
  const hook = plugin.transformIndexHtml;
  const handler = typeof hook === "function" ? hook : hook.handler;
  return handler(html);
};

describe("elementSSR (vite plugin)", () => {
  it("is a Vite plugin exposing a transformIndexHtml hook", () => {
    const plugin = elementSSR({ resolve: { "el-button": Button } });
    expect(plugin.name).toBeTruthy();
    expect(plugin.transformIndexHtml).toBeDefined();
  });

  it("pre-renders components from a static catalog", async () => {
    const plugin = elementSSR({ resolve: { "el-button": Button } });
    const out = await transform(plugin, "<el-button>Save</el-button>");
    expect(out).toContain('<template shadowrootmode="open">');
  });

  it("pre-renders components resolved lazily, loading only what's present", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Button }));
    const plugin = elementSSR({ resolve: { "el-button": importer } });

    const out = await transform(plugin, "<el-button>Save</el-button>");
    expect(out).toContain("shadowrootmode");
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("leaves a document with no custom elements structurally intact", async () => {
    const plugin = elementSSR({ resolve: { "el-button": Button } });
    const out = await transform(
      plugin,
      "<!doctype html><html><head><title>x</title></head><body><p>hi</p></body></html>",
    );
    expect(out).toContain("<p>hi</p>");
    expect(out).toContain("<title>x</title>");
  });
});
