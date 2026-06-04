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
  const { lazy } = await import("@webtides/element-js-ssr-renderer");

  // element-library components, loaded eagerly into a static registry (the class,
  // never the `/define` module — that's client-only).
  const { default: Button } = await import("@webtides/element-library/button");
  const { default: Notification } =
    await import("@webtides/element-library/notification");

  // This example composes two component sources to show the headline resolution
  // feature (T-008) — `resolve` takes an array, later sources win on a tag clash:
  //
  //   • a static `{ tag: Class }` source — element-library components, eagerly
  //     imported above;
  //   • a lazy source — this project's own components under `./elements`, imported
  //     on demand so only the ones actually on a page are ever loaded.
  //
  // Unlike the Astro / SvelteKit examples, we can't use
  // `lazy(import.meta.glob('./elements/*.js'))`: `import.meta.glob` is a Vite
  // feature, and Nuxt's server runs on Nitro (rollup), which doesn't provide it.
  // Rather than hand-write the importer map, we generate it: `npm run gen:components`
  // runs `element-ssr gen ./elements -o ./server/components.generated.js`, emitting
  // a static map of `() => import('../elements/x-*.js')` thunks — literal specifiers
  // Nitro can trace and code-split. Re-run it whenever you add/remove a component.
  const { default: localComponents } =
    await import("../components.generated.js");

  // `elementSSR` returns a Nitro `render:response` handler; register it on the
  // hook so it post-processes every page's HTML body — see src/adapters/nuxt.js.
  nitroApp.hooks.hook(
    "render:response",
    elementSSR({
      resolve: [
        {
          "el-button": Button,
          "el-notification": Notification,
        },
        lazy(localComponents),
      ],
    }),
  );
});
