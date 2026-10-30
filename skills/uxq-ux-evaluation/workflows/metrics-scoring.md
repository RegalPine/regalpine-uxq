# 指标、评分与门禁

在定义中声明 sourceKey、valueKind、unit、aggregation、minimumSamples、evidenceRequired、维度和适用性。METRIC_CALCULATION 的 inputRefs 指向观测生产步骤，RULE_EVALUATION 指向指标步骤。

```bash
uxq evaluate evaluation/page.yaml --root .uxq --json
uxq inspect <run-id> metrics --root .uxq --json
uxq inspect <run-id> evaluation --root .uxq --json
uxq settle <run-id> --policy evaluation/policy-v2.json --root .uxq --json
uxq quality-gate <run-id> --root .uxq --json
```

settle 使用完整 ScoringPolicy JSON，实算已有指标并保存新的快照和报告，保留旧评价历史。它不重新采集页面，也不是一个任意给分接口。

BOOLEAN 的合法 false 对应布尔归一化 0 分，不是缺失；无样本和缺证据不能补零。覆盖率按指标的 measured/applicable 计算。关键规则结果缺失不能通过，关键规则失败不能被高平均分抵消。

权重、门槛和风险严重度由项目确认，不预设行业百分位或虚构置信区间。D01 任务有效性，D02 操作效率，D03 可理解性与认知支持，D04 可访问性与包容性，D05 交互可靠性与错误恢复，D06 主观体验。
