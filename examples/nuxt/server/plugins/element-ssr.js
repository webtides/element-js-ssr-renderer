// Nitro bundles the *entire* server into one module graph and orders top-level
// module evaluation by its own dependency sort — it does NOT preserve a static
// `import` statement's source order. So a top-level
// `import '@webtides/element-js-ssr-renderer/dom-shim'` is NOT guaranteed to run
// before element-js' `class … extends HTMLElement` is evaluated (it isn't —
// you'd get `ReferenceError: HTMLElement is not defined` at startup).
//
// The fix is to do every element-js-related import *dynamically*, inside the
// plugin: dynamic `import()` evaluates in call order, which we control. We import
// the DOM shim first (installing HTMLElement & friends on globalThis), then the
// adapter, the resolver helper, and the eager element-library component classes.
// Nitro awaits this plugin during startup, so the hook is registered before any
// request is served. (The Astro / SvelteKit examples instead rely on Vite's
// `ssr.noExternal`, which preserves static source order; Nitro needs this.)
export default defineNitroPlugin(async (nitroApp) => {
  await import("@webtides/element-js-ssr-renderer/dom-shim"); // must be first
  const { elementSSR } = await import("@webtides/element-js-ssr-renderer/nuxt");

  // A third-party library that ships its OWN catalog: element-library exposes a
  // lazy Catalog at `@webtides/element-library/catalog` — a `{ tag: () => import(…) }`
  // map of every component, with package-internal specifiers that resolve in any
  // consumer's bundle (Nitro/rollup included). Drop it into `resolve`: no eager
  // imports, no hand-written `{ tag: Class }` map; only components present on a page
  // load. (Imported dynamically like everything element-js-related here, for Nitro's
  // eval-order reasons — though the catalog module only defines lazy thunks, so
  // importing it triggers no `extends HTMLElement` evaluation itself.)
  const { default: catalog } =
    await import("@webtides/element-library/catalog");

  // This project's OWN components: unlike the Astro / SvelteKit examples we can't use
  // `import.meta.glob('./elements/*.js')` — it's a Vite feature, and Nuxt's server runs
  // on Nitro (rollup), which doesn't provide it. So we generate a static Catalog of
  // traceable `() => import('../elements/x-*.js')` thunks via `npm run gen:catalog`
  // (`element-js-ssr-renderer catalog ./elements -o ./server/catalog.js`); re-run it
  // whenever you add/remove a component.
  const { default: localComponents } = await import("../catalog.js");

  // `resolve` takes an array; later sources win on a tag clash (T-008). Responsibility
  // split: the third-party library ships its catalog (drop it in); your own components
  // you generate/glob yourself. `elementSSR` returns a Nitro `render:response` handler;
  // register it so it post-processes every page's HTML body — see src/adapters/nuxt.js.
  nitroApp.hooks.hook(
    "render:response",
    elementSSR({
      resolve: [catalog, localComponents],
    }),
  );
});
