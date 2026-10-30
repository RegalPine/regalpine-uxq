# UXQ 指标参考

## 指标类型

| 类型 | 说明 |
|---|---|
| OBS | 观测指标 — 直接从采集数据计算 |
| PROXY | 代理指标 — 用可测量的代理值代表不可直接测量的 UX 属性 |

## 值类型

| 类型 | 说明 |
|---|---|
| NUMBER | 数值（支持所有聚合方式） |
| BOOLEAN | 布尔值（仅支持 LATEST 聚合） |
| CATEGORY | 分类值 |
| STRUCTURED | 结构化值 |

## 聚合方式

| 聚合 | 说明 | 适用值类型 |
|---|---|---|
| LATEST | 取最后一个样本值 | NUMBER, BOOLEAN |
| MEAN | 算术平均值 | NUMBER |
| MEDIAN | 中位数 | NUMBER |
| P95 | 第 95 百分位 | NUMBER |
| SUM | 求和 | NUMBER |
| COUNT | 计数 | NUMBER |
| RATIO | 比率（需配对采样，同 sampleId） | NUMBER |
| SUCCESS_RATE | 成功率 | NUMBER |

## 方向

| 方向 | 说明 |
|---|---|
| LOWER_IS_BETTER | 值越低越好（如加载时间） |
| HIGHER_IS_BETTER | 值越高越好（如成功率） |
| TARGET_RANGE | 目标范围内最好 |
| CONTEXT_DEPENDENT | 取决于上下文（需声明 rationale） |
| DESCRIPTIVE_ONLY | 仅描述性，不参与评分 |

## 比率指标注意事项

RATIO 聚合需要同一任务动作序列中的连续 CAPTURE，分别采集 numeratorKey 和 denominatorKey。这些动作共享 sampleId。操作、等待、截图或导航会开始新采样组，不能跨组配对。
