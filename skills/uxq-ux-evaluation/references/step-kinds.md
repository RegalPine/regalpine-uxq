# UXQ 步骤类型参考

## 步骤类型（StepKind）

| 类型 | 说明 | 典型用途 |
|---|---|---|
| ENVIRONMENT_CHECK | 环境检查 | 验证浏览器、网络等环境就绪 |
| BROWSER_SETUP | 浏览器设置 | 配置视口、User-Agent 等 |
| PAGE_NAVIGATION | 页面导航 | 导航到目标 URL |
| TASK_EXECUTION | 任务执行 | 执行用户任务流（点击、填写等） |
| OBSERVATION_CAPTURE | 观测采集 | 采集 DOM 数据、截图 |
| METRIC_CALCULATION | 指标计算 | 从观测数据计算指标值 |
| RULE_EVALUATION | 规则评价 | 判定规则是否通过 |
| SCORING | 评分 | 计算维度得分和总分 |
| EVIDENCE_VALIDATION | 证据验证 | 验证证据有效性和时效性 |
| RESULT_FINALIZATION | 结果终结 | 生成最终评价快照 |

## 依赖关系

步骤通过 `dependsOn` 字段声明依赖。执行引擎按拓扑排序执行，确保依赖先于当前步骤完成。

## 会话管理

PAGE_NAVIGATION 和 TASK_EXECUTION 步骤使用 `sessionId` 字段标识浏览器会话。同一 sessionId 的步骤共享浏览器上下文。

## 输入输出契约

每个步骤声明：
- `inputRefs`: 依赖的步骤输出（如 `[{ stepId: 'capture', contract: 'RawObservation' }]`）
- `outputContracts`: 本步骤产出的契约类型（如 `['RawObservation', 'Evidence']`）
