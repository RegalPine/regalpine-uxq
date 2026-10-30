# UXQ 状态与结论参考

## 运行状态（RunStatus）

| 状态 | 说明 |
|---|---|
| PENDING | 等待执行 |
| RUNNING | 执行中 |
| COMPLETED | 全部步骤成功 |
| PARTIAL | 部分步骤失败但可继续 |
| FAILED | 必要步骤失败 |
| CANCELLED | 用户取消 |

## 步骤状态（StepStatus）

| 状态 | 说明 |
|---|---|
| PENDING | 等待执行 |
| RUNNING | 执行中 |
| COMPLETED | 成功 |
| FAILED | 失败 |
| SKIPPED | 跳过（依赖失败） |
| CANCELLED | 取消 |

## 评价结论（OverallOutcome）

| 结论 | 说明 |
|---|---|
| PASS | 通过所有必需规则且评分达标 |
| FAIL | 有关键规则失败或评分不达标 |
| INCONCLUSIVE | 证据不足无法判定 |
| NOT_RATED | 未配置评分策略 |

## 规则结论（RuleOutcome）

| 结论 | 说明 |
|---|---|
| PASS | 规则通过 |
| FAIL | 规则失败 |
| INDETERMINATE | 无法判定 |
| NOT_APPLICABLE | 不适用 |
| EXECUTION_ERROR | 执行出错 |

## 指标状态（MeasurementStatus）

| 状态 | 说明 |
|---|---|
| MEASURED | 已测量 |
| INSUFFICIENT_EVIDENCE | 证据不足 |
| NOT_APPLICABLE | 不适用 |
| INVALID | 无效（如类型不匹配） |

## 状态转换规则

- 运行只能从 PENDING → RUNNING → COMPLETED/PARTIAL/FAILED/CANCELLED
- 活动运行（RUNNING）不能重新结算
- 步骤状态转换遵循依赖关系
