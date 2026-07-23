#!/usr/bin/env node
// Generates the canonical RFC-0008 test vectors used by the AVAR
// conformance suite. Produces signed "valid" vectors, one rejection
// vector per RFC-0008 / RFC-0009 error code, and interop vectors
// exercising the RFC-0008 §3 interop rules (deprecated-alias acceptance,
// unknown evidence_type acceptance, unknown extension attributes,
// pre-1.10 receipt acceptance).
//
// Output: vectors/rfc-0008/{name}.json + index.json
//
// This generator is dual-licensed with the rest of the repo (Apache-2.0
// for code, CC BY 4.0 for the vector JSON per SYNC.md).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync, sign as edSign } from "node:crypto";
// Minimal inline RFC-8785 JCS canonicalizer so the generator has no
// runtime dependency on the reference verifier's build output. Matches
// the algorithm in Aarmatix/avar packages/core/src/canonicalize.ts
// (both derived from the public RFC-8785 text).
function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError("non-finite number");
    return value === 0 ? "0" : String(value);
  }
  if (typeof value === "string") return canonString(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return "{" + keys.map((k) => canonString(k) + ":" + canonicalize(value[k])).join(",") + "}";
  }
  throw new TypeError(`unsupported: ${typeof value}`);
}
function canonString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += "\\\\";
    else if (c === 0x08) out += "\\b";
    else if (c === 0x09) out += "\\t";
    else if (c === 0x0a) out += "\\n";
    else if (c === 0x0c) out += "\\f";
    else if (c === 0x0d) out += "\\r";
    else if (c < 0x20) out += "\\u" + c.toString(16).padStart(4, "0");
    else out += s[i];
  }
  return out + '"';
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "vectors", "rfc-0008");
mkdirSync(OUT, { recursive: true });

const FIXED_ISSUED_AT = "2026-07-21T00:00:00Z";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pubB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

function sign(receiptWithoutSig) {
  const canonical = canonicalize(receiptWithoutSig);
  const sig = edSign(null, Buffer.from(canonical, "utf8"), privateKey).toString("base64");
  return { ...receiptWithoutSig, signature: sig };
}

function base() {
  return {
    spec_version: "1.10",
    producer: { name: "conformance-producer", version: "1.0.0", source: "sdk-wrapper", public_key: pubB64 },
    issued_at: FIXED_ISSUED_AT,
    session_id: "01900000-0000-7000-8000-000000000001",
    entries: [{
      prev_hash: null,
      evidence_type: "action",
      source: "sdk-wrapper",
      destination: "api.example.com",
      method: "POST",
      path_or_call: "/v1/chat",
      arguments: { prompt: "hello" },
      response_status: 200,
      actor_identity: "user-1",
      session_binding: "sess-1",
      claims: {
        destination: true, method: true, path_or_call: true,
        arguments: true, payload_contents: false, response_status: true,
        response_contents: false, actor_identity: true, session_binding: true,
      },
    }],
  };
}

const vectors = [];
function emit(name, receipt, expected) {
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(receipt, null, 2) + "\n");
  vectors.push({ name, file: `vectors/rfc-0008/${name}.json`, expected });
}

// --- Valid vectors: one per standardized evidence_type -----------------

emit("valid-action-type", sign(base()), { valid: true, code: null });

{
  const r = base();
  r.entries[0].evidence_type = "protocol";
  // Drop claims beyond protocol allowance.
  r.entries[0].arguments = undefined; delete r.entries[0].arguments;
  r.entries[0].actor_identity = undefined; delete r.entries[0].actor_identity;
  r.entries[0].claims.arguments = false;
  r.entries[0].claims.actor_identity = false;
  emit("valid-protocol-type", sign(r), { valid: true, code: null });
}

{
  const r = base();
  r.entries[0].evidence_type = "transport";
  // Only `destination` and `session_binding` allowed at transport.
  delete r.entries[0].method;
  delete r.entries[0].path_or_call;
  delete r.entries[0].arguments;
  delete r.entries[0].response_status;
  delete r.entries[0].actor_identity;
  r.entries[0].claims = {
    destination: true, method: false, path_or_call: false,
    arguments: false, payload_contents: false, response_status: false,
    response_contents: false, actor_identity: false, session_binding: true,
  };
  emit("valid-transport-type", sign(r), { valid: true, code: null });
}

// --- Rejection vectors --------------------------------------------------

// Signature tampering → E-SIG-INVALID
{
  const r = sign(base());
  r.entries[0].destination = "tampered.example.com";
  emit("invalid-signature", r, { valid: false, code: "E-SIG-INVALID" });
}

// Missing producer → E-PRODUCER-MISSING
{
  const r = base();
  delete r.producer;
  emit("missing-producer", sign(r), { valid: false, code: "E-PRODUCER-MISSING" });
}

// Missing evidence_type (and no legacy depth) → E-EVIDENCE-TYPE-INVALID
{
  const r = base();
  delete r.entries[0].evidence_type;
  emit("missing-evidence-type", sign(r), { valid: false, code: "E-EVIDENCE-TYPE-INVALID" });
}

// Missing claims → E-CLAIMS-MISSING
{
  const r = base();
  delete r.entries[0].claims;
  emit("missing-claims", sign(r), { valid: false, code: "E-CLAIMS-MISSING" });
}

// Contradiction: payload_contents populated, claim false → E-CLAIMS-CONTRADICTION
{
  const r = base();
  r.entries[0].payload_contents = "leaked";
  emit("claims-contradiction", sign(r), { valid: false, code: "E-CLAIMS-CONTRADICTION" });
}

// Coherence: transport type with arguments claim true → E-COHERENCE
{
  const r = base();
  r.entries[0].evidence_type = "transport";
  // `arguments` claim stays true from base — that's the violation.
  emit("evidence-type-coherence-violation", sign(r), { valid: false, code: "E-COHERENCE" });
}

// Broken chain
{
  const r = base();
  const second = JSON.parse(JSON.stringify(r.entries[0]));
  second.prev_hash = "0".repeat(64);
  r.entries.push(second);
  emit("chain-broken", sign(r), { valid: false, code: "E-CHAIN-BROKEN" });
}

// Time out of range
{
  const r = base();
  r.issued_at = "1970-01-01T00:00:00Z";
  emit("time-out-of-range", sign(r), { valid: false, code: "E-TIME-OUT-OF-RANGE" });
}

// --- Interop vectors (RFC-0008 §3 rules) -------------------------------

// Legacy `depth` field accepted with deprecation warning (still valid=true).
{
  const r = base();
  delete r.entries[0].evidence_type;
  r.entries[0].depth = "action";
  emit("legacy-depth-field-accepted", sign(r), { valid: true, code: null });
}

// Legacy `depth: "intent"` accepted with warning (intent is out of scope).
{
  const r = base();
  delete r.entries[0].evidence_type;
  r.entries[0].depth = "intent";
  emit("legacy-intent-accepted", sign(r), { valid: true, code: null });
}

// Unknown evidence_type accepted with warning; coherence check skipped.
{
  const r = base();
  r.entries[0].evidence_type = "cosmic";
  emit("unknown-evidence-type-accepted", sign(r), { valid: true, code: null });
}

// Unknown extension attribute on entry → still valid.
{
  const r = base();
  r.entries[0].vendor_extension_x = { foo: "bar", nested: [1, 2, 3] };
  emit("unknown-extension-attr-accepted", sign(r), { valid: true, code: null });
}

// Pre-1.10 legacy receipt still accepted with legacy flag.
{
  const r = {
    spec_version: "1.9",
    producer: { name: "legacy-producer", version: "0.0.1", source: "application", public_key: pubB64 },
    issued_at: FIXED_ISSUED_AT,
    entries: [{ prev_hash: null, destination: "api.example.com" }],
  };
  emit("legacy-1.9-accepted", sign(r), { valid: true, code: null, legacy: true });
}

writeFileSync(
  join(OUT, "index.json"),
  JSON.stringify({ spec: "RFC-0008", generated_at: FIXED_ISSUED_AT, vectors }, null, 2) + "\n",
);

console.log(`generated ${vectors.length} vectors in ${OUT}`);
