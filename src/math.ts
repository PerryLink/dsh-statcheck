/**
 * Distribution tails for statistical consistency checks — zero dependencies.
 *
 * Implementations: Lanczos log-gamma, regularized incomplete beta (continued
 * fraction), regularized upper incomplete gamma (series + continued fraction),
 * and the normal CDF via an error-function approximation. Accuracy is ~1e-10
 * for the beta/gamma paths, enough for p-values reported to three decimals.
 *
 * Sources are the standard Numerical Recipes formulas (public-domain algorithms,
 * reimplemented in TypeScript).
 *
 * @module dsh-statcheck/math
 */

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
]

/**
 * Log-gamma (Lanczos approximation).
 * @param value - a positive number.
 * @returns ln Γ(value).
 */
export function logGamma(value: number): number {
  if (value < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * value)) - logGamma(1 - value)
  const z = value - 1
  let x = LANCZOS[0]!
  for (let index = 1; index < LANCZOS.length; index += 1) x += LANCZOS[index]! / (z + index)
  const t = z + LANCZOS.length - 2 + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

/**
 * Continued fraction for the regularized incomplete beta function.
 * @param a - first shape parameter.
 * @param b - second shape parameter.
 * @param x - evaluation point in (0, 1).
 * @returns the fraction value.
 */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 3e-14) break
  }
  return h
}

/**
 * Regularized incomplete beta I_x(a, b).
 * @param a - first shape parameter.
 * @param b - second shape parameter.
 * @param x - evaluation point in [0, 1].
 * @returns I_x(a, b) in [0, 1].
 */
export function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b
}

/**
 * Regularized upper incomplete gamma Q(a, x).
 * @param a - shape parameter.
 * @param x - evaluation point.
 * @returns Q(a, x) in [0, 1].
 */
export function upperGamma(a: number, x: number): number {
  if (x <= 0) return 1
  if (x < a + 1) {
    // Series for P(a, x).
    let term = 1 / a
    let sum = term
    let current = a
    for (let index = 1; index <= 1000; index += 1) {
      current += 1
      term *= x / current
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a))
  }
  // Continued fraction for Q(a, x).
  const tiny = 1e-300
  let b = x + 1 - a
  let c = 1 / tiny
  let d = 1 / b
  let h = d
  for (let index = 1; index <= 1000; index += 1) {
    const an = -index * (index - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < tiny) d = tiny
    c = b + an / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 3e-14) break
  }
  return h * Math.exp(-x + a * Math.log(x) - logGamma(a))
}

/**
 * Standard normal CDF (Abramowitz–Stegun 7.1.26; |error| < 1.5e-7).
 * @param value - the z score.
 * @returns Φ(value).
 */
export function normalCdf(value: number): number {
  // Φ(x) = 0.5 * (1 + erf(x / √2))
  const z = Math.abs(value) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * z)
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z)
  const cdf = 0.5 * (1 + erf)
  return value >= 0 ? cdf : 1 - cdf
}

/**
 * Two-tailed p for Student's t.
 * @param t - the t statistic (absolute value is used).
 * @param df - degrees of freedom (> 0).
 * @returns the two-tailed p value.
 */
export function tTwoTailedP(t: number, df: number): number {
  if (!(df > 0) || !Number.isFinite(df)) throw new RangeError(`df must be > 0, got ${String(df)}`)
  const x = df / (df + t * t)
  return incompleteBeta(df / 2, 0.5, x)
}

/**
 * Upper-tail p for the F distribution.
 * @param f - the F statistic.
 * @param df1 - numerator degrees of freedom.
 * @param df2 - denominator degrees of freedom.
 * @returns P(F >= f).
 */
export function fUpperP(f: number, df1: number, df2: number): number {
  if (!(df1 > 0) || !(df2 > 0)) throw new RangeError(`df must be > 0, got ${String(df1)}, ${String(df2)}`)
  if (f <= 0) return 1
  return incompleteBeta(df2 / 2, df1 / 2, df2 / (df2 + df1 * f))
}

/**
 * Upper-tail p for the chi-square distribution.
 * @param chi2 - the chi-square statistic.
 * @param df - degrees of freedom (> 0).
 * @returns P(χ² >= chi2).
 */
export function chiSquareUpperP(chi2: number, df: number): number {
  if (!(df > 0)) throw new RangeError(`df must be > 0, got ${String(df)}`)
  if (chi2 <= 0) return 1
  return upperGamma(df / 2, chi2 / 2)
}

/**
 * Two-tailed p for a correlation r with df = n - 2.
 * @param r - the correlation.
 * @param df - degrees of freedom (> 0).
 * @returns the two-tailed p value.
 */
export function rTwoTailedP(r: number, df: number): number {
  if (!(df > 0)) throw new RangeError(`df must be > 0, got ${String(df)}`)
  if (Math.abs(r) > 1) throw new RangeError(`r must be in [-1, 1], got ${String(r)}`)
  if (Math.abs(r) === 1) return 0
  const t = r * Math.sqrt(df / (1 - r * r))
  return tTwoTailedP(t, df)
}

/**
 * Two-tailed p for a z statistic.
 * @param z - the z statistic.
 * @returns the two-tailed p value.
 */
export function zTwoTailedP(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)))
}
