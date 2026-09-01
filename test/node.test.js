import "../src/dom-shim.js"; // must precede any component import
import { describe, it, expect, vi } from "vitest";
import { elementSSR } from "../src/adapters/node.js";

import Button from "@webtides/element-library/button";

/**
 * Minimal Connect-style `res` mock: buffers what the *real* (un-overridden) write/end emit, and
 * exposes a `done` promise that resolves when the response finishes — the adapter transforms
 * asynchronously inside its `end` override, so tests await this.
 */
function mockRes(headers = {}) {
  const store = {};
  for (const [k, v] of Object.entries(headers)) store[k.toLowerCase()] = v;
  const out = [];
  let resolveDone;
  const res = {
    headersSent: false,
    done: new Promise((r) => (resolveDone = r)),
    getHeader: (k) => store[k.toLowerCase()],
    setHeader: (k, v) => {
      store[k.toLowerCase()] = v;
    },
    write(chunk) {
      out.push(Buffer.from(chunk));
      return true;
    },
    end(chunk) {
      if (chunk) out.push(Buffer.from(chunk));
      this.headersSent = true;
      resolveDone();
      return this;
    },
    body: () => Buffer.concat(out).toString("utf8"),
    header: (k) => store[k.toLowerCase()],
  };
  return res;
}

/** Run the middleware, drive the app handler, and await the finished response. */
async function run(options, handler, headers) {
  const res = mockRes(headers);
  elementSSR(options)({}, res, () => handler(res));
  await res.done;
  return res;
}

describe("elementSSR (node middleware)", () => {
  it("pre-renders components in an HTML response", async () => {
    const res = await run(
      { resolve: { "el-button": Button } },
      (res) => res.end("<el-button>Save</el-button>"),
      { "content-type": "text/html" },
    );
    expect(res.body()).toContain('<template shadowrootmode="open">');
  });

  it("resolves lazily, loading only what's present", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Button }));
    const res = await run(
      { resolve: { "el-button": importer } },
      (res) => res.end("<el-button>x</el-button>"),
      { "content-type": "text/html" },
    );
    expect(res.body()).toContain("shadowrootmode");
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("transforms a body assembled from multiple write() calls", async () => {
    const res = await run(
      { resolve: { "el-button": Button } },
      (res) => {
        res.write("<el-button>");
        res.write("Save");
        res.end("</el-button>");
      },
      { "content-type": "text/html" },
    );
    expect(res.body()).toContain("shadowrootmode");
    expect(res.body()).toContain("Save");
  });

  it("updates Content-Length to match the transformed body", async () => {
    const res = await run(
      { resolve: { "el-button": Button } },
      (res) => res.end("<el-button>Save</el-button>"),
      { "content-type": "text/html", "content-length": "29" },
    );
    expect(Number(res.header("content-length"))).toBe(
      Buffer.byteLength(res.body()),
    );
  });

  it("passes non-HTML responses through untouched", async () => {
    const json = '{"el-button":true}';
    const res = await run(
      { resolve: { "el-button": Button } },
      (res) => res.end(json),
      { "content-type": "application/json" },
    );
    expect(res.body()).toBe(json);
  });

  it("leaves the response untouched when headers were already flushed", async () => {
    const input = "<el-button>x</el-button>";
    const res = await run(
      { resolve: { "el-button": Button } },
      (res) => {
        res.headersSent = true; // simulate a raw res.writeHead(...) before the body
        res.end(input);
      },
      { "content-type": "text/html" },
    );
    expect(res.body()).toBe(input);
  });
});

describe("property provider context (node)", () => {
  it("hands { request, response } to the property provider as `context`", async () => {
    const provider = vi.fn(() => null);
    const res = mockRes({ "content-type": "text/html" });
    const req = { url: "/" };
    elementSSR({ resolve: { "el-button": Button }, properties: provider })(
      req,
      res,
      () => res.end("<el-button>x</el-button>"),
    );
    await res.done;
    expect(provider).toHaveBeenCalled();
    expect(provider.mock.calls[0][0].context.request).toBe(req);
    expect(provider.mock.calls[0][0].context.response).toBe(res);
  });
});
