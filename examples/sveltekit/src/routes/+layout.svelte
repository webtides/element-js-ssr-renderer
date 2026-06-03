<script>
  import { onMount } from "svelte";

  let { children } = $props();

  // Client hydration. Loading each component's `define` upgrades the matching
  // tags; because the SSR output already contains their rendered markup +
  // hydration markers, element-js hydrates in place instead of re-rendering.
  //
  // We do this in `onMount` so the imports run only in the browser — the
  // `/define` modules are client-only (they call `customElements.define`, which
  // doesn't exist on the server). Vite bundles these dynamic imports for the
  // client.
  onMount(async () => {
    // element-library components: import the side-effecting `/define` entry.
    await import("@webtides/element-library/button/define");
    await import("@webtides/element-library/notification/define");

    // This project's components: call their exported `define()`.
    const { define: defineCounter } = await import(
      "../components/x-counter.js"
    );
    const { define: defineGreeting } = await import(
      "../components/x-greeting.js"
    );
    defineCounter();
    defineGreeting();
  });
</script>

<main>
  {@render children()}
</main>
