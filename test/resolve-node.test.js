import "../src/dom-shim.js"; // must precede any component import (incl. lazily-imported fixtures)
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStringAsync } from "../src/index.js";
import { fromDirectory } from "../src/resolve/node.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures/components");

describe("fromDirectory (node convention resolver)", () => {
  it("resolves a component by tag→file convention and renders it", async () => {
    const out = await renderToStringAsync("<el-fixture></el-fixture>", {
      resolve: fromDirectory(fixturesDir),
    });
    expect(out).toContain('<template shadowrootmode="open">');
    expect(out).toContain("fixture");
  });

  it("accepts a file: URL base (ESM-friendly)", async () => {
    const out = await renderToStringAsync("<el-fixture></el-fixture>", {
      resolve: fromDirectory(new URL("fixtures/components/", import.meta.url)),
    });
    expect(out).toContain("fixture");
  });

  it("passes through a tag with no matching file", async () => {
    const out = await renderToStringAsync("<el-missing></el-missing>", {
      resolve: fromDirectory(fixturesDir),
      onUnresolved: () => {},
    });
    expect(out).toContain("<el-missing>");
  });

  it("imports each module once, even across repeated instances", async () => {
    const out = await renderToStringAsync(
      "<el-fixture></el-fixture><el-fixture></el-fixture>",
      { resolve: fromDirectory(fixturesDir) },
    );
    expect(out.match(/shadowrootmode/g)?.length).toBe(2);
  });

  it("refuses path traversal in a tag", async () => {
    const resolve = fromDirectory(fixturesDir);
    expect(await resolve("../secret")).toBeUndefined();
  });

  it("throws if no directory is given", () => {
    expect(() => fromDirectory()).toThrow(/base directory is required/);
  });
});
