# 任务核验

在 EvaluationDefinition.tasks 定义动作、版本、scenarioId、sideEffect、authorized、businessConditions 和 feedbackConditions；用 TASK_EXECUTION 步骤的 taskId 引用任务。动作成功不代表任务成功，业务和反馈条件都需满足。

> **前置核对**：执行任务定义前，先运行 `uxq capabilities --json` 确认当前版本支持 FILL/CLICK/WAIT_FOR 等交互动作。若不支持，任务定义中的交互步骤会被 validate 拒绝。

```bash
uxq validate evaluation/task.json --json
uxq plan evaluation/task.json --json
uxq evaluate evaluation/task.json --root .uxq --json
uxq inspect <run-id> steps --root .uxq --json
uxq report <run-id> --root .uxq --json
```

RATIO 指标需要同一任务动作序列中的连续 CAPTURE，分别采集 numeratorKey 和 denominatorKey；这些动作共享 sampleId。操作、等待、截图或导航会开始新采样组，不能跨组配对。同组每个 key 只能采集一次；分子分母使用相同单位，结果是比值。

目前核验 TEXT、VISIBLE、URL、ATTRIBUTE；BUSINESS_JSON 不支持。共享 sessionId 的步骤需要串行依赖。页面状态异步变化时先 WAIT_FOR 再检查条件。

## 同 session 链式 dependsOn 最小模板

共享 sessionId 的步骤**必须**逐个依赖前一个，形成单链，否则触发 SHARED_SESSION_RACE：

```yaml
steps:
  - stepId: nav
    kind: PAGE_NAVIGATION
    sessionId: s1
    dependsOn: []
    action: { action: NAVIGATE, url: "https://example.com/page" }

  - stepId: cap-a
    kind: OBSERVATION_CAPTURE
    sessionId: s1
    dependsOn: [nav]
    action: { action: CAPTURE, selector: "h1", key: "heading-count", extractor: COUNT, unit: count }

  - stepId: cap-b
    kind: OBSERVATION_CAPTURE
    sessionId: s1
    dependsOn: [cap-a]
    action: { action: CAPTURE, selector: "input", key: "input-count", extractor: COUNT, unit: count }

  - stepId: cap-c
    kind: OBSERVATION_CAPTURE
    sessionId: s1
    dependsOn: [cap-b]
    action: { action: SCREENSHOT, name: "page" }

  # 同 sessionId：后续步骤逐个依赖前一个，形成单链
  # 不同 sessionId 的步骤才允许并行
```

**规则**：
- 同 sessionId 的步骤必须链式串行（每个 dependsOn 前一个）
- 不同 sessionId 的步骤可以并行
- 同组每个 observation key 只能采集一次
- taskId 引用任务时，任务内的 actions 自动串行

任务产生 TaskExecution，但不会自动创建任务耗时/成功率指标；需要显式观测和指标步骤，不能把空指标报告当作成功率报告。自动化执行耗时只反映机器脚本，不等于用户耗时。WRITE 任务需要任务授权及 profile.allowSideEffects，登录秘密使用环境变量引用。失败步骤及下游阻塞必须在报告中保留。

## h1/结构类指标的局限性

> **警示**：CAPTURE 的 COUNT 提取器只做 DOM 计数（`document.querySelectorAll('h1').length`），不验证内容、位置或可见性。`<h1>` 和 `<h1 class="sr-only">` 同等对待，无法识别"为指标优化"的作弊行为。

**推荐做法**：
- 修复 h1 缺失时，在页面组件内添加**可见 `<h1>`**，而非在布局层添加 sr-only 隐藏 h1
- 后者虽然能通过计数检查，但属于 gaming the metric，对真实无障碍体验无增益，且增加维护成本
- React.lazy + Suspense 场景下，CAPTURE 可能在组件挂载前执行，导致正确代码也被判 FAIL——确保页面完全加载后再采集
