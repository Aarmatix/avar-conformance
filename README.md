# AVAR Conformance Suite

Test vectors and a harness for verifying that an AVAR implementation
conforms to the [specification](https://github.com/Aarmatix/avar-spec).

## License

Dual-licensed:
- **Vector JSON** (under `vectors/`) is **CC BY 4.0** — the same license as
  the spec text they exercise.
- **Harness and generator code** (under `scripts/`) is **Apache-2.0**.

## Layout

```
vectors/
  rfc-0008/            # Evidence Model vectors
    index.json         # manifest: vector name, file, expected outcome
    *.json             # individual signed receipts
scripts/
  generate-vectors.mjs # regenerate vectors from the reference verifier
  run.mjs              # run every vector against a target verifier
```

## Run against the reference verifier

```bash
# Clone the reference verifier alongside this repo:
git clone https://github.com/Aarmatix/avar.git ../avar
(cd ../avar && npm install && npx tsc)
node scripts/run.mjs
```

## Run against your verifier

Export a `verifyReceipt(receipt, opts)` function that follows the reference
API, then:

```bash
node scripts/run.mjs --verifier ./path/to/my-verifier.js
```

Expected outcome fields per vector:

| Field | Meaning |
|---|---|
| `valid` | boolean — must match `result.valid` (or throw with matching `code`) |
| `code` | AVAR error code from RFC-0008 §8 / RFC-0009 §8, or `null` if `valid` |
| `legacy` | (optional) `true` iff the receipt is pre-1.10 |

## Regenerating vectors

Vectors are regenerated deterministically (fixed `issued_at`, fresh
Ed25519 keypair per run):

```bash
node scripts/generate-vectors.mjs
```

Commit both `vectors/**/*.json` and the updated `index.json` together.
