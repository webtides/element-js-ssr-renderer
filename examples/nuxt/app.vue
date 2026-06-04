<script setup>
// A document-global stylesheet, injected inline into <head> (not extracted to an
// external file) so it lands in the SSR'd HTML as a real <style> the renderer can
// read. Shadow-DOM components (el-button, el-notification, x-counter) ADOPT it
// into their shadow roots during SSR — element-js' `adoptGlobalStyles` behavior,
// which the renderer mirrors — and the `--el-*` design tokens on :root also
// inherit through the shadow boundary.
const globalCss = `
  :root {
    color-scheme: light dark;

    /* element-library design tokens (a small hand-picked subset). */
    --el-color-fg: light-dark(#111827, #f3f4f6);
    --el-color-fg-muted: light-dark(#6b7280, #9ca3af);
    --el-color-bg: light-dark(#ffffff, #14171c);
    --el-color-bg-muted: light-dark(#f3f4f6, #1c1f24);
    --el-color-border: light-dark(#d1d5db, #2d3138);
    --el-color-accent: light-dark(#2563eb, #60a5fa);
    --el-color-on-accent: #ffffff;
    --el-space-2: 0.5rem;
    --el-space-3: 0.75rem;
    --el-space-4: 1rem;
    --el-radius-sm: 0.375rem;
    --el-radius-md: 0.5rem;
    --el-radius-lg: 0.75rem;
    --el-font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }

  body {
    margin: 0;
    padding: var(--el-space-4);
    font-family: var(--el-font-sans);
    line-height: 1.5;
    color: var(--el-color-fg);
    background: var(--el-color-bg);
  }

  main { max-width: 52rem; margin: 0 auto; }

  section {
    margin-block: 2rem;
    padding: var(--el-space-4);
    border: 1px solid var(--el-color-border);
    border-radius: var(--el-radius-lg);
  }

  h1 { font-size: 1.75rem; }

  .row { display: flex; flex-wrap: wrap; gap: var(--el-space-3); align-items: center; }

  code {
    padding: 0.1em 0.35em;
    border-radius: var(--el-radius-sm);
    background: var(--el-color-bg-muted);
    font-size: 0.9em;
  }
`;

useHead({
  title: "element-js SSR renderer — Nuxt example",
  style: [{ innerHTML: globalCss }],
});
</script>

<template>
  <main>
    <h1>element-js SSR renderer — Nuxt example</h1>
    <p>
      Every custom element below is authored as plain HTML in this Nuxt page. A
      Nitro <code>render:response</code> hook pre-renders each one on the server —
      shadow components as Declarative Shadow DOM, light-DOM components in place —
      then they hydrate in the browser.
    </p>
    <p>
      <strong>To see it work:</strong> view source (or disable JavaScript) — the
      components are already fully rendered, including
      <code>&lt;template shadowrootmode="open"&gt;</code> for the shadow ones.
      Then with JS on, the counter's buttons work: that's hydration, not a
      re-render.
    </p>

    <section>
      <h2>Local components</h2>
      <p class="row">
        <!-- Shadow DOM, interactive — seeded from a `count` attribute. -->
        <x-counter count="3" label="Apples"></x-counter>
        <x-counter label="Pears"></x-counter>
      </p>
      <!-- Light DOM. -->
      <x-greeting name="Nuxt"></x-greeting>
    </section>

    <section>
      <h2>element-library components</h2>
      <div class="row">
        <el-button variant="primary">Primary</el-button>
        <el-button variant="success" outline>Outline</el-button>
        <el-button variant="danger" pill>Pill</el-button>
        <el-button loading>Loading</el-button>
      </div>
    </section>

    <section>
      <h2>Nested + composed</h2>
      <!--
        The renderer walks recursively and resolves nested custom elements —
        including ones inside other components' slotted content — so the button
        inside this notification is SSR'd too.
      -->
      <el-notification variant="primary" open>
        Saved successfully.
        <el-button size="small" variant="primary">Undo</el-button>
      </el-notification>
    </section>
  </main>
</template>
