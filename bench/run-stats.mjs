// Statistics benchmark adapter for dsh-statcheck.
//
// Reads dsh-research-bench `data/stats/cases.jsonl`, runs the plugin's parser and
// recomputation on each sentence, and prints the confusion matrix required by
// the bench scoring contract. No network, no manuscript files.
//
// Usage: node bench/run-stats.mjs [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeText } from '../lib/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const benchRoot = process.env.BENCH_DIR ?? path.resolve(here, '..', '..', 'dsh-research-bench')
const cases = readFileSync(path.join(benchRoot, 'data', 'stats', 'cases.jsonl'), 'utf8')
  .split('\n')
  .filter(line => line.trim() !== '')
  .map(line => JSON.parse(line))
const summary = JSON.parse(readFileSync(path.join(benchRoot, 'data', 'stats', 'SUMMARY.json'), 'utf8'))

const predictions = cases.map(caseItem => {
  const { findings } = analyzeText(caseItem.text)
  const finding = findings[0]
  return {
    id: caseItem.id,
    prediction: {
      verdict: finding === undefined ? 'unparsed' : finding.status === 'inconsistent' ? 'inconsistent' : finding.status === 'unparsed' ? 'unparsed' : 'consistent',
      issue: finding?.issue ?? null,
      reportedP: finding?.reported.p ?? null,
      recomputedP: finding === undefined || Number.isNaN(finding.recomputed.p) ? null : Number(finding.recomputed.p.toFixed(6)),
    },
  }
})

const ratio = (numerator, denominator) => (denominator === 0 ? null : Number((numerator / denominator).toFixed(4)))
const scores = {
  inconsistent: { tp: 0, fp: 0, fn: 0 },
  clean: { total: 0, flagged: 0 },
  issue: { total: 0, correct: 0 },
  exact: { total: 0, correct: 0 },
}
for (const [index, caseItem] of cases.entries()) {
  const predicted = predictions[index].prediction
  const truth = caseItem.expected
  if (truth.verdict === 'inconsistent' && predicted.verdict === 'inconsistent') scores.inconsistent.tp += 1
  else if (truth.verdict === 'consistent' && predicted.verdict === 'inconsistent') scores.inconsistent.fp += 1
  else if (truth.verdict === 'inconsistent' && predicted.verdict !== 'inconsistent') scores.inconsistent.fn += 1
  if (truth.verdict === 'consistent') {
    scores.clean.total += 1
    if (predicted.verdict === 'inconsistent') scores.clean.flagged += 1
  }
  if (truth.verdict === 'inconsistent' && predicted.verdict === 'inconsistent') {
    scores.issue.total += 1
    if (predicted.issue === truth.issue) scores.issue.correct += 1
  }
  scores.exact.total += 1
  if (predicted.verdict === truth.verdict && (truth.verdict === 'consistent' || predicted.issue === truth.issue)) scores.exact.correct += 1
}

const metrics = {
  dataset: { name: summary.dataset, version: summary.version, total: summary.total, cases: cases.length },
  plugin: '@perrylink/dsh-statcheck',
  inconsistentDetection: {
    precision: ratio(scores.inconsistent.tp, scores.inconsistent.tp + scores.inconsistent.fp),
    recall: ratio(scores.inconsistent.tp, scores.inconsistent.tp + scores.inconsistent.fn),
    f1: ratio(2 * scores.inconsistent.tp, 2 * scores.inconsistent.tp + scores.inconsistent.fp + scores.inconsistent.fn),
    ...scores.inconsistent,
  },
  cleanFalsePositiveRate: ratio(scores.clean.flagged, scores.clean.total),
  issueAccuracyWhenFlagged: ratio(scores.issue.correct, scores.issue.total),
  exactAccuracy: ratio(scores.exact.correct, scores.exact.total),
  cleanCases: scores.clean.total,
}

const report = { generatedAt: new Date().toISOString(), command: 'node bench/run-stats.mjs', benchDir: benchRoot, metrics, predictions }
const jsonFlag = process.argv.indexOf('--json')
if (jsonFlag !== -1 && process.argv[jsonFlag + 1] !== undefined) {
  writeFileSync(process.argv[jsonFlag + 1], `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

console.log(`# dsh-statcheck × dsh-research-bench (${summary.dataset} v${summary.version}, ${cases.length} cases)`)
console.log('')
console.log('| metric | value |')
console.log('|---|---:|')
for (const [key, value] of [
  ['inconsistent precision', metrics.inconsistentDetection.precision],
  ['inconsistent recall', metrics.inconsistentDetection.recall],
  ['inconsistent F1', metrics.inconsistentDetection.f1],
  ['clean false-positive rate', metrics.cleanFalsePositiveRate],
  ['issue accuracy when flagged', metrics.issueAccuracyWhenFlagged],
  ['exact accuracy', metrics.exactAccuracy],
]) {
  console.log(`| ${key} | ${value === null ? 'n/a' : value} |`)
}
const wrong = predictions.filter((item, index) => {
  const truth = cases[index].expected
  return item.prediction.verdict !== truth.verdict || (truth.verdict === 'inconsistent' && item.prediction.issue !== truth.issue)
})
if (wrong.length > 0) {
  console.log('')
  console.log(`Cases whose predictions differ from the label: ${wrong.length}`)
  for (const item of wrong.slice(0, 10)) console.log(`  ${item.id}: ${JSON.stringify(item.prediction)}`)
}
