import "../src/dom-shim.js"; // must precede any component import
import { describe, it, expect, vi } from "vitest";
import { elementSSR } from "../src/adapters/sveltekit.js";

import Button from "@webtides/element-library/button";

/**
 * A SvelteKit `resolve` that streams the given HTML chunks through `transformPageChunk` (the last
 * one flagged `done`) and concatenates the results, as the kit runtime would. A chunk handler
 * returning `undefined` falls back to the original chunk — mirroring SvelteKit's own semantics.
 */
const resolveWithChunks =
  (...chunks) =>
  async (_event, { transformPageChunk }) => {
    let out = "";
    for (let i = 0; i < chunks.length; i++) {
      const done = i === chunks.length - 1;
      out += (await transformPageChunk({ html: chunks[i], done })) ?? chunks[i];
    }
    return out;
  };

describe("elementSSR (sveltekit handle)", () => {
  it("pre-renders components from a static catalog", async () => {
    const handle = elementSSR({ resolve: { "el-button": Button } });
    const out = await handle({
      event: {},
      resolve: resolveWithChunks("<el-button>Save</el-button>"),
    });
    expect(out).toContain('<template shadowrootmode="open">');
  });

  it("pre-renders components resolved lazily, loading only what's present", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Button }));
    const handle = elementSSR({ resolve: { "el-button": importer } });

    const out = await handle({
      event: {},
      resolve: resolveWithChunks("<el-button>Save</el-button>"),
    });
    expect(out).toContain("shadowrootmode");
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("buffers chunks and transforms the whole document once, on the final chunk", async () => {
    const handle = elementSSR({ resolve: { "el-button": Button } });
    // The element is split across two chunks — only buffering the full document can render it.
    const out = await handle({
      event: {},
      resolve: resolveWithChunks("<el-button>Sa", "ve</el-button>"),
    });

    // Exactly one rendered element (not one per chunk), and no leftover empty chunk text.
    expect(out.match(/shadowrootmode/g)).toHaveLength(1);
    expect(out).toContain("Save");
  });
});
