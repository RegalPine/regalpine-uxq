# Task Evaluation Workflow

## Purpose

Use for analyzing user task completion and interaction quality.

## When to Use

- Evaluating task completion rates
- Measuring time-on-task metrics
- Analyzing interaction patterns
- Assessing task difficulty

## Commands

### Evaluate Task Flow

```bash
uxq task evaluate --url <target> --task <task-definition>
```

**Parameters:**

- `--url`: Target URL to evaluate
- `--task`: Task definition (name, steps, success criteria)
- `--timeout`: Maximum task completion time (default: 30000ms)
- `--retries`: Number of retry attempts (default: 3)

**Example:**

```bash
uxq task evaluate \
  --url "https://shop.example.com/checkout" \
  --task "完成购买流程：添加商品 → 填写地址 → 支付"
```

### Measure Task Metrics

```bash
uxq task measure --run-id <id> --metrics <metric-list>
```

**Parameters:**

- `--run-id`: Evaluation run ID
- `--metrics`: Comma-separated list (time,errors,success-rate,completion-rate)

**Example:**

```bash
uxq task measure --run-id latest --metrics time,errors,success-rate
```

### Analyze Interactions

```bash
uxq task analyze --run-id <id> --focus <focus-area>
```

**Parameters:**

- `--run-id`: Evaluation run ID
- `--focus`: Analysis focus (interactions,patterns,efficiency)

**Example:**

```bash
uxq task analyze --run-id latest --focus interactions
```

## Outputs

### JSON Output

```json
{
  "taskEvaluation": {
    "taskId": "checkout-flow",
    "status": "completed",
    "metrics": {
      "completionRate": 0.92,
      "avgTimeOnTask": 145000,
      "errorRate": 0.08,
      "successRate": 0.92
    },
    "interactions": {
      "totalClicks": 23,
      "totalInputs": 12,
      "navigationSteps": 5
    },
    "difficulty": {
      "index": 6.5,
      "classification": "moderate"
    }
  }
}
```

### Markdown Report

```markdown
## 任务评价报告

### 任务：完成购买流程

**状态**: ✅ 完成

#### 核心指标

- 完成率: 92%
- 平均时间: 145 秒
- 错误率: 8%
- 成功率: 92%

#### 交互分析

- 总点击数: 23
- 总输入数: 12
- 导航步骤: 5

#### 任务难度

- 难度指数: 6.5/10
- 分类: 中等
```

## Integration Example

### With Playwright

```typescript
import { test } from '@playwright/test';
import { UXQClient } from '@uxq/cli-client';

test('task evaluation', async ({ page }) => {
  const uxq = new UXQClient();

  await page.goto('https://shop.example.com/checkout');

  const run = await uxq.task.evaluate({
    url: page.url(),
    task: {
      name: '完成购买',
      steps: ['添加商品', '填写地址', '支付'],
      successCriteria: {
        completionRate: 0.9,
        avgTime: 180000,
      },
    },
  });

  expect(run.metrics.completionRate).toBeGreaterThanOrEqual(0.9);
});
```

## Best Practices

1. **定义清晰的任务步骤**: 任务应该包含明确的步骤和成功标准
2. **设置合理的超时时间**: 根据任务复杂度设置超时
3. **收集多次运行数据**: 至少运行 5 次以获得统计意义
4. **分析失败原因**: 对失败任务进行根因分析

## Related Workflows

- [Cognitive Load](./cognitive-load.md) - 测量任务认知负担
- [Accessibility](./accessibility.md) - 检查任务可访问性
- [Metrics & Scoring](./metrics-scoring.md) - 计算综合评分
