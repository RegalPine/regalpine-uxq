# Report Generation Workflow

## Purpose

Use for generating comprehensive UX evaluation reports in various formats.

## When to Use

- Creating full evaluation reports
- Generating executive summaries
- Exporting data for further analysis
- Creating stakeholder presentations

## Commands

### Generate Full Report

```bash
uxq report generate --run-id <id> --format <format> --output <file>
```

**Parameters:**

- `--run-id`: Evaluation run ID
- `--format**: Output format (markdown, pdf, html)
- `--output**: Output file path
- `--template**: Report template (default, executive, technical)
- `--sections**: Sections to include (all,summary,metrics,findings,recommendations)

**Example:**

```bash
uxq report generate \
  --run-id latest \
  --format markdown \
  --output docs/ux-evaluation-report.md \
  --template default
```

### Create Executive Summary

```bash
uxq report summary --run-id <id> --audience <audience>
```

**Parameters:**

- `--run-id`: Evaluation run ID
- `--audience**: Target audience (stakeholders,developers,designers,management)
- `--length**: Summary length (brief,standard,detailed)

**Example:**

```bash
uxq report summary \
  --run-id latest \
  --audience stakeholders \
  --length brief
```

### Export Data

```bash
uxq report export --run-id <id> --format <format> --output <file>
```

**Parameters:**

- `--run-id`: Evaluation run ID
- `--format**: Data format (json, csv, excel)
- `--output**: Output file path
- `--include**: Data to include (metrics,findings,evidence,recommendations)

**Example:**

```bash
uxq report export \
  --run-id latest \
  --format json \
  --output data/ux-evaluation.json
```

## Outputs

### Full Report (Markdown)

```markdown
# UX 评价报告

**项目**: Example.com 电商网站
**评价日期**: 2026-10-28
**评价范围**: 全面 UX 评价
**总体评分**: 78/100

---

## 执行摘要

### 关键发现

- ✅ 任务完成率良好 (92%)
- ⚠️ 认知负担偏高 (72/100)
- 🔴 可访问性需要改进 (76/100)

### 核心建议

1. **高优先级**: 提升按钮对比度，满足 WCAG AA 标准
2. **中优先级**: 简化结账流程，减少认知负担
3. **低优先级**: 增加表单帮助提示

### 预期影响

实施全部建议后，预期 UX 评分可提升至 88/100 (+10 分)

---

## 详细指标

### 任务完成指标

| 指标     | 值   | 目标 | 状态    |
| -------- | ---- | ---- | ------- |
| 完成率   | 92%  | 90%  | ✅ 通过 |
| 平均时间 | 145s | 180s | ✅ 通过 |
| 错误率   | 8%   | 5%   | ⚠️ 警告 |
| 成功率   | 92%  | 90%  | ✅ 通过 |

### 认知负担指标

| 指标       | 值   | 目标 | 状态    |
| ---------- | ---- | ---- | ------- |
| NASA-TLX   | 33.6 | <30  | ⚠️ 警告 |
| 信息复杂度 | 68%  | <60% | 🔴 失败 |
| 清晰度     | 82%  | >80% | ✅ 通过 |

### 可访问性指标

| 指标             | 值  | 目标 | 状态    |
| ---------------- | --- | ---- | ------- |
| WCAG 符合度      | 89% | 95%  | ⚠️ 警告 |
| 屏幕阅读器兼容性 | 82% | 90%  | ⚠️ 警告 |
| 键盘可导航性     | 91% | 95%  | ⚠️ 警告 |

---

## 问题清单

### 高严重性问题

#### 1. 按钮对比度不足 (f-001)

**类别**: 可访问性
**严重性**: 🔴 Error
**位置**: checkout 页面 - `.btn-secondary`

**描述**: 次要按钮的对比度为 3.2:1，低于 WCAG AA 要求的 4.5:1

**影响**: 影响约 8% 的视力障碍用户

**建议**: 将按钮颜色从 #999 改为 #666

---

### 中等严重性问题

#### 2. 表单字段过多 (f-002)

**类别**: 认知负担
**严重性**: 🟡 Moderate
**位置**: checkout 页面 - 支付表单

**描述**: 支付表单包含 12 个必填字段，超出用户预期

**影响**: 导致用户认知负担增加，任务时间延长

**建议**: 减少必填字段至 6 个，提供自动填充

---

## 改进路线图

### 短期 (2 周)

- [ ] 修复按钮对比度问题
- [ ] 优化表单标签
- **预期影响**: +5 分

### 中期 (8 周)

- [ ] 简化支付流程
- [ ] 增加帮助提示
- **预期影响**: +8 分

### 长期 (16 周)

- [ ] 重新设计信息架构
- [ ] 个性化用户体验
- **预期影响**: +12 分

---

## 附录

### 评价方法

- 任务评价: 5 个核心任务，10 名参与者
- 认知负担: NASA-TLX 量表
- 可访问性: WCAG 2.1 AA 标准

### 数据来源

- 用户测试: 2026-10-25
- 自动评价: 2026-10-28
- 用户访谈: 2026-10-20

### 术语表

- **NASA-TLX**: NASA Task Load Index，认知负担量表
- **WCAG**: Web Content Accessibility Guidelines
- **完成率**: 成功完成任务的用户比例
```

### Executive Summary

```markdown
# UX 评价执行摘要

**致**: 利益相关者
**项目**: Example.com 电商网站
**日期**: 2026-10-28

---

## 总体评分: 78/100 ⚠️

### 核心发现

✅ **优势**

- 任务完成率 92%，超过行业平均 85%
- 用户满意度 4.2/5，处于良好水平
- 核心流程设计清晰，用户导航顺畅

⚠️ **需要改进**

- 认知负担偏高 (72/100)，影响用户效率
- 可访问性合规度 89%，未达到 95% 目标
- 结账流程复杂性导致 8% 的错误率

### 业务影响

**当前损失**:

- 因可访问性问题损失的潜在用户: ~8%
- 因流程复杂性导致的转化损失: ~2-3%
- 年度收入影响: 约 ¥500,000

**改进收益**:

- 实施高优先级建议后，预期转化率提升 1-2%
- 可访问性改进可扩大用户群体 8%
- 预计年度收入增加: ¥800,000

### 投资建议

**短期 (2 周)**: ¥50,000

- 修复可访问性问题
- 优化表单设计

**中期 (8 周)**: ¥200,000

- 简化结账流程
- 增加用户引导

**长期 (16 周)**: ¥500,000

- 重新设计信息架构
- 个性化用户体验

**预期 ROI**: 320% (12 个月内)

### 建议行动

1. **立即行动**: 修复高严重性问题
2. **本月内**: 启动可访问性改进项目
3. **本季度**: 实施结账流程优化
4. **持续**: 建立 UX 监控和基线对比机制
```

## Report Templates

### Default Template

- Full evaluation report
- All sections included
- Suitable for project teams

### Executive Template

- High-level summary
- Business impact focus
- Suitable for stakeholders

### Technical Template

- Detailed metrics
- Implementation focus
- Suitable for developers

### Custom Template

- Select specific sections
- Custom branding
- Custom data visualization

## Integration Example

### Automated Report Generation

```typescript
import { UXQClient } from '@uxq/cli-client';

const uxq = new UXQClient();

// Generate full report
await uxq.report.generate({
  runId: 'latest',
  format: 'markdown',
  output: 'docs/ux-report.md',
  template: 'default',
});

// Generate executive summary
await uxq.report.summary({
  runId: 'latest',
  audience: 'stakeholders',
  length: 'brief',
  output: 'docs/executive-summary.md',
});

// Export raw data
await uxq.report.export({
  runId: 'latest',
  format: 'json',
  output: 'data/ux-data.json',
  include: ['metrics', 'findings', 'evidence'],
});

console.log('Reports generated successfully');
```

### Custom Report Template

```typescript
import { UXQClient } from '@uxq/cli-client';

const uxq = new UXQClient();

// Create custom template
const template = {
  name: 'custom-quarterly',
  sections: ['summary', 'metrics', 'trends'],
  branding: {
    logo: 'company-logo.png',
    colors: {
      primary: '#007bff',
      secondary: '#6c757d',
    },
  },
  visualization: {
    charts: ['bar', 'line', 'radar'],
    tables: true,
  },
};

await uxq.report.generate({
  runId: 'latest',
  format: 'pdf',
  output: 'reports/quarterly-ux.pdf',
  template,
});
```

## Best Practices

1. **选择合适的模板**: 根据受众选择报告模板
2. **包含可操作建议**: 每个问题都应有对应的改进建议
3. **使用可视化**: 图表比文字更易于理解
4. **定期生成**: 建立定期报告机制（每周/每月）
5. **分享与讨论**: 将报告分享给团队并讨论改进计划
6. **跟踪改进**: 对比历史报告跟踪改进进度

## Related Workflows

- [Task Evaluation](./task-evaluation.md) - 任务数据
- [Diagnostic](./diagnostic.md) - 问题诊断
- [Regression](./regression.md) - 回归对比
