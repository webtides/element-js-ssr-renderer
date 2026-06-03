/**
 * Node-only convention resolver: map a custom-element tag to a module file on disk and import it on
 * demand — `<el-button>` → `<dir>/el-button.js` — so a project's components resolve by filename
 * without enumerating them or running a bundler.
 *
 * Lives behind the `@webtides/element-js-ssr-renderer/resolve/node` entry point **on purpose**. It
 * builds a *runtime* import specifier from the tag, which a bundler cannot statically analyze; that's
 * fine in a long-running Node server (real filesystem, no bundling) but must never land in an edge
 * bundle. Keeping it in its own module means edge builds that don't import it never see the dynamic
 * import. For bundled / serverless / edge targets use `lazy(import.meta.glob(...))` instead.
 *
 * @typedef {import('../render-to-string.js').ResolveFn} ResolveFn
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Default tag→relative-path: `el-button` → `el-button.js`. */
const defaultTagToPath = (tag) => `${tag}.js`;

/** Default module→class pick: the `default` export, or the value itself if it's already a class. */
const defaultPick = (mod) => mod?.default ?? mod;

/** Resolve a base directory given as a path string, a `file:` URL string, or a URL instance. */
function toDirPath(dir) {
  if (dir instanceof URL) return fileURLToPath(dir);
  if (typeof dir === "string" && dir.startsWith("file:")) return fileURLToPath(dir);
  return path.resolve(dir); // relative paths resolve from process.cwd()
}

/**
 * Build a {@link ResolveFn} that loads components from `dir` by tag convention. Pass the result as a
 * `resolve` source (alone or in an array, where later sources win). A tag with no matching file
 * resolves to `undefined`, so other sources — or pass-through — handle it; an *error inside* a found
 * module propagates, so a broken component fails loudly rather than looking unregistered.
 *
 * Prefer a `file:` URL base for ESM robustness — `fromDirectory(new URL('./components/', import.meta.url))`
 * — since a relative string resolves from `process.cwd()`, not the calling module.
 *
 * @param {string | URL} dir - base directory (path, `file:` URL string, or URL instance)
 * @param {{
 *   tagToPath?: (tag: string) => string,
 *   pick?: (mod: object, tag: string) => CustomElementConstructor,
 * }} [options]
 *   `tagToPath` maps a tag to a path relative to `dir` (default `\`${tag}.js\``); use it to strip a
 *   prefix or nest in subfolders. `pick` selects the class from a resolved module (default `.default`).
 * @return {ResolveFn}
 */
export function fromDirectory(
  dir,
  { tagToPath = defaultTagToPath, pick = defaultPick } = {},
) {
  if (dir == null)
    throw new TypeError("fromDirectory(dir): a base directory is required");
  const baseDir = toDirPath(dir);
  const cache = new Map(); // tag -> Promise<class>, found modules only (each imports once)

  return (tag) => {
    if (cache.has(tag)) return cache.get(tag);

    const filePath = path.resolve(baseDir, tagToPath(tag));
    // Containment guard: tags can be attacker-influenced, so never let one escape `baseDir`.
    if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep))
      return undefined;
    // No file → not this source's component; let other sources / pass-through handle it.
    if (!existsSync(filePath)) return undefined;

    const loaded = import(pathToFileURL(filePath).href).then((mod) =>
      pick(mod, tag),
    );
    cache.set(tag, loaded);
    return loaded;
  };
}
