/**
 * Runtime: text/path handling, REP evidence and records for statistical
 * findings.
 *
 * A finding is a check on the manuscript snapshot: `pass` for a consistent
 * report, `fail` for an inconsistent one, `skipped` (`parse_failed`) when no p
 * value could be located. The evidence status therefore inherits the same
 * honesty rules as the rest of the family.
 *
 * @module dsh-statcheck/runtime
 */

import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  EvidenceStore,
  RepStoreError,
  stableId,
  validateRep,
  type AddEvidenceInput,
  type CaptureInput,
  type CheckResult,
  type Evidence,
  type ResearchRecord,
  type Snapshot,
} from '@perrylink/dsh-research-core'
import { analyzeText, recomputeP, judgeP, StatInputError, type StatFinding, type StatisticKind, type StatSummary } from './check.ts'
import type { ResolvedConfig } from './config.ts'
import { VERSION } from './version.ts'

/** Stable runtime error codes. */
export type StatcheckErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'PATH_ESCAPE'
  | 'NOT_A_FILE'
  | 'TOO_LARGE'
  | 'OUT_OF_DOMAIN'
  | 'STORE_ERROR'

/** A typed failure. */
export class StatcheckError extends Error {
  /** Stable code. */
  readonly code: StatcheckErrorCode

  constructor(code: StatcheckErrorCode, message: string) {
    super(message)
    this.name = 'StatcheckError'
    this.code = code
  }
}

/** The subset of the REP service used here. */
export interface EvidencePort {
  capture(input: CaptureInput): Promise<{ snapshot: Snapshot }>
  addEvidence(input: AddEvidenceInput): Promise<{ evidence: Evidence }>
  buildRecord(options?: { evidenceIds?: readonly string[] }): Promise<Omit<ResearchRecord, 'manifest'>>
}

/** The `stat_check` success value. */
export interface StatCheckResult {
  readonly ok: true
  readonly summary: StatSummary
  readonly findings: readonly StatFinding[]
  readonly source: { readonly kind: 'file' | 'inline'; readonly id: string; readonly chars: number }
  readonly evidenceId?: string
  readonly recordPath?: string
}

/** Input for {@link StatcheckRuntime.check}. */
export interface StatCheckRequest {
  readonly text?: string
  readonly path?: string
  readonly persist?: boolean
  readonly maxFindings?: number
}

/** Options for {@link StatcheckRuntime}. */
export interface StatcheckRuntimeOptions {
  readonly config: ResolvedConfig
  readonly service?: EvidencePort
  readonly now?: () => Date
}

/** True when `candidate` is inside `root`. */
function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`)
}

/** Media type by extension (the analyzed text keeps its source shape). */
function mediaTypeOf(name: string): Snapshot['mediaType'] {
  const extension = name.toLowerCase().split('.').pop() ?? ''
  if (extension === 'md' || extension === 'markdown') return 'text/markdown'
  if (extension === 'tex' || extension === 'latex') return 'text/x-latex'
  if (extension === 'html' || extension === 'htm') return 'text/html'
  return 'text/plain'
}

/** Map one finding to a REP check. */
export function findingToCheck(finding: StatFinding): CheckResult {
  const status: CheckResult['status'] =
    finding.status === 'consistent' ? 'pass' : finding.status === 'inconsistent' ? 'fail' : 'skipped'
  return {
    checkId: `chk-${finding.findingId}`,
    check: 'stat-consistency',
    status,
    ...(status === 'skipped' ? { code: 'parse_failed' as const } : {}),
    severity: status === 'fail' ? 'error' : status === 'skipped' ? 'warning' : 'info',
    detail: `${finding.text}: ${finding.detail}`,
    expected: { reportedP: finding.reported.p, statistic: finding.reported.statistic, df: [...finding.df] },
    actual: { recomputedP: Number.isNaN(finding.recomputed.p) ? null : Number(finding.recomputed.p.toFixed(6)) },
  }
}

/** The statcheck runtime. */
export class StatcheckRuntime {
  readonly config: ResolvedConfig

  readonly #service: EvidencePort | undefined
  readonly #now: () => Date
  #store: EvidenceStore | undefined

  constructor(options: StatcheckRuntimeOptions) {
    this.config = options.config
    this.#service = options.service
    this.#now = options.now ?? (() => new Date())
  }

  /** Current ISO timestamp. */
  iso(): string {
    return this.#now().toISOString()
  }

  /** The evidence port. */
  port(): EvidencePort {
    if (this.#service !== undefined) return this.#service
    this.#store ??= new EvidenceStore(path.join(this.config.root, 'store'))
    return this.#store
  }

  /** Resolve a manuscript path inside the workspace. */
  async resolvePath(input: string): Promise<{ absolute: string; id: string }> {
    if (typeof input !== 'string' || input.trim() === '') throw new StatcheckError('INVALID_INPUT', 'path must be a non-empty string')
    const root = this.config.workspaceRoot
    let realRoot: string
    try {
      realRoot = await realpath(root)
    } catch {
      throw new StatcheckError('NOT_FOUND', `workspace root does not exist: ${root}`)
    }
    const candidate = path.resolve(realRoot, input)
    if (!isInside(realRoot, candidate)) throw new StatcheckError('PATH_ESCAPE', 'path resolves outside the workspace root')
    let real: string
    try {
      real = await realpath(candidate)
    } catch {
      throw new StatcheckError('NOT_FOUND', `manuscript not found: ${input}`)
    }
    if (!isInside(realRoot, real)) throw new StatcheckError('PATH_ESCAPE', 'path escapes the workspace root through a symlink')
    if (!(await stat(real)).isFile()) throw new StatcheckError('NOT_A_FILE', `not a regular file: ${input}`)
    return { absolute: real, id: path.relative(realRoot, real).split(path.sep).join('/') }
  }

  /**
   * Analyze text or a workspace manuscript.
   * @param request - text or path plus optional caps.
   * @returns findings, counts and (when persisting) the evidence id and record path.
   */
  async check(request: StatCheckRequest): Promise<StatCheckResult> {
    if ((request.text === undefined) === (request.path === undefined)) {
      throw new StatcheckError('INVALID_INPUT', 'pass exactly one of text or path')
    }
    let text: string
    let source: StatCheckResult['source']
    let mediaType: Snapshot['mediaType'] = 'text/plain'
    let sourceRef: AddEvidenceInput['sourceRef']
    if (request.text !== undefined) {
      if (request.text.length > this.config.maxChars) {
        throw new StatcheckError('TOO_LARGE', `text is ${request.text.length} characters, the cap is ${this.config.maxChars}`)
      }
      text = request.text
      source = { kind: 'inline', id: 'inline:text', chars: text.length }
      sourceRef = { kind: 'other', id: 'inline:text', retrievedAt: this.iso() }
    } else {
      const resolved = await this.resolvePath(request.path!)
      const size = (await stat(resolved.absolute)).size
      if (size > this.config.maxChars * 4) {
        throw new StatcheckError('TOO_LARGE', `manuscript is ${size} bytes, the cap is ${this.config.maxChars * 4}`)
      }
      text = await readFile(resolved.absolute, 'utf8')
      if (text.length > this.config.maxChars) {
        throw new StatcheckError('TOO_LARGE', `manuscript is ${text.length} characters, the cap is ${this.config.maxChars}`)
      }
      source = { kind: 'file', id: resolved.id, chars: text.length }
      mediaType = mediaTypeOf(resolved.id)
      sourceRef = { kind: 'file', id: resolved.id, retrievedAt: this.iso() }
    }

    const { findings, summary } = analyzeText(text, { maxFindings: request.maxFindings ?? this.config.maxFindings })
    const persist = request.persist ?? this.config.persist
    if (!persist) return { ok: true, summary, findings, source }

    const port = this.port()
    let evidence: Evidence
    try {
      const captured = await port.capture({ bytes: text, mediaType, sourceRef, capturedAt: this.iso() })
      evidence = (
        await port.addEvidence({
          evidenceId: stableId('ev', ['statcheck', source.kind, source.id, captured.snapshot.snapshotId]),
          title: `Statistical report of ${source.id}`,
          sourceRef,
          snapshotIds: [captured.snapshot.snapshotId],
          anchors: [{ snapshotId: captured.snapshot.snapshotId, kind: 'record', value: 'field:text' }],
          provenance: { plugin: 'dsh-statcheck', version: VERSION, method: 'apa-stat-consistency', retrievedAt: this.iso() },
          checks: findings.map(findingToCheck),
          notes: `${summary.total} statistic(s): ${summary.consistent} consistent, ${summary.inconsistent} inconsistent, ${summary.unparsed} unparsed`,
        })
      ).evidence
    } catch (error) {
      if (error instanceof RepStoreError) throw new StatcheckError('STORE_ERROR', error.message)
      throw error
    }

    let recordPath: string | undefined
    try {
      const record = await port.buildRecord({ evidenceIds: [evidence.evidenceId] })
      if (!validateRep(record).ok) throw new StatcheckError('STORE_ERROR', 'refusing to write an invalid REP record')
      const directory = path.join(this.config.root, 'records')
      await mkdir(directory, { recursive: true })
      const file = path.join(directory, `${evidence.evidenceId}.rep.json`)
      await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
      recordPath = file
    } catch (error) {
      if (error instanceof StatcheckError) throw error
      throw new StatcheckError('STORE_ERROR', `could not write the REP record: ${(error as Error).message}`)
    }
    return { ok: true, summary, findings, source, evidenceId: evidence.evidenceId, ...(recordPath === undefined ? {} : { recordPath }) }
  }

  /**
   * Recompute one statistic and optionally judge a reported p.
   * @param input - statistic kind, value, df and optional reported p string.
   * @returns the recomputed p and, when a p was given, the judgment.
   */
  recompute(input: {
    statistic: StatisticKind
    value: number
    df: readonly number[]
    p?: string
  }): { p: number; judgment?: { status: 'consistent' | 'inconsistent'; issue?: string; detail: string } } {
    let p: number
    try {
      p = recomputeP({ statistic: input.statistic, value: input.value, df: input.df })
    } catch (error) {
      if (error instanceof StatInputError) throw new StatcheckError(error.code, error.message)
      throw error
    }
    if (input.p === undefined) return { p }
    const parsed = /^(<|>|=|≤|≥)?\s*(\.\d+|\d+\.?\d*)$/u.exec(input.p.trim())
    if (parsed === null) throw new StatcheckError('INVALID_INPUT', `cannot parse the reported p: ${input.p}`)
    const kind = parsed[1] === '<' || parsed[1] === '≤' ? 'less' : parsed[1] === '>' || parsed[1] === '≥' ? 'greater' : 'equal'
    const judgment = judgeP({ pRaw: parsed[2]!, pKind: kind, recomputed: p })
    return { p, judgment }
  }
}

/** Re-export the math errors for tools. */
export { StatInputError }
