/**
 * Tool surface: names, schemas, canonical values and renderers.
 * @module test/tools.spec
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'
import { StatcheckRuntime } from '../src/runtime.ts'
import { makeStatCheckTool } from '../src/tools/stat-check.ts'
import { makeStatRecomputeTool } from '../src/tools/stat-recompute.ts'
import { makeStatReportTool } from '../src/tools/stat-report.ts'

const AT = new Date('2026-05-01T09:00:00.000Z')
const TEXT = 'Reported: t(28) = 2.048, p = .010.'
let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'statcheck-tools-'))
})

afterEach(async () => {
  if (root.startsWith(tmpdir())) await rm(root, { recursive: true, force: true })
})

/** Build a runtime rooted in the temp directory. */
function runtime(): StatcheckRuntime {
  return new StatcheckRuntime({ config: resolveConfig({ workspaceRoot: root, root }), now: () => AT })
}

const EXEC = {} as never

describe('tool interfaces', () => {
  it('declares names, parameter schemas and canonical output schemas', () => {
    for (const [tool, name] of [
      [makeStatCheckTool(runtime()), 'stat_check'],
      [makeStatRecomputeTool(runtime()), 'stat_recompute'],
      [makeStatReportTool(), 'stat_report'],
    ] as const) {
      expect(tool.name).toBe(name)
      expect(Object.keys(tool.parameters).length).toBeGreaterThan(0)
      expect(tool.output.schema).toBeDefined()
      expect(typeof tool.output.render).toBe('function')
    }
  })

  it('stat_check returns findings and a readable render', async () => {
    const tool = makeStatCheckTool(runtime())
    const value = (await tool.execute({ text: TEXT, persist: false }, EXEC)) as {
      ok: true
      summary: { total: number; inconsistent: number }
      findings: Array<{ statistic: string; status: string }>
    }
    expect(value.ok).toBe(true)
    expect(value.summary.total).toBe(1)
    expect(value.findings[0]?.status).toBe('inconsistent')
    const blocks = tool.output.render({}, value as never) as Array<{ text: string }>
    expect(blocks[0]?.text).toContain('stat_check')
    expect(blocks[0]?.text).toContain('inconsistent')
  })

  it('stat_check failure branch carries a stable code', async () => {
    const tool = makeStatCheckTool(runtime())
    const value = (await tool.execute({}, EXEC)) as { ok: false; error: { code: string } }
    expect(value.ok).toBe(false)
    expect(value.error.code).toBe('INVALID_INPUT')
  })

  it('stat_recompute returns the p value and judgment', async () => {
    const tool = makeStatRecomputeTool(runtime())
    const value = (await tool.execute({ statistic: 't', value: 2.048, df: [28], p: '.010' }, EXEC)) as {
      ok: true
      p: number
      judgment: { status: string }
    }
    expect(value.ok).toBe(true)
    expect(value.p).toBeCloseTo(0.05, 3)
    expect(value.judgment.status).toBe('inconsistent')
  })

  it('stat_report renders Markdown and SARIF', async () => {
    const check = makeStatCheckTool(runtime())
    const checked = (await check.execute({ text: TEXT, persist: false }, EXEC)) as { findings: unknown[] }
    const tool = makeStatReportTool()
    const value = (await tool.execute({ findings: checked.findings }, EXEC)) as {
      ok: true
      markdown: string
      sarif: { version: string; runs: Array<{ results: unknown[] }> }
      summary: { inconsistent: number }
    }
    expect(value.ok).toBe(true)
    expect(value.summary.inconsistent).toBe(1)
    expect(value.markdown).toContain('Statistical consistency report')
    expect(value.sarif.version).toBe('2.1.0')
    expect(value.sarif.runs[0]?.results.length).toBe(1)
  })

  it('stat_report maps SARIF line and column when the source text is supplied', async () => {
    const source = 'Intro line.\n\nReported: t(28) = 2.048, p = .010.\n'
    const check = makeStatCheckTool(runtime())
    const checked = (await check.execute({ text: source, persist: false }, EXEC)) as { findings: unknown[] }
    const value = (await makeStatReportTool().execute({ findings: checked.findings, text: source }, EXEC)) as {
      ok: boolean
      sarif: {
        runs: Array<{
          results: Array<{ locations: Array<{ physicalLocation: { region: { startLine: number; startColumn: number } } }> }>
        }>
      }
    }
    expect(value.ok).toBe(true)
    const region = value.sarif.runs[0]?.results[0]?.locations[0]?.physicalLocation.region
    expect(region?.startLine).toBe(3)
    expect(region?.startColumn).toBe(11)
  })

  it('stat_report renders a df-error finding whose recomputed p is null in JSON', async () => {
    const check = makeStatCheckTool(runtime())
    const checked = (await check.execute({ text: 't(0) = 2.048, p = .050', persist: false }, EXEC)) as {
      findings: Array<{ recomputed: { p: number | null } }>
    }
    expect(checked.findings[0]?.recomputed.p).toBeNull()
    const value = (await makeStatReportTool().execute({ findings: checked.findings }, EXEC)) as {
      ok: boolean
      markdown: string
      sarif: { runs: Array<{ results: Array<{ properties: { recomputedP: number | null } }> }> }
    }
    expect(value.ok).toBe(true)
    expect(value.markdown).toContain('n/a')
    expect(value.sarif.runs[0]?.results[0]?.properties.recomputedP).toBeNull()
  })
})
