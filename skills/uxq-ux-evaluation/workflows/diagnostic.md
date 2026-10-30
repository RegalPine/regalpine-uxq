# 诊断和复测

规则失败与异常指标生成信号和 Finding；有可用支持证据才可确认为缺陷。机器结果、专家解释和根因假设分别标注，不能凭观察生成确定因果结论。

```bash
uxq finding list <run-id> --root .uxq --json
uxq verify plan <run-id> --finding-id <finding-id> --root .uxq --json
uxq evaluate evaluation/page.yaml --root .uxq --json
uxq verify result <verification-plan-id> --source-run <new-run-id> --root .uxq --json
```

计划必须关联实际 Finding，并从其来源推导相关规则和指标。结果需要计划之后的新运行、相同定义、可比配置、实测指标、通过的规则和有效证据；BLOCKED、INCONCLUSIVE 和 FAILED 不能改写为 PASSED。

CLI 当前不支持 Finding 状态迁移、自动根因分析、自动生成实施排期或预估分数收益。可在报告外提供带证据引用的人工建议；保留验证计划和结果 ID。
