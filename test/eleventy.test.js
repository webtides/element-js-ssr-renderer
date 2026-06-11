import "../src/dom-shim.js"; // must precede any component import
import { describe, it, expect, vi } from "vitest";
import { elementSSR } from "../src/adapters/eleventy.js";

import Button from "@webtides/element-library/button";

/**
 * Run the transform the way Eleventy does: as a method whose `this.page.outputPath` is set, so the
 * `.html` gate sees it. `outputPath` defaults to an `.html` path; pass `false`/a non-HTML path to
 * exercise the pass-through.
 */
const runTransform = (transform, content, outputPath = "/_site/index.html") =>
  transform.call({ page: { outputPath } }, content);

describe("elementSSR (eleventy transform)", () => {
  it("pre-renders components from a static catalog on .html output", async () => {
    const transform = elementSSR({ resolve: { "el-button": Button } });
    const out = await runTransform(transform, "<el-button>Save</el-button>");
    expect(out).toContain('<template shadowrootmode="open">');
    expect(out).toContain("Save");
  });

  it("pre-renders components resolved lazily, loading only what's present", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Button }));
    const transform = elementSSR({ resolve: { "el-button": importer } });
    const out = await runTransform(transform, "<el-button>Save</el-button>");
    expect(out).toContain("shadowrootmode");
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("passes non-HTML output through untouched (gates on the output path)", async () => {
    const transform = elementSSR({ resolve: { "el-button": Button } });
    const json = "<el-button>not really html</el-button>";

    // A .json output path — Eleventy runs transforms over every file; we must not touch this one.
    expect(await runTransform(transform, json, "/_site/feed.json")).toBe(json);
    // A `permalink: false` page has no output path at all.
    expect(await runTransform(transform, json, false)).toBe(json);
  });

  it("serializeState emits the ejs/json state script", async () => {
    const transform = elementSSR({
      resolve: { "el-button": Button },
      serializeState: true,
    });
    const out = await runTransform(transform, "<el-button>Save</el-button>");
    expect(out).toContain('<script type="ejs/json">');
  });
});
