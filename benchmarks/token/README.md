# Token benchmark baseline

`baseline-0.6.0.json` freezes the public npm package and checked-in source used
as the pre-migration comparison. The registry metadata was read from the
official npm registry, the tarball was downloaded to an isolated temporary
directory, and `version` plus `capabilities --json` were executed through the
installed package.

This baseline is evidence, not a claim that token savings already exist. Live
baseline/candidate runs must use the same model, Agent configuration, user
prompt, fixtures, and tool permissions described by the delivery contract.

Run `node scripts/verify-token-baseline.mjs` from the package root to verify
source hashes and static counts that do not require network access. Tarball
identity is verified separately after downloading the recorded URL.

Tier 1 uses the locked, data-vendored `gpt-tokenizer@3.4.0`: its GPT-4 model
reproduces the frozen `cl100k_base` count exactly, while the GPT-5 model records
the current-tokenizer count separately. Run `pnpm test:tokens` twice; output
must be byte-identical.

Tier 2 is opt-in and never spends tokens implicitly. Build first, then validate
all identities and the interleaved three-run schedule:

```sh
node scripts/hash-benchmark-package.mjs --root /absolute/baseline/package --name k-teach --version 0.6.0
node scripts/hash-benchmark-package.mjs --root /absolute/candidate/package --name k-teach --version 0.6.0
node scripts/live-token-benchmark.mjs --config /absolute/path/config.json --dry-run
```

After an external provider/Agent runner captures usage for that exact schedule,
evaluate it and write the human-readable report with:

```sh
node scripts/live-token-benchmark.mjs --config /absolute/path/config.json \
  --samples /absolute/path/redacted-samples.json \
  --markdown /absolute/path/live-report.md
```

Start from `live-config.example.json`; every `REPLACE_*` value must be frozen
before the dry-run. The harness
rejects missing usage, quality failures, content failures, route regressions,
late environmental replacements, non-interleaved successes, non-zero
model-authored layout code, and threshold misses. It retains failed attempts in
redacted JSON and never calls WeChat or reads credentials.
