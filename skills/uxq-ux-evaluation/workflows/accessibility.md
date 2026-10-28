# Accessibility Evaluation Workflow

## Purpose

Use for assessing accessibility compliance and inclusivity of web interfaces.

## When to Use

- Checking WCAG compliance
- Testing screen reader compatibility
- Evaluating keyboard navigation
- Assessing inclusive design

## Commands

### WCAG Compliance Audit

```bash
uxq accessibility audit --url <target> --standard <wcag-level>
```

**Parameters:**
- `--url`: Target URL to audit
- `--standard`: WCAG standard (WCAG21-A, WCAG21-AA, WCAG21-AAA)
- `--include`: Specific criteria to check

**Example:**
```bash
uxq accessibility audit \
  --url "https://example.com" \
  --standard WCAG21-AA
```

### Screen Reader Testing

```bash
uxq accessibility screen-reader --url <target> --readers <reader-list>
```

**Parameters:**
- `--url`: Target URL
- `--readers`: Screen readers to test (nvda,voiceover,jaws)
- `--pages`: Specific pages to test

**Example:**
```bash
uxq accessibility screen-reader \
  --url "https://example.com" \
  --readers nvda,voiceover
```

### Keyboard Navigation Test

```bash
uxq accessibility keyboard --url <target> --test <test-type>
```

**Parameters:**
- `--url`: Target URL
- `--test`: Test type (tab-order,shortcuts,focus-management)

**Example:**
```bash
uxq accessibility keyboard \
  --url "https://example.com" \
  --test tab-order,focus-management
```

## Outputs

### JSON Output

```json
{
  "accessibility": {
    "overallScore": 76,
    "wcagCompliance": {
      "standard": "WCAG21-AA",
      "passRate": 0.89,
      "violations": {
        "critical": 0,
        "serious": 2,
        "moderate": 5,
        "minor": 8
      }
    },
    "screenReader": {
      "compatibility": 0.82,
      "testedReaders": ["nvda", "voiceover"],
      "issues": [
        {
          "reader": "nvda",
          "element": ".nav-menu",
          "issue": "Missing ARIA labels"
        }
      ]
    },
    "keyboard": {
      "navigability": 0.91,
      "tabOrder": "correct",
      "focusManagement": "good",
      "shortcuts": "available"
    },
    "inclusiveDesign": {
      "score": 0.78,
      "colorContrast": "pass",
      "textAlternative": "partial",
      "motionSensitivity": "good"
    }
  }
}
```

### Markdown Report

```markdown
## 可访问性评价报告

### 总体评分: 76/100

#### WCAG 2.1 AA 符合度
- 通过率: 89%
- 严重违规: 0
- 重要违规: 2
- 中等违规: 5
- 轻微违规: 8

#### 屏幕阅读器兼容性
- 兼容性评分: 82%
- 测试阅读器: NVDA, VoiceOver
- 发现问题: 1
  - `.nav-menu`: 缺少 ARIA 标签

#### 键盘可导航性
- 可导航性评分: 91%
- Tab 顺序: ✅ 正确
- 焦点管理: ✅ 良好
- 快捷键: ✅ 可用

#### 包容性设计
- 评分: 78%
- 颜色对比度: ✅ 通过
- 文本替代: ⚠️ 部分
- 运动敏感性: ✅ 良好
```

## WCAG Success Criteria

### Level A (Must Support)
- 1.1.1 Non-text Content
- 2.1.1 Keyboard
- 2.2.1 Pause, Stop, Hide
- 3.1.1 Language of Page
- 4.1.1 Parsing

### Level AA (Should Support)
- 1.3.1 Info and Relationships
- 1.4.3 Contrast (Minimum)
- 1.4.4 Resize Text
- 2.4.1 Bypass Blocks
- 3.2.3 Consistent Navigation

### Level AAA (May Support)
- 1.2.6 Sign Language
- 1.4.6 Contrast (Enhanced)
- 2.2.3 No Timing
- 3.1.3 Unusual Words

## Integration Example

### Automated Testing

```typescript
import { test } from '@playwright/test';
import { UXQClient } from '@uxq/cli-client';

test('accessibility compliance', async ({ page }) => {
  const uxq = new UXQClient();
  
  await page.goto('https://example.com');
  
  const audit = await uxq.accessibility.audit({
    url: page.url(),
    standard: 'WCAG21-AA',
  });
  
  // Check for critical violations
  expect(audit.wcagCompliance.violations.critical).toBe(0);
  
  // Check overall compliance
  expect(audit.wcagCompliance.passRate).toBeGreaterThanOrEqual(0.9);
});
```

## Best Practices

1. **测试多种辅助技术**: 不仅测试屏幕阅读器，还要测试键盘导航
2. **覆盖所有页面**: 测试首页、产品页、结账流程等关键页面
3. **使用真实用户**: 邀请残障用户参与测试
4. **持续监控**: 将可访问性检查集成到 CI/CD
5. **优先修复**: 先修复 critical 和 serious 级别的违规

## Related Workflows

- [Task Evaluation](./task-evaluation.md) - 任务完成分析
- [Design System](./design-system.md) - 设计系统一致性
- [Report Generation](./report.md) - 生成评价报告
