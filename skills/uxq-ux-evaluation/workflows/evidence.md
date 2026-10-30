# 证据追溯

真实浏览器 CAPTURE 生成 RawObservation 与 DOM Evidence；SCREENSHOT 保存 PNG 字节并记录摘要。步骤、尝试、运行、观测与指标通过 ID 关联。

```bash
uxq inspect <run-id> evidence --root .uxq --json
uxq inspect <run-id> metrics --root .uxq --json
uxq report <run-id> --root .uxq --json
```

从 report.evidenceIndex 或运行存储读取完整证据和 artifact 引用；inspect evidence 仅为摘要。截图工件位于 runs/<run-id>/artifacts 下，不能把四字节 PNG 头视作截图。

定义内 observation 只是输入数据声明，限制段应说明不是本次真实浏览器采集。evidenceRequired 指标遇到缺失或无效证据不能评分。截图不自动证明每个指标，须查具体关联。

证据有用途、有效性和保留期限。重结算按本次时点重新检查必需证据；已失效、过期或工件不可验证时不出总体分数，历史测量和原快照保持不变。定义内 E4 观测无法携带研究同意记录，当前执行器明确拒绝。隐私、用户同意及脱敏需要明确检查；当前 CLI 不提供研究数据导入、视频采集、手工证据链接或自动清理过期文件命令。秘密输入框遮罩不能保证整个页面不存在个人信息。
