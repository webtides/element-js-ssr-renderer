// Client hydration. The `.client.js` suffix makes Nuxt run this only in the
// browser — the `/define` modules call `customElements.define`, which doesn't
// exist on the server.
//
// Loading each component's `define` upgrades the matching tags; because the SSR
// output already contains their rendered markup + hydration markers, element-js
// hydrates in place instead of re-rendering.
export default defineNuxtPlugin(async () => {
  // element-library components: import the side-effecting `/define` entry.
  await import("@webtides/element-library/button/define");
  await import("@webtides/element-library/notification/define");

  // This project's components: call their exported `define()`.
  const { define: defineCounter } = await import("../elements/x-counter.js");
  const { define: defineGreeting } = await import("../elements/x-greeting.js");
  defineCounter();
  defineGreeting();
});
