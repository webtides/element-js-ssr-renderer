import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
);
const typescriptCompiler = path.join(root, "node_modules/typescript/bin/tsc");

/** Runs `tsc -p <project>` and returns its diagnostics — an empty string when the project is clean. */
function compile(project) {
  try {
    execFileSync(process.execPath, [typescriptCompiler, "-p", project], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    });
    return "";
  } catch (error) {
    return `${error.stdout}${error.stderr}`;
  }
}

describe("TypeScript declarations", () => {
  beforeAll(() => {
    rmSync(path.join(root, "types"), { recursive: true, force: true });
    expect(compile("tsconfig.json")).toBe("");
  }, 120_000);

  it("pairs every subpath export with a generated declaration file", () => {
    expect(packageJson.files).toContain("types");
    expect(packageJson.types).toBe(packageJson.exports["."].types);

    for (const [subpath, target] of Object.entries(packageJson.exports)) {
      // `types` has to come first — TypeScript picks the first matching condition.
      expect(Object.keys(target), subpath).toEqual(["types", "default"]);
      expect(target.types, subpath).toBe(
        target.default
          .replace(/^\.\/src\//, "./types/")
          .replace(/\.js$/, ".d.ts"),
      );
      expect(existsSync(path.join(root, target.default)), target.default).toBe(
        true,
      );
      expect(existsSync(path.join(root, target.types)), target.types).toBe(
        true,
      );
    }
  });

  it("type-checks a strict consumer that imports every subpath", () => {
    expect(compile("test/fixtures/types/tsconfig.json")).toBe("");
  }, 120_000);
});
