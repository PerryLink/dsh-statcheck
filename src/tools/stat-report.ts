/**
 * `stat_report` — render findings as Markdown and SARIF 2.1.0.
 * @module dsh-statcheck/tools/stat-report
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { StatFinding } from '../check.ts'
import { findingsToMarkdown, findingsToSarif } from '../report.ts'
import { VERSION } from '../version.ts'
import { ERROR_SCHEMA, SUMMARY_SCHEMA } from './shared.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    markdown: { type: 'string' },
    sarif: { type: 'json' },
    summary: SUMMARY_SCHEMA,
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `stat_report` tool.
 * @returns the tool definition.
 */
export function makeStatReportTool() {
  return defineTool({
    name: 'stat_report',
    description: [
      'Render stat_check findings as a Markdown report and a SARIF 2.1.0 log (dsh-statcheck).',
      '',
      'Pass the `findings` array returned by stat_check. The Markdown table names the reported statistic, the recomputed p, the verdict and the character range; the SARIF log carries one error result per inconsistent finding for CI/code-scanning consumers.',
      '',
      'The report says explicitly that a finding means "the reported p does not follow from the reported statistic" — not misconduct.',
    ].join('\n'),
    parameters: {
      findings: { type: 'array', items: { type: 'json' }, required: true, description: 'Findings from stat_check.' },
      text: { type: 'string', description: 'Original manuscript text; when provided, SARIF line/column are mapped from each finding charStart.' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as { ok: true; markdown: string; summary: { inconsistent: number } } | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `stat_report failed (${result.error.code}): ${result.error.message}` }]
        return [{ type: 'text', text: result.markdown }]
      },
    },
    async execute(args: unknown) {
      const request = args as { findings?: StatFinding[]; text?: string }
      const findings = Array.isArray(request.findings) ? request.findings : []
      const text = typeof request.text === 'string' ? request.text : undefined
      const summary = {
        total: findings.length,
        consistent: findings.filter(finding => finding.status === 'consistent').length,
        inconsistent: findings.filter(finding => finding.status === 'inconsistent').length,
        unparsed: findings.filter(finding => finding.status === 'unparsed').length,
      }
      return {
        ok: true as const,
        markdown: findingsToMarkdown(findings, summary),
        sarif: findingsToSarif(findings, VERSION, text) as never,
        summary,
      }
    },
  })
}
