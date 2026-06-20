// Bundle the serverless backend into a single self-contained ESM file for Vercel.
//
// Why: Vercel's @vercel/node runtime compiles each `api/*.ts` (and its imports) to separate
// `.js` files, then runs them with Node in ESM mode ("type":"module"). Our source uses
// explicit `.ts` import extensions (needed by tsx locally), which Node cannot resolve at
// runtime → FUNCTION_INVOCATION_FAILED. esbuild bundles the whole import graph (engine, tools,
// providers, state) into one `api/_handler.js` with no remaining local imports, so the
// functions just import that single real file. Resolves the crash without touching client code.

import { build } from "esbuild";

await build({
  entryPoints: ["server/handler.ts"],
  outfile: "api/_handler.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  logLevel: "info",
});

console.log("✓ Bundled server/handler.ts → api/_handler.js");
