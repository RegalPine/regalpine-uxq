# UXQ 使用示例

以下命令在仓库中使用当前构建的 CLI。先安装工作区依赖、运行 `pnpm build`，真实页面还需要 `pnpm exec playwright install chromium`。`<run-id>` 等为占位符，必须替换为实际输出，不能使用 `latest`。

> **前置核对**：运行示例前先 `node apps/cli/dist/index.js capabilities --json` 确认当前版本支持示例中使用的动作类型。若某动作不在 capabilities 输出中，写进定义会被 validate 拒绝。

## 真实页面：按类型生成定义
```bash
# 内容页面（文档、博客）— 包含 h1 指标
node apps/cli/dist/index.js init evaluation/page.yaml --url https://example.com --profile content --json

# 交互式工具（编辑器、画布）— 不包含 h1 指标
node apps/cli/dist/index.js init evaluation/tool.yaml --url http://localhost:8090/canvas/new --profile tool --json

# 仪表盘/数据大屏 — 不包含 h1 指标
node apps/cli/dist/index.js init evaluation/dashboard.yaml --url http://localhost:8090/dashboard --profile dashboard --json

# 表单页 — 关注输入框标签和错误提示
node apps/cli/dist/index.js init evaluation/form.yaml --url https://example.com/checkout --profile form --json

# 落地页/营销页 — 包含 h1 和 CTA 按钮指标
node apps/cli/dist/index.js init evaluation/landing.yaml --url https://example.com --profile landing --json

# 设置/配置页 — 关注控件标签和分组结构
node apps/cli/dist/index.js init evaluation/settings.yaml --url http://localhost:8090/settings/general --profile settings --json

# 不提供 --profile 时根据 URL 路径自动推断
node apps/cli/dist/index.js init evaluation/auto.yaml --url http://localhost:8090/canvas/new --json
node apps/cli/dist/index.js init evaluation/auto.yaml --url http://localhost:8090/settings/appearance --json
node apps/cli/dist/index.js init evaluation/auto.yaml --url http://localhost:8090/blog/post-1 --json

node apps/cli/dist/index.js validate evaluation/tool.yaml --json
node apps/cli/dist/index.js plan evaluation/tool.yaml --json
node apps/cli/dist/index.js evaluate evaluation/tool.yaml --root .uxq --json
node apps/cli/dist/index.js inspect <run-id> metrics --root .uxq --json
node apps/cli/dist/index.js inspect <run-id> evidence --root .uxq --json
node apps/cli/dist/index.js report <run-id> --root .uxq --json
```
`init --url --profile <type>` 按页面类型自动生成匹配的指标、规则和步骤。不需要手写定义。

> **profile 选择**：`content`/`landing` 包含 h1 指标（适用于内容型页面）；`tool`/`dashboard`/`form`/`settings` 不包含 h1（交互式工具、仪表盘、表单、设置页面不以标题层级组织内容）。所有 profile 均包含通用可访问性指标（跳过导航、lang 属性、focus-visible）。不提供 `--profile` 时根据 URL 路径自动推断。

> **COUNT 计数局限**：所有 COUNT 提取器仅做 DOM 计数，不验证语义正确性或可见性。

## 离线合成示例
```bash
node apps/cli/dist/index.js init evaluation/offline.json --json
node apps/cli/dist/index.js evaluate evaluation/offline.json --root .uxq-offline --json
node apps/cli/dist/index.js report <run-id> --root .uxq-offline --json
```
这条流程验证定义、计算与持久化，不需要浏览器。报告必须保留合成来源说明，不得称为用户指定网站的评估。

## 重结算和跨进程基线
从已确认的定义中提取完整 policy 对象保存为 JSON，明确修改归一化、权重或门槛并更新 version；不要把门禁配置当成 ScoringPolicy。
```bash
node apps/cli/dist/index.js baseline create main <run-id> --root .uxq --json
node apps/cli/dist/index.js baseline list --root .uxq --json
node apps/cli/dist/index.js evaluate evaluation/page.yaml --root .uxq --json
node apps/cli/dist/index.js compare <new-run-id> main --root .uxq --json
node apps/cli/dist/index.js settle <new-run-id> --policy evaluation/policy-v2.json --root .uxq --json
node apps/cli/dist/index.js report <new-run-id> --root .uxq --json
```
settle 消费已有测量并追加评价快照，不重新导航。基线保留创建时的数据；策略内容变化后可能不可比，不应将分差解释为产品变化。基线更新需明确授权并提供原因：
```bash
node apps/cli/dist/index.js baseline update main <new-run-id> --reason "已确认的新版本基线" --root .uxq --json
```

## CI 门禁
将已审核的定义提交到项目；准备可访问且明确授权的测试目标。门禁文件只支持下列字段：
```json
{"minimumScore":80,"requiredOutcome":["PASS"]}
```
```bash
node apps/cli/dist/index.js evaluate evaluation/page.yaml --root .uxq-ci --gate evaluation/gate.json --json
```
CI 直接使用退出码阻断，无需从 stdout 猜测分数。评价报告已落盘，失败时也应保留 `.uxq-ci` 以供追溯。单独检查已有结果：
```bash
node apps/cli/dist/index.js quality-gate <run-id> --root .uxq-ci --gate evaluation/gate.json --json
```

## 任务与登录（交互动作示例）

> **前提**：`uxq capabilities --json` 确认当前版本支持 FILL、CLICK、FILL_SECRET、WAIT_FOR 动作。若不支持，以下示例无法使用，需改用纯采集路径。

在 EvaluationDefinition 中显式定义任务动作、业务和反馈条件，再用 evaluate 执行。秘密动作片段示例（不是完整定义）：
```json
{"action":"FILL_SECRET","selector":"input[type=password]","secretRef":"UXQ_TEST_PASSWORD"}
```
环境变量由用户安全配置。登录 POST 请求需要明确的副作用授权，生产环境的订单、支付、删除操作不可仅因"评价"请求就执行。当前不支持直接复用外部 Playwright 的 page 或 storageState。

### 同 session 链式依赖示例

```yaml
steps:
  - stepId: nav-login
    kind: PAGE_NAVIGATION
    sessionId: auth
    dependsOn: []
    action: { action: NAVIGATE, url: "https://app.example.com/login" }

  - stepId: fill-user
    kind: OBSERVATION_CAPTURE
    sessionId: auth
    dependsOn: [nav-login]
    action: { action: FILL, selector: "#email", value: "test@example.com" }

  - stepId: fill-pass
    kind: OBSERVATION_CAPTURE
    sessionId: auth
    dependsOn: [fill-user]
    action: { action: FILL_SECRET, selector: "#password", secretRef: "UXQ_TEST_PASSWORD" }

  - stepId: click-submit
    kind: OBSERVATION_CAPTURE
    sessionId: auth
    dependsOn: [fill-pass]
    action: { action: CLICK, selector: "button[type=submit]" }

  - stepId: wait-dashboard
    kind: OBSERVATION_CAPTURE
    sessionId: auth
    dependsOn: [click-submit]
    action: { action: WAIT_FOR, selector: ".dashboard", state: visible }

  - stepId: screenshot-dashboard
    kind: OBSERVATION_CAPTURE
    sessionId: auth
    dependsOn: [wait-dashboard]
    action: { action: SCREENSHOT, name: "dashboard" }
```

**关键规则**：同 sessionId 的步骤必须链式串行（每个 dependsOn 前一个）。不同 sessionId 的步骤才允许并行。

## Finding 复测
```bash
node apps/cli/dist/index.js finding list <baseline-run-id> --root .uxq --json
node apps/cli/dist/index.js verify plan <baseline-run-id> --finding-id <finding-id> --root .uxq --json
node apps/cli/dist/index.js evaluate evaluation/page.yaml --root .uxq --json
node apps/cli/dist/index.js verify result <verification-plan-id> --source-run <new-run-id> --root .uxq --json
```
需要计划创建后新运行、相同定义和可比执行配置、实际规则结果和有效证据。旧运行、不可比运行及证据不足不能标成修复成功。CLI 不提供 Finding lifecycle transition 命令。
