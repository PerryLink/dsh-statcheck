/**
 * Parsing and judging APA-style statistical reports.
 * @module test/check.spec
 */

import { describe, expect, it } from 'vitest'
import { analyzeText, judgeP, recomputeP, StatInputError } from '../src/check.ts'

/** Analyze one sentence and return its single finding. */
function one(text: string) {
  const result = analyzeText(text)
  expect(result.findings).toHaveLength(1)
  return { finding: result.findings[0]!, summary: result.summary }
}

describe('parsing', () => {
  it('parses each statistic family', () => {
    expect(one('t(28) = 2.048, p = .050').finding.statistic).toBe('t')
    expect(one('F(2, 27) = 3.354, p = .050').finding.df).toEqual([2, 27])
    expect(one('χ²(1) = 3.841, p = .050').finding.statistic).toBe('chi2')
    expect(one('r(28) = .361, p = .050').finding.reported.statistic).toBe(0.361)
    expect(one('z = 1.960, p = .050').finding.df).toEqual([])
  })

  it('records exact character offsets', () => {
    const text = 'Results were mixed. A t(28) = 2.048, p = .050 was reported.'
    const { finding } = one(text)
    expect(text.slice(finding.charStart, finding.charEnd)).toBe('t(28) = 2.048')
  })

  it('handles p thresholds, decimals without a leading zero and CIs', () => {
    const threshold = one('t(28) = 4.000, p < .001').finding
    expect(threshold.reported.pKind).toBe('less')
    const ci = one('t(28) = 2.500, p = .019, 95% CI [0.05, 0.85]').finding
    expect(ci.reported.ci).toEqual([0.05, 0.85])
  })

  it('marks statistics without a p value as unparsed', () => {
    const { finding } = one('t(28) = 2.048 was reported.')
    expect(finding.status).toBe('unparsed')
    expect(finding.detail).toContain('no p value')
  })

  it('finds several statistics in one text', () => {
    const result = analyzeText('First t(28) = 2.048, p = .050. Second F(2, 27) = 3.354, p = .050.')
    expect(result.findings).toHaveLength(2)
    expect(result.summary.consistent).toBe(2)
  })
})

describe('judging', () => {
  it('accepts a p that follows from the statistic', () => {
    expect(one('t(28) = 2.048, p = .050').finding.status).toBe('consistent')
    expect(one('F(2, 27) = 3.354, p = .050').finding.status).toBe('consistent')
    expect(one('z = 1.960, p = .050').finding.status).toBe('consistent')
  })

  it('rejects a p that does not follow from the statistic', () => {
    const { finding } = one('t(28) = 2.048, p = .010')
    expect(finding.status).toBe('inconsistent')
    expect(finding.issue).toBe('p-value')
    expect(finding.detail).toContain('recomputed')
  })

  it('accepts a correctly reported p < .001 and rejects a wrong threshold', () => {
    expect(one('t(28) = 6.000, p < .001').finding.status).toBe('consistent')
    expect(one('t(28) = 2.048, p < .010').finding.status).toBe('inconsistent')
    expect(one('t(28) = 2.048, p < .010').finding.issue).toBe('p-threshold')
  })

  it('flags p = .000 as a formatting error', () => {
    const { finding } = one('t(28) = 2.048, p = .000')
    expect(finding.status).toBe('inconsistent')
    expect(finding.issue).toBe('format')
    expect(finding.detail).toContain('p < .001')
  })

  it('flags a CI that contradicts a significant p', () => {
    const { finding } = one('t(28) = 2.500, p = .019, 95% CI [-0.05, 0.85]')
    expect(finding.status).toBe('inconsistent')
    expect(finding.issue).toBe('ci')
  })

  it('keeps a significant p with an excluding CI consistent', () => {
    expect(one('t(28) = 2.500, p = .019, 95% CI [0.05, 0.85]').finding.status).toBe('consistent')
  })

  it('rejects an impossible df', () => {
    const { finding } = one('t(0) = 2.048, p = .050')
    expect(finding.status).toBe('inconsistent')
    expect(finding.issue).toBe('df')
  })
})

describe('recomputeP and judgeP', () => {
  it('recomputes each family', () => {
    expect(recomputeP({ statistic: 't', value: 2.048, df: [28] })).toBeCloseTo(0.05, 3)
    expect(recomputeP({ statistic: 'F', value: 3.354, df: [2, 27] })).toBeCloseTo(0.05, 3)
    expect(recomputeP({ statistic: 'chi2', value: 3.841, df: [1] })).toBeCloseTo(0.05, 3)
    expect(recomputeP({ statistic: 'r', value: 0.361, df: [28] })).toBeCloseTo(0.05, 3)
    expect(recomputeP({ statistic: 'z', value: 1.96, df: [] })).toBeCloseTo(0.05, 4)
  })

  it('rejects negative F and chi-square values as out of domain', () => {
    expect(() => recomputeP({ statistic: 'F', value: -1, df: [1, 20] })).toThrow(StatInputError)
    expect(() => recomputeP({ statistic: 'chi2', value: -1, df: [1] })).toThrow(StatInputError)
  })

  it('applies the documented rounding tolerance', () => {
    expect(judgeP({ pRaw: '.019', pKind: 'equal', recomputed: 0.01855 }).status).toBe('consistent')
    expect(judgeP({ pRaw: '.010', pKind: 'equal', recomputed: 0.01855 }).status).toBe('inconsistent')
    expect(judgeP({ pRaw: '1.20', pKind: 'equal', recomputed: 0.05 }).status).toBe('inconsistent')
  })
})
