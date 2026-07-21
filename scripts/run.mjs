#!/usr/bin/env node
// Runs every vector in vectors/**/index.json against a verifier.
// Default target: the reference verifier (clone Aarmatix/avar next to this
// repo, or pass --verifier <path-to-node-module-exporting-verifyReceipt>).
//
// This is the conformance harness. Third-party verifiers can plug in here
// by exporting `verifyReceipt(receipt)` from a Node module.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// --verifier flag
const argIdx = process.argv.indexOf("--verifier");
const verifierPath = argIdx > -1
  ? resolve(process.cwd(), process.argv[argIdx + 1])
  : resolve(ROOT, "..", "avar", "dist", "index.js");

if (!existsSync(verifierPath)) {
  console.error(`verifier not found: ${verifierPath}`);
  console.error("build the reference verifier first: (cd ../avar && npm install && npx tsc)");
  process.exit(2);
}

const mod = await import(pathToFileURL(verifierPath).href);
if (typeof mod.verifyReceipt !== "function") {
  console.error(`verifier module does not export verifyReceipt(): ${verifierPath}`);
  process.exit(2);
}

const suiteDir = join(ROOT, "vectors");
const suites = readdirSync(suiteDir).filter((d) => !d.startsWith("."));
let pass = 0, fail = 0;
const failures = [];

for (const suite of suites) {
  const indexPath = join(suiteDir, suite, "index.json");
  if (!existsSync(indexPath)) continue;
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  for (const v of index.vectors) {
    const receipt = JSON.parse(readFileSync(join(ROOT, v.file), "utf8"));
    // Fixed clock so time-window vectors are deterministic.
    const now = new Date("2026-07-21T00:00:00Z");
    let outcome;
    try {
      const r = await mod.verifyReceipt(receipt, {
        now,
        pastWindowMs: 365 * 24 * 60 * 60 * 1000,
      });
      outcome = { valid: r.valid, code: null, legacy: !!r.legacy };
    } catch (err) {
      outcome = { valid: false, code: err.code ?? "UNKNOWN", legacy: false };
    }
    const ok =
      outcome.valid === v.expected.valid &&
      outcome.code === v.expected.code &&
      (v.expected.legacy === undefined || outcome.legacy === v.expected.legacy);
    if (ok) {
      pass++;
      console.log(`  ✓ ${suite}/${v.name}`);
    } else {
      fail++;
      failures.push({ vector: `${suite}/${v.name}`, expected: v.expected, got: outcome });
      console.log(`  ✗ ${suite}/${v.name}  expected=${JSON.stringify(v.expected)}  got=${JSON.stringify(outcome)}`);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log(JSON.stringify({ failures }, null, 2));
  process.exit(1);
}
