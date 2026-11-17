import "@webtides/element-js-ssr-renderer/dom-shim";

import { renderToString, glob } from "@webtides/element-js-ssr-renderer";
import type {
  Catalog,
  ComponentConfig,
  PageTransform,
  PropertyProvider,
} from "@webtides/element-js-ssr-renderer";
import { autoload } from "@webtides/element-js-ssr-renderer/autoloader";
import type { Loading } from "@webtides/element-js-ssr-renderer/autoloader";
import { lockdownFetch } from "@webtides/element-js-ssr-renderer/dom-shim";
import { elementSSR as astroElementSSR } from "@webtides/element-js-ssr-renderer/astro";
import { elementSSR as eleventyElementSSR } from "@webtides/element-js-ssr-renderer/eleventy";
import { elementSSR as nodeElementSSR } from "@webtides/element-js-ssr-renderer/node";
import { elementSSR as nuxtElementSSR } from "@webtides/element-js-ssr-renderer/nuxt";
import { elementSSR as sveltekitElementSSR } from "@webtides/element-js-ssr-renderer/sveltekit";
import { elementSSR as viteElementSSR } from "@webtides/element-js-ssr-renderer/vite";
import { buildCatalog } from "@webtides/element-js-ssr-renderer/generate";

class ExampleElement extends HTMLElement {}

const componentConfig: ComponentConfig = {
  component: ExampleElement,
  styles: ":host { display: block; }",
};
const catalog: Catalog = {
  "x-example": ExampleElement,
  "x-lazy": () => import("./consumer.js"),
  "x-configured": componentConfig,
};
const properties: PropertyProvider = async ({ tag }) => ({ tag });
const transform: PageTransform = (html) => html;
export const loading: Loading = "hydrate:onDelay(200)";
const options = {
  resolve: [catalog, glob({ "./components/x-example.js": () => import("./consumer.js") })],
  serializeState: true,
  transforms: { pre: transform, post: [transform] },
  properties,
};

export const html: string = await renderToString("<x-example></x-example>", options);
export const handle = sveltekitElementSSR(options);
export const adapters = [
  astroElementSSR(options),
  eleventyElementSSR(options),
  nodeElementSSR(options),
  nuxtElementSSR(options),
  viteElementSSR(options),
];
export const restoreFetch: () => void = lockdownFetch({ allowOrigins: ["https://example.com"] });
export const autoloader = autoload({ resolve: catalog, eager: false });
export const generated: string = buildCatalog({ dir: "./components", out: "./catalog.js" }).code;

// @ts-expect-error a number is not a catalog entry
export const brokenCatalog: Catalog = { "x-example": 42 };
// @ts-expect-error unknown option
sveltekitElementSSR({ unknownOption: true });
// @ts-expect-error renderToString resolves to a string
export const notANumber: number = await renderToString("");
// @ts-expect-error not a loading declaration
export const brokenLoading: Loading = "hydrate:whenever";
