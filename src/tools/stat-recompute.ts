/**
 * `stat_recompute` — one statistic in, the recomputed p value out.
 * @module dsh-statcheck/tools/stat-recompute
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { StatcheckError, type StatcheckRuntime } from '../runtime.ts'
import { ERROR_SCHEMA } from './shared.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    statistic: { type: 'string' },
    value: { type: 'number' },
    df: { type: 'array', items: { type: 'number' } },
    p: { type: 'number' },
    judgment: { type: 'json' },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `stat_recompute` tool.
 * @param runtime - the statcheck runtime.
 * @returns the tool definition.
 */
export function makeStatRecomputeTool(runtime: StatcheckRuntime) {
  return defineTool({
    name: 'stat_recompute',
    description: [
      'Recompute a p value from a single reported statistic (dsh-statcheck).',
      '',
      't and r are two-tailed; F and χ² are upper-tail; z is two-tailed. Degrees of freedom are required (t: 1, F: 2, χ²: 1, r: 1, z: 0). Pass `p` as written (e.g. ".018" or "<.001") to also get a consistency judgment with the same rounding rule used by stat_check.',
      '',
      'This is arithmetic, not inference: it does not re-analyse data and cannot tell whether the reported statistic itself is appropriate.',
    ].join('\n'),
    parameters: {
      statistic: { type: 'string', enum: ['t', 'F', 'chi2', 'r', 'z'], description: 'Statistic family.' },
      value: { type: 'number', required: true, description: 'The reported statistic.' },
      df: { type: 'array', items: { type: 'number' }, description: 'Degrees of freedom as reported (empty for z).' },
      p: { type: 'string', description: 'The p value as reported (".018", "<.001", "= .05").' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as
          | { ok: true; statistic: string; value: number; df: number[]; p: number; judgment?: { status: string; issue?: string; detail: string } }
          | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `stat_recompute failed (${result.error.code}): ${result.error.message}` }]
        const lines = [`stat_recompute: ${result.statistic} = ${result.value}${result.df.length === 0 ? '' : `, df = ${result.df.join(', ')}`} → p = ${result.p.toFixed(6)}`]
        if (result.judgment !== undefined) lines.push(`  ${result.judgment.status}${result.judgment.issue === undefined ? '' : ` (${result.judgment.issue})`}: ${result.judgment.detail}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args: unknown) {
      const request = args as { statistic: 't' | 'F' | 'chi2' | 'r' | 'z'; value: number; df?: number[]; p?: string }
      try {
        const result = runtime.recompute({
          statistic: request.statistic,
          value: request.value,
          df: request.df ?? [],
          ...(request.p === undefined ? {} : { p: request.p }),
        })
        return {
          ok: true as const,
          statistic: request.statistic,
          value: request.value,
          df: [...(request.df ?? [])],
          p: result.p,
          ...(result.judgment === undefined
            ? {}
            : { judgment: { status: result.judgment.status, ...(result.judgment.issue === undefined ? {} : { issue: result.judgment.issue }), detail: result.judgment.detail } }),
        }
      } catch (error) {
        if (error instanceof StatcheckError) return { ok: false as const, error: { code: error.code, message: error.message } }
        throw error
      }
    },
  })
}
