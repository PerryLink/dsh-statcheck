/**
 * Tool schema fragments for dsh-statcheck.
 * @module dsh-statcheck/tools/shared
 */

/** The failure branch. */
export const ERROR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    code: { type: 'string', required: true },
    message: { type: 'string', required: true },
  },
} as const

/** One finding. */
export const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findingId: { type: 'string', required: true },
    statistic: { type: 'string', required: true },
    text: { type: 'string', required: true },
    charStart: { type: 'integer', required: true },
    charEnd: { type: 'integer', required: true },
    df: { type: 'array', items: { type: 'number' } },
    status: { type: 'string', required: true },
    detail: { type: 'string', required: true },
    severity: { type: 'string', required: true },
    issue: { type: 'string' },
    reported: { type: 'json' },
    recomputed: { type: 'json' },
  },
} as const

/** The summary counters. */
export const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    total: { type: 'integer', required: true },
    consistent: { type: 'integer', required: true },
    inconsistent: { type: 'integer', required: true },
    unparsed: { type: 'integer', required: true },
  },
} as const

/** Project one finding into lossless JSON. */
export function plainFinding(finding: {
  findingId: string
  statistic: string
  text: string
  charStart: number
  charEnd: number
  df: readonly number[]
  status: string
  detail: string
  severity: string
  issue?: string
  reported: Record<string, unknown>
  recomputed: { p: number }
}) {
  return {
    findingId: finding.findingId,
    statistic: finding.statistic,
    text: finding.text,
    charStart: finding.charStart,
    charEnd: finding.charEnd,
    df: [...finding.df],
    status: finding.status,
    detail: finding.detail,
    severity: finding.severity,
    ...(finding.issue === undefined ? {} : { issue: finding.issue }),
    reported: { ...finding.reported, ...(finding.reported['ci'] === undefined ? {} : { ci: [...(finding.reported['ci'] as number[])] }) } as never,
    recomputed: { p: Number.isNaN(finding.recomputed.p) ? null : finding.recomputed.p } as never,
  }
}
