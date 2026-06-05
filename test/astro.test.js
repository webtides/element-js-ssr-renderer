import "../src/dom-shim.js"; // must precede any component import
import { describe, it, expect, vi } from "vitest";
import { elementSSR } from "../src/adapters/astro.js";

import Button from "@webtides/element-library/button";

/** A `next()` that yields an HTML Response, as Astro's middleware chain would. */
const htmlNext = (body) => () =>
  Promise.resolve(
    new Response(body, { headers: { "content-type": "text/html" } }),
  );

describe("elementSSR (astro middleware)", () => {
  it("pre-renders components from a static catalog", async () => {
    const onRequest = elementSSR({ resolve: { "el-button": Button } });
    const res = await onRequest({}, htmlNext("<el-button>Save</el-button>"));
    expect(await res.text()).toContain('<template shadowrootmode="open">');
  });

  it("pre-renders components resolved lazily, loading only what's present", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Button }));
    const onRequest = elementSSR({ resolve: { "el-button": importer } });

    const res = await onRequest({}, htmlNext("<el-button>Save</el-button>"));
    expect(await res.text()).toContain("shadowrootmode");
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("preserves status and headers from the wrapped response", async () => {
    const onRequest = elementSSR({ resolve: { "el-button": Button } });
    const next = () =>
      Promise.resolve(
        new Response("<el-button>x</el-button>", {
          status: 201,
          statusText: "Created",
          headers: { "content-type": "text/html", "x-custom": "1" },
        }),
      );

    const res = await onRequest({}, next);
    expect(res.status).toBe(201);
    expect(res.statusText).toBe("Created");
    expect(res.headers.get("x-custom")).toBe("1");
  });

  it("passes non-HTML responses through untouched", async () => {
    const onRequest = elementSSR({ resolve: { "el-button": Button } });
    const json = '{"el-button":true}';
    const next = () =>
      Promise.resolve(
        new Response(json, { headers: { "content-type": "application/json" } }),
      );

    const res = await onRequest({}, next);
    expect(await res.text()).toBe(json);
  });
});
