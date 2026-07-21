#!/usr/bin/env node
// Portable vocabulary guardrail for the three public AVAR repos:
//   - Aarmatix/avar-spec
//   - Aarmatix/avar             (reference verifier)
//   - Aarmatix/avar-conformance (test suite + vectors)
//
// Enforces mem://strategy/avar-publication-boundary.md (private).
//
// Usage:
//   node scripts/check-avar-vocabulary.mjs                 (auto-detect repo)
//   node scripts/check-avar-vocabulary.mjs --repo=spec|verifier|conformance
//
// Exit codes: 0 = clean, 1 = violations.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

// ── Repo-agnostic bans (whole file, all repos) ───────────────────────────
const UNIVERSAL_BANS = [
  { pattern: /\baarmos\b/i,          note: "Vendor name banned in public AVAR repos (docs may name Aarmos as an example producer in Markdown only)" },
  { pattern: /\baarmatix\b/i,        note: "Company name banned in code (Markdown OK for governance/contact)" },
  { pattern: /\bPWA\b/,              note: "Aarmos product concept — not AVAR" },
  { pattern: /\bentitlement/i,       note: "Aarmos product concept — not AVAR" },
  { pattern: /\bRule [A-Z]\d\b/,     note: "Internal Aarmos invariant name — never publish" },
  { pattern: /\b(?:D1|T1|M1|O3)\b/,  note: "Internal Aarmos invariant name — never publish" },
  { pattern: /\bsub[- ]microsecond\b/i, note: "Banned latency claim" },
  { pattern: /\bkernel[- ]level\b/i, note: "Banned latency claim" },
];

// ── Spec-repo additional bans (spec text should be vendor-neutral) ───────
const SPEC_ONLY_BANS = [
  { pattern: /\d+\s?(µs|us|ms)\b/,   note: "No performance numbers in spec text — those belong to implementations" },
  { pattern: /\blocal[- ]first\b/i,  note: "Product positioning — not a spec requirement" },
  { pattern: /\bon[- ]device\b/i,    note: "Product positioning — not a spec requirement" },
];

// ── Verifier/conformance repo bans (no aarmos code imports) ──────────────
const CODE_BANS = [
  { pattern: /from\s+['"]@aarmos\//,  note: "no-aarmos-imports: reference verifier is clean-room" },
  { pattern: /require\(['"]@aarmos\//, note: "no-aarmos-imports: reference verifier is clean-room" },
];

// ── File filters ─────────────────────────────────────────────────────────
const SCAN_EXT = new Set([".md", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".rs", ".py", ".yaml", ".yml"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "target", ".next", ".turbo"]);

// Markdown files in ALL repos may name Aarmos as an example producer,
// governance contact, or historical note. Code files may not.
const MARKDOWN_ALLOWS_VENDOR = new Set([".md"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SCAN_EXT.has(extname(name))) out.push(full);
  }
  return out;
}

function detectRepo(root) {
  // Heuristic: look for tell-tale files.
  const files = readdirSync(root);
  if (files.some((f) => /^RFC-\d+/.test(f)) || files.includes("GOVERNANCE.md") && files.includes("VERSIONING.md")) return "spec";
  if (files.includes("CLEAN-ROOM.md")) return "verifier";
  if (files.some((f) => f === "vectors") || files.includes("LICENSE-VECTORS")) return "conformance";
  return "spec"; // safest default
}

function main() {
  const argRepo = process.argv.find((a) => a.startsWith("--repo="));
  const root = process.cwd();
  const repo = argRepo ? argRepo.split("=")[1] : detectRepo(root);

  const bans = [...UNIVERSAL_BANS];
  if (repo === "spec") bans.push(...SPEC_ONLY_BANS);

  const files = walk(root);
  const violations = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const ext = extname(file);
    const isMd = MARKDOWN_ALLOWS_VENDOR.has(ext);

    for (const { pattern, note } of bans) {
      // Vendor-name bans (aarmos/aarmatix) allow Markdown in non-spec repos
      const isVendorBan = /\baarmos\b|\baarmatix\b/i.test(pattern.source);
      if (isVendorBan && isMd && repo !== "spec") continue;

      if (pattern.test(src)) {
        const lines = src.split("\n");
        const lineNo = lines.findIndex((l) => pattern.test(l)) + 1;
        violations.push({ file, line: lineNo, note, match: (src.match(pattern) || [""])[0] });
      }
    }

    // Code-only bans (no-aarmos-imports) never apply to Markdown
    if (!isMd && (repo === "verifier" || repo === "conformance")) {
      for (const { pattern, note } of CODE_BANS) {
        if (pattern.test(src)) {
          const lines = src.split("\n");
          const lineNo = lines.findIndex((l) => pattern.test(l)) + 1;
          violations.push({ file, line: lineNo, note, match: (src.match(pattern) || [""])[0] });
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log(`✓ AVAR vocabulary check clean (repo: ${repo}, ${files.length} files)`);
    process.exit(0);
  }

  console.error(`✗ AVAR vocabulary violations (repo: ${repo}):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  "${v.match}"  — ${v.note}`);
  }
  console.error(`\n${violations.length} violation(s). See avar-publication-boundary rules.`);
  process.exit(1);
}

main();
