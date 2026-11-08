/**
 * Distribution tails against published critical values.
 *
 * A statistic at the .05 critical value must produce p ≈ .05; that is the
 * independent check that the implementation is not merely self-consistent.
 * @module test/math.spec
 */

import { describe, expect, it } from 'vitest'
import { chiSquareUpperP, fUpperP, normalCdf, rTwoTailedP, tTwoTailedP, zTwoTailedP } from '../src/math.ts'

/** Assert p is within 0.001 of the expected value. */
function expectP(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(0.001)
}

describe('critical values', () => {
  it('t two-tailed p at the .05 and .01 critical values', () => {
    expectP(tTwoTailedP(2.048, 28), 0.05)
    expectP(tTwoTailedP(2.228, 10), 0.05)
    expectP(tTwoTailedP(2.0, 60), 0.05)
    expectP(tTwoTailedP(2.763, 28), 0.01)
    expectP(tTwoTailedP(2.5, 28), 0.01855)
  })

  it('F upper-tail p at the .05 critical values', () => {
    expectP(fUpperP(3.354, 2, 27), 0.05)
    expectP(fUpperP(4.171, 1, 30), 0.05)
  })

  it('chi-square upper-tail p at the .05 critical values', () => {
    expectP(chiSquareUpperP(3.841, 1), 0.05)
    expectP(chiSquareUpperP(5.991, 2), 0.05)
    expectP(chiSquareUpperP(7.815, 3), 0.05)
  })

  it('r two-tailed p at the .05 critical values', () => {
    expectP(rTwoTailedP(0.361, 28), 0.05)
    expectP(rTwoTailedP(0.304, 40), 0.0503)
  })

  it('z two-tailed p', () => {
    expectP(zTwoTailedP(1.96), 0.05)
    expectP(zTwoTailedP(2.576), 0.01)
    expectP(normalCdf(0), 0.5)
  })

  it('is symmetric for t and z', () => {
    expect(tTwoTailedP(-2.5, 28)).toBeCloseTo(tTwoTailedP(2.5, 28), 12)
    expect(zTwoTailedP(-1.96)).toBeCloseTo(zTwoTailedP(1.96), 12)
  })

  it('rejects out-of-domain parameters', () => {
    expect(() => tTwoTailedP(2, 0)).toThrow(/df/u)
    expect(() => fUpperP(2, 0, 10)).toThrow(/df/u)
    expect(() => chiSquareUpperP(2, -1)).toThrow(/df/u)
    expect(() => rTwoTailedP(2, 28)).toThrow(/r must be/u)
  })
})
