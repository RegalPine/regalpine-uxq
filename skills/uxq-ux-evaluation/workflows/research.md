# User Research Integration Workflow

## Purpose

Use for integrating qualitative user research data with quantitative UX evaluation.

## When to Use

- Importing user research data
- Coding qualitative responses
- Synthesizing findings across studies
- Correlating qualitative and quantitative data

## Commands

### Import Research Data

```bash
uxq research import --source <file> --format <format>
```

**Parameters:**

- `--source`: Data source file path
- `--format`: File format (csv, json, excel)
- `--study`: Study identifier
- `--metadata`: Study metadata (JSON)

**Example:**

```bash
uxq research import \
  --source data/usability-test.csv \
  --format csv \
  --study usability-oct-2026
```

### Code Qualitative Data

```bash
uxq research code --data <file> --method <coding-method>
```

**Parameters:**

- `--data`: Data file to code
- `--method`: Coding method (thematic,grounded,affinity)
- `--codes`: Predefined codes (comma-separated)

**Example:**

```bash
uxq research code \
  --data data/interviews.csv \
  --method thematic \
  --codes "frustration,confusion,delight,efficiency"
```

### Synthesize Findings

```bash
uxq research synthesize --studies <study-ids> --output <file>
```

**Parameters:**

- `--studies`: Comma-separated study IDs
- `--output`: Output file path
- `--format`: Output format (markdown, pdf, html)

**Example:**

```bash
uxq research synthesize \
  --studies usability-oct-2026,survey-q3,interviews-2026 \
  --output docs/research-synthesis.md
```

### Link Research to Evaluation

```bash
uxq research link --study <study-id> --evaluation-run <run-id>
```

**Parameters:**

- `--study`: Research study ID
- `--evaluation-run`: UXQ evaluation run ID
- `--correlation`: Correlation type (supports,contradicts,context)

**Example:**

```bash
uxq research link \
  --study usability-oct-2026 \
  --evaluation-run latest
```

## Outputs

### JSON Output

```json
{
  "research": {
    "studies": [
      {
        "id": "usability-oct-2026",
        "type": "usability-test",
        "participants": 10,
        "tasks": ["checkout", "search", "navigation"],
        "dataPoints": 150
      }
    ],
    "codes": [
      {
        "code": "frustration",
        "frequency": 8,
        "percentage": 0.8,
        "sentiment": "negative",
        "relatedMetrics": {
          "taskTime": "+20s",
          "errorRate": "+15%"
        }
      }
    ],
    "themes": [
      {
        "theme": "支付流程复杂",
        "codes": ["frustration", "confusion"],
        "frequency": 8,
        "impact": "high",
        "recommendations": ["简化表单字段", "提供进度指示"]
      }
    ],
    "synthesis": {
      "totalStudies": 3,
      "totalParticipants": 25,
      "keyFindings": 12,
      "actionableInsights": 8
    }
  }
}
```

### Synthesis Report

```markdown
# 用户研究综合报告

## 研究概览

- **研究数量**: 3
- **总参与者**: 25
- **关键发现**: 12
- **可操作洞察**: 8

## 量化发现

- 任务完成率: 92%
- 平均任务时间: 145 秒
- 用户满意度: 4.2/5
- 错误率: 8%

## 定性主题

### 主题 1: 支付流程复杂

- **提及频率**: 8/10 用户
- **情感倾向**: 负面
- **相关指标**: 认知负担 +15%
- **用户引用**:
  > "我不知道该填哪些信息，太多了"
  > "我担心填错了"

### 主题 2: 表单字段过多

- **提及频率**: 6/10 用户
- **情感倾向**: 负面
- **相关指标**: 任务时间 +20s
- **用户引用**:
  > "为什么要填这么多信息？"
  > "有些字段我不知道怎么填"

### 主题 3: 进度指示清晰

- **提及频率**: 7/10 用户
- **情感倾向**: 正面
- **相关指标**: 认知负担 -10%
- **用户引用**:
  > "我知道我现在在哪一步"
  > "还有几步就完成了"

## 定量-定性关联

| 定性主题     | 量化指标      | 关联性   |
| ------------ | ------------- | -------- |
| 支付流程复杂 | 认知负担 +15% | 强相关   |
| 表单字段过多 | 任务时间 +20s | 中等相关 |
| 进度指示清晰 | 认知负担 -10% | 强相关   |

## 改进建议

### 高优先级

1. **简化支付表单**
   - 减少必填字段从 12 个到 6 个
   - 提供地址自动填充
   - 预期影响: 任务时间 -15s, 认知负担 -20%

2. **优化错误提示**
   - 提供具体的错误信息
   - 建议正确的输入格式
   - 预期影响: 错误率 -30%

### 中优先级

3. **增加帮助提示**
   - 为复杂字段提供说明
   - 使用图标和提示文字
   - 预期影响: 用户满意度 +0.5

### 低优先级

4. **个性化流程**
   - 根据用户类型调整流程
   - 保存常用信息
   - 预期影响: 任务时间 -10s
```

## Research Methods

### Usability Testing

- Task-based evaluation
- Think-aloud protocol
- Observation and note-taking
- Metrics: completion rate, time-on-task, errors

### User Interviews

- Semi-structured interviews
- Open-ended questions
- Qualitative coding
- Themes and patterns

### Surveys

- Likert scales
- Net Promoter Score (NPS)
- System Usability Scale (SUS)
- Quantitative analysis

### Field Studies

- Contextual inquiry
- Ethnographic observation
- Real-world usage
- Longitudinal data

## Integration Example

### Mixed-Methods Study

```typescript
import { UXQClient } from '@uxq/cli-client';

const uxq = new UXQClient();

// 1. Conduct quantitative evaluation
const evalRun = await uxq.evaluate({
  url: 'https://example.com',
  scope: 'comprehensive',
});

// 2. Import qualitative data
await uxq.research.import({
  source: 'data/interviews.csv',
  format: 'csv',
  study: 'interviews-2026',
});

// 3. Code qualitative data
const codes = await uxq.research.code({
  data: 'interviews-2026',
  method: 'thematic',
  codes: ['frustration', 'delight', 'confusion'],
});

// 4. Link research to evaluation
await uxq.research.link({
  study: 'interviews-2026',
  evaluationRun: evalRun.id,
});

// 5. Synthesize findings
const synthesis = await uxq.research.synthesize({
  studies: ['interviews-2026', 'usability-test'],
  output: 'docs/synthesis.md',
});

console.log(`Key findings: ${synthesis.keyFindings}`);
console.log(`Actionable insights: ${synthesis.actionableInsights}`);
```

## Best Practices

1. **混合方法**: 结合定量和定性数据获得全面洞察
2. **及时记录**: 在研究过程中实时记录观察和引用
3. **三角验证**: 使用多种数据源验证发现
4. **关注行动**: 确保每个发现都有对应的改进建议
5. **分享洞察**: 将研究结果分享给整个团队

## Related Workflows

- [Task Evaluation](./task-evaluation.md) - 量化任务数据
- [Cognitive Load](./cognitive-load.md) - 认知负担测量
- [Report Generation](./report.md) - 生成综合报告
