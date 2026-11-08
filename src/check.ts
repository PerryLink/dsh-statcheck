/**
 * APA-style statistical reporting parser and consistency judge.
 *
 * It recognizes `t(df)`, `F(df1, df2)`, `χ²(df)`, `r(df)` and `z` with a nearby
 * p value (and optional 95% CI), recomputes the p value from the reported
 * statistic, and decides whether the report is self-consistent. It never
 * re-analyses the data, never judges the model and never calls a result
 * "fraudulent": a finding is "the reported p does not follow from the reported
 * statistic", with both numbers shown.
 *
 * @module dsh-statcheck/check
 */

import { stableId } from '@perrylink/dsh-research-core'
import { chiSquareUpperP, fUpperP, rTwoTailedP, tTwoTailedP, zTwoTailedP } from './math.ts'

/** Supported statistic families. */
export type StatisticKind = 't' | 'F' | 'chi2' | 'r' | 'z'

/** Consistency verdict of one reported statistic. */
export type StatStatus = 'consistent' | 'inconsistent' | 'unparsed'

/** What kind of problem was found. */
export type StatIssue = 'p-value' | 'p-threshold' | 'ci' | 'format' | 'df'

/** One parsed and judged statistical report. */
export interface StatFinding {
  readonly findingId: string
  readonly statistic: StatisticKind
  /** The matched source text. */
  readonly text: string
  readonly charStart: number
  readonly charEnd: number
  /** Degrees of freedom as reported. */
  readonly df: readonly number[]
  readonly reported: {
    readonly statistic: number
    /** The p value as written (`".018"`, `"<.001"` …). */
    readonly p?: string
    readonly pKind?: 'equal' | 'less' | 'greater'
    readonly pValue?: number
    readonly ci?: readonly [number, number]
  }
  /** The p value recomputed from the reported statistic. */
  readonly recomputed: { readonly p: number }
  readonly status: StatStatus
  readonly issue?: StatIssue
  readonly severity: 'info' | 'warning' | 'error'
  readonly detail: string
}

/** Aggregate counts. */
export interface StatSummary {
  readonly total: number
  readonly consistent: number
  readonly inconsistent: number
  readonly unparsed: number
}

/** A parsed statistic before judging. */
interface Candidate {
  readonly kind: StatisticKind
  readonly statistic: number
  readonly df: number[]
  readonly start: number
  readonly end: number
  readonly text: string
}

const P_PATTERN = /\bp\s*(<|>|=|≤|≥)\s*(\.\d+|\d+\.?\d*)/u
const CI_PATTERN = /(?:9[05]%\s*)?(?:CI|confidence interval)\s*[:=]?\s*\[?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/iu
const WINDOW = 120

/** Thrown for an impossible recomputation request (bad df/statistic). */
export class StatInputError extends Error {
  /** Stable code. */
  readonly code: 'INVALID_INPUT' | 'OUT_OF_DOMAIN'

  constructor(code: 'INVALID_INPUT' | 'OUT_OF_DOMAIN', message: string) {
    super(message)
    this.name = 'StatInputError'
    this.code = code
  }
}

/** Parse the statistic candidates in one text. */
function candidatesOf(text: string): Candidate[] {
  const candidates: Candidate[] = []
  const add = (match: RegExpExecArray, kind: StatisticKind, statistic: number, df: number[]): void => {
    candidates.push({ kind, statistic, df, start: match.index, end: match.index + match[0].length, text: match[0] })
  }
  for (const match of text.matchAll(/\bt\s*\(\s*(\d+(?:\.\d+)?)\s*\)\s*=\s*(-?\d+(?:\.\d+)?)/gu)) {
    add(match, 't', Number(match[2]), [Number(match[1])])
  }
  for (const match of text.matchAll(/\bF\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*=\s*(-?\d+(?:\.\d+)?)/gu)) {
    add(match, 'F', Number(match[3]), [Number(match[1]), Number(match[2])])
  }
  for (const match of text.matchAll(/(?:χ²|χ2|X²|X2)\s*\(\s*(\d+(?:\.\d+)?)\s*\)\s*=\s*(-?\d+(?:\.\d+)?)/gu)) {
    add(match, 'chi2', Number(match[2]), [Number(match[1])])
  }
  for (const match of text.matchAll(/\br\s*\(\s*(\d+(?:\.\d+)?)\s*\)\s*=\s*(-?\.?\d+(?:\.\d+)?)/gu)) {
    add(match, 'r', Number(match[2]), [Number(match[1])])
  }
  for (const match of text.matchAll(/\bz\s*=\s*(-?\d+(?:\.\d+)?)/gu)) {
    add(match, 'z', Number(match[1]), [])
  }
  return candidates.sort((left, right) => left.start - right.start)
}

/**
 * Recompute the two-tailed (t/r/z) or upper-tail (F/χ²) p value.
 * @param input - statistic kind, value and df.
 * @returns the recomputed p value.
 * @throws StatInputError when the request is outside the distribution's domain.
 */
export function recomputeP(input: { statistic: StatisticKind; value: number; df: readonly number[] }): number {
  const { statistic, value } = input
  const df = [...input.df]
  if (!Number.isFinite(value)) throw new StatInputError('INVALID_INPUT', 'statistic must be a finite number')
  if (statistic === 't') {
    const df1 = df[0]
    if (df1 === undefined || df1 <= 0) throw new StatInputError('OUT_OF_DOMAIN', 't requires df > 0')
    return tTwoTailedP(value, df1)
  }
  if (statistic === 'F') {
    const [df1, df2] = df
    if (df1 === undefined || df2 === undefined || df1 <= 0 || df2 <= 0) {
      throw new StatInputError('OUT_OF_DOMAIN', 'F requires df1 > 0 and df2 > 0')
    }
    return fUpperP(value, df1, df2)
  }
  if (statistic === 'chi2') {
    const df1 = df[0]
    if (df1 === undefined || df1 <= 0) throw new StatInputError('OUT_OF_DOMAIN', 'chi-square requires df > 0')
    return chiSquareUpperP(value, df1)
  }
  if (statistic === 'r') {
    const df1 = df[0]
    if (df1 === undefined || df1 <= 0) throw new StatInputError('OUT_OF_DOMAIN', 'r requires df > 0')
    if (Math.abs(value) > 1) throw new StatInputError('OUT_OF_DOMAIN', 'r must be in [-1, 1]')
    return rTwoTailedP(value, df1)
  }
  return zTwoTailedP(value)
}

/** Decimal places in a reported p string. */
function decimalsOf(raw: string): number {
  const dot = raw.indexOf('.')
  return dot === -1 ? 0 : raw.length - dot - 1
}

/** Judge one reported p against the recomputed one. */
export function judgeP(input: {
  pRaw: string
  pKind: 'equal' | 'less' | 'greater'
  recomputed: number
}): { status: 'consistent' | 'inconsistent'; issue?: StatIssue; detail: string } {
  const { pRaw, pKind, recomputed } = input
  const reported = Number(pRaw.startsWith('.') ? `0${pRaw}` : pRaw)
  if (!Number.isFinite(reported) || reported < 0 || reported > 1) {
    return {
      status: 'inconsistent',
      issue: 'format',
      detail: `the reported p ${pKind === 'equal' ? '=' : pKind === 'less' ? '<' : '>'} ${pRaw} is not a probability in [0, 1]`,
    }
  }
  const shown = recomputed.toFixed(4)
  if (pKind === 'equal' && reported === 0) {
    return {
      status: 'inconsistent',
      issue: 'format',
      detail: `the report says p = ${pRaw}; an exact zero p cannot follow from a finite statistic — APA style requires p < .001 (recomputed ${shown})`,
    }
  }
  if (pKind === 'equal') {
    const tolerance = 0.5 * 10 ** -decimalsOf(pRaw) + 0.001
    if (Math.abs(recomputed - reported) <= tolerance) {
      return { status: 'consistent', detail: `reported p = ${pRaw}; recomputed ${shown} (within rounding)` }
    }
    return {
      status: 'inconsistent',
      issue: 'p-value',
      detail: `reported p = ${pRaw}, but the reported statistic gives recomputed p = ${shown}`,
    }
  }
  if (pKind === 'less') {
    if (recomputed < reported - 1e-12) {
      return { status: 'consistent', detail: `reported p < ${pRaw}; recomputed ${shown}` }
    }
    return {
      status: 'inconsistent',
      issue: 'p-threshold',
      detail: `reported p < ${pRaw}, but the reported statistic gives p = ${shown}`,
    }
  }
  if (recomputed > reported + 1e-12) {
    return { status: 'consistent', detail: `reported p > ${pRaw}; recomputed ${shown}` }
  }
  return {
    status: 'inconsistent',
    issue: 'p-threshold',
    detail: `reported p > ${pRaw}, but the reported statistic gives p = ${shown}`,
  }
}

/** True when a p value is significant at .05. */
function isSignificant(pValue: number): boolean {
  return pValue < 0.05
}

/**
 * Analyze a block of text.
 * @param text - the manuscript text (untrusted data).
 * @param options - `maxFindings` caps the output (default 500).
 * @returns the findings and their aggregate counts.
 */
export function analyzeText(text: string, options: { maxFindings?: number } = {}): { findings: StatFinding[]; summary: StatSummary } {
  const maxFindings = options.maxFindings ?? 500
  const candidates = candidatesOf(text)
  const findings: StatFinding[] = []
  for (const [index, candidate] of candidates.entries()) {
    if (findings.length >= maxFindings) break
    const next = candidates[index + 1]?.start ?? text.length
    const windowEnd = Math.min(next, candidate.end + WINDOW)
    const window = text.slice(candidate.end, windowEnd)
    const pMatch = P_PATTERN.exec(window)
    const ciMatch = CI_PATTERN.exec(window)
    const findingId = stableId('st', [candidate.kind, candidate.text, candidate.start])
    const base = {
      findingId,
      statistic: candidate.kind,
      text: candidate.text,
      charStart: candidate.start,
      charEnd: candidate.end,
      df: candidate.df,
    }
    let recomputed: number
    try {
      recomputed = recomputeP({ statistic: candidate.kind, value: candidate.statistic, df: candidate.df })
    } catch (error) {
      findings.push({
        ...base,
        reported: { statistic: candidate.statistic },
        recomputed: { p: Number.NaN },
        status: 'inconsistent',
        issue: 'df',
        severity: 'error',
        detail: `cannot recompute: ${(error as Error).message}`,
      })
      continue
    }

    if (pMatch === null) {
      findings.push({
        ...base,
        reported: { statistic: candidate.statistic },
        recomputed: { p: recomputed },
        status: 'unparsed',
        severity: 'info',
        detail: `statistic parsed (recomputed p = ${recomputed.toFixed(4)}), but no p value was found next to it`,
      })
      continue
    }
    const pKind = pMatch[1] === '<' || pMatch[1] === '≤' ? 'less' : pMatch[1] === '>' || pMatch[1] === '≥' ? 'greater' : 'equal'
    const pRaw = pMatch[2]!
    const judgment = judgeP({ pRaw, pKind, recomputed })
    const ci = ciMatch === null ? undefined : ([Number(ciMatch[1]), Number(ciMatch[2])] as const)
    let status = judgment.status
    let issue = judgment.issue
    let detail = judgment.detail
    let severity: StatFinding['severity'] = status === 'consistent' ? 'info' : 'error'
    if (ci !== undefined && status === 'consistent') {
      const reportedP = Number(pRaw.startsWith('.') ? `0${pRaw}` : pRaw)
      const significant = pKind === 'equal' ? isSignificant(reportedP) : isSignificant(recomputed)
      const excludesZero = ci[0] > 0 || ci[1] < 0
      if (significant && !excludesZero) {
        status = 'inconsistent'
        issue = 'ci'
        severity = 'error'
        detail = `p = ${pRaw} is significant, but the reported 95% CI [${ci[0]}, ${ci[1]}] includes 0`
      }
    }
    findings.push({
      ...base,
      reported: {
        statistic: candidate.statistic,
        p: pRaw,
        pKind,
        pValue: Number(pRaw.startsWith('.') ? `0${pRaw}` : pRaw),
        ...(ci === undefined ? {} : { ci }),
      },
      recomputed: { p: recomputed },
      status,
      ...(issue === undefined ? {} : { issue }),
      severity,
      detail,
    })
  }
  const summary: StatSummary = {
    total: findings.length,
    consistent: findings.filter(finding => finding.status === 'consistent').length,
    inconsistent: findings.filter(finding => finding.status === 'inconsistent').length,
    unparsed: findings.filter(finding => finding.status === 'unparsed').length,
  }
  return { findings, summary }
}
