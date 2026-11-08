# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-11-08

### Changed

- Release-engineering refresh: CHANGELOG accuracy, package metadata and authors; no runtime changes.

## [0.1.0] - 2026-11-08

### Fixed

- Re-checking unchanged text no longer fails with `STORE_ERROR`: evidence
  identity is the immutable snapshot plus the findings, and retrieval times
  come from the snapshot, so unchanged analysis dedupes while a different
  findings cap produces distinct evidence.
- `stat_report` no longer throws when a finding's recomputed p is `null` (the
  JSON form of the NaN emitted for an impossible df); Markdown shows `n/a` and
  SARIF records `recomputedP: null`.
- A per-call `maxFindings` is clamped to the configured hard cap instead of
  overriding it.
- Negative F and χ² values are rejected as out of domain instead of being
  mapped to p = 1.
- `stat_report` accepts an optional `text` and maps each finding's `charStart`
  to a real SARIF line/column; without it the old line-1 fallback remains.

First release: statistical consistency checking.

### Added

- `stat_check`: APA-style parsing of t/F/χ²/r/z with p values and 95% CIs,
  recomputation of p (two-tailed t/r/z, upper-tail F/χ²) from zero-dependency
  distributions, and self-consistency findings with exact character locators.
- `stat_recompute`: single-statistic recomputation with the same documented
  rounding rule.
- `stat_report`: Markdown table and SARIF 2.1.0 output.
- REP v1 integration: the analyzed text becomes an immutable snapshot, findings
  become evidence checks (pass/fail/skipped), and a sealed-able record is written.
- Distribution implementations validated against published critical values
  (t, F, χ², r, z) in the test suite.
- 42 tests; benchmark on `dsh-research-bench` stats v0.1.0 (30 cases): precision
  1.00, recall 1.00, clean false-positive rate 0.00, exact accuracy 1.00.

### Notes

- Findings mean "the reported p does not follow from the reported statistic";
  they are not misconduct claims and are not a substitute for a statistician.
- One-sided tests, Welch fractional df and table-embedded statistics are out of
  scope in v0.1.
