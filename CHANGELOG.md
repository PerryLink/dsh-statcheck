# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-08

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
- 37 tests; benchmark on `dsh-research-bench` stats v0.1.0 (30 cases): precision
  1.00, recall 1.00, clean false-positive rate 0.00, exact accuracy 1.00.

### Notes

- Findings mean "the reported p does not follow from the reported statistic";
  they are not misconduct claims and are not a substitute for a statistician.
- One-sided tests, Welch fractional df and table-embedded statistics are out of
  scope in v0.1.
