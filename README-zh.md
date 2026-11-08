# dsh-statcheck

**重算论文里报告的统计量，把对不上的标出来。**

*这是算术，不是指控：每条 finding 都给出报告值、它实际蕴含的 p 值，以及原文的精确字符位置。*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24.9-brightgreen.svg)]()

[English](README.md) · 简体中文

---

## 它做什么

- 解析 APA 风格报告：`t(df)`、`F(df1, df2)`、`χ²(df)`、`r(df)`、`z`，以及邻近的 `p = …`、`p < …`、`p > …` 与可选 `95% CI [lo, hi]`。
- 用零依赖分布函数重算 p 值（t/r/z 双尾，F/χ² 上尾）。
- 标出自相矛盾之处：报告值、重算值、字符区间、稳定 issue code。
- 校验 CI 与显著性的关系（p 显著但 CI 含 0 即矛盾）。
- 输出 Markdown 与 **SARIF 2.1.0**；把被分析文本注册为 REP v1 证据，检查项就是这些 findings。

## 它不做什么

- **不重跑数据**：无法判断报告的统计量是否适合该设计。
- **不做学术不端指控**：finding 的含义是“报告的 p 推不出报告的统计量”，是需要人工复核的候选，不是对作者的结论。
- **不读 PDF/OCR**：先用 `dsh-doc-anchor` 抽文本，再传 `text` 或 `.txt/.md/.tex/.html` 路径。
- **不做模型/假设检查**，不做多重比较校正，不做样本量推断。
- **不静默放宽容差**：舍入规则固定并写明，标出的就是标出的。

## 兼容性

| 项 | 值 |
|---|---|
| DeepSeek Harness | **`dsh-v0.2.1-rc.5`**（2026-11-08 实测）；peer 区间 `>=0.2.1-0 <0.3.0 \|\| >=0.2.2-0 <0.3.0` |
| Node | `^22.19.0 \|\| >=24.9.0`（实测 `24.22.1`），仅 ESM |
| Peer | `@perrylink/dsh-research-core ^0.1.0`、`@deepseek-ai/cordis ^4.0.5-alpha.1`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery ^3.18.5-alpha.1` |
| 运行时依赖 | **零** |

```sh
dsh plugin --profile <name> add @perrylink/dsh-research-core dsh-statcheck
dsh --profile <name> --dump-config | grep dsh-statcheck
dsh plugin --profile <name> remove dsh-statcheck
```

## 工具

### `stat_check`

`{ text?, path?, persist?, maxFindings? }` → `{ ok, summary, findings[], source, evidenceId?, recordPath? }`。

每条 finding：`statistic`、`df`、`text`、`charStart`、`charEnd`、`reported { statistic, p, pKind, pValue, ci? }`、`recomputed { p }`、`status`（`consistent`/`inconsistent`/`unparsed`）、`issue?`（`p-value`/`p-threshold`/`ci`/`format`/`df`）、`severity`、`detail`。

### `stat_recompute`

`{ statistic: 't'|'F'|'chi2'|'r'|'z', value, df[], p? }` → `{ ok, p, judgment? }`。
t/r/z 双尾，F/χ² 上尾；`p` 与 `stat_check` 用同一舍入规则。

### `stat_report`

`{ findings }` → `{ ok, markdown, sarif, summary }`。SARIF 中每条不一致 finding 一个 error。

### 错误码

`INVALID_INPUT` · `NOT_FOUND` · `PATH_ESCAPE` · `NOT_A_FILE` · `TOO_LARGE` · `OUT_OF_DOMAIN` · `STORE_ERROR`

## 舍入规则（写明，不是调出来的）

报告 `p = x` 一致的条件：`|recomputed − x| ≤ 0.5 × 10^-decimals + 0.001`。
多出的 `0.001` 是因为统计量本身常被四舍五入报告（如 `t = 2.50` 实际 p ≈ .01855，常写作 `.019`）。`p < X` 要求重算值小于 X，`p > X` 要求大于 X。

## 配置

| 键 | 默认 | 含义 |
|---|---|---|
| `enabled` | `true` | `false` 不挂载 |
| `root` | `.statcheck` | 存储与记录根 |
| `workspaceRoot` | `process.cwd()` | 稿件路径必须解析在其内 |
| `maxChars` | `2000000` | 分析字符上限（超过失败，不截断） |
| `maxFindings` | `500` | 单次 findings 上限 |
| `persist` | `true` | 落快照 + REP 记录 |

## 评测

### 基准 —— `dsh-research-bench` stats v0.1.0（30 条）

```sh
pnpm run bench:stats
```

| 指标 | 值 |
|---|---:|
| 不一致检出 precision | **1.00** |
| 不一致检出 recall | **1.00** |
| 不一致检出 F1 | **1.00** |
| 干净样本误报率 | **0.00** |
| 标出时的 issue 准确率 | **1.00** |
| 完全一致率 | **1.00** |

逐案预测： [`bench/results-stats.json`](bench/results-stats.json)。

**范围警告**：数据集小、合成、干净（围绕公开临界值的 10 条一致 + 20 条不一致）。满分只说明解析与重算在这些构造上与临界值标签一致，**不代表**真实稿件上的准确率。舍入规则与 issue code 都写明，读者可以逐条不同意。

### 测试

- **37 个测试 / 5 个文件**：分布尾概率对公开临界值（t/F/χ²/r/z）、解析（各统计族、偏移、阈值、CI、多统计量、无 p）、判定（p-value/threshold/format/CI/df）、运行时（证据与合法 REP 记录、文件媒体类型、persist=false、路径逃逸、大小上限）、工具（schema、成功/失败、SARIF）、包契约。

## 已知限制（v0.1）

- 不建模单侧检验、Welch 分数自由度、多模型表格、“见 Table 2”式引用。
- 只解析正文内联 APA 报告；表格里的 p 不在范围。
- CI 与 p 的校验假设同一效应的双侧检验、α = .05。
- 不做多重比较校正。

## 许可

Apache-2.0。运行时零第三方代码。
