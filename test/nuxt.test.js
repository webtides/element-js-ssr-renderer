import "../src/dom-shim.js"; // must precede any component import
import { describe, it, expect, vi } from "vitest";
import { elementSSR } from "../src/adapters/nuxt.js";

import Button from "@webtides/element-library/button";

/** A Nitro `render:response` payload, as the hook would hand it (body is the rendered HTML string). */
const htmlResponse = (body, headers = { "content-type": "text/html" }) => ({
  body,
  headers,
  statusCode: 200,
});

describe("elementSSR (nuxt render:response hook)", () => {
  it("pre-renders components from a static catalog, mutating response.body in place", async () => {
    const onResponse = elementSSR({ resolve: { "el-button": Button } });
    const response = htmlResponse("<el-button>Save</el-button>");

    await onResponse(response);
    expect(response.body).toContain('<template shadowrootmode="open">');
  });

  it("pre-renders components resolved lazily, loading only what's present", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Button }));
    const onResponse = elementSSR({ resolve: { "el-button": importer } });
    const response = htmlResponse("<el-button>Save</el-button>");

    await onResponse(response);
    expect(response.body).toContain("shadowrootmode");
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("passes non-HTML responses through untouched", async () => {
    const onResponse = elementSSR({ resolve: { "el-button": Button } });
    const json = '{"el-button":true}';
    const response = htmlResponse(json, { "content-type": "application/json" });

    await onResponse(response);
    expect(response.body).toBe(json);
  });

  it("leaves non-string bodies (streams, buffers) untouched", async () => {
    const onResponse = elementSSR({ resolve: { "el-button": Button } });
    const body = Buffer.from("<el-button>x</el-button>");
    const response = { body, headers: { "content-type": "text/html" } };

    await onResponse(response);
    expect(response.body).toBe(body);
  });
});

describe("property provider context (nuxt)", () => {
  it("hands Nitro's H3Event to the property provider as `context`", async () => {
    const provider = vi.fn(() => null);
    const onResponse = elementSSR({
      resolve: { "el-button": Button },
      properties: provider,
    });
    const event = { path: "/" };
    await onResponse(htmlResponse("<el-button>x</el-button>"), { event });
    expect(provider).toHaveBeenCalled();
    expect(provider.mock.calls[0][0].context).toBe(event);
  });
});
