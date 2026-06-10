// The DOM shim MUST be imported first — element-js component classes are
// `class … extends HTMLElement`, evaluated at import time, so HTMLElement (and
// friends) have to exist on globalThis before any component module is loaded.
// Plain Node evaluates static imports in source order, so this side-effecting
// import landing first is enough — there's no bundler here to hoist anything
// above it (unlike the Astro/Nuxt/SvelteKit examples).
import "@webtides/element-js-ssr-renderer/dom-shim";

import express from "express";
import { elementSSR } from "@webtides/element-js-ssr-renderer/node";

// A third-party library that ships its OWN catalog: element-library exposes a
// lazy Catalog at `@webtides/element-library/catalog` — a `{ tag: () => import(…) }`
// map of every component, with package-internal specifiers that resolve in any
// consumer's bundle. We just drop it into `resolve`: no eager imports, no
// hand-written `{ tag: Class }` map, and only the components actually present on
// a page are ever loaded.
import catalog from "@webtides/element-library/catalog";

// This project's own components. Plain Node has no Vite `import.meta.glob`, so we
// write the lazy Catalog by hand: a tag → `() => import(…)` map. The renderer
// calls a loader only for tags it actually finds in the HTML, and picks each
// module's default export. (For many components, generate this instead with
// `npx element-js-ssr-renderer catalog ./src/components -o ./src/catalog.js`.)
const localComponents = {
  "x-counter": () => import("./src/components/x-counter.js"),
  "x-greeting": () => import("./src/components/x-greeting.js"),
};

const app = express();

// Mount the middleware BEFORE the routes so it can wrap their HTML output. It
// buffers each response, and for `text/html` runs the body through the renderer
// once on `end`; anything else (JSON, assets, redirects) passes through.
// `resolve` takes an array — later sources win on a tag clash.
app.use(elementSSR({ resolve: [catalog, localComponents] }));

app.get("/", (_req, res) => {
  res.type("html").send(page());
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(
    `element-js SSR renderer — Node example → http://localhost:${port}`,
  );
});

/**
 * The page, authored as plain HTML. Every custom element below is a tag in this
 * string — that's what the middleware pre-renders. (This example is deliberately
 * SSR-only: it proves the adapter's server output. To add client hydration, load
 * each component's `define` — see examples/astro for the client `<script>`, and
 * docs/frameworks/node for how to ship it from a plain Node server.)
 */
function page() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>element-js SSR renderer — Node example</title>
    <style>
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
      main {
        max-width: 52rem;
        margin: 0 auto;
      }
      section {
        margin-block: 2rem;
        padding: var(--el-space-4);
        border: 1px solid var(--el-color-border);
        border-radius: var(--el-radius-lg);
      }
      h1 {
        font-size: 1.75rem;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--el-space-3);
        align-items: center;
      }
      code {
        padding: 0.1em 0.35em;
        border-radius: var(--el-radius-sm);
        background: var(--el-color-bg-muted);
        font-size: 0.9em;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>element-js SSR renderer — Node (Express) example</h1>
      <p>
        Every custom element below is authored as plain HTML, returned by an
        Express route. The <code>elementSSR</code> middleware pre-renders each one
        before the response is sent — shadow components as Declarative Shadow DOM,
        light-DOM components in place.
      </p>
      <p>
        <strong>To see it work:</strong> view source (or
        <code>curl</code> this page) — the components are already fully rendered,
        including <code>&lt;template shadowrootmode="open"&gt;</code> for the shadow
        ones. This example is SSR-only; for client hydration see the other examples.
      </p>

      <section>
        <h2>Local components</h2>
        <p class="row">
          <!-- Shadow DOM — seeded from a \`count\` attribute. -->
          <x-counter count="3" label="Apples"></x-counter>
          <x-counter label="Pears"></x-counter>
        </p>
        <!-- Light DOM. -->
        <x-greeting name="Node"></x-greeting>
      </section>

      <section>
        <h2>element-library components</h2>
        <div class="row">
          <el-button variant="primary">Primary</el-button>
          <el-button variant="success" outline>Outline</el-button>
          <el-button variant="danger" pill>Pill</el-button>
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
  </body>
</html>`;
}
