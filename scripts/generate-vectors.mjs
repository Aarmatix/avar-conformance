#!/usr/bin/env node
// Generates the canonical RFC-0008 test vectors used by the AVAR
// conformance suite. Produces one signed "valid" vector plus one
// rejection vector per RFC-0008/0009 error code.
//
// Output: vectors/rfc-0008/{name}.json + index.json
//
// This generator is dual-licensed with the rest of the repo (Apache-2.0
// for code, CC BY 4.0 for the vector JSON per SYNC.md).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { canonicalize } from "../reference/dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "vectors", "rfc-0008");
mkdirSync(OUT, { recursive: true });

// Deterministic timestamp so vectors are stable across regenerations.
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
      depth: "action",
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
  const path = join(OUT, `${name}.json`);
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
  vectors.push({ name, file: `vectors/rfc-0008/${name}.json`, expected });
}

// 1. Valid baseline
emit("valid-action-depth", sign(base()), { valid: true, code: null });

// 2. Signature tampering → E-SIG-INVALID
{
  const r = sign(base());
  r.entries[0].destination = "tampered.example.com";
  emit("invalid-signature", r, { valid: false, code: "E-SIG-INVALID" });
}

// 3. Missing producer → E-PRODUCER-MISSING
{
  const r = base();
  delete r.producer;
  emit("missing-producer", sign(r), { valid: false, code: "E-PRODUCER-MISSING" });
}

// 4. Bad depth → E-DEPTH-INVALID
{
  const r = base();
  r.entries[0].depth = "cosmic";
  emit("invalid-depth", sign(r), { valid: false, code: "E-DEPTH-INVALID" });
}

// 5. Missing claims → E-CLAIMS-MISSING
{
  const r = base();
  delete r.entries[0].claims;
  emit("missing-claims", sign(r), { valid: false, code: "E-CLAIMS-MISSING" });
}

// 6. Contradiction: payload_contents populated, claim false → E-CLAIMS-CONTRADICTION
{
  const r = base();
  r.entries[0].payload_contents = "leaked";
  emit("claims-contradiction", sign(r), { valid: false, code: "E-CLAIMS-CONTRADICTION" });
}

// 7. Coherence: transport depth with arguments claim → E-COHERENCE
{
  const r = base();
  r.entries[0].depth = "transport";
  emit("depth-coherence-violation", sign(r), { valid: false, code: "E-COHERENCE" });
}

// 8. Broken chain
{
  const r = base();
  const second = JSON.parse(JSON.stringify(r.entries[0]));
  second.prev_hash = "0".repeat(64);
  r.entries.push(second);
  emit("chain-broken", sign(r), { valid: false, code: "E-CHAIN-BROKEN" });
}

// 9. Time out of range
{
  const r = base();
  r.issued_at = "1970-01-01T00:00:00Z";
  emit("time-out-of-range", sign(r), { valid: false, code: "E-TIME-OUT-OF-RANGE" });
}

// 10. Legacy 1.9 receipt accepted with legacy flag
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
