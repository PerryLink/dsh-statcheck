/**
 * `dsh-statcheck` — recompute reported statistics, flag self-inconsistency.
 *
 * Three tools, one job: parse APA-style reports, recompute the p value from the
 * reported statistic, and show both numbers. It is arithmetic, not accusation:
 * findings are candidates for human review, never a conclusion about authors.
 *
 * Function plugin — no default export.
 * @module dsh-statcheck
 */

import type { Context } from '@deepseek-ai/cordis'
import { Config, resolveConfig, type Config as ConfigShape } from './config.ts'
import { StatcheckRuntime, type EvidencePort } from './runtime.ts'
import { makeStatCheckTool } from './tools/stat-check.ts'
import { makeStatRecomputeTool } from './tools/stat-recompute.ts'
import { makeStatReportTool } from './tools/stat-report.ts'

/** Cordis plugin name. */
export const name = 'statcheck'

/** The tool registry is required; the REP service is optional. */
export const inject = ['tools']

export { Config, resolveConfig }
export type { ConfigShape }
export type { ResolvedConfig } from './config.ts'
export { VERSION } from './version.ts'
export {
  chiSquareUpperP,
  fUpperP,
  incompleteBeta,
  logGamma,
  normalCdf,
  rTwoTailedP,
  tTwoTailedP,
  upperGamma,
  zTwoTailedP,
} from './math.ts'
export { analyzeText, judgeP, recomputeP, StatInputError } from './check.ts'
export type { StatFinding, StatIssue, StatisticKind, StatStatus, StatSummary } from './check.ts'
export { findingsToMarkdown, findingsToSarif } from './report.ts'
export { StatcheckError, StatcheckRuntime, findingToCheck } from './runtime.ts'
export type {
  EvidencePort,
  StatCheckRequest,
  StatCheckResult,
  StatcheckErrorCode,
  StatcheckRuntimeOptions,
} from './runtime.ts'
export { makeStatCheckTool } from './tools/stat-check.ts'
export { makeStatRecomputeTool } from './tools/stat-recompute.ts'
export { makeStatReportTool } from './tools/stat-report.ts'

/**
 * Mount the three tools.
 * @param ctx - the plugin context (host).
 * @param config - raw plugin config.
 */
export function apply(ctx: Context, config: ConfigShape): void {
  const resolved = resolveConfig(config)
  const logger = ctx.logger('statcheck')
  if (!resolved.enabled) {
    logger.info('disabled: enabled is false — no tools are mounted')
    return
  }
  const service = ctx.get('researchEvidence') as EvidencePort | undefined
  const runtime = new StatcheckRuntime({ config: resolved, ...(service === undefined ? {} : { service }) })
  if (service === undefined) {
    logger.info(`ctx.researchEvidence is not mounted; using a local core store under ${resolved.root}`)
  }
  ctx.effect(() => ctx.tools.register(makeStatCheckTool(runtime)), 'statcheck: stat_check tool')
  ctx.effect(() => ctx.tools.register(makeStatRecomputeTool(runtime)), 'statcheck: stat_recompute tool')
  ctx.effect(() => ctx.tools.register(makeStatReportTool()), 'statcheck: stat_report tool')
}
