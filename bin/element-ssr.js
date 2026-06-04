#!/usr/bin/env node
/**
 * `element-ssr` CLI. Currently one subcommand:
 *
 *   element-ssr gen <dir> -o <out.js>
 *   element-ssr gen --manifest <custom-elements.json> [--base <pkg-root>] -o <out.js>
 *
 * Generates a static, bundler-traceable lazy importer map (see src/generate-lazy-map.js) so you
 * never hand-write `lazy({ ... })` on bundled / edge targets.
 */

import { parseArgs } from "node:util";
import { generateLazyMap } from "../src/generate-lazy-map.js";

const USAGE = `element-ssr gen — generate a static lazy importer map

Usage:
  element-ssr gen <dir> -o <out.js>
  element-ssr gen --manifest <custom-elements.json> [--base <pkg-root>] -o <out.js>

Options:
  -o, --out <file>       Output module path (required)
      --manifest <file>  Read tags from a custom-elements.json instead of scanning a directory
      --base <dir>       Package root the manifest's paths resolve against (default: manifest's dir)
  -h, --help             Show this help`;

function fail(msg) {
  console.error(`element-ssr: ${msg}\n\n${USAGE}`);
  process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);

if (command === "-h" || command === "--help" || command === undefined) {
  console.log(USAGE);
  process.exit(0);
}
if (command !== "gen") fail(`unknown command "${command}"`);

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
  const { outFile, entries } = generateLazyMap({
    dir,
    manifest: values.manifest,
    base: values.base,
    out: values.out,
  });
  console.log(
    `element-ssr: wrote ${entries.length} component${entries.length === 1 ? "" : "s"} → ${outFile}`,
  );
} catch (err) {
  fail(err.message);
}
