import "../src/dom-shim.js"; // before any component import (incl. the generated map's targets)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderToStringAsync, lazy } from "../src/index.js";
import {
  entriesFromDirectory,
  entriesFromManifest,
  renderLazyMapModule,
  generateLazyMap,
} from "../src/generate-lazy-map.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures/components");

const fixtureManifest = {
  modules: [
    {
      path: "el-fixture.js",
      declarations: [
        { kind: "class", customElement: true, tagName: "el-fixture" },
        { kind: "variable", name: "notAnElement" }, // ignored
      ],
    },
  ],
};

describe("entriesFromDirectory", () => {
  it("discovers hyphenated *.js by basename and skips the rest", () => {
    const entries = entriesFromDirectory(fixturesDir);
    expect(entries).toEqual([
      { tag: "el-fixture", file: path.join(fixturesDir, "el-fixture.js") },
    ]);
  });
});

describe("entriesFromManifest", () => {
  it("maps each customElement tag to its resolved module file", () => {
    const entries = entriesFromManifest(fixtureManifest, { base: fixturesDir });
    expect(entries).toEqual([
      { tag: "el-fixture", file: path.join(fixturesDir, "el-fixture.js") },
    ]);
  });

  it("requires a base", () => {
    expect(() => entriesFromManifest(fixtureManifest, {})).toThrow(/base/);
  });
});

describe("renderLazyMapModule", () => {
  it("emits sorted lazy thunks with specifiers relative to the output file", () => {
    const outFile = path.join(fixturesDir, "sub/map.generated.js");
    const code = renderLazyMapModule(
      [
        { tag: "x-two", file: path.join(fixturesDir, "x-two.js") },
        { tag: "x-one", file: path.join(fixturesDir, "x-one.js") },
      ],
      { outFile },
    );
    // sorted, `./`-relative from sub/ back up to the component files
    expect(code).toMatch(
      /"x-one": \(\) => import\("\.\.\/x-one\.js"\),\n\s*"x-two": \(\) => import\("\.\.\/x-two\.js"\),/,
    );
    expect(code.indexOf('"x-one"')).toBeLessThan(code.indexOf('"x-two"'));
  });

  it("throws on a duplicate tag", () => {
    expect(() =>
      renderLazyMapModule(
        [
          { tag: "x-dup", file: "/a/x-dup.js" },
          { tag: "x-dup", file: "/b/x-dup.js" },
        ],
        { outFile: "/out/map.js" },
      ),
    ).toThrow(/duplicate tag/);
  });
});

describe("generateLazyMap (end-to-end)", () => {
  let tmp;
  beforeAll(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "ssrgen-"));
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("requires exactly one of dir/manifest", () => {
    expect(() => generateLazyMap({ out: "x.js" })).toThrow(/exactly one/);
    expect(() =>
      generateLazyMap({ dir: fixturesDir, manifest: {}, out: "x.js" }),
    ).toThrow(/exactly one/);
  });

  it("generates a directory map whose thunks render through lazy()", async () => {
    const out = path.join(tmp, "dir/components.generated.js");
    const { entries } = generateLazyMap({ dir: fixturesDir, out });
    expect(entries.map((e) => e.tag)).toEqual(["el-fixture"]);

    const { default: map } = await import(pathToFileURL(out).href);
    const html = await renderToStringAsync("<el-fixture></el-fixture>", {
      resolve: lazy(map),
    });
    expect(html).toContain('<template shadowrootmode="open">');
    expect(html).toContain("fixture");
  });

  it("generates a manifest map that resolves the same way", async () => {
    const out = path.join(tmp, "manifest/components.generated.js");
    generateLazyMap({
      manifest: fixtureManifest,
      base: fixturesDir,
      out,
    });
    const { default: map } = await import(pathToFileURL(out).href);
    const html = await renderToStringAsync("<el-fixture></el-fixture>", {
      resolve: lazy(map),
    });
    expect(html).toContain("fixture");
  });
});
