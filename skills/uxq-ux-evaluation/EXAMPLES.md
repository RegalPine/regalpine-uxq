# UXQ 使用示例

以下命令在仓库中使用当前构建的 CLI。先安装工作区依赖、运行 `pnpm build`，真实页面还需要 `pnpm exec playwright install chromium`。`<run-id>` 等为占位符，必须替换为实际输出，不能使用 `latest`。

## 真实页面：仅标题结构演示
```bash
node apps/cli/dist/index.js init evaluation/page.yaml --url https://example.com --json
node apps/cli/dist/index.js validate evaluation/page.yaml --json
node apps/cli/dist/index.js plan evaluation/page.yaml --json
node apps/cli/dist/index.js evaluate evaluation/page.yaml --root .uxq --json
node apps/cli/dist/index.js inspect <run-id> metrics --root .uxq --json
node apps/cli/dist/index.js inspect <run-id> evidence --root .uxq --json
node apps/cli/dist/index.js report <run-id> --root .uxq --json
```
预期核验的是实测 h1 数量、关联 DOM 证据、真实 PNG 工件、规则和数值评分。不要预先编造 78 分、用户满意度、NASA-TLX、WCAG 合规率等输出。此模板即使得到 100，也只表示该演示策略满足，不表示网站 UX 完美。

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

## 任务与登录
在 EvaluationDefinition 中显式定义任务动作、业务和反馈条件，再用 evaluate 执行。秘密动作片段示例（不是完整定义）：
```json
{"action":"FILL_SECRET","selector":"input[type=password]","secretRef":"UXQ_TEST_PASSWORD"}
```
环境变量由用户安全配置。登录 POST 请求需要明确的副作用授权，生产环境的订单、支付、删除操作不可仅因“评价”请求就执行。当前不支持直接复用外部 Playwright 的 page 或 storageState。

## Finding 复测
```bash
node apps/cli/dist/index.js finding list <baseline-run-id> --root .uxq --json
node apps/cli/dist/index.js verify plan <baseline-run-id> --finding-id <finding-id> --root .uxq --json
node apps/cli/dist/index.js evaluate evaluation/page.yaml --root .uxq --json
node apps/cli/dist/index.js verify result <verification-plan-id> --source-run <new-run-id> --root .uxq --json
```
需要计划创建后的新运行、相同定义和可比执行配置、实际规则结果和有效证据。旧运行、不可比运行及证据不足不能标成修复成功。CLI 不提供 Finding lifecycle transition 命令。
