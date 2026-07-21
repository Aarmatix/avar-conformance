#!/usr/bin/env node
// Standalone IP-leak scanner for public Aarmos repos (avar-spec, invite-spec,
// bundle-spec, homebrew-tap). Drop this file at scripts/check-ip-leaks.mjs
// alongside ip-leak-tokens.json at the repo root. See .lovable/ci-templates/README.md.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(".");
const TOKENS = JSON.parse(readFileSync(resolve(ROOT, "ip-leak-tokens.json"), "utf8"));
const BANNED = TOKENS.banned.map(({ pattern, flags, note }) => ({
  pattern: new RegExp(pattern, flags ?? "g"),
  note,
}));

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo"]);
const SCAN_EXTS = [".md", ".mdx", ".txt", ".json", ".yml", ".yaml", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".sh", ".rb"];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if (s.isFile() && SCAN_EXTS.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
let violations = 0;
const perFile = new Map();

for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const { pattern, note } of BANNED) {
    const m = src.match(pattern);
    if (m) {
      const rel = f.replace(ROOT + "/", "");
      const key = `${rel}\t${note}`;
      const prev = perFile.get(key) ?? new Set();
      m.forEach((x) => prev.add(x));
      perFile.set(key, prev);
      violations += m.length;
    }
  }
}

if (violations > 0) {
  console.error(`\ncheck-ip-leaks: ${violations} leaked internal identifier(s):\n`);
  for (const [key, terms] of perFile.entries()) {
    const [rel, note] = key.split("\t");
    console.error(`  ${rel}\n    ${note}: ${[...terms].join(", ")}`);
  }
  process.exit(1);
}
console.log(`✓ IP-leak check passed (${files.length} file(s) scanned)`);
