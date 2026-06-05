#!/usr/bin/env node
/**
 * `element-js-ssr-renderer` CLI. Currently one subcommand:
 *
 *   element-js-ssr-renderer catalog <dir> -o <catalog.js>
 *   element-js-ssr-renderer catalog --manifest <custom-elements.json> [--base <pkg-root>] -o <catalog.js>
 *
 * Generates a static, bundler-traceable Catalog (see src/generate-catalog.js) so you never
 * hand-write `{ tag: () => import(...) }` on bundled / edge targets. The emitted module drops
 * straight into `resolve` — no wrapper.
 */

import { parseArgs } from "node:util";
import { buildCatalog } from "../src/generate-catalog.js";

const USAGE = `element-js-ssr-renderer catalog — generate a static Catalog

Usage:
  element-js-ssr-renderer catalog <dir> -o <catalog.js>
  element-js-ssr-renderer catalog --manifest <custom-elements.json> [--base <pkg-root>] -o <catalog.js>

Options:
  -o, --out <file>       Output module path (required)
      --manifest <file>  Read tags from a custom-elements.json instead of scanning a directory
      --base <dir>       Package root the manifest's paths resolve against (default: manifest's dir)
  -h, --help             Show this help`;

function fail(msg) {
  console.error(`element-js-ssr-renderer: ${msg}\n\n${USAGE}`);
  process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);

if (command === "-h" || command === "--help" || command === undefined) {
  console.log(USAGE);
  process.exit(0);
}
if (command !== "catalog") fail(`unknown command "${command}"`);

let parsed;
try {
  parsed = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      manifest: { type: "string" },
      base: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
} catch (err) {
  fail(err.message);
}

const { values, positionals } = parsed;
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
if (!values.out) fail("missing -o/--out");

const dir = positionals[0];
if ((dir == null) === (values.manifest == null))
  fail("provide either a <dir> positional or --manifest <file>, not both");

try {
  const { outFile, entries } = buildCatalog({
    dir,
    manifest: values.manifest,
    base: values.base,
    out: values.out,
  });
  console.log(
    `element-js-ssr-renderer: wrote ${entries.length} component${entries.length === 1 ? "" : "s"} → ${outFile}`,
  );
} catch (err) {
  fail(err.message);
}
