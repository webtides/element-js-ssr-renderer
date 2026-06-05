import "../src/dom-shim.js"; // before any component import (incl. the generated catalog's targets)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderToString } from "../src/index.js";
import {
  catalogEntriesFromDirectory,
  catalogEntriesFromManifest,
  renderCatalogModule,
  buildCatalog,
} from "../src/generate-catalog.js";

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

describe("catalogEntriesFromDirectory", () => {
  it("discovers hyphenated *.js by basename and skips the rest", () => {
    const entries = catalogEntriesFromDirectory(fixturesDir);
    expect(entries).toEqual([
      { tag: "el-fixture", file: path.join(fixturesDir, "el-fixture.js") },
    ]);
  });
});

describe("catalogEntriesFromManifest", () => {
  it("maps each customElement tag to its resolved module file", () => {
    const entries = catalogEntriesFromManifest(fixtureManifest, {
      base: fixturesDir,
    });
    expect(entries).toEqual([
      { tag: "el-fixture", file: path.join(fixturesDir, "el-fixture.js") },
    ]);
  });

  it("requires a base", () => {
    expect(() => catalogEntriesFromManifest(fixtureManifest, {})).toThrow(
      /base/,
    );
  });
});

describe("renderCatalogModule", () => {
  it("emits sorted loader thunks with specifiers relative to the output file", () => {
    const outFile = path.join(fixturesDir, "sub/catalog.js");
    const code = renderCatalogModule(
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
      renderCatalogModule(
        [
          { tag: "x-dup", file: "/a/x-dup.js" },
          { tag: "x-dup", file: "/b/x-dup.js" },
        ],
        { outFile: "/out/catalog.js" },
      ),
    ).toThrow(/duplicate tag/);
  });
});

describe("buildCatalog (end-to-end)", () => {
  let tmp;
  beforeAll(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "ssrgen-"));
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("requires exactly one of dir/manifest", () => {
    expect(() => buildCatalog({ out: "x.js" })).toThrow(/exactly one/);
    expect(() =>
      buildCatalog({ dir: fixturesDir, manifest: {}, out: "x.js" }),
    ).toThrow(/exactly one/);
  });

  it("generates a directory catalog that drops straight into resolve", async () => {
    const out = path.join(tmp, "dir/catalog.js");
    const { entries } = buildCatalog({ dir: fixturesDir, out });
    expect(entries.map((e) => e.tag)).toEqual(["el-fixture"]);

    const { default: catalog } = await import(pathToFileURL(out).href);
    const html = await renderToString("<el-fixture></el-fixture>", {
      resolve: catalog, // no wrapper — the loader thunks are auto-detected
    });
    expect(html).toContain('<template shadowrootmode="open">');
    expect(html).toContain("fixture");
  });

  it("generates a manifest catalog that resolves the same way", async () => {
    const out = path.join(tmp, "manifest/catalog.js");
    buildCatalog({
      manifest: fixtureManifest,
      base: fixturesDir,
      out,
    });
    const { default: catalog } = await import(pathToFileURL(out).href);
    const html = await renderToString("<el-fixture></el-fixture>", {
      resolve: catalog,
    });
    expect(html).toContain("fixture");
  });
});
