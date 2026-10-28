# Metrics & Scoring Workflow

## Purpose

Use for computing UX metrics and overall quality scores.

## When to Use

- Calculating UX metrics
- Computing weighted scores
- Benchmarking against industry standards
- Tracking UX trends over time

## Commands

### Calculate Metrics

```bash
uxq metrics calculate --run-id <id> --metrics <metric-list>
```

**Parameters:**

- `--run-id`: Evaluation run ID
- `--metrics`: Metrics to calculate (all,task,cognition,a11y,color,geometry)
- `--confidence`: Confidence level (default: 0.95)

**Example:**

```bash
uxq metrics calculate --run-id latest --metrics all
```

### Compute Weighted Scores

```bash
uxq scoring compute --run-id <id> --weights <weight-config>
```

**Parameters:**

- `--run-id`: Evaluation run ID
- `--weights`: Dimension weights (format: task:0.4,cognition:0.3,a11y:0.3)
- `--normalize`: Normalize scores to 0-100 (default: true)

**Example:**

```bash
uxq scoring compute \
  --run-id latest \
  --weights task:0.4,cognition:0.3,a11y:0.3
```

### Benchmark Against Standards

```bash
uxq scoring benchmark --run-id <id> --industry <sector>
```

**Parameters:**

- `--run-id`: Evaluation run ID
- `--industry`: Industry sector (ecommerce,saas,finance,healthcare)
- `--percentile`: Target percentile (50, 75, 90)

**Example:**

```bash
uxq scoring benchmark \
  --run-id latest \
  --industry ecommerce \
  --percentile 75
```

## Outputs

### JSON Output

```json
{
  "metrics": {
    "task": {
      "completionRate": 0.92,
      "avgTimeOnTask": 145000,
      "errorRate": 0.08,
      "successRate": 0.92,
      "efficiency": 0.85
    },
    "cognition": {
      "nasaTlxScore": 33.6,
      "complexity": 0.68,
      "clarity": 0.82,
      "cognitiveDemand": 6.2
    },
    "accessibility": {
      "wcagCompliance": 0.89,
      "screenReaderCompat": 0.82,
      "keyboardNav": 0.91,
      "inclusiveDesign": 0.78
    },
    "color": {
      "contrastScore": 0.92,
      "wcagAA": 0.95,
      "wcagAAA": 0.78
    },
    "geometry": {
      "spacingConsistency": 0.88,
      "alignmentScore": 0.91,
      "gridConformance": 0.85
    }
  },
  "scoring": {
    "overallScore": 78,
    "dimensions": {
      "task": {
        "score": 85,
        "weight": 0.4,
        "weightedScore": 34
      },
      "cognition": {
        "score": 72,
        "weight": 0.3,
        "weightedScore": 21.6
      },
      "accessibility": {
        "score": 76,
        "weight": 0.3,
        "weightedScore": 22.8
      }
    },
    "confidence": {
      "interval": [74.2, 81.8],
      "level": 0.95,
      "margin": 3.8
    }
  },
  "benchmark": {
    "industry": "ecommerce",
    "percentile": 75,
    "comparison": {
      "yourScore": 78,
      "industryMedian": 72,
      "industryP75": 76,
      "industryP90": 85
    },
    "ranking": {
      "position": "above-average",
      "percentile": 68
    }
  }
}
```

### Markdown Report

```markdown
## UX 指标与评分报告

### 总体评分: 78/100

**置信区间**: [74.2, 81.8] (95% 置信度)

#### 维度分解

| 维度     | 得分 | 权重 | 加权得分 |
| -------- | ---- | ---- | -------- |
| 任务完成 | 85   | 40%  | 34.0     |
| 认知负担 | 72   | 30%  | 21.6     |
| 可访问性 | 76   | 30%  | 22.8     |
| **总计** | -    | 100% | **78.4** |

### 详细指标

#### 任务指标

- 完成率: 92%
- 平均时间: 145 秒
- 错误率: 8%
- 成功率: 92%
- 效率: 85%

#### 认知负担指标

- NASA-TLX: 33.6/54
- 信息复杂度: 68%
- 清晰度: 82%
- 认知需求: 6.2/10

#### 可访问性指标

- WCAG 符合度: 89%
- 屏幕阅读器兼容性: 82%
- 键盘可导航性: 91%
- 包容性设计: 78%

### 行业基准

**行业**: 电商
**百分位**: 75th

| 指标    | 你的得分 | 行业中位数 | 行业 P75 | 行业 P90 |
| ------- | -------- | ---------- | -------- | -------- |
| UX 评分 | 78       | 72         | 76       | 85       |

**排名**: 高于平均 (68th 百分位)
```

## Scoring Methodology

### Weighted Average

```
Overall Score = Σ (Dimension Score × Weight)
```

### Confidence Interval

```
CI = Score ± Z × (σ / √n)
```

Where:

- Z = Z-score for confidence level (1.96 for 95%)
- σ = Standard deviation
- n = Sample size

### Percentile Ranking

```
Percentile = (Number of scores below yours / Total scores) × 100
```

## Integration Example

### Custom Scoring

```typescript
import { UXQClient } from '@uxq/cli-client';

const uxq = new UXQClient();

// Calculate all metrics
const metrics = await uxq.metrics.calculate({
  runId: 'latest',
  metrics: 'all',
});

// Compute custom weighted score
const score = await uxq.scoring.compute({
  runId: 'latest',
  weights: {
    task: 0.5, // Prioritize task completion
    cognition: 0.2, // Lower weight for cognition
    accessibility: 0.3, // Standard accessibility weight
  },
});

console.log(`Overall Score: ${score.overallScore}`);
console.log(`Confidence: ${score.confidence.interval}`);

// Benchmark against industry
const benchmark = await uxq.scoring.benchmark({
  runId: 'latest',
  industry: 'ecommerce',
  percentile: 75,
});

console.log(`Industry Ranking: ${benchmark.ranking.position}`);
console.log(`Percentile: ${benchmark.ranking.percentile}`);
```

## Best Practices

1. **选择合适的权重**: 根据产品优先级调整维度权重
2. **建立基线**: 首次评价后建立基线用于对比
3. **跟踪趋势**: 定期评价并跟踪 UX 评分变化
4. **使用置信区间**: 理解评分的不确定性
5. **对比行业基准**: 了解在行业中的位置

## Related Workflows

- [Task Evaluation](./task-evaluation.md) - 任务指标
- [Cognitive Load](./cognitive-load.md) - 认知指标
- [Accessibility](./accessibility.md) - 可访问性指标
- [Diagnostic](./diagnostic.md) - 问题诊断
