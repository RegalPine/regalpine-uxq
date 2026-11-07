---
name: uxq-ux-evaluation
description: 使用 UXQ 的定义文件驱动 CLI，采集已授权页面的 DOM 和截图，计算声明的指标、规则与评分，保存报告并比较基线。用于 UX 评价、任务流程核验、证据追溯、回归比较和报告请求。认知负荷、可访问性、用户研究与设计系统需求须先确认采集能力和证据，不承诺一键完成全领域评价。
---

# UXQ 评价工作流

## 先确认范围和能力
1. 确认目标 URL、允许的 origin、任务、环境、测试账号授权和是否允许写操作。
2. 确认用户需要的是结构检查、自动化任务核验，还是实际用户研究。自动化操作耗时不等于用户任务耗时，DOM 数量不等于认知负荷。
3. 检查 `uxq version`、`uxq capabilities --json`、`uxq --help`。在本仓库验证时先 `pnpm build`，将下文的 `uxq` 替换为 `node apps/cli/dist/index.js`，避免使用陈旧的全局安装。
4. 真实浏览器需要 Node 24、对应版本的 Playwright 浏览器。运行 `uxq doctor --json`；缺浏览器时按错误提示安装。不可降级为内存数据后声称评价了页面。
5. CLI 没有 `--format`、`--output` 或 `@uxq/cli-client`。完整命令集见 [CLI 命令参考](references/cli.md)。

## 版本能力矩阵

执行评估前**必须先核对版本**：`uxq capabilities --json` 输出当前构建支持的全部动作、步骤类型和提取器。下表反映 v0.1.0 源码能力；若 `capabilities` 输出缺少某项，**以实际输出为准，不要强行使用**。

| 类别 | 已实现 | 说明 |
|---|---|---|
| **动作 (action)** | NAVIGATE, CLICK, FILL, FILL_SECRET, PRESS, WAIT_FOR, CAPTURE, SCREENSHOT | 全部通过 Playwright 真实浏览器执行 |
| **步骤类型 (step kind)** | ENVIRONMENT_CHECK, BROWSER_SETUP, PAGE_NAVIGATION, TASK_EXECUTION, OBSERVATION_CAPTURE, METRIC_CALCULATION, RULE_EVALUATION, SCORING, EVIDENCE_VALIDATION, RESULT_FINALIZATION | 全部 10 种均已实现（见 packages/execution/src/evaluation.ts） |
| **CAPTURE 提取器** | COUNT, VISIBLE, TEXT, VALUE, ACCESSIBLE_NAME | COUNT 仅做 DOM 计数，不验证语义或可见性 |
| **条件核验** | TEXT, VISIBLE, URL, ATTRIBUTE | BUSINESS_JSON 未实现 |
| **聚合** | LATEST, MEAN, MEDIAN, P95, SUM, COUNT, RATIO, SUCCESS_RATE | RATIO 需配对采样（同 sampleId） |

### 已知局限（必须告知用户）

- **COUNT 提取器只做 DOM 计数**：`document.querySelectorAll('h1').length`，不检查内容、位置或可见性。`<h1 class="sr-only">` 与可见 `<h1>` 同等计数，无法识别"为指标优化"。
- **h1/结构类指标不等于 UX 评估**：计数通过 ≠ 页面可理解。当评估仅含 STRUCT 类计数指标时，报告必须声明"本次为结构合规性检查，非用户体验评估"。
- **h1 不是所有页面的必需项**：交互式工具（画布编辑器、IDE）、仪表盘、数据大屏等页面类型不以标题层级组织内容，h1 指标对此类页面不适用。定义中包含 h1 规则但页面类型不需要时，应标记 `required: false` 或移除，不要把"无 h1"报为缺陷。
- **纯静态采集（无交互动作）时**：D02 操作效率（无任务耗时测量手段）、D05 交互可靠性（无法触发错误路径）、D06 主观体验（无用户研究证据）均为 OOS（不适用），未采集维度不等于通过。

## 环境警示：WebSocket 与 Dev Server

> **后果**：`allowWebSocket: false`（默认）时 `routeWebSocket(/.*/)` 无条件拦截所有 WS 流量。任何 WS 连接（含 Vite/Webpack HMR）都会让 navigate ERROR、下游全部 BLOCKED、evaluate rc=4。**不要尝试加参数放行**。

**判定**：目标 URL 是 dev server（5173/3000 端口、vite/webpack dev）→ 必须先 `npm run build` 用静态产物评估，或改用生产地址。详见 [环境编排](workflows/site-setup.md)。

**顺带**：HTTP 重定向（300-399）默认拒绝（`maxRedirects: 0`）；多页面弹窗默认关闭。需启用时在 profile 中显式配置并提供最终 URL。

## 最小真实页面闭环
```bash
uxq init evaluation/page.yaml --url https://example.com --profile content --json
uxq validate evaluation/page.yaml --json
uxq plan evaluation/page.yaml --json
uxq evaluate evaluation/page.yaml --root .uxq --json
```

`init --url --profile <type>` 按页面类型自动生成匹配的指标、规则和步骤，**不需要手写定义**。

### 完整 CLI 命令集

| 类别 | 命令 |
|---|---|
| 基础 | `version`, `doctor`, `capabilities` |
| 定义管理 | `init`, `validate`, `plan` |
| 执行查询 | `evaluate`, `list`, `inspect`, `cancel`, `report` |
| 基线比较 | `baseline create/update/list/delete`, `compare` |
| 质量门禁 | `quality-gate`, `settle` |
| 验证符合性 | `verify plan`, `verify result`, `conformance`, `finding list` |
| Skill 管理 | `install-skill`, `uninstall-skill` |
| 认证状态 | `auth-save`, `auth-clean` |

详细用法见 [CLI 命令参考](references/cli.md)。

### 支持的页面类型（--profile）

| profile | 页面类型 | 典型指标 | h1 |
|---|---|---|---|
| `content` | 文档、博客、文章 | h1 数量、标题层级、图片 alt、地标区域 | 有 |
| `tool` | 编辑器、IDE、画布 | 带标签交互元素、ARIA 角色、面板区域、DOM 总量 | **无** |
| `dashboard` | 仪表盘、数据大屏、BI | 数据区块数、带标签区域、图表/表格、动态更新区域 | **无** |
| `form` | 注册、结账、多步骤表单 | 表单元素、带标签输入框、必填标识、错误提示、步骤指示器 | 无 |
| `landing` | 产品页、营销着陆页、首页 | h1 数量、CTA 按钮、图片 alt、导航链接 | 有 |
| `settings` | 设置、偏好、账户管理 | 设置控件数、分组区域、带标签控件、状态反馈区域 | **无** |

所有 profile 自动生成时均包含通用可访问性指标：跳过导航链接（D04）、HTML lang 属性（D04）、focus-visible 元素（D05）。

不提供 `--profile` 时，`init` 根据 URL 路径自动推断（editor/canvas → tool，dashboard/admin → dashboard，settings/account → settings 等），默认 fallback 为 `content`。

不提供 `--url` 的 `init` 生成离线合成示例，仅供测试。

取得 evaluate 输出中的真实 `runId` 后：
```bash
uxq inspect <run-id> metrics --root .uxq --json
uxq inspect <run-id> rules --root .uxq --json
uxq inspect <run-id> evidence --root .uxq --json
uxq inspect <run-id> evaluation --root .uxq --json
uxq finding list <run-id> --root .uxq --json
uxq report <run-id> --root .uxq --json
uxq quality-gate <run-id> --root .uxq --json
```

所有后续命令使用同一 `--root`。`report` 无 `--json` 时将 Markdown 写到 stdout；JSON 输出是 `{ report, markdown }`。评价时报告和快照已写入运行的 artifacts，具体路径见 manifest。日志和错误写到 stderr，不能把 stderr 拼入 JSON。

## 定义与证据
- 定义接受 JSON 或真正的 YAML；公共结构以 `schemas/uxq.schema.json` 和 `uxq validate` 为准。
- 步骤通过 `dependsOn` 和 `inputRefs` 显式连接；观测键对应 `sourceKey`。指标按声明单位、类型和聚合计算；规则只消费声明输入。
- 同一浏览器会话的步骤设置相同 `sessionId` 并**串行依赖**（链式 dependsOn），否则触发 SHARED_SESSION_RACE。不同 sessionId 的步骤才允许并行。
- 任务使用业务及反馈条件核验；当前支持 TEXT、VISIBLE、URL、ATTRIBUTE，不支持 BUSINESS_JSON。
- `allowedOrigins` 列明页面和资源 origin。HTTP 请求通过请求层获取后交给浏览器渲染；默认拒绝 HTTP 重定向（`maxRedirects: 0`），可配置 `maxRedirects: N`（0-10）允许自动跟随重定向，但仍需验证目标 origin 在 `allowedOrigins` 内。私网需要 `allowPrivateNetwork`；非只读请求需要 `allowSideEffects`；WRITE 任务还需要 `authorized`。这些是应用层检查，不是网络隔离沙箱；只评价可信测试目标。
- 登录秘密用 FILL_SECRET 的 `secretRef` 引用由用户配置的环境变量。不在定义、日志或报告中写密码。支持通过 `--auth-state <file>` 加载预存的认证状态（cookies + localStorage），见 [认证状态管理](workflows/auth.md)。截图遮罩密码和秘密输入框，但不能保证页面其他位置没有个人信息，采集前仍需确认范围与脱敏。
- 默认不支持 WebSocket（`allowWebSocket: false`）和多页面弹窗（`allowPopup: false`）；遇到明确错误停止，不伪造任务成功。如需评估依赖 WebSocket 的实时功能或弹窗交互，可在 profile 中显式开启。
- 定义内 observation 是外部/合成输入，不是本次浏览器实测。E4 用户研究证据需要有效同意记录，当前定义输入不能代替完整研究导入流程。
- **validate 报错排障**：SCHEMA_VALIDATION 笼统报错时，先用 `uxq capabilities --json` 核对当前版本支持的动作/步骤类型，再逐字段二分定位。CLI 会输出 JSON Path（如 `steps[3].action`）和原因码帮助定位。

## 验收与解释
运行 `COMPLETED` 只证明步骤执行结束，还需核对：
- metrics 非空且相应项为 MEASURED；数值、单位和观测/证据 ID 合理。
- scores、维度覆盖率和 evaluation 来自实际结果；无样本、缺证据或非法值不能补零或给固定分数。
- 关键规则失败、任务失败、证据不足均不能宣称门禁通过。门禁退出 1 是确定不通过，4 是没有可用的确定评价；其他非零按错误处理。
- 报告同时写明范围、来源、策略版本、运行 ID、未覆盖维度和限制。不得把未执行的领域写成"通过"。
- 建议和根因假设由证据支持，和工具实测结果分开；不承诺未经复测的分数收益。

统一六维名称：D01 任务有效性；D02 操作效率；D03 可理解性与认知支持；D04 可访问性与包容性；D05 交互可靠性与错误恢复；D06 主观体验。未采集维度不等于零分，也不等于通过。

## 禁止

编写或审查评估定义时，不得：

- 不审查页面功能特性就直接套用 `init --url` 生成的演示模板
- 对不需要 h1 的页面类型（交互式工具、仪表盘、数据大屏等）将 h1 缺失报为缺陷
- 为了让指标通过而建议添加无语义价值的 DOM 元素（如仅为计数而加的 `sr-only` h1）
- 在定义中包含与目标页面功能无关的指标或规则
- 把 COUNT 计数结果等同于语义合规（h1 数量 = 0 不等于"可理解性不合格"）
- 发明 CLI 不支持的指标、动作或命令

## 按需深入
- [环境编排](workflows/site-setup.md)：静态服务器、登录态、WebSocket/dev server、前置检查清单。
- [认证状态管理](workflows/auth.md)：保存、加载、清理浏览器认证状态（cookies + localStorage）。
- [任务核验](workflows/task-evaluation.md)：动作、条件、自动化边界与链式依赖模板。
- [证据](workflows/evidence.md)：追溯、有效性及隐私。
- [指标和评分](workflows/metrics-scoring.md)：声明、重结算、门禁。
- [诊断和复测](workflows/diagnostic.md)：Finding 查询与新运行验证。
- [回归](workflows/regression.md)：跨进程基线与可比性。
- [报告](workflows/report.md)：持久化产物、限制与 OOS 声明。
- [认知负荷](workflows/cognitive-load.md)、[可访问性](workflows/accessibility.md)、[用户研究](workflows/research.md)、[设计系统](workflows/design-system.md)：SDK 与当前 CLI 的能力边界。
- [完整示例](EXAMPLES.md)：真实页面、离线示例和 CI 门禁。

## 参考文档

概念查阅（Agent 按需引用）：
- [维度](references/dimensions.md)：D01-D06 定义与 OOS 说明
- [指标](references/metrics.md)：类型、聚合方式、方向
- [步骤类型](references/step-kinds.md)：10 种 StepKind 与依赖规则
- [浏览器动作](references/actions.md)：8 种动作与采样组规则
- [提取器](references/extractors.md)：5 种提取器语义与局限
- [状态与结论](references/states.md)：运行/步骤/评价/规则状态
- [证据](references/evidence.md)：来源分类、生命周期、隐私
- [CLI 命令](references/cli.md)：完整命令参考与退出码
