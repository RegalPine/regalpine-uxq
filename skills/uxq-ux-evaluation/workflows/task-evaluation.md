# 任务核验

在 EvaluationDefinition.tasks 定义动作、版本、scenarioId、sideEffect、authorized、businessConditions 和 feedbackConditions；用 TASK_EXECUTION 步骤的 taskId 引用任务。动作成功不代表任务成功，业务和反馈条件都需满足。

```bash
uxq validate evaluation/task.json --json
uxq plan evaluation/task.json --json
uxq evaluate evaluation/task.json --root .uxq --json
uxq inspect <run-id> steps --root .uxq --json
uxq report <run-id> --root .uxq --json
```

RATIO 指标需要同一任务动作序列中的连续 CAPTURE，分别采集 numeratorKey 和 denominatorKey；这些动作共享 sampleId。操作、等待、截图或导航会开始新采样组，不能跨组配对。同组每个 key 只能采集一次；分子分母使用相同单位，结果是比值。

目前核验 TEXT、VISIBLE、URL、ATTRIBUTE；BUSINESS_JSON 不支持。共享 sessionId 的步骤需要串行依赖。页面状态异步变化时先 WAIT_FOR 再检查条件。

任务产生 TaskExecution，但不会自动创建任务耗时/成功率指标；需要显式观测和指标步骤，不能把空指标报告当作成功率报告。自动化执行耗时只反映机器脚本，不等于用户耗时。WRITE 任务需要任务授权及 profile.allowSideEffects，登录秘密使用环境变量引用。失败步骤及下游阻塞必须在报告中保留。
