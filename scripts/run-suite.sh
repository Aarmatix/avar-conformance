#!/usr/bin/env bash
# Runs the AVAR conformance suite against a compiled binary.
#
# Usage: scripts/run-suite.sh <path-to-avar-binary>
#
# Contract: the binary must expose `<bin> verify <receipt.json>` returning
#   exit 0 with `{"ok":true,...}` on valid receipts, and
#   exit 1 with `{"ok":false,"code":"<E-*>",...}` on rejected receipts.
#
# The suite fixes the verifier clock to 2026-07-21T00:00:00Z via the
# AVAR_NOW env var (verifier honors it if supported; otherwise time-window
# vectors are skipped by tagging their index entry with "requires_clock":true).

set -euo pipefail

BIN="${1:-}"
if [ -z "$BIN" ] || [ ! -x "$BIN" ]; then
  echo "usage: $0 <path-to-avar-binary>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AVAR_NOW="2026-07-21T00:00:00Z"

PASS=0; FAIL=0
FAILED=()

for idx in "$ROOT"/vectors/*/index.json; do
  suite="$(basename "$(dirname "$idx")")"
  # jq-free parser using python
  python3 - "$idx" <<'PY' | while IFS=$'\t' read -r name file exp_valid exp_code exp_legacy requires_clock; do
import json, sys
d = json.load(open(sys.argv[1]))
for v in d["vectors"]:
    e = v["expected"]
    print("\t".join([
        v["name"], v["file"],
        "true" if e["valid"] else "false",
        e.get("code") or "",
        "true" if e.get("legacy") else "false" if "legacy" in e else "",
        "true" if v.get("requires_clock") else "false",
    ]))
PY
    vector_path="$ROOT/$file"
    set +e
    out="$("$BIN" verify "$vector_path" 2>/dev/null)"
    ec=$?
    set -e

    ok=1
    if [ "$exp_valid" = "true" ]; then
      [ "$ec" -eq 0 ] || ok=0
      echo "$out" | grep -q '"ok": true' || ok=0
    else
      [ "$ec" -eq 1 ] || ok=0
      if [ -n "$exp_code" ]; then
        echo "$out" | grep -q "\"code\": \"$exp_code\"" || ok=0
      fi
    fi

    if [ "$ok" = "1" ]; then
      PASS=$((PASS+1))
      echo "  ✓ $suite/$name"
    else
      FAIL=$((FAIL+1))
      FAILED+=("$suite/$name (exit=$ec expected_valid=$exp_valid expected_code=$exp_code)")
      echo "  ✗ $suite/$name  exit=$ec expected_valid=$exp_valid expected_code=$exp_code"
      echo "    out: $out" | head -c 400
      echo
    fi
  done
done

echo
echo "$PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  printf '  - %s\n' "${FAILED[@]}"
  exit 1
fi
