# dsh-statcheck

**重算稿件报告的统计数据 —— 并把对不上的那些标出来。**

*这是算术，不是指控：每条 finding 都会给出报告的统计量、它实际蕴含的 p 值，以及它所依据的精确字符位置。*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24.9-brightgreen.svg)]()

[English](README.md) · 简体中文

---

## 它做什么

- 解析 APA 风格的报告：`t(df)`、`F(df1, df2)`、`χ²(df)`、`r(df)`、`z`，每一项都带邻近的 `p = …`、`p < …` 或 `p > …`，以及可选的 `95% CI [lo, hi]`。
- 用零依赖的分布函数，从报告的统计量重算 p 值（t/r/z 双尾，F/χ² 上尾）。
- 用报告值、重算值、字符区间与稳定的 issue code 标出自相矛盾之处。
- 校验 CI 与显著性是否一致（p 显著，但 CI 包含 0，就是矛盾）。
- 输出 Markdown 与 **SARIF 2.1.0**，并把被分析的文本注册为一条 REP v1 证据，其检查项就是这些 findings。

## 它不做什么

- **不重新分析数据。** 它无从判断报告的统计量是否适合该研究设计。
- **不做学术不端指控。** 一条 finding 的含义只是“报告的 p 无法由报告的统计量推出”。它是供人工复核的候选，绝不是对作者的定论。
- **不读 PDF/OCR。** 请先用 `dsh-doc-anchor` 抽取文本，再传入 `text` 或 `.txt/.md/.tex/.html` 路径。
- **不做模型/假设检查**，不做多重比较校正，也不做样本量推断。
- **不静默放宽容差。** 舍入规则固定且已写明；被标出的值始终是标出的。

## 兼容性

| | |
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
t/r/z 为双尾，F/χ² 为上尾。`p` 使用与 `stat_check` 相同的舍入规则。

### `stat_report`

`{ findings, text? }` → `{ ok, markdown, sarif, summary }`。SARIF 中每条不一致的 finding 对应一个 error 结果。传入原始稿件文本，才能把每条 finding 的 `charStart` 映射为真实的 SARIF `startLine`/`startColumn`；不传 `text` 时，区域退化为第 1 行加字符列（`properties.charStart`/`charEnd` 始终精确）。

### 错误码

`INVALID_INPUT` · `NOT_FOUND` · `PATH_ESCAPE` · `NOT_A_FILE` · `TOO_LARGE` · `OUT_OF_DOMAIN` · `STORE_ERROR`

## 舍入规则（写明，不是调出来的）

报告的 `p = x` 视为一致，当且仅当 `|recomputed − x| ≤ 0.5 × 10^-decimals + 0.001`。
多出的 `0.001` 用来吸收一个事实：统计量本身也经常是四舍五入后报告的（例如 `t = 2.50` 蕴含 p ≈ .01855，通常写作 `.019`）。`p < X` 在重算值低于 `X` 时一致；`p > X` 在重算值高于 `X` 时一致。

## 配置

| 键 | 默认 | 含义 |
|---|---|---|
| `enabled` | `true` | `false` 时不挂载任何内容 |
| `root` | `.statcheck` | 存储与记录的根目录 |
| `workspaceRoot` | `process.cwd()` | 稿件路径必须解析到该目录内 |
| `maxChars` | `2000000` | 分析字符数上限（超出即失败，绝不截断） |
| `maxFindings` | `500` | 单次调用的 findings 上限 |
| `persist` | `true` | 写入快照与 REP 记录 |

## 评测

### 基准评测 —— `dsh-research-bench` stats v0.1.0（30 条用例）

```sh
pnpm run bench:stats
```

| 指标 | 值 |
|---|---:|
| 不一致 precision | **1.00** |
| 不一致 recall | **1.00** |
| 不一致 F1 | **1.00** |
| 干净样本误报率 | **0.00** |
| 标出时 issue 的准确率 | **1.00** |
| 整案完全一致率 | **1.00** |

逐案原始预测：[`bench/results-stats.json`](bench/results-stats.json)。

**范围警告**：数据集规模小、是合成的且干净（围绕已发表的临界值构造的 10 条一致句子 + 20 条不一致句子）。满分只说明解析器与重算逻辑在这些构造上与临界值标签一致；它**并不**估计真实稿件上的准确率。舍入规则与 issue code 都已写明，因此读者可以具体地不同意某条 finding。

### 测试

- **42 个测试，分布在 5 个文件**：对照已发表的临界值检验分布尾概率（t/F/χ²/r/z）；解析（所有统计族、偏移、阈值、CI、多统计量、无法解析）；判定（p 值、阈值、格式、CI、df、负的 F/χ² 定义域）；运行时（证据 + 合法 REP 记录、不产生证据冲突的重复检查、findings 上限的截断、文件与媒体类型、persist=false、路径逃逸、大小上限）；工具（schema、成功/失败、含重算 p 为 null 的 SARIF，以及由可选 text 提供的行列映射）；包契约。

## 已知限制（v0.1）

- 不建模单侧检验、Welch 分数自由度、多模型表格，以及“见 Table 2”这类正文内引用。
- 只解析 APA 风格的行内报告；表格中的 `p` 值不在范围内。
- CI 与 p 的一致性检查假设对同一效应做双侧检验，α = .05。
- 不做多重比较校正。
- SARIF 的行列映射需要可选的 `stat_report` `text`；不提供时，区域为第 1 行加字符列（精确的 `charStart`/`charEnd` 属性始终存在）。

## 许可

Apache-2.0。运行时不含任何第三方代码。
