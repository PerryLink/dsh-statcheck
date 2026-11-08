/**
 * Config schema and resolution for `dsh-statcheck`.
 * @module dsh-statcheck/config
 */

import path from 'node:path'
import z from '@deepseek-ai/schemastery'

/** Raw plugin config. */
export interface Config {
  enabled?: boolean
  /** Store/record root, resolved against the harness working directory. */
  root?: string
  /** Workspace root that manuscript paths must stay inside. */
  workspaceRoot?: string
  /** Hard cap on analyzed characters. */
  maxChars?: number
  /** Hard cap on findings per call. */
  maxFindings?: number
  /** Persist a snapshot + REP record (default true). */
  persist?: boolean
}

/** Fully resolved config. */
export interface ResolvedConfig {
  readonly enabled: boolean
  readonly root: string
  readonly workspaceRoot: string
  readonly maxChars: number
  readonly maxFindings: number
  readonly persist: boolean
}

/** Schemastery schema. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  root: z.string().default('.statcheck'),
  workspaceRoot: z.string(),
  maxChars: z.number().default(2_000_000),
  maxFindings: z.number().default(500),
  persist: z.boolean().default(true),
})

/** Throw unless the value is a positive safe integer. */
function assertPositiveInt(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer, got ${String(value)}`)
  }
}

/**
 * Validate raw values and fill explicit defaults.
 * @param config - raw plugin config.
 * @returns the fully resolved config.
 */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  const root = config.root ?? '.statcheck'
  if (typeof root !== 'string' || root.trim() === '') throw new TypeError('root must be a non-empty path')
  const maxChars = config.maxChars ?? 2_000_000
  const maxFindings = config.maxFindings ?? 500
  assertPositiveInt('maxChars', maxChars)
  assertPositiveInt('maxFindings', maxFindings)
  return {
    enabled: config.enabled ?? true,
    root: path.resolve(root),
    workspaceRoot: path.resolve(config.workspaceRoot ?? process.cwd()),
    maxChars,
    maxFindings,
    persist: config.persist ?? true,
  }
}
