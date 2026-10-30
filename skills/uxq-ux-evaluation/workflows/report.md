# 报告与产物

```bash
uxq report <run-id> --root .uxq --json
uxq report <run-id> --root .uxq
uxq inspect <run-id> evaluation --root .uxq --json
uxq conformance <run-id> --root .uxq --json
```

JSON 报告命令输出 {report, markdown}；不加 --json 输出 Markdown。报告投影已有评价快照，不偷偷重测或补分。evaluate 和 settle 已将 JSON、Markdown 报告及评价快照保存到运行 artifacts，并在 manifest 登记真实摘要和字节数。

## 报告必含字段

交付包含目标、范围、实测方法、运行状态、评价结论、指标、评分、维度、问题、证据索引和限制。引用具体 run/evaluation/policy ID；缺失字段明确标不可用。无快照的旧运行应提示显式重新评价或 settle。

### 未覆盖维度显式声明（OOS）

当某些维度未被采集时，报告**必须**在"维度评分"表上方固定渲染警示：

```markdown
> **以下维度未采集：D02/D05/D06 —— 原因：未定义相应指标/无交互动作能力**
> 未采集维度不等于零分，也不等于通过。
```

纯静态采集（无交互动作）的评估，报告必须写明：
- **D02 操作效率**：无任务耗时测量手段 → 不适用（OOS）
- **D05 交互可靠性与错误恢复**：无法触发错误路径 → OOS
- **D06 主观体验**：无用户研究证据 → OOS

当评估仅包含 STRUCT 类计数指标（h1/buttons/inputs/links）时，报告结论处必须声明：
- **本次评估为"结构合规性检查"，非"用户体验评估"**
- 计数指标通过 ≠ UX 良好，仅表示 DOM 元素存在
- D01（任务有效性）、D04（可访问性）、D06（主观体验）**未被有效评估**

### 环境偏差声明（evaluatedEnvironment）

当实际评估环境与请求目标不同时，报告首屏必须包含：

```json
{
  "evaluatedEnvironment": {
    "requestedUrl": "http://localhost:5173/page",
    "actualUrl": "http://127.0.0.1:8090/page",
    "environmentType": "static-build",
    "differences": ["dev server 改为静态构建"]
  }
}
```

此字段放在"评价结论"之前。

conformance 检查 UXQ 数据契约，不是 WCAG 合规认证。当前无 PDF、CSV、HTML 报告导出命令。需要其他格式时说明是外部转换，不冒充 CLI 内建产物。
