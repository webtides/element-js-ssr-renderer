/**
 * The client-side companion to the SSR renderer (T-029): progressive hydration's loading half.
 *
 * `autoload` is the client mirror of the server's `resolve`: it takes the same Catalog shapes
 * (a `{ tag: Class | () => import() }` map, raw `import.meta.glob()` output with path keys,
 * ComponentConfig values — so one catalog file can serve both sides), discovers the catalog's
 * custom elements on the page (initial scan + MutationObserver for later-inserted markup), and
 * defines each tag according to its `ejs-loading` attribute — the advisory marker the renderer
 * stamps from the component's `static loading` / ComponentConfig declaration:
 *
 *   - (no attribute) / `client` — define immediately.
 *   - `server` — never load: the SSR output is the final output, no JS ships for this tag.
 *   - `hydrate:onIdle` — define when the main thread is idle (`requestIdleCallback`).
 *   - `hydrate:onVisible` — define when an instance scrolls into view (`IntersectionObserver`).
 *   - `hydrate:onDelay(ms)` — define after a timeout.
 *   - `hydrate:onMedia(query)` — define when the media query matches (now or on change).
 *
 * Hydration itself is deliberately NOT its job: the elements already stand fully rendered as
 * Declarative Shadow DOM; `customElements.define` upgrades them, and element-js hydrates from the
 * existing shadow root (and `ejs:key` state) on its own. The autoloader only decides *when* each
 * tag's module loads.
 *
 * This module is client code with zero dependencies — it must never import from the server
 * modules (which would drag node-html-parser into the browser bundle).
 */

/**
 * A component's loading declaration for progressive hydration — the value of `static loading` on
 * the class, the `loading` field of a ComponentConfig, or a hand-authored `ejs-loading` attribute:
 * @typedef {'server' | 'client' | 'hydrate:onIdle' | 'hydrate:onVisible' | `hydrate:onDelay(${number})` | `hydrate:onMedia(${string})`} Loading
 */

/** The advisory attribute the renderer stamps — see `LOADING_ATTRIBUTE` in render-to-string.js. */
const LOADING_ATTRIBUTE = "ejs-loading";

/** Default key→tag mapping: a path's basename without extension (`./x/el-button.js` → `el-button`). */
function defaultPathToTag(key) {
  const base = key.split("/").pop() ?? key;
  return base.replace(/\.[^.]+$/, "");
}

/** Whether a Catalog value is an eager component class (vs a lazy `() => import()` loader). */
function isElementClass(value) {
  return (
    typeof value === "function" &&
    typeof HTMLElement === "function" &&
    value.prototype instanceof HTMLElement
  );
}

/**
 * Flatten `resolve` sources into one `tag -> class | loader` map, mirroring the server's Catalog
 * auto-detection: path keys (containing `/`, e.g. `import.meta.glob` output) map to tags by
 * basename, ComponentConfig values are unwrapped to their `component`, later sources win. Bare
 * resolver *functions* are rejected: discovery needs an enumerable tag set, which a `(tag) => …`
 * lookup cannot provide — on the client, pass the catalog itself.
 * @param {object | object[]} resolve
 * @return {Map<string, *>}
 */
function toRegistry(resolve) {
  const sources = Array.isArray(resolve) ? resolve : [resolve];
  const registry = new Map();
  for (const source of sources) {
    if (source == null) continue;
    if (typeof source === "function" || typeof source !== "object")
      throw new TypeError(
        "[element-js-ssr-renderer] autoload({ resolve }) takes Catalog objects only — " +
          "discovery needs an enumerable set of tags, which a resolver function cannot provide",
      );
    for (const [key, value] of Object.entries(source)) {
      const tag = key.includes("/") ? defaultPathToTag(key) : key;
      const component =
        value != null &&
        typeof value === "object" &&
        Object.hasOwn(value, "component")
          ? value.component
          : value;
      registry.set(tag, component);
    }
  }
  return registry;
}

/** `requestIdleCallback` where it exists; a timeout elsewhere (Safari has no idle callback). */
function onIdle(callback) {
  if (typeof requestIdleCallback === "function") requestIdleCallback(callback);
  else setTimeout(callback, 200);
}

/**
 * Start autoloading custom elements. Call it once on the client, as early as you like — elements
 * parsed later (streaming HTML, client navigation, re-rendered CMS markup) are picked up by a
 * MutationObserver, and an element whose tag is already loading or defined costs nothing.
 *
 * ```js
 * import { autoload } from "@webtides/element-js-ssr-renderer/autoloader";
 *
 * autoload({
 *   resolve: import.meta.glob("./components/*.js"),
 *   // The non-SSR fallback gate: a page rendered without SSR carries no `ejs-loading`
 *   // attributes and needs everything — the marker (e.g. stamped by a `post` transform)
 *   // and its name stay yours.
 *   eager: !document.documentElement.hasAttribute("data-ssr"),
 * });
 * ```
 *
 * Loading a tag = call its catalog loader, then `customElements.define(tag, module.default)` —
 * unless the module already defined the tag itself (a `define`-style side-effect module). Each
 * tag loads at most once (the first trigger of any instance wins; the upgrade then covers every
 * instance), and a failing load is isolated per tag: reported via `console.error`, never retried,
 * other tags unaffected. An unknown `ejs-loading` value fails open — warn and load immediately —
 * because a typo'd trigger must degrade to eager loading, never to a component that silently
 * never loads.
 *
 * @param {{ resolve: object | object[], eager?: boolean, root?: Element | Document }} options
 *   `resolve` — the same Catalog shapes the server takes (see above); required.
 *   `eager` (default `false`) — load every discovered tag immediately, ignoring `ejs-loading`
 *   (including `server`: on a page that was NOT server-rendered, nothing pre-rendered exists, so
 *   everything must load).
 *   `root` (default `document`) — the subtree to discover and observe.
 * @return {{ load: (tag: string) => Promise<void>, stop: () => void }} `load` triggers a tag's
 *   load by hand (cached, resolves after define; a failed load resolves too — it is reported, not
 *   thrown). `stop` disconnects discovery and the trigger observers; already-started loads finish,
 *   and already-scheduled timers/idle callbacks still fire.
 */
export function autoload({ resolve, eager = false, root } = {}) {
  if (resolve == null)
    throw new TypeError(
      "[element-js-ssr-renderer] autoload requires `resolve` — a Catalog " +
        "(`{ tag: Class | () => import() }`, `import.meta.glob()` output) or an array of them",
    );
  const registry = toRegistry(resolve);
  const inert = { load: async () => undefined, stop: () => {} };
  // No DOM (an SSR bundle evaluating this module's consumer) or nothing to load — do nothing.
  if (typeof document === "undefined" || registry.size === 0) return inert;

  const selector = [...registry.keys()].join(",");
  const target = root ?? document;
  const loads = new Map(); // tag -> Promise<void>; the at-most-once load cache
  const seen = new WeakSet(); // elements already scheduled, so re-scans never double-schedule

  async function defineTag(tag) {
    try {
      const value = registry.get(tag);
      const module = isElementClass(value) ? undefined : await value();
      // A side-effect module (`define.js` style) registered the tag itself while importing.
      if (customElements.get(tag)) return;
      const Constructor = module ? (module.default ?? module) : value;
      customElements.define(tag, Constructor);
    } catch (error) {
      console.error(
        `[element-js-ssr-renderer] autoloader failed to load <${tag}> — its elements stay ` +
          `un-upgraded (never retried).`,
        error,
      );
    }
  }

  function load(tag) {
    let pending = loads.get(tag);
    if (!pending) {
      pending = defineTag(tag);
      loads.set(tag, pending);
    }
    return pending;
  }

  // One shared IntersectionObserver for every `hydrate:onVisible` element, created on first use.
  let intersectionObserver;
  function observeVisibility(element) {
    intersectionObserver ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        intersectionObserver.unobserve(entry.target);
        load(entry.target.tagName.toLowerCase());
      }
    });
    intersectionObserver.observe(element);
  }

  function onMedia(query, tag) {
    const mediaQueryList = matchMedia(query);
    // An invalid query parses as "not all" and would silently never match — fail open instead.
    if (mediaQueryList.media === "not all" && query.trim() !== "not all") {
      console.warn(
        `[element-js-ssr-renderer] invalid media query "${query}" in ejs-loading on <${tag}> — ` +
          `loading immediately.`,
      );
      load(tag);
      return;
    }
    if (mediaQueryList.matches) {
      load(tag);
      return;
    }
    const listener = (event) => {
      if (!event.matches) return;
      mediaQueryList.removeEventListener("change", listener);
      load(tag);
    };
    mediaQueryList.addEventListener("change", listener);
  }

  function schedule(element, tag) {
    const value = eager
      ? "client"
      : (element.getAttribute(LOADING_ATTRIBUTE) ?? "client");
    if (value === "server") return;
    if (value === "client") {
      load(tag);
      return;
    }
    if (value.startsWith("hydrate:")) {
      const trigger = value.slice("hydrate:".length);
      if (trigger === "onIdle") return onIdle(() => load(tag));
      if (trigger === "onVisible") return observeVisibility(element);
      const delay = trigger.match(/^onDelay\(([\d.]+)\)$/);
      if (delay) return void setTimeout(() => load(tag), Number(delay[1]));
      const media = trigger.match(/^onMedia\((.+)\)$/);
      if (media) return onMedia(media[1], tag);
    }
    // Unknown value — fail open (see the function JSDoc): warn, load immediately.
    console.warn(
      `[element-js-ssr-renderer] unknown ejs-loading value "${value}" on <${tag}> — ` +
        `loading immediately.`,
    );
    load(tag);
  }

  function scan(node) {
    // Text/comment nodes (from mutation records) have no query surface — nothing to discover.
    if (typeof node.querySelectorAll !== "function") return;
    const matches = [...node.querySelectorAll(selector)];
    if (node.matches?.(selector)) matches.unshift(node);
    for (const element of matches) {
      if (seen.has(element)) continue;
      seen.add(element);
      const tag = element.tagName.toLowerCase();
      // Already defined (or already loading): the browser upgrades this element by itself.
      if (customElements.get(tag) || loads.has(tag)) continue;
      schedule(element, tag);
    }
  }

  // Discovery: observe first (catches nodes streamed in while the document is still parsing —
  // `seen` de-duplicates against the initial scan), scan once the DOM is ready.
  const mutationObserver =
    typeof MutationObserver === "function"
      ? new MutationObserver((records) => {
          for (const record of records)
            for (const node of record.addedNodes) scan(node);
        })
      : undefined;
  mutationObserver?.observe(target, { childList: true, subtree: true });

  const start = () => scan(target);
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  function stop() {
    document.removeEventListener("DOMContentLoaded", start);
    mutationObserver?.disconnect();
    intersectionObserver?.disconnect();
  }

  return { load, stop };
}
