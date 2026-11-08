/**
 * SARIF 2.1.0 and Markdown rendering for statistical findings.
 *
 * Every finding names the reported value, the recomputed value and the exact
 * character range, so a reviewer can check it in seconds. Nothing is described
 * as misconduct: the text says "the reported p does not follow from the
 * reported statistic".
 *
 * @module dsh-statcheck/report
 */

import type { StatFinding } from './check.ts'

/** Minimal SARIF shapes emitted here. */
export interface StatSarifResult {
  readonly ruleId: string
  readonly level: 'error' | 'warning' | 'note'
  readonly message: { readonly text: string }
  readonly locations: readonly {
    readonly physicalLocation: {
      readonly artifactLocation: { readonly uri: string }
      readonly region: { readonly startLine: number; readonly startColumn: number }
    }
  }[]
  readonly properties: Record<string, unknown>
}

/** Read a finite recomputed p, tolerating the JSON `null` a df error emits. */
function recomputedOf(finding: StatFinding): number | undefined {
  const value: unknown = finding.recomputed?.p
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Map a UTF-16 character offset to a 1-based SARIF line/column.
 * Without the source text the old line-1 + character-column fallback is kept.
 */
function regionOf(finding: StatFinding, text: string | undefined): { startLine: number; startColumn: number } {
  if (text === undefined) return { startLine: 1, startColumn: finding.charStart + 1 }
  const offset = Math.min(Math.max(finding.charStart, 0), text.length)
  const before = text.slice(0, offset)
  const lastNewline = before.lastIndexOf('\n')
  return { startLine: before.split('\n').length, startColumn: offset - lastNewline }
}

/** Render findings as a SARIF 2.1.0 log. */
export function findingsToSarif(findings: readonly StatFinding[], version: string, text?: string): Record<string, unknown> {
  const results: StatSarifResult[] = findings
    .filter(finding => finding.status === 'inconsistent')
    .map(finding => {
      const recomputed = recomputedOf(finding)
      return {
        ruleId: `statcheck/${finding.issue ?? 'p-value'}`,
        level: 'error' as const,
        message: {
          text: `${finding.text}: ${finding.detail}`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'manuscript.txt' },
              region: regionOf(finding, text),
            },
          },
        ],
        properties: {
          statistic: finding.statistic,
          df: [...finding.df],
          reportedP: finding.reported.p ?? null,
          recomputedP: recomputed === undefined ? null : Number(recomputed.toFixed(6)),
          issue: finding.issue ?? null,
          charStart: finding.charStart,
          charEnd: finding.charEnd,
        },
      }
    })
  const rules = [...new Set(results.map(result => result.ruleId))].map(id => ({ id, name: id.split('/')[1] ?? 'finding' }))
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'dsh-statcheck', version, ...(rules.length === 0 ? {} : { rules }) } },
        results,
      },
    ],
  }
}

/** Render findings as a Markdown table plus a short explanation. */
export function findingsToMarkdown(findings: readonly StatFinding[], summary: { total: number; consistent: number; inconsistent: number; unparsed: number }): string {
  const lines: string[] = []
  lines.push('# Statistical consistency report')
  lines.push('')
  lines.push(
    `${summary.total} reported statistic(s): ${summary.consistent} consistent, ${summary.inconsistent} inconsistent, ${summary.unparsed} unparsed.`,
  )
  lines.push('')
  if (summary.inconsistent > 0) {
    lines.push('> These findings mean **the reported p value does not follow from the reported statistic**. They do not imply misconduct, and they are not a substitute for a statistician reviewing the analysis.')
    lines.push('')
  }
  lines.push('| # | Reported | Recomputed p | Status | Detail | Chars |')
  lines.push('|---:|---|---:|---|---|---|')
  findings.forEach((finding, index) => {
    const recomputed = recomputedOf(finding)
    const shown = recomputed === undefined ? 'n/a' : recomputed.toFixed(4)
    lines.push(
      `| ${index + 1} | \`${finding.text}\` | ${shown} | ${finding.status}${finding.issue === undefined ? '' : ` (${finding.issue})`} | ${finding.detail.replace(/\|/gu, '\\|')} | ${finding.charStart}-${finding.charEnd} |`,
    )
  })
  return `${lines.join('\n')}\n`
}
