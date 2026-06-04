# Quick start

The simplest setup uses the framework-agnostic core with a static `{ tag: Class }` map — every component
imported and listed up front.

```js
import "@webtides/element-js-ssr-renderer/dom-shim"; // MUST be first — installs HTMLElement etc. for Node
import { renderToString } from "@webtides/element-js-ssr-renderer";
import Button from "@webtides/element-library/button";
import InputField from "@webtides/element-library/input-field";

const html = await renderToString(
  '<el-button variant="primary">Save</el-button>',
  {
    resolve: { "el-button": Button, "el-input-field": InputField },
  },
);
```

::: tip Import order
`@webtides/element-js-ssr-renderer/dom-shim` must be imported before any component module — see
[Installation](/guide/installation#import-order-matters).
:::

On the client, import the matching `…/define` (or `…/all`) so the elements upgrade and hydrate:

```js
import "@webtides/element-library/button/define";
```

That's the floor — every component imported and listed up front, zero tooling. To load components lazily (so
only what's on the page loads, which matters for cold-start / serverless / edge) or to compose several
component sources, read [Resolving components](/resolving-components).

To skip the manual HTML plumbing in a meta-framework, use a [framework adapter](/frameworks/astro) instead.
