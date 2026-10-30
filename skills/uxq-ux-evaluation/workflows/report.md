# 报告与产物

```bash
uxq report <run-id> --root .uxq --json
uxq report <run-id> --root .uxq
uxq inspect <run-id> evaluation --root .uxq --json
uxq conformance <run-id> --root .uxq --json
```

JSON 报告命令输出 {report, markdown}；不加 --json 输出 Markdown。报告投影已有评价快照，不偷偷重测或补分。evaluate 和 settle 已将 JSON、Markdown 报告及评价快照保存到运行 artifacts，并在 manifest 登记真实摘要和字节数。

交付包含目标、范围、实测方法、运行状态、评价结论、指标、评分、维度、问题、证据索引和限制。引用具体 run/evaluation/policy ID；缺失字段明确标不可用。无快照的旧运行应提示显式重新评价或 settle。

conformance 检查 UXQ 数据契约，不是 WCAG 合规认证。当前无 PDF、CSV、HTML 报告导出命令。需要其他格式时说明是外部转换，不冒充 CLI 内建产物。
