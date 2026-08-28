import "../src/dom-shim.js"; // before any component import (incl. the generated catalog's targets)
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

describe("catalogEntriesFromDirectory — recursive + tag hook", () => {
  let tmp;
  beforeAll(() => {
    // an element-js-style nested layout where one tag doesn't match its basename
    tmp = mkdtempSync(path.join(os.tmpdir(), "ssrgen-rec-"));
    mkdirSync(path.join(tmp, "icon"));
    mkdirSync(path.join(tmp, "nested/deep"), { recursive: true });
    writeFileSync(path.join(tmp, "el-top.js"), "export default class {}\n");
    writeFileSync(
      path.join(tmp, "icon/icon.js"),
      "defineElement('mb-icon', Icon);\n",
    );
    writeFileSync(
      path.join(tmp, "nested/deep/el-deep.js"),
      "export default class {}\n",
    );
    writeFileSync(path.join(tmp, "nested/helper.js"), "export const x = 1;\n");
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("stays flat by default (back-compat)", () => {
    const entries = catalogEntriesFromDirectory(tmp);
    expect(entries.map((e) => e.tag)).toEqual(["el-top"]);
  });

  it("recursive: true walks nested folders, basename convention unchanged", () => {
    const entries = catalogEntriesFromDirectory(tmp, { recursive: true });
    // icon/icon.js and nested/helper.js have no hyphen → skipped, as in flat mode
    expect(entries).toEqual([
      { tag: "el-top", file: path.join(tmp, "el-top.js") },
      { tag: "el-deep", file: path.join(tmp, "nested/deep/el-deep.js") },
    ]);
  });

  it("tag hook overrides the basename convention per file, with lazy source", () => {
    const entries = catalogEntriesFromDirectory(tmp, {
      recursive: true,
      tag: ({ source }) =>
        source.match(/defineElement\(["']([^"']+)["']/)?.[1] ?? null,
    });
    expect(entries.map((e) => e.tag)).toEqual(["el-top", "mb-icon", "el-deep"]);
    expect(entries[1].file).toBe(path.join(tmp, "icon/icon.js"));
  });

  it("hands the hook path, POSIX relativePath and basename", () => {
    const seen = [];
    catalogEntriesFromDirectory(tmp, {
      recursive: true,
      tag: ({ path: file, relativePath, basename }) => {
        seen.push({ file, relativePath, basename });
        return null;
      },
    });
    expect(seen).toContainEqual({
      file: path.join(tmp, "icon/icon.js"),
      relativePath: "icon/icon.js",
      basename: "icon",
    });
  });

  it("supports multiple tags per file and [] to skip", () => {
    const entries = catalogEntriesFromDirectory(tmp, {
      recursive: true,
      tag: ({ relativePath }) =>
        relativePath === "el-top.js" ? ["x-one", "x-two"] : [],
    });
    expect(entries).toEqual([
      { tag: "x-one", file: path.join(tmp, "el-top.js") },
      { tag: "x-two", file: path.join(tmp, "el-top.js") },
    ]);
  });

  it("warns loudly and skips an invalid returned tag", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const entries = catalogEntriesFromDirectory(tmp, {
        tag: () => "NoHyphen",
      });
      expect(entries).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"NoHyphen"'));
    } finally {
      warn.mockRestore();
    }
  });

  it("buildCatalog forwards recursive and tag", async () => {
    const out = path.join(tmp, ".out/catalog.js");
    const { entries } = buildCatalog({
      dir: tmp,
      out,
      recursive: true,
      tag: ({ source, basename }) =>
        source.match(/defineElement\(["']([^"']+)["']/)?.[1] ?? null,
    });
    expect(entries.map((e) => e.tag)).toEqual(["el-top", "mb-icon", "el-deep"]);
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
