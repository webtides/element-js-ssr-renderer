/**
 * Build-time generator for a **static, bundler-traceable** {@link import('./render-to-string.js').Catalog} —
 * the no-hand-writing way to turn a folder (or a manifest) of components into the
 * `{ tag: () => import(...) }` map you pass straight to `resolve`. It runs at build time (filesystem +
 * path work, Node-only), reads the component files, and emits a module of literal
 * `() => import('./x-foo.js')` loader thunks, which a bundler can statically trace and code-split — so
 * it works everywhere, including bundled servers (Nuxt/Nitro, webpack) and the edge, where an
 * `import()` built from a tag at runtime could never be traced. The emitted catalog drops directly
 * into `resolve` — no wrapper (the renderer auto-detects the loader thunks).
 *
 * Two input modes:
 *   - **directory** — scan by filename convention (`x-counter.js` → `x-counter`; tags must contain
 *     a hyphen per the custom-element spec, so helper files are skipped). `recursive` walks nested
 *     layouts (`src/components/<name>/<name>.js`); the `tag` hook overrides the basename
 *     convention per file for projects where the tag doesn't match the filename (T-024).
 *   - **manifest** — a `custom-elements.json` (CEM). Handles nested layouts via the manifest's
 *     module paths.
 *
 * Meant for a dev/build step, never imported at render time. Exposed programmatically (this module)
 * and as the `element-js-ssr-renderer catalog` CLI (`bin/element-js-ssr-renderer.js`).
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
 * Candidate `*.[cm]js` files under `dirPath`, sorted per level so output is deterministic. With
 * `recursive`, nested folders are walked in place (dot-directories and `node_modules` skipped);
 * `exclude`d names and `out` itself never make it in.
 * @param {string} dirPath
 * @param {{ exclude: RegExp, recursive: boolean, out: string | undefined }} options
 * @param {string[]} [files]
 * @return {string[]}
 */
function componentFiles(dirPath, options, files = []) {
  for (const name of readdirSync(dirPath).sort()) {
    const file = path.join(dirPath, name);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      if (options.recursive && !name.startsWith(".") && name !== "node_modules")
        componentFiles(file, options, files);
      continue;
    }
    if (
      !stat.isFile() ||
      !/\.[cm]?js$/.test(name) ||
      options.exclude.test(name)
    )
      continue;
    if (file === options.out) continue;
    files.push(file);
  }
  return files;
}

/** Whether a `tag` hook return is a usable custom-element name: lower-case, with a hyphen. */
function isValidTag(tag) {
  return (
    typeof tag === "string" && tag.includes("-") && tag === tag.toLowerCase()
  );
}

/**
 * The tag(s) a discovered file contributes: the `tag` hook's answer, else the basename convention
 * (a hyphenated basename is its own tag; anything else is a helper file and contributes none).
 * Hook returns are validated — an invalid tag is skipped with a warning, never silently.
 * @param {string} file
 * @param {string} baseDir
 * @param {(entry: object) => string | string[] | null | undefined} [tagHook]
 * @return {string[]}
 */
function tagsForFile(file, baseDir, tagHook) {
  const basename = tagFromFile(file);
  const fallback = basename.includes("-") ? [basename] : [];
  if (!tagHook) return fallback;

  let source; // read lazily — only hooks that look at file contents pay for the read
  const result = tagHook({
    path: file,
    relativePath: path.relative(baseDir, file).split(path.sep).join("/"),
    basename,
    get source() {
      return (source ??= readFileSync(file, "utf8"));
    },
  });
  if (result == null) return fallback; // hook abstains → basename convention

  return (Array.isArray(result) ? result : [result]).filter((tag) => {
    if (isValidTag(tag)) return true;
    console.warn(
      `[element-js-ssr-renderer] catalog: tag(…) returned ${JSON.stringify(tag)} for ` +
        `${path.relative(baseDir, file)} — not a valid custom-element name (lower-case, ` +
        `with a hyphen) — skipped.`,
    );
    return false;
  });
}

/**
 * Discover `{ tag, file }` entries by directory convention. Only hyphenated `*.js` basenames
 * are taken (a valid custom-element tag must contain a hyphen); `*.define.js`, test/spec/story
 * files, prior `*.generated.js` output, and `outFile` itself are skipped.
 *
 * `recursive` walks nested folders. The `tag` hook overrides the basename convention per file —
 * for projects where the tag doesn't match the filename, e.g. element-js'
 * `defineElement('mb-icon', Icon)` in `icon.js` (T-024). It receives
 * `{ path, relativePath, basename, source }` (`source` reads the file lazily) and returns the
 * tag, an array of tags (a multi-element file), `[]` to skip the file, or `null`/`undefined` to
 * fall back to the basename convention.
 *
 * @param {string | URL} dir
 * @param {{
 *   outFile?: string,
 *   exclude?: RegExp,
 *   recursive?: boolean,
 *   tag?: (entry: { path: string, relativePath: string, basename: string, source: string }) => string | string[] | null | undefined,
 * }} [options]
 * @return {{ tag: string, file: string }[]}
 */
export function catalogEntriesFromDirectory(
  dir,
  { outFile, exclude = DEFAULT_EXCLUDE, recursive = false, tag } = {},
) {
  const baseDir = toDirPath(dir);
  const out = outFile && path.resolve(outFile);
  const entries = [];
  for (const file of componentFiles(baseDir, { exclude, recursive, out }))
    for (const resolvedTag of tagsForFile(file, baseDir, tag))
      entries.push({ tag: resolvedTag, file });
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
export function catalogEntriesFromManifest(manifest, { base }) {
  if (base == null)
    throw new TypeError(
      "catalogEntriesFromManifest(manifest, { base }): base is required",
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
 * Render the generated module source: a default-exported {@link import('./render-to-string.js').Catalog}
 * of `tag → () => import(specifier)`, with each specifier made relative to `outFile`. Throws on a
 * duplicate tag — two components can't claim one tag in a single catalog.
 *
 * @param {{ tag: string, file: string }[]} entries
 * @param {{ outFile: string, source?: string }} options
 * @return {string}
 */
export function renderCatalogModule(entries, { outFile, source }) {
  const sorted = [...entries].sort((a, b) => a.tag.localeCompare(b.tag));
  const seen = new Set();
  const lines = sorted.map(({ tag, file }) => {
    if (seen.has(tag))
      throw new Error(`buildCatalog: duplicate tag ${JSON.stringify(tag)}`);
    seen.add(tag);
    return `  ${JSON.stringify(tag)}: () => import(${JSON.stringify(relSpecifier(outFile, file))}),`;
  });
  const name = path.basename(outFile);
  return `// Generated by @webtides/element-js-ssr-renderer — do not edit by hand.
${source ? `// ${source}\n` : ""}// A static, bundler-traceable Catalog. Pass it straight to \`resolve\` — no wrapper:
//   import catalog from "./${name}";
//   elementSSR({ resolve: catalog });

/** @type {import("@webtides/element-js-ssr-renderer").Catalog} */
export default {
${lines.join("\n")}
};
`;
}

/**
 * Generate the catalog module and write it to `out`. Provide exactly one input: `dir` (directory
 * convention — with optional `recursive` and `tag` hook, see
 * {@link catalogEntriesFromDirectory}) or `manifest` (a CEM — a parsed object or a path to
 * `custom-elements.json`). For a manifest path, `base` defaults to the manifest file's own
 * directory (the usual package root).
 *
 * @param {{
 *   dir?: string | URL,
 *   manifest?: object | string,
 *   base?: string | URL,
 *   out: string,
 *   exclude?: RegExp,
 *   recursive?: boolean,
 *   tag?: (entry: { path: string, relativePath: string, basename: string, source: string }) => string | string[] | null | undefined,
 * }} options
 * @return {{ outFile: string, entries: { tag: string, file: string }[], code: string }}
 */
export function buildCatalog({
  dir,
  manifest,
  base,
  out,
  exclude,
  recursive,
  tag,
}) {
  if (!out) throw new TypeError("buildCatalog: `out` is required");
  if ((dir == null) === (manifest == null))
    throw new TypeError(
      "buildCatalog: provide exactly one of `dir` or `manifest`",
    );

  const outFile = path.resolve(out);
  let entries, source;
  if (dir != null) {
    entries = catalogEntriesFromDirectory(dir, {
      outFile,
      exclude,
      recursive,
      tag,
    });
    source = `Source: directory ${dir} (${entries.length} component${entries.length === 1 ? "" : "s"})`;
  } else {
    const isPath = typeof manifest === "string";
    const cem = isPath ? JSON.parse(readFileSync(manifest, "utf8")) : manifest;
    const resolvedBase = base ?? (isPath ? path.dirname(manifest) : undefined);
    entries = catalogEntriesFromManifest(cem, { base: resolvedBase });
    source = `Source: manifest ${isPath ? manifest : "(inline)"} (${entries.length} component${entries.length === 1 ? "" : "s"})`;
  }

  const code = renderCatalogModule(entries, { outFile, source });
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, code);
  return { outFile, entries, code };
}
