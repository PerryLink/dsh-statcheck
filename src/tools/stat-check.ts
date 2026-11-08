/**
 * `stat_check` — recompute reported statistics in a manuscript.
 * @module dsh-statcheck/tools/stat-check
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { StatcheckError, type StatcheckRuntime } from '../runtime.ts'
import { ERROR_SCHEMA, FINDING_SCHEMA, SUMMARY_SCHEMA, plainFinding } from './shared.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    summary: SUMMARY_SCHEMA,
    findings: { type: 'array', items: FINDING_SCHEMA },
    source: { type: 'json' },
    evidenceId: { type: 'string' },
    recordPath: { type: 'string' },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `stat_check` tool.
 * @param runtime - the statcheck runtime.
 * @returns the tool definition.
 */
export function makeStatCheckTool(runtime: StatcheckRuntime) {
  return defineTool({
    name: 'stat_check',
    description: [
      'Recompute the p values reported in a manuscript and flag self-inconsistent statistics (dsh-statcheck).',
      '',
      'Parses APA-style reports: t(df), F(df1, df2), χ²(df), r(df), z, each with a nearby p value (`p = .018`, `p < .001`) and an optional 95% CI. The p value is recomputed from the reported statistic only — no data is re-analysed, no model is judged.',
      '',
      'Flags mean "the reported p does not follow from the reported statistic", with both numbers and the character range shown. They do NOT imply misconduct and must be reviewed by a human. Scanned/PDF text is out of scope: extract text first (dsh-doc-anchor) and pass `text` or a `.txt`/`.md`/`.tex` path.',
    ].join('\n'),
    parameters: {
      text: { type: 'string', description: 'Manuscript text to analyze (mutually exclusive with path).' },
      path: { type: 'string', description: 'Workspace-relative manuscript path (.txt/.md/.tex/.html; must stay inside the workspace).' },
      persist: { type: 'boolean', description: 'Store the analyzed text as a REP snapshot + record (default true).' },
      maxFindings: { type: 'integer', description: 'Findings cap for this call.' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as
          | { ok: true; summary: { total: number; consistent: number; inconsistent: number; unparsed: number }; findings: Array<{ statistic: string; text: string; detail: string; status: string; charStart: number }>; evidenceId?: string }
          | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `stat_check failed (${result.error.code}): ${result.error.message}` }]
        const lines = [
          `stat_check: ${result.summary.total} statistic(s) — ${result.summary.consistent} consistent, ${result.summary.inconsistent} inconsistent, ${result.summary.unparsed} unparsed`,
        ]
        for (const finding of result.findings.filter(item => item.status === 'inconsistent').slice(0, 20)) {
          lines.push(`  [inconsistent] ${finding.text} — ${finding.detail} (chars ${finding.charStart}-${finding.charStart + finding.text.length})`)
        }
        if (result.summary.inconsistent > 0) {
          lines.push('  these findings are candidates for human review, not a conclusion about the authors')
        }
        if (result.evidenceId !== undefined) lines.push(`evidence ${result.evidenceId}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args: unknown) {
      const request = args as Parameters<StatcheckRuntime['check']>[0]
      try {
        const result = await runtime.check(request)
        return {
          ok: true as const,
          summary: { ...result.summary },
          findings: result.findings.map(plainFinding),
          source: { ...result.source },
          ...(result.evidenceId === undefined ? {} : { evidenceId: result.evidenceId }),
          ...(result.recordPath === undefined ? {} : { recordPath: result.recordPath }),
        }
      } catch (error) {
        if (error instanceof StatcheckError) return { ok: false as const, error: { code: error.code, message: error.message } }
        throw error
      }
    },
  })
}
