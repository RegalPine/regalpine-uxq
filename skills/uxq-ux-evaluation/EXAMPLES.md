# UXQ Agent Skill 使用示例

本文档提供 UXQ UX Evaluation Skill 的实际使用示例。

---

## 示例 1：完整的用户体验评价

### 场景

对一个电商结账流程进行全面的 UX 评价。

### 工作流

```bash
# 1. 定义任务并执行评价
uxq task evaluate \
  --url "https://shop.example.com/checkout" \
  --task "完成购买流程：添加商品 → 填写地址 → 支付"

# 2. 测量认知负担
uxq cognition measure \
  --url "https://shop.example.com/checkout" \
  --methods nasa-tlx,secondary-task

# 3. 检查可访问性
uxq accessibility audit \
  --url "https://shop.example.com/checkout" \
  --standard WCAG21-AA

# 4. 计算综合评分
uxq scoring compute \
  --run-id latest \
  --weights task:0.4,cognition:0.3,a11y:0.3

# 5. 生成报告
uxq report generate \
  --run-id latest \
  --format markdown \
  --output docs/checkout-ux-report.md
```

### 预期输出

```json
{
  "runId": "ux-eval-2026-10-28-001",
  "overallScore": 78,
  "dimensions": {
    "taskCompletion": {
      "score": 85,
      "completionRate": 0.92,
      "avgTimeOnTask": 145,
      "errorRate": 0.08
    },
    "cognitiveLoad": {
      "score": 72,
      "nasaTlx": {
        "mentalDemand": 6.5,
        "physicalDemand": 3.2,
        "temporalDemand": 5.8,
        "performance": 7.1,
        "effort": 6.8,
        "frustration": 4.2
      }
    },
    "accessibility": {
      "score": 76,
      "wcagCompliance": 0.89,
      "violations": {
        "critical": 0,
        "serious": 2,
        "moderate": 5
      }
    }
  },
  "recommendations": [
    {
      "priority": "high",
      "category": "cognitive-load",
      "description": "简化支付表单字段，减少认知负担",
      "expectedImpact": "+12 points"
    }
  ]
}
```

---

## 示例 2：设计迭代前后的回归测试

### 场景

比较结账流程 redesign 前后的 UX 变化。

### 工作流

```bash
# 1. 建立基线（redesign 前）
uxq regression baseline \
  --run-id pre-redesign \
  --label "v1.0-baseline"

# 2. 执行新版本评价
uxq task evaluate \
  --url "https://shop.example.com/checkout-v2" \
  --task "完成购买流程"

# 3. 对比分析
uxq regression compare \
  --baseline pre-redesign \
  --current latest

# 4. 检测回归
uxq regression detect \
  --comparison latest \
  --thresholds score:-5,metrics:+10%
```

### 预期输出

```markdown
## 回归测试报告

### 总体变化

- UX 评分：78 → 85 (+7 ✅)
- 任务完成率：92% → 95% (+3% ✅)
- 平均任务时间：145s → 120s (-25s ✅)

### 维度对比

| 维度     | 基线 | 当前 | 变化  |
| -------- | ---- | ---- | ----- |
| 任务完成 | 85   | 90   | +5 ✅ |
| 认知负担 | 72   | 80   | +8 ✅ |
| 可访问性 | 76   | 75   | -1 ⚠️ |

### 回归警报

⚠️ 可访问性轻微下降（-1 分）

- 新增问题：焦点指示器对比度不足

### 改进亮点

✅ 表单步骤从 5 步减少到 3 步
✅ 认知负担显著降低
✅ 用户满意度提升 15%
```

---

## 示例 3：与 Playwright MCP 集成

### 场景

在浏览器自动化测试中集成 UXQ 评价。

### 工作流

```typescript
import { test, expect } from '@playwright/test';
import { UXQClient } from '@uxq/cli-client';

test('结账流程 UX 评价', async ({ page }) => {
  const uxq = new UXQClient();

  // 1. 导航到目标页面
  await page.goto('https://shop.example.com/checkout');

  // 2. 启动 UXQ 评价
  const run = await uxq.startEvaluation({
    url: page.url(),
    scope: 'task-focused',
    taskDefinition: {
      name: '完成购买',
      steps: ['添加商品', '填写地址', '支付'],
    },
  });

  // 3. 执行用户任务
  await page.click('[data-testid="add-to-cart"]');
  await page.fill('[name="address"]', '测试地址');
  await page.click('[data-testid="submit-order"]');

  // 4. 等待任务完成
  await page.waitForSelector('[data-testid="success"]');

  // 5. 收集证据
  const screenshot = await page.screenshot();
  await uxq.collectEvidence({
    runId: run.id,
    type: 'screenshot',
    data: screenshot,
    metadata: { timestamp: new Date().toISOString() },
  });

  // 6. 结束评价并获取结果
  const result = await uxq.completeEvaluation(run.id);

  // 7. 断言 UX 指标
  expect(result.taskCompletion.score).toBeGreaterThanOrEqual(80);
  expect(result.cognitiveLoad.score).toBeGreaterThanOrEqual(70);
});
```

---

## 示例 4：用户研究数据整合

### 场景

将用户访谈和可用性测试数据整合到 UXQ 评价中。

### 工作流

```bash
# 1. 导入用户研究数据
uxq research import \
  --source data/usability-test.csv \
  --format csv

# 2. 编码定性数据
uxq research code \
  --data data/usability-test.csv \
  --method thematic \
  --codes "frustration,confusion,delight,efficiency"

# 3. 关联量化评价
uxq research link \
  --study usability-test \
  --evaluation-run latest

# 4. 综合合成
uxq research synthesize \
  --studies usability-test,survey,interviews \
  --output docs/research-synthesis.md
```

### 预期输出

```markdown
# 用户研究综合报告

## 量化发现

- 任务完成率：92%
- 平均任务时间：145 秒
- 用户满意度：4.2/5

## 定性主题

### 主题 1：支付流程复杂

- 提及频率：8/10 用户
- 情感倾向：负面
- 关联指标：认知负担 +15%

### 主题 2：表单字段过多

- 提及频率：6/10 用户
- 情感倾向：负面
- 关联指标：任务时间 +20s

### 主题 3：进度指示清晰

- 提及频率：7/10 用户
- 情感倾向：正面
- 关联指标：认知负担 -10%

## 改进建议

1. [高优先级] 简化支付表单，减少必填字段
2. [中优先级] 提供地址自动填充
3. [低优先级] 增加表单帮助提示
```

---

## 示例 5：CI/CD 集成

### 场景

在 GitHub Actions 中自动化 UX 质量门禁。

### 工作流

```yaml
# .github/workflows/ux-quality.yml
name: UX Quality Gate

on:
  pull_request:
    branches: [main]

jobs:
  ux-evaluation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup UXQ
        run: pnpm install

      - name: Start Preview Server
        run: pnpm preview &

      - name: Run UX Evaluation
        run: |
          uxq task evaluate \
            --url http://localhost:3000 \
            --task "核心用户旅程"

      - name: Check Quality Gate
        run: |
          SCORE=$(uxq scoring compute --run-id latest --format json | jq '.overallScore')
          if [ $SCORE -lt 80 ]; then
            echo "❌ UX 评分 $SCORE 低于阈值 80"
            exit 1
          fi
          echo "✅ UX 评分 $SCORE 通过门禁"

      - name: Detect Regressions
        run: |
          uxq regression compare \
            --baseline main \
            --current pr-${{ github.event.pull_request.number }}

          REGRESSIONS=$(uxq regression detect --thresholds score:-5 --format json | jq '.regressions | length')
          if [ $REGRESSIONS -gt 0 ]; then
            echo "⚠️ 检测到 $REGRESSIONS 个回归"
            exit 1
          fi

      - name: Upload Report
        if: always()
        run: |
          uxq report generate \
            --run-id latest \
            --format markdown \
            --output ux-report.md

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ux-report
          path: ux-report.md
```

---

## 示例 6：多主题设计系统评价

### 场景

评价 Light/Dark 主题下的设计系统一致性。

### 工作流

```bash
# 1. 评价 Light 主题
uxq design-system theme \
  --url "https://app.example.com" \
  --theme light \
  --spec tokens/design-tokens.json

# 2. 评价 Dark 主题
uxq design-system theme \
  --url "https://app.example.com" \
  --theme dark \
  --spec tokens/design-tokens.json

# 3. 对比主题一致性
uxq design-system compare \
  --themes light,dark \
  --metrics token-usage,color-consistency,spacing

# 4. 生成设计系统报告
uxq report generate \
  --run-id latest \
  --section design-system \
  --output docs/design-system-audit.md
```

### 预期输出

```json
{
  "designSystemScore": 88,
  "themes": {
    "light": {
      "tokenConformance": 92,
      "colorConsistency": 95,
      "spacingAdherence": 88
    },
    "dark": {
      "tokenConformance": 89,
      "colorConsistency": 91,
      "spacingAdherence": 85
    }
  },
  "violations": [
    {
      "type": "token-mismatch",
      "severity": "moderate",
      "description": "Dark 主题中 3 处使用了硬编码颜色值",
      "locations": [".card-header", ".button-secondary", ".text-muted"]
    }
  ],
  "recommendations": [
    "统一 Dark 主题的颜色 Token 使用",
    "增加主题切换的过渡动画",
    "优化 Dark 主题下的对比度"
  ]
}
```

---

## 最佳实践总结

### 1. 任务定义要具体

❌ **不推荐**：

```bash
uxq task evaluate --url "https://example.com" --task "浏览网站"
```

✅ **推荐**：

```bash
uxq task evaluate \
  --url "https://example.com/products" \
  --task "搜索商品 → 查看详情 → 加入购物车 → 完成结账"
```

### 2. 多维度评价

❌ **不推荐**：只评价任务完成

```bash
uxq task evaluate --url <url> --task <task>
```

✅ **推荐**：综合任务、认知、可访问性

```bash
uxq task evaluate --url <url> --task <task>
uxq cognition measure --url <url>
uxq accessibility audit --url <url>
uxq scoring compute --weights task:0.4,cognition:0.3,a11y:0.3
```

### 3. 建立基线并持续监控

```bash
# 首次评价后建立基线
uxq regression baseline --run-id v1.0 --label "production-baseline"

# 每次迭代后对比
uxq regression compare --baseline v1.0 --current latest
```

### 4. 整合定量与定性数据

```bash
# 量化评价
uxq task evaluate --url <url> --task <task>

# 定性研究
uxq research import --source user-interviews.csv
uxq research synthesize --studies interviews,evaluation
```

### 5. 自动化质量门禁

在 CI/CD 中设置 UX 评分阈值，防止质量退化。

---

## 常见问题

### Q: 如何自定义评分权重？

A: 使用 `--weights` 参数：

```bash
uxq scoring compute \
  --weights task:0.5,cognition:0.3,a11y:0.2
```

### Q: 如何导出原始数据？

A: 使用 `--format json` 或 `--format csv`：

```bash
uxq report export --run-id latest --format json --output raw-data.json
```

### Q: 如何只评价特定维度？

A: 使用对应的专用命令：

```bash
# 只评价认知负担
uxq cognition measure --url <url>

# 只评价可访问性
uxq accessibility audit --url <url>
```

### Q: 如何处理需要登录的页面？

A: 使用 Playwright MCP 先完成登录，再传递 storageState：

```typescript
const storageState = await page.context().storageState();
await uxq.evaluate({ url, storageState });
```
