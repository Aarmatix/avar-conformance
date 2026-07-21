# AVAR Conformance Suite

[![License: Apache 2.0](https://img.shields.io/badge/code-Apache_2.0-blue.svg)](LICENSE)
[![Vectors: CC BY 4.0](https://img.shields.io/badge/vectors-CC_BY_4.0-lightgrey.svg)](LICENSE-VECTORS)

Test vectors and runner for verifying AVAR-compliant implementations.

## Two Tiers

- **`producer/`** — vectors an implementation must correctly *emit*
- **`verifier/`** — vectors an implementation must correctly *accept or reject*

## Usage

```bash
# Test a verifier binary
avar-conformance verifier --binary ./my-verifier

# Test a producer by feeding it scripted actions
avar-conformance producer --producer-config ./my-producer.yaml
```

Exit code `0` = all tests passed. Non-zero = failure count.

## Vector Format

Each vector is a JSON file:

```json
{
  "id": "rfc-0008/depth-transport-basic",
  "description": "Transport-depth evidence with minimal claims block",
  "spec_refs": ["RFC-0008 §3", "RFC-0008 §5"],
  "input": { ... receipt ... },
  "expected": {
    "verdict": "accept",
    "warnings": [],
    "errors": []
  }
}
```

Rejection vectors set `expected.verdict` to `reject` and list required
error codes.

## Vendor-Neutral Rule

Vectors MUST use only generic `source` values from RFC-0008 §4
(`network-proxy`, `sdk-wrapper`, `os-agent`, `application`, `broker`).
Vendor-specific source values are rejected by the vector linter.

## "AVAR Compatible" Certification

Passing the current-version verifier suite is the technical basis for the
proposed **AVAR Compatible** certification mark. See
[Aarmatix/avar-spec/GOVERNANCE.md](https://github.com/Aarmatix/avar-spec/blob/main/GOVERNANCE.md).

## Contributing

- Bug in a vector? Open an issue with the vector ID.
- Missing coverage? Open a PR adding a vector; every vector MUST cite the
  RFC section it exercises.
- Spec ambiguity? Open an issue in `avar-spec`, not here.

## License

- Code: Apache-2.0 (LICENSE)
- Test vectors: CC BY 4.0 (LICENSE-VECTORS)
