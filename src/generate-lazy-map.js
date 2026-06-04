/**
 * Build-time generator for a **static, bundler-traceable** lazy importer map — the no-hand-writing
 * way to turn a folder (or a manifest) of components into the `{ tag: () => import(...) }` map that
 * `lazy()` consumes. It runs at build time (filesystem + path work, Node-only), reads the component
 * files, and emits a module of literal `() => import('./x-foo.js')` thunks, which a bundler can
 * statically trace and code-split — so it works everywhere, including bundled servers (Nuxt/Nitro,
 * webpack) and the edge, where an `import()` built from a tag at runtime could never be traced. You
 * then wrap the emitted map in {@link lazy} like any importer map.
 *
 * Two input modes:
 *   - **directory** — flat scan by filename convention (`x-counter.js` → `x-counter`). Tags must
 *     contain a hyphen (custom-element spec), so helper files are skipped.
 *   - **manifest** — a `custom-elements.json` (CEM). Handles nested layouts (e.g. element-library's
 *     `src/components/<name>/<name>.js`) via the manifest's module paths.
 *
 * Meant for a dev/build step, never imported at render time. Exposed programmatically (this module)
 * and as the `element-ssr gen` CLI (`bin/element-ssr.js`).
 *
 * @typedef {import('./render-to-string.js').ImporterMap} ImporterMap
 */

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Files that live next to components but aren't components themselves. */
const DEFAULT_EXCLUDE = /\.(define|test|spec|stories|generated)\.[cm]?js$/;

/** Resolve a base directory given as a path string, a `file:` URL string, or a URL instance. */
function toDirPath(dir) {
  if (dir instanceof URL) return fileURLToPath(dir);
  if (typeof dir === "string" && dir.startsWith("file:"))
    return fileURLToPath(dir);
  return path.resolve(dir); // relative paths resolve from process.cwd()
}

/** Basename without extension — the custom-element tag, by convention. */
function tagFromFile(file) {
  return path.basename(file).replace(/\.[^.]+$/, "");
}

/** A POSIX, relative, `./`-prefixed import specifier from `fromFile`'s directory to `toFile`. */
function relSpecifier(fromFile, toFile) {
  let rel = path
    .relative(path.dirname(fromFile), toFile)
    .split(path.sep)
    .join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

/**
 * Discover `{ tag, file }` entries by flat directory convention. Only hyphenated `*.js` basenames
 * are taken (a valid custom-element tag must contain a hyphen); `*.define.js`, test/spec/story
 * files, prior `*.generated.js` output, and `outFile` itself are skipped.
 *
 * @param {string | URL} dir
 * @param {{ outFile?: string, exclude?: RegExp }} [options]
 * @return {{ tag: string, file: string }[]}
 */
export function entriesFromDirectory(
  dir,
  { outFile, exclude = DEFAULT_EXCLUDE } = {},
) {
  const baseDir = toDirPath(dir);
  const out = outFile && path.resolve(outFile);
  const entries = [];
  for (const name of readdirSync(baseDir).sort()) {
    if (!/\.[cm]?js$/.test(name) || exclude.test(name)) continue;
    const file = path.join(baseDir, name);
    if (file === out || !statSync(file).isFile()) continue;
    const tag = tagFromFile(name);
    if (!tag.includes("-")) continue; // not a custom-element tag → skip
    entries.push({ tag, file });
  }
  return entries;
}

/**
 * Discover `{ tag, file }` entries from a parsed `custom-elements.json`. Module paths are
 * package-relative, so `base` must point at the package root.
 *
 * @param {{ modules?: Array<{ path: string, declarations?: Array<{ customElement?: boolean, tagName?: string }> }> }} manifest
 * @param {{ base: string | URL }} options
 * @return {{ tag: string, file: string }[]}
 */
export function entriesFromManifest(manifest, { base }) {
  if (base == null)
    throw new TypeError(
      "entriesFromManifest(manifest, { base }): base is required",
    );
  const baseDir = toDirPath(base);
  const entries = [];
  for (const mod of manifest?.modules ?? [])
    for (const decl of mod.declarations ?? [])
      if (decl.customElement && decl.tagName)
        entries.push({
          tag: decl.tagName,
          file: path.resolve(baseDir, mod.path),
        });
  return entries;
}

/**
 * Render the generated module source: a default-exported map of `tag → () => import(specifier)`,
 * with each specifier made relative to `outFile`. Throws on a duplicate tag — two components can't
 * claim one tag in a single map.
 *
 * @param {{ tag: string, file: string }[]} entries
 * @param {{ outFile: string, source?: string }} options
 * @return {string}
 */
export function renderLazyMapModule(entries, { outFile, source }) {
  const sorted = [...entries].sort((a, b) => a.tag.localeCompare(b.tag));
  const seen = new Set();
  const lines = sorted.map(({ tag, file }) => {
    if (seen.has(tag))
      throw new Error(
        `generate-lazy-map: duplicate tag ${JSON.stringify(tag)}`,
      );
    seen.add(tag);
    return `  ${JSON.stringify(tag)}: () => import(${JSON.stringify(relSpecifier(outFile, file))}),`;
  });
  const name = path.basename(outFile);
  return `// Generated by @webtides/element-js-ssr-renderer — do not edit by hand.
${source ? `// ${source}\n` : ""}// A static, bundler-traceable lazy importer map. Wrap it in \`lazy()\`:
//   import map from "./${name}";
//   elementSSR({ resolve: lazy(map) });

/** @type {import("@webtides/element-js-ssr-renderer").ImporterMap} */
export default {
${lines.join("\n")}
};
`;
}

/**
 * Generate the lazy-map module and write it to `out`. Provide exactly one input: `dir` (directory
 * convention) or `manifest` (a CEM — a parsed object or a path to `custom-elements.json`). For a
 * manifest path, `base` defaults to the manifest file's own directory (the usual package root).
 *
 * @param {{
 *   dir?: string | URL,
 *   manifest?: object | string,
 *   base?: string | URL,
 *   out: string,
 *   exclude?: RegExp,
 * }} options
 * @return {{ outFile: string, entries: { tag: string, file: string }[], code: string }}
 */
export function generateLazyMap({ dir, manifest, base, out, exclude }) {
  if (!out) throw new TypeError("generateLazyMap: `out` is required");
  if ((dir == null) === (manifest == null))
    throw new TypeError(
      "generateLazyMap: provide exactly one of `dir` or `manifest`",
    );

  const outFile = path.resolve(out);
  let entries, source;
  if (dir != null) {
    entries = entriesFromDirectory(dir, { outFile, exclude });
    source = `Source: directory ${dir} (${entries.length} component${entries.length === 1 ? "" : "s"})`;
  } else {
    const isPath = typeof manifest === "string";
    const cem = isPath ? JSON.parse(readFileSync(manifest, "utf8")) : manifest;
    const resolvedBase = base ?? (isPath ? path.dirname(manifest) : undefined);
    entries = entriesFromManifest(cem, { base: resolvedBase });
    source = `Source: manifest ${isPath ? manifest : "(inline)"} (${entries.length} component${entries.length === 1 ? "" : "s"})`;
  }

  const code = renderLazyMapModule(entries, { outFile, source });
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, code);
  return { outFile, entries, code };
}
