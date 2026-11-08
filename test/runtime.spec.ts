/**
 * Runtime: text/path handling, REP evidence and records.
 * @module test/runtime.spec
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { validateRep } from '@perrylink/dsh-research-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'
import { StatcheckRuntime, StatcheckError } from '../src/runtime.ts'

const AT = new Date('2026-05-01T09:00:00.000Z')
const TEXT = 'The treatment effect was significant, t(28) = 2.048, p = .010, and the model fitted well, F(2, 27) = 3.354, p = .050.'

let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'statcheck-runtime-'))
  await writeFile(path.join(workspace, 'paper.txt'), TEXT, 'utf8')
})

afterEach(async () => {
  if (workspace.startsWith(tmpdir())) await rm(workspace, { recursive: true, force: true })
})

/** Build a runtime over the temp workspace. */
function runtime(): StatcheckRuntime {
  return new StatcheckRuntime({
    config: resolveConfig({ workspaceRoot: workspace, root: path.join(workspace, '.statcheck') }),
    now: () => AT,
  })
}

describe('check', () => {
  it('analyzes inline text and registers evidence with one check per finding', async () => {
    const rt = runtime()
    const result = await rt.check({ text: TEXT })
    expect(result.summary.total).toBe(2)
    expect(result.summary.inconsistent).toBe(1)
    expect(result.summary.consistent).toBe(1)
    expect(result.evidenceId).toMatch(/^ev-/u)
    const record = JSON.parse(await readFile(result.recordPath!, 'utf8')) as unknown
    const validation = validateRep(record)
    expect(validation.ok, JSON.stringify(validation.issues)).toBe(true)
    const stored = (record as { evidence: Array<{ checks: Array<{ check: string; status: string }> }> }).evidence[0]
    expect(stored?.checks).toHaveLength(2)
    expect(stored?.checks.filter(check => check.status === 'fail')).toHaveLength(1)
  })

  it('analyzes a workspace file and keeps its extension as the media type', async () => {
    await writeFile(path.join(workspace, 'paper.md'), TEXT, 'utf8')
    const result = await runtime().check({ path: 'paper.md' })
    expect(result.source.kind).toBe('file')
    expect(result.source.id).toBe('paper.md')
  })

  it('does not persist when persist=false', async () => {
    const result = await runtime().check({ text: TEXT, persist: false })
    expect(result.evidenceId).toBeUndefined()
    expect(result.recordPath).toBeUndefined()
  })

  it('rejects path traversal and missing files', async () => {
    await expect(runtime().check({ path: '../outside.txt' })).rejects.toMatchObject({ code: 'PATH_ESCAPE' })
    await expect(runtime().check({ path: 'missing.txt' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects oversized input instead of truncating', async () => {
    const rt = new StatcheckRuntime({
      config: resolveConfig({ workspaceRoot: workspace, root: path.join(workspace, '.statcheck'), maxChars: 10 }),
      now: () => AT,
    })
    await expect(rt.check({ text: 't(28) = 2.048, p = .010' })).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('requires exactly one of text/path', async () => {
    await expect(runtime().check({})).rejects.toBeInstanceOf(StatcheckError)
  })
})

describe('recompute', () => {
  it('recomputes and judges a reported p', () => {
    const result = runtime().recompute({ statistic: 't', value: 2.048, df: [28], p: '.010' })
    expect(result.p).toBeCloseTo(0.05, 3)
    expect(result.judgment?.status).toBe('inconsistent')
  })

  it('reports out-of-domain input as a typed failure', () => {
    expect(() => runtime().recompute({ statistic: 'F', value: 1, df: [2] })).toThrow(/df1 > 0 and df2 > 0/u)
  })
})
