import "../src/dom-shim.js"; // must precede any component import
import { EventEmitter } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { elementSSR } from "../src/adapters/vite.js";

import Button from "@webtides/element-library/button";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures/components"); // holds el-fixture.js (tag el-fixture)

/** Invoke the plugin's `transformIndexHtml` hook the way Vite would, returning the transformed HTML. */
const transform = (plugin, html) => {
  const hook = plugin.transformIndexHtml;
  const handler = typeof hook === "function" ? hook : hook.handler;
  return handler(html);
};

/** Drive the `configResolved` lifecycle hook Vite would (build or serve), then return the plugin. */
const start = (plugin, command = "build", root = here) => {
  plugin.configResolved?.({ command, root });
  return plugin;
};

describe("elementSSR (vite plugin)", () => {
  it("is a Vite plugin exposing a transformIndexHtml hook", () => {
    const plugin = elementSSR({ resolve: { "el-button": Button } });
    expect(plugin.name).toBeTruthy();
    expect(plugin.transformIndexHtml).toBeDefined();
  });

  it("pre-renders components from a static catalog", async () => {
    const plugin = elementSSR({ resolve: { "el-button": Button } });
    const out = await transform(plugin, "<el-button>Save</el-button>");
    expect(out).toContain('<template shadowrootmode="open">');
  });

  it("pre-renders components resolved lazily, loading only what's present", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Button }));
    const plugin = elementSSR({ resolve: { "el-button": importer } });

    const out = await transform(plugin, "<el-button>Save</el-button>");
    expect(out).toContain("shadowrootmode");
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("leaves a document with no custom elements structurally intact", async () => {
    const plugin = elementSSR({ resolve: { "el-button": Button } });
    const out = await transform(
      plugin,
      "<!doctype html><html><head><title>x</title></head><body><p>hi</p></body></html>",
    );
    expect(out).toContain("<p>hi</p>");
    expect(out).toContain("<title>x</title>");
  });

  describe("components (auto-resolved directory)", () => {
    it("discovers and renders components from the directory", async () => {
      const plugin = start(elementSSR({ components: "fixtures/components" }));
      const out = await transform(plugin, "<el-fixture></el-fixture>");
      expect(out).toContain('<template shadowrootmode="open">');
      expect(out).toContain("fixture");
    });

    it("composes with `resolve` — both sources resolve in one document", async () => {
      const plugin = start(
        elementSSR({
          components: "fixtures/components",
          resolve: { "el-button": Button },
        }),
      );
      const out = await transform(
        plugin,
        "<el-button>Save</el-button><el-fixture></el-fixture>",
      );
      expect(out).toContain("Save"); // from `resolve`
      expect(out).toContain("fixture"); // from `components`
    });

    it("dev: watches the dir and full-reloads on a component change", () => {
      const plugin = start(
        elementSSR({ components: "fixtures/components" }),
        "serve",
      );
      const watcher = Object.assign(new EventEmitter(), { add: vi.fn() });
      const send = vi.fn();
      plugin.configureServer({ watcher, ws: { send } });

      expect(watcher.add).toHaveBeenCalledWith(fixturesDir);

      // A JS change inside the dir triggers a full reload.
      watcher.emit("change", path.join(fixturesDir, "el-fixture.js"));
      expect(send).toHaveBeenCalledWith({ type: "full-reload", path: "*" });

      // A file outside the components dir is ignored.
      send.mockClear();
      watcher.emit("change", path.join(here, "vite.test.js"));
      expect(send).not.toHaveBeenCalled();
    });
  });
});

describe("property provider context (vite)", () => {
  it("hands Vite's transformIndexHtml context to the property provider as `context`", async () => {
    const provider = vi.fn(() => null);
    const plugin = elementSSR({
      resolve: { "el-button": Button },
      properties: provider,
    });
    const viteContext = { path: "/index.html", filename: "/x/index.html" };
    await plugin.transformIndexHtml.handler(
      "<el-button>x</el-button>",
      viteContext,
    );
    expect(provider).toHaveBeenCalled();
    expect(provider.mock.calls[0][0].context).toBe(viteContext);
  });
});
