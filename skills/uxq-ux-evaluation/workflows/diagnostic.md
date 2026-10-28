# Diagnostic & Recommendations Workflow

## Purpose

Use for diagnosing UX issues and generating improvement recommendations.

## When to Use

- Analyzing root causes of UX problems
- Generating prioritized recommendations
- Creating improvement roadmaps
- Estimating impact of changes

## Commands

### Diagnose Problems

```bash
uxq diagnostic analyze --run-id <id> --severity <severity-list>
```

**Parameters:**

- `--run-id`: Evaluation run ID
- `--severity`: Severity levels (critical,high,moderate,low,info)
- `--category`: Issue categories (task,cognition,a11y,color,geometry)

**Example:**

```bash
uxq diagnostic analyze \
  --run-id latest \
  --severity critical,high
```

### Generate Recommendations

```bash
uxq diagnostic recommend --finding-ids <ids> --prioritize <strategy>
```

**Parameters:**

- `--finding-ids`: Comma-separated finding IDs (or "all")
- `--prioritize`: Prioritization strategy (impact,effort,impact-effort)
- `--limit`: Maximum recommendations (default: 10)

**Example:**

```bash
uxq diagnostic recommend \
  --finding-ids all \
  --prioritize impact-effort \
  --limit 10
```

### Create Improvement Plan

```bash
uxq diagnostic plan --recommendations <ids> --timeline <timeline>
```

**Parameters:**

- `--recommendations`: Recommendation IDs
- `--timeline**: Timeline phases (short,mid,long)
- `--resources**: Available resources (team-size, budget)

**Example:**

```bash
uxq diagnostic plan \
  --recommendations rec-001,rec-002,rec-003 \
  --timeline short,mid
```

## Outputs

### JSON Output

```json
{
  "diagnostic": {
    "findings": [
      {
        "id": "f-001",
        "category": "accessibility",
        "severity": "error",
        "title": "按钮对比度不足",
        "description": "次要按钮的对比度为 3.2:1，低于 WCAG AA 要求的 4.5:1",
        "location": {
          "page": "checkout",
          "element": ".btn-secondary",
          "url": "https://example.com/checkout"
        },
        "evidence": ["ev-001", "ev-002"],
        "rootCause": {
          "hypothesis": "设计系统中次要按钮的颜色定义不符合 WCAG 标准",
          "confidence": 0.85
        },
        "impact": {
          "users": "影响约 8% 的视力障碍用户",
          "tasks": "影响结账流程的完成",
          "business": "可能导致 2-3% 的转化率损失"
        }
      }
    ],
    "recommendations": [
      {
        "id": "rec-001",
        "findingIds": ["f-001"],
        "title": "调整次要按钮颜色",
        "description": "将次要按钮颜色从 #999 改为 #666，使对比度达到 4.8:1",
        "priority": "high",
        "impact": {
          "score": 8.5,
          "users": "改善 8% 用户的体验",
          "conversion": "预期提升 1-2% 转化率"
        },
        "effort": {
          "score": 2,
          "time": "2 小时",
          "complexity": "低"
        },
        "implementation": {
          "steps": [
            "修改 design-tokens.json 中的 button-secondary-color",
            "更新组件库中的 Button 组件",
            "运行视觉回归测试"
          ],
          "risks": ["可能影响其他使用该颜色的组件"],
          "testing": ["对比度测试", "视觉回归测试"]
        }
      }
    ],
    "roadmap": {
      "shortTerm": {
        "weeks": 2,
        "recommendations": ["rec-001", "rec-002"],
        "expectedImpact": "+5 points",
        "effort": "20 hours"
      },
      "midTerm": {
        "weeks": 8,
        "recommendations": ["rec-003", "rec-004"],
        "expectedImpact": "+12 points",
        "effort": "80 hours"
      },
      "longTerm": {
        "weeks": 16,
        "recommendations": ["rec-005"],
        "expectedImpact": "+8 points",
        "effort": "120 hours"
      }
    }
  }
}
```

### Markdown Report

```markdown
## UX 诊断与改进建议报告

### 问题概览

**总 Findings**: 15

- 🔴 Critical: 0
- 🟠 High: 2
- 🟡 Moderate: 5
- 🔵 Low: 8

### 关键问题

#### 1. 按钮对比度不足 (f-001)

**严重性**: 🔴 Error
**类别**: 可访问性
**位置**: checkout 页面 - `.btn-secondary`

**描述**: 次要按钮的对比度为 3.2:1，低于 WCAG AA 要求的 4.5:1

**影响**:

- 影响约 8% 的视力障碍用户
- 影响结账流程的完成
- 可能导致 2-3% 的转化率损失

**根因分析**: 设计系统中次要按钮的颜色定义不符合 WCAG 标准 (置信度: 85%)

---

### 改进建议

#### 高优先级

##### 1. 调整次要按钮颜色 (rec-001)

**关联问题**: f-001
**优先级**: 🔴 High

**描述**: 将次要按钮颜色从 #999 改为 #666，使对比度达到 4.8:1

**影响评估**:

- 影响评分: 8.5/10
- 用户影响: 改善 8% 用户的体验
- 业务影响: 预期提升 1-2% 转化率

**实施成本**:

- 成本评分: 2/10
- 预计时间: 2 小时
- 复杂度: 低

**实施步骤**:

1. 修改 `design-tokens.json` 中的 `button-secondary-color`
2. 更新组件库中的 Button 组件
3. 运行视觉回归测试

**风险**: 可能影响其他使用该颜色的组件
**测试**: 对比度测试、视觉回归测试

---

### 改进路线图

#### 短期 (2 周)

- **建议**: rec-001, rec-002
- **预期影响**: +5 points
- **工作量**: 20 小时

#### 中期 (8 周)

- **建议**: rec-003, rec-004
- **预期影响**: +12 points
- **工作量**: 80 小时

#### 长期 (16 周)

- **建议**: rec-005
- **预期影响**: +8 points
- **工作量**: 120 小时

**总预期改进**: +25 points
```

## Root Cause Analysis

### Hypothesis Generation

For each finding, UXQ generates root cause hypotheses:

1. **Pattern Matching**: Compare with known issue patterns
2. **Context Analysis**: Analyze surrounding code and design
3. **Evidence Correlation**: Link related findings and evidence
4. **Confidence Scoring**: Rate hypothesis confidence (0-1)

### Impact Assessment

Impact is assessed across three dimensions:

1. **User Impact**: How many users are affected?
2. **Task Impact**: Which tasks are affected?
3. **Business Impact**: What is the business cost?

### Effort Estimation

Effort is estimated based on:

1. **Complexity**: Technical complexity of the fix
2. **Scope**: Number of files/components affected
3. **Risk**: Potential side effects and regression risk

## Integration Example

### Automated Diagnosis

```typescript
import { UXQClient } from '@uxq/cli-client';

const uxq = new UXQClient();

// Run evaluation
const run = await uxq.evaluate({ url: 'https://example.com' });

// Diagnose issues
const diagnosis = await uxq.diagnostic.analyze({
  runId: run.id,
  severity: ['critical', 'high'],
});

console.log(`Found ${diagnosis.findings.length} issues`);

// Generate recommendations
const recommendations = await uxq.diagnostic.recommend({
  findingIds: diagnosis.findings.map((f) => f.id),
  prioritize: 'impact-effort',
  limit: 5,
});

console.log(`Top recommendation: ${recommendations[0].title}`);
console.log(`Expected impact: ${recommendations[0].impact.score}/10`);

// Create improvement plan
const plan = await uxq.diagnostic.plan({
  recommendations: recommendations.map((r) => r.id),
  timeline: 'short,mid',
});

console.log(`Short-term impact: ${plan.shortTerm.expectedImpact}`);
```

## Best Practices

1. **优先处理高影响低成本的问题**: 使用 impact-effort 矩阵
2. **根因分析**: 不要只解决表面症状
3. **量化影响**: 用数据支持改进决策
4. **分阶段实施**: 将改进分为短期、中期、长期
5. **验证效果**: 实施后重新评价验证改进效果

## Related Workflows

- [Evidence Management](./evidence.md) - 证据收集
- [Metrics & Scoring](./metrics-scoring.md) - 评分计算
- [Report Generation](./report.md) - 生成报告
