# UXQ Reference - 参考实现与示例库

UXQ Reference 提供可控的测试页面、参考评价定义和演示数据，用于校验评价工具能力、教学和测试。

## 内容

### 测试页面 (`pages/`)

| 页面                        | 场景               | 用途                                 |
| --------------------------- | ------------------ | ------------------------------------ |
| `task-flow.html`            | 多步骤任务流程     | 验证任务执行、进度追踪、步骤状态     |
| `form-validation.html`      | 表单验证与错误反馈 | 验证表单交互、错误提示、ARIA 属性    |
| `accessibility-issues.html` | 可访问性问题       | 故意包含 a11y 缺陷，验证自动检测能力 |

### 评价定义 (`definitions/`)

| 文件                     | 说明                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| `webapp-evaluation.json` | 覆盖 6 维度的完整 Web 应用评价定义，含 6 指标、3 规则、1 任务、6 步骤 |

## CLI 命令

```bash
# 列出测试页面
uxq-reference pages

# 列出评价定义
uxq-reference definitions

# 查看定义详情
uxq-reference inspect <definition-file>

# 验证定义结构
uxq-reference validate <definition-file>

# 显示资源路径
uxq-reference path
```

## 使用方式

### 测试页面

在浏览器中直接打开或使用 Playwright：

```typescript
await page.goto('file:///path/to/apps/reference/pages/task-flow.html');
```

### 评价定义

用于 CLI 评价、Inspector 查看或 Playground 演示：

```bash
# 验证定义
uxq-reference validate webapp-evaluation

# 查看详情
uxq-reference inspect webapp-evaluation
```

## 设计原则

1. **可控性** — 页面状态可预测，适合自动化测试
2. **完整性** — 覆盖规范中提到的主要场景类型
3. **独立性** — 不依赖外部服务或网络
4. **教学性** — 每个页面和定义都有清晰的说明

## 与项目其他应用的关系

| 应用              | 定位                         |
| ----------------- | ---------------------------- |
| `apps/cli`        | 完整评价工具链（生产用）     |
| `apps/inspector`  | 评价结果交互式浏览（分析用） |
| `apps/playground` | 评价策略演示实验（教学用）   |
| `apps/reference`  | 测试页面与参考数据（校验用） |
