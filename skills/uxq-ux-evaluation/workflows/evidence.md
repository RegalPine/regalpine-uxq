# Evidence Management Workflow

## Purpose

Use for collecting, linking, and tracing evaluation evidence.

## When to Use

- Collecting screenshots, videos, and metrics
- Linking evidence to findings
- Generating traceability reports
- Maintaining audit trails

## Commands

### Collect Evidence

```bash
uxq evidence collect --run-id <id> --type <evidence-type>
```

**Parameters:**

- `--run-id`: Evaluation run ID
- `--type`: Evidence type (screenshot,video,metrics,logs)
- `--metadata`: Additional metadata (JSON)

**Example:**

```bash
uxq evidence collect \
  --run-id latest \
  --type screenshot \
  --metadata '{"page":"checkout","step":"payment"}'
```

### Link Evidence to Findings

```bash
uxq evidence link --evidence-id <id> --finding-id <id>
```

**Parameters:**

- `--evidence-id`: Evidence identifier
- `--finding-id`: Finding identifier
- `--relationship`: Relationship type (supports, contradicts, context)

**Example:**

```bash
uxq evidence link \
  --evidence-id ev-001 \
  --finding-id f-042 \
  --relationship supports
```

### Generate Traceability Report

```bash
uxq evidence trace --run-id <id> --format <format>
```

**Parameters:**

- `--run-id`: Evaluation run ID
- `--format`: Output format (matrix,list,json)

**Example:**

```bash
uxq evidence trace --run-id latest --format matrix
```

## Outputs

### JSON Output

```json
{
  "evidence": {
    "catalog": [
      {
        "id": "ev-001",
        "type": "screenshot",
        "timestamp": "2026-10-28T10:30:00Z",
        "metadata": {
          "page": "checkout",
          "step": "payment",
          "url": "https://example.com/checkout"
        },
        "storage": {
          "path": "/evidence/screenshots/ev-001.png",
          "size": 245678
        }
      }
    ],
    "linkages": [
      {
        "evidenceId": "ev-001",
        "findingId": "f-042",
        "relationship": "supports",
        "linkedAt": "2026-10-28T10:35:00Z"
      }
    ],
    "traceability": {
      "completeness": 0.92,
      "totalFindings": 15,
      "linkedFindings": 14,
      "totalEvidence": 28,
      "linkedEvidence": 26
    }
  }
}
```

### Traceability Matrix

```markdown
## 可追溯性矩阵

### 评价运行: latest

**日期**: 2026-10-28
**完整性**: 92%

| Finding ID | 描述           | 严重性  | 证据 ID        | 证据类型         | 关系     |
| ---------- | -------------- | ------- | -------------- | ---------------- | -------- |
| f-001      | 按钮对比度不足 | error   | ev-001         | screenshot       | supports |
| f-002      | 表单标签缺失   | warning | ev-002, ev-003 | screenshot, code | supports |
| f-003      | 导航混乱       | info    | ev-004         | video            | context  |

### 统计

- 总 Findings: 15
- 已链接: 14 (93%)
- 未链接: 1 (7%)
- 总证据: 28
- 已使用: 26 (93%)
```

## Evidence Types

### Screenshot

- Captures visual state at a point in time
- Format: PNG, JPEG
- Use for: Visual issues, layout problems

### Video

- Records user interaction over time
- Format: MP4, WebM
- Use for: Task flow analysis, interaction patterns

### Metrics

- Quantitative measurements
- Format: JSON, CSV
- Use for: Performance data, completion rates

### Logs

- System and user action logs
- Format: Text, JSON
- Use for: Error tracking, behavior analysis

### Code Snippet

- Source code excerpts
- Format: Text with syntax highlighting
- Use for: Implementation issues, accessibility markup

## Integration Example

### Automated Evidence Collection

```typescript
import { UXQClient } from '@uxq/cli-client';

const uxq = new UXQClient();

// Start evaluation
const run = await uxq.evaluate({ url: 'https://example.com' });

// Collect evidence at key moments
const steps = ['landing', 'navigation', 'checkout', 'confirmation'];

for (const step of steps) {
  const screenshot = await page.screenshot();
  await uxq.evidence.collect({
    runId: run.id,
    type: 'screenshot',
    data: screenshot,
    metadata: { step, timestamp: new Date().toISOString() },
  });
}

// Link evidence to findings
const findings = await uxq.diagnostic.getFindings({ runId: run.id });

for (const finding of findings) {
  const relatedEvidence = await uxq.evidence.findRelated({
    runId: run.id,
    findingId: finding.id,
  });

  for (const evidence of relatedEvidence) {
    await uxq.evidence.link({
      evidenceId: evidence.id,
      findingId: finding.id,
      relationship: 'supports',
    });
  }
}
```

## Best Practices

1. **收集多种类型证据**: 结合截图、视频和指标数据
2. **添加详细元数据**: 记录时间、页面、步骤等上下文
3. **及时链接证据**: 在发现问题的同时链接相关证据
4. **定期检查完整性**: 确保所有 finding 都有证据支持
5. **安全存储**: 确保证据文件的完整性和可访问性

## Related Workflows

- [Diagnostic](./diagnostic.md) - 问题诊断
- [Report Generation](./report.md) - 生成评价报告
- [Task Evaluation](./task-evaluation.md) - 任务分析
