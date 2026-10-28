# Design System Evaluation Workflow

## Purpose

Use for evaluating design system conformance, consistency, and quality.

## When to Use

- Checking Token compliance
- Evaluating theme consistency
- Assessing component usage
- Auditing design system alignment

## Commands

### Token Compliance Check

```bash
uxq design-system tokens --url <target> --spec <token-file>
```

**Parameters:**
- `--url`: Target URL to evaluate
- `--spec**: Design token specification file (JSON/YAML)
- `--tolerance**: Color tolerance (default: 5%)
- `--include**: Token types to check (color,spacing,typography,all)

**Example:**
```bash
uxq design-system tokens \
  --url "https://app.example.com" \
  --spec tokens/design-tokens.json
```

### Theme Consistency Check

```bash
uxq design-system theme --url <target> --themes <theme-list>
```

**Parameters:**
- `--url**: Target URL
- `--themes**: Themes to check (light,dark,custom)
- `--metrics**: Consistency metrics (token-usage,color-consistency,spacing)

**Example:**
```bash
uxq design-system theme \
  --url "https://app.example.com" \
  --themes light,dark
```

### Component Usage Analysis

```bash
uxq design-system components --url <target> --library <library-name>
```

**Parameters:**
- `--url**: Target URL
- `--library**: Component library name
- `--coverage**: Coverage analysis (usage,coverage,gaps)

**Example:**
```bash
uxq design-system components \
  --url "https://app.example.com" \
  --library @example/ui-components
```

### Compare Themes

```bash
uxq design-system compare --themes <theme-list> --metrics <metric-list>
```

**Parameters:**
- `--themes**: Themes to compare
- `--metrics**: Comparison metrics
- `--output**: Output file

**Example:**
```bash
uxq design-system compare \
  --themes light,dark \
  --metrics token-usage,color-consistency,spacing
```

## Outputs

### JSON Output

```json
{
  "designSystem": {
    "overallScore": 88,
    "tokens": {
      "conformance": 0.92,
      "totalTokens": 150,
      "compliantTokens": 138,
      "violations": [
        {
          "type": "color-mismatch",
          "severity": "moderate",
          "expected": "#007bff",
          "actual": "#0078ff",
          "location": ".btn-primary",
          "delta": 2.3
        }
      ]
    },
    "themes": {
      "light": {
        "tokenConformance": 0.95,
        "colorConsistency": 0.96,
        "spacingAdherence": 0.91
      },
      "dark": {
        "tokenConformance": 0.89,
        "colorConsistency": 0.91,
        "spacingAdherence": 0.85
      },
      "consistency": {
        "score": 0.88,
        "issues": [
          {
            "type": "theme-mismatch",
            "description": "Dark 主题中 3 处使用了硬编码颜色值",
            "locations": [".card-header", ".button-secondary", ".text-muted"]
          }
        ]
      }
    },
    "components": {
      "coverage": 0.85,
      "totalComponents": 45,
      "usedComponents": 38,
      "unusedComponents": 7,
      "customImplementations": 12,
      "gaps": [
        {
          "component": "DatePicker",
          "status": "missing",
          "usage": "custom-implementation",
          "recommendation": "Use @example/ui-components DatePicker"
        }
      ]
    },
    "recommendations": [
      {
        "priority": "high",
        "category": "token-conformance",
        "description": "统一 Dark 主题的颜色 Token 使用",
        "impact": "+3 points",
        "effort": "low"
      },
      {
        "priority": "medium",
        "category": "component-usage",
        "description": "替换自定义 DatePicker 为标准组件",
        "impact": "+2 points",
        "effort": "medium"
      }
    ]
  }
}
```

### Markdown Report

```markdown
## 设计系统评价报告

### 总体评分: 88/100

---

### Token 符合度: 92/100

**总 Token 数**: 150
**符合 Token 数**: 138
**违规数**: 12

#### 违规详情

| 类型 | 严重性 | 期望值 | 实际值 | 位置 | 偏差 |
|------|--------|--------|--------|------|------|
| 颜色不匹配 | 🟡 Moderate | #007bff | #0078ff | .btn-primary | 2.3% |
| 间距不一致 | 🔵 Low | 16px | 18px | .card-body | 12.5% |
| 字体大小不匹配 | 🟡 Moderate | 14px | 13px | .text-small | 7.1% |

---

### 主题一致性: 88/100

#### Light 主题
- Token 符合度: 95%
- 颜色一致性: 96%
- 间距符合度: 91%

#### Dark 主题
- Token 符合度: 89%
- 颜色一致性: 91%
- 间距符合度: 85%

#### 一致性问题
🟡 **主题不一致**: Dark 主题中 3 处使用了硬编码颜色值
- `.card-header`
- `.button-secondary`
- `.text-muted`

---

### 组件使用: 85/100

**总组件数**: 45
**已使用组件**: 38
**未使用组件**: 7
**自定义实现**: 12

#### 组件覆盖率
- 标准组件使用率: 84.4%
- 自定义实现率: 26.7%

#### 缺失组件
| 组件 | 状态 | 当前实现 | 建议 |
|------|------|----------|------|
| DatePicker | ❌ 缺失 | 自定义实现 | 使用 @example/ui-components DatePicker |
| TimePicker | ❌ 缺失 | 自定义实现 | 使用 @example/ui-components TimePicker |
| FileUpload | ❌ 缺失 | 自定义实现 | 使用 @example/ui-components FileUpload |

---

### 改进建议

#### 高优先级

##### 1. 统一 Dark 主题的颜色 Token 使用
**类别**: Token 符合度
**影响**: +3 points
**工作量**: 低

**描述**: 将 Dark 主题中的硬编码颜色值替换为对应的 Token

**实施步骤**:
1. 识别所有硬编码颜色值
2. 映射到对应的 Token
3. 替换并测试

#### 中优先级

##### 2. 替换自定义 DatePicker 为标准组件
**类别**: 组件使用
**影响**: +2 points
**工作量**: 中

**描述**: 使用设计系统提供的 DatePicker 组件替换自定义实现

**实施步骤**:
1. 引入 @example/ui-components DatePicker
2. 迁移现有功能
3. 进行回归测试

---

### 设计系统健康度

| 维度 | 评分 | 状态 |
|------|------|------|
| Token 符合度 | 92 | ✅ 良好 |
| 主题一致性 | 88 | ⚠️ 需改进 |
| 组件覆盖率 | 85 | ⚠️ 需改进 |
| **总体评分** | **88** | **良好** |

### 趋势分析

| 日期 | 评分 | 变化 |
|------|------|------|
| 2026-10-01 | 85 | - |
| 2026-10-15 | 86 | +1 |
| 2026-10-28 | 88 | +2 |

**趋势**: 📈 持续改进
```

## Design System Metrics

### Token Conformance

Measures how well the implementation matches the design token specification:

```
Conformance = (Compliant Tokens / Total Tokens) × 100
```

### Theme Consistency

Measures consistency across different themes:

```
Consistency = 1 - (Issues / Total Elements) × 100
```

### Component Coverage

Measures adoption of design system components:

```
Coverage = (Used Components / Total Components) × 100
```

### Design Debt

Tracks accumulated design inconsistencies:

```
Design Debt = Σ (Violation Severity × Impact)
```

## Integration Example

### Automated Design System Audit

```typescript
import { UXQClient } from '@uxq/cli-client';

const uxq = new UXQClient();

// Check token compliance
const tokenAudit = await uxq.designSystem.tokens({
  url: 'https://app.example.com',
  spec: 'tokens/design-tokens.json',
});

console.log(`Token Conformance: ${tokenAudit.tokens.conformance * 100}%`);
console.log(`Violations: ${tokenAudit.tokens.violations.length}`);

// Check theme consistency
const themeAudit = await uxq.designSystem.theme({
  url: 'https://app.example.com',
  themes: ['light', 'dark'],
});

console.log(`Theme Consistency: ${themeAudit.themes.consistency.score * 100}%`);

// Analyze component usage
const componentAudit = await uxq.designSystem.components({
  url: 'https://app.example.com',
  library: '@example/ui-components',
});

console.log(`Component Coverage: ${componentAudit.components.coverage * 100}%`);
console.log(`Custom Implementations: ${componentAudit.components.customImplementations}`);

// Generate recommendations
const recommendations = tokenAudit.recommendations
  .concat(themeAudit.recommendations)
  .concat(componentAudit.recommendations)
  .sort((a, b) => {
    const priority = { high: 3, medium: 2, low: 1 };
    return priority[b.priority] - priority[a.priority];
  });

console.log(`\nTop Recommendations:`);
recommendations.slice(0, 5).forEach((rec, i) => {
  console.log(`${i + 1}. [${rec.priority}] ${rec.description}`);
});
```

### CI/CD Design System Check

```yaml
# .github/workflows/design-system-audit.yml
name: Design System Audit

on:
  pull_request:
    paths:
      - 'src/**'
      - 'tokens/**'
      - 'components/**'

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Audit Design System
        run: |
          uxq design-system tokens \
            --url ${{ env.PREVIEW_URL }} \
            --spec tokens/design-tokens.json \
            --output audit-tokens.json
          
          uxq design-system theme \
            --url ${{ env.PREVIEW_URL }} \
            --themes light,dark \
            --output audit-theme.json
          
          # Check for violations
          VIOLATIONS=$(cat audit-tokens.json | jq '.tokens.violations | length')
          if [ $VIOLATIONS -gt 10 ]; then
            echo "❌ Too many token violations: $VIOLATIONS"
            exit 1
          fi
          
          echo "✅ Design system audit passed"
      
      - name: Upload Audit Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: design-system-audit
          path: audit-*.json
```

## Best Practices

1. **定期审计**: 每周或每次重大更新后进行设计系统审计
2. **自动化检查**: 在 CI/CD 中集成设计系统检查
3. **建立基线**: 记录设计系统健康度基线
4. **跟踪趋势**: 监控设计系统指标的变化趋势
5. **优先修复**: 先修复高严重性的违规
6. **文档化**: 维护设计系统使用指南和最佳实践
7. **团队协作**: 与设计和开发团队共同维护设计系统

## Related Workflows

- [Color Analysis](./color.md) - 颜色对比度检查
- [Layout Analysis](./layout.md) - 布局一致性检查
- [Report Generation](./report.md) - 生成评价报告
