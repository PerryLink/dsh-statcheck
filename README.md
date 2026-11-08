# dsh-statcheck

**Recompute the statistics a manuscript reports — and flag the ones that do not add up.**

*It is arithmetic, not accusation: each finding shows the reported statistic, the p value it actually implies, and the exact characters it came from.*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24.9-brightgreen.svg)]()

English · [简体中文](README-zh.md)

---

## What it does

- Parses APA-style reports: `t(df)`, `F(df1, df2)`, `χ²(df)`, `r(df)`, `z`, each with a nearby `p = …`, `p < …` or `p > …` and an optional `95% CI [lo, hi]`.
- Recomputes the p value from the reported statistic with zero-dependency distributions (two-tailed t/r/z, upper-tail F/χ²).
- Flags self-inconsistency with the reported value, the recomputed value, the character range and a stable issue code.
- Checks the CI against significance (a significant p with a CI that includes 0 is a contradiction).
- Emits Markdown and **SARIF 2.1.0**, and registers the analyzed text as a REP v1 evidence item whose checks are the findings.

## What it does not do

- **No data re-analysis.** It cannot know whether the reported statistic is appropriate for the design.
- **No misconduct claims.** A finding means “the reported p does not follow from the reported statistic”. It is a candidate for human review, never a verdict about authors.
- **No PDF/OCR.** Extract text first (`dsh-doc-anchor`) and pass `text` or a `.txt/.md/.tex/.html` path.
- **No model/assumption checks**, no multiple-comparison correction, no sample-size inference.
- **No silent tolerance widening.** The rounding rule is fixed and documented; a flagged value stays flagged.

## Compatibility

| | |
|---|---|
| DeepSeek Harness | **`dsh-v0.2.1-rc.5`** (verified 2026-11-08); peer line `>=0.2.1-0 <0.3.0 \|\| >=0.2.2-0 <0.3.0` |
| Node | `^22.19.0 \|\| >=24.9.0` (tested on `24.22.1`), ESM only |
| Peers | `@perrylink/dsh-research-core ^0.1.0`, `@deepseek-ai/cordis ^4.0.5-alpha.1`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery ^3.18.5-alpha.1` |
| Runtime dependencies | **zero** |

```sh
dsh plugin --profile <name> add @perrylink/dsh-research-core dsh-statcheck
dsh --profile <name> --dump-config | grep dsh-statcheck
dsh plugin --profile <name> remove dsh-statcheck
```

## Tools

### `stat_check`

`{ text?, path?, persist?, maxFindings? }` → `{ ok, summary, findings[], source, evidenceId?, recordPath? }`.

Each finding: `statistic`, `df`, `text`, `charStart`, `charEnd`, `reported { statistic, p, pKind, pValue, ci? }`, `recomputed { p }`, `status` (`consistent`/`inconsistent`/`unparsed`), `issue?` (`p-value`/`p-threshold`/`ci`/`format`/`df`), `severity`, `detail`.

### `stat_recompute`

`{ statistic: 't'|'F'|'chi2'|'r'|'z', value, df[], p? }` → `{ ok, p, judgment? }`.
t/r/z are two-tailed; F/χ² upper-tail. `p` uses the same rounding rule as `stat_check`.

### `stat_report`

`{ findings }` → `{ ok, markdown, sarif, summary }`. SARIF carries one error result per inconsistent finding.

### Error codes

`INVALID_INPUT` · `NOT_FOUND` · `PATH_ESCAPE` · `NOT_A_FILE` · `TOO_LARGE` · `OUT_OF_DOMAIN` · `STORE_ERROR`

## The rounding rule (documented, not tuned)

A reported `p = x` is consistent when `|recomputed − x| ≤ 0.5 × 10^-decimals + 0.001`.
The extra `0.001` absorbs the fact that the statistic itself is often reported rounded (e.g. `t = 2.50` implies p ≈ .01855, commonly written `.019`). `p < X` is consistent when the recomputed value is below `X`; `p > X` when above.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | `false` mounts nothing |
| `root` | `.statcheck` | store + records root |
| `workspaceRoot` | `process.cwd()` | manuscript paths must resolve inside it |
| `maxChars` | `2000000` | analyzed-character cap (over-limit fails, never truncates) |
| `maxFindings` | `500` | findings per call |
| `persist` | `true` | store a snapshot + REP record |

## Evaluation

### Benchmark — `dsh-research-bench` stats v0.1.0 (30 cases)

```sh
pnpm run bench:stats
```

| metric | value |
|---|---:|
| inconsistent precision | **1.00** |
| inconsistent recall | **1.00** |
| inconsistent F1 | **1.00** |
| clean false-positive rate | **0.00** |
| issue accuracy when flagged | **1.00** |
| exact accuracy | **1.00** |

Raw per-case predictions: [`bench/results-stats.json`](bench/results-stats.json).

**Scope warning**: the dataset is small, synthetic and clean (10 consistent + 20 inconsistent sentences around published critical values). A perfect score shows the parser and the recomputation agree with the critical-value labels on these constructions; it does **not** estimate real-manuscript accuracy. The rounding rule and issue codes are documented so a reader can disagree with a specific finding.

### Tests

- **41 tests across 5 files**: distribution tails against published critical values (t/F/χ²/r/z), parsing (all families, offsets, thresholds, CIs, multiple statistics, unparsed), judging (p-value, threshold, format, CI, df, negative F/χ² domains), runtime (evidence + valid REP record, re-check without an evidence conflict, findings-cap clamp, file/media type, persist=false, path escapes, size cap), tools (schemas, success/failure, SARIF incl. a null recomputed p), package contract.

## Known limitations (v0.1)

- One-sided tests, fractional Welch df, multi-model tables and within-text references such as “see Table 2” are not modeled.
- Only APA-style inline reports are parsed; `p` values in tables are out of scope.
- CI-versus-p checking assumes a two-sided test of the same effect at α = .05.
- No correction for multiple comparisons.

## License

Apache-2.0. No third-party runtime code.
