# Cognitive Load Measurement Workflow

## Purpose

Use for measuring user cognitive burden and mental effort during task completion.

## When to Use

- Measuring mental effort required by interface
- Comparing cognitive load across design alternatives
- Identifying information complexity issues
- Optimizing interface for reduced cognitive burden

## Commands

### Measure Cognitive Load

```bash
uxq cognition measure --url <target> --methods <method-list>
```

**Parameters:**

- `--url`: Target URL to evaluate
- `--methods`: Measurement methods (nasa-tlx,secondary-task,reaction-time)
- `--participants`: Number of participants (default: 5)

**Example:**

```bash
uxq cognition measure \
  --url "https://app.example.com/dashboard" \
  --methods nasa-tlx,secondary-task
```

### Analyze Information Complexity

```bash
uxq cognition analyze --page <url> --metrics <metric-list>
```

**Parameters:**

- `--page`: Page URL to analyze
- `--metrics`: Complexity metrics (complexity,clarity,density)

**Example:**

```bash
uxq cognition analyze --page https://app.example.com --metrics complexity,clarity
```

### Compare Design Alternatives

```bash
uxq cognition compare --baseline <url-a> --candidate <url-b>
```

**Parameters:**

- `--baseline`: Baseline design URL
- `--candidate`: Candidate design URL
- `--metrics`: Comparison metrics

**Example:**

```bash
uxq cognition compare \
  --baseline "https://app.example.com/v1" \
  --candidate "https://app.example.com/v2"
```

## Outputs

### JSON Output

```json
{
  "cognitiveLoad": {
    "overallScore": 72,
    "nasaTlx": {
      "mentalDemand": 6.5,
      "physicalDemand": 3.2,
      "temporalDemand": 5.8,
      "performance": 7.1,
      "effort": 6.8,
      "frustration": 4.2,
      "totalScore": 33.6
    },
    "complexity": {
      "informationDensity": 0.68,
      "visualClutter": 0.45,
      "cognitiveDemand": 6.2
    },
    "comparison": {
      "baseline": 33.6,
      "candidate": 28.4,
      "improvement": 15.5
    }
  }
}
```

### Markdown Report

```markdown
## 认知负担测量报告

### 总体评分: 72/100

#### NASA-TLX 评分

- 心理需求: 6.5/9
- 身体需求: 3.2/9
- 时间需求: 5.8/9
- 绩效表现: 7.1/9
- 努力程度: 6.8/9
- 挫折程度: 4.2/9
- **总分: 33.6/54**

#### 信息复杂度

- 信息密度: 68%
- 视觉混乱: 45%
- 认知需求: 6.2/10

#### 设计对比

- 基线版本: 33.6
- 候选版本: 28.4
- **改进: 15.5%** ✅
```

## NASA-TLX Dimensions

The NASA Task Load Index measures 6 dimensions:

1. **Mental Demand**: How mentally demanding was the task?
2. **Physical Demand**: How physically demanding was the task?
3. **Temporal Demand**: How hurried or leisurely was the pace?
4. **Performance**: How successful were you in accomplishing the task?
5. **Effort**: How hard did you have to work to accomplish your level of performance?
6. **Frustration**: How insecure, discouraged, irritated, stressed, and annoyed were you?

## Integration Example

### With User Testing

```typescript
import { UXQClient } from '@uxq/cli-client';

const uxq = new UXQClient();

// Measure during user testing session
const session = await uxq.cognition.startSession({
  url: 'https://app.example.com',
  methods: ['nasa-tlx', 'secondary-task'],
});

// User completes tasks
await user.completeTask('find-product');
await user.completeTask('add-to-cart');

// Collect NASA-TLX ratings
const ratings = await session.collectNasaTlx();

// End session and get results
const results = await session.end();
console.log(`NASA-TLX Score: ${results.nasaTlx.totalScore}`);
```

## Best Practices

1. **使用多种测量方法**: 结合主观（NASA-TLX）和客观（反应时间）指标
2. **控制测试环境**: 确保所有参与者在相似条件下测试
3. **收集足够样本**: 至少 5 个参与者以获得统计意义
4. **对比基线**: 总是与基线设计进行对比
5. **关注趋势**: 跟踪认知负担随时间的变化

## Related Workflows

- [Task Evaluation](./task-evaluation.md) - 任务完成分析
- [Metrics & Scoring](./metrics-scoring.md) - 综合评分计算
- [Diagnostic](./diagnostic.md) - 问题诊断与建议
