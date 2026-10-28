# Regression Testing Workflow

## Purpose

Use for comparing current UX against baselines and detecting regressions.

## When to Use

- Creating baselines before releases
- Comparing current version against baseline
- Detecting UX regressions
- Tracking UX improvements over time

## Commands

### Create Baseline

```bash
uxq regression baseline --run-id <id> --label <version-label>
```

**Parameters:**
- `--run-id`: Evaluation run ID to use as baseline
- `--label**: Version label (e.g., "v1.0", "production-baseline")
- `--description**: Baseline description
- `--snapshot**: Include full data snapshot (default: true)

**Example:**
```bash
uxq regression baseline \
  --run-id latest \
  --label "v2.0-baseline" \
  --description "Release 2.0 production baseline"
```

### Compare Runs

```bash
uxq regression compare --baseline <id> --current <id>
```

**Parameters:**
- `--baseline`: Baseline run ID or label
- `--current**: Current run ID
- `--metrics**: Metrics to compare (all,task,cognition,a11y,color,geometry)

**Example:**
```bash
uxq regression compare \
  --baseline "v2.0-baseline" \
  --current latest
```

### Detect Regressions

```bash
uxq regression detect --comparison <id> --thresholds <threshold-config>
```

**Parameters:**
- `--comparison**: Comparison ID from `compare` command
- `--thresholds**: Threshold config (format: score:-5,metrics:+10%)
- `--severity**: Minimum severity to report (critical,high,moderate,low)

**Example:**
```bash
uxq regression detect \
  --comparison latest \
  --thresholds score:-5,task:-10%,a11y:-5%
```

## Outputs

### JSON Output

```json
{
  "regression": {
    "baseline": {
      "id": "run-2026-10-01",
      "label": "v2.0-baseline",
      "timestamp": "2026-10-01T10:00:00Z",
      "overallScore": 78
    },
    "current": {
      "id": "run-2026-10-28",
      "label": "latest",
      "timestamp": "2026-10-28T10:00:00Z",
      "overallScore": 75
    },
    "comparison": {
      "overallScore": {
        "baseline": 78,
        "current": 75,
        "change": -3,
        "percentChange": -3.85,
        "status": "warning"
      },
      "dimensions": {
        "task": {
          "baseline": 85,
          "current": 88,
          "change": +3,
          "percentChange": +3.53,
          "status": "improved"
        },
        "cognition": {
          "baseline": 72,
          "current": 68,
          "change": -4,
          "percentChange": -5.56,
          "status": "regression"
        },
        "accessibility": {
          "baseline": 76,
          "current": 74,
          "change": -2,
          "percentChange": -2.63,
          "status": "warning"
        }
      }
    },
    "regressions": [
      {
        "id": "reg-001",
        "severity": "high",
        "dimension": "cognition",
        "metric": "nasaTlxScore",
        "baseline": 33.6,
        "current": 38.2,
        "change": +4.6,
        "percentChange": +13.69,
        "description": "认知负担显著增加",
        "possibleCauses": [
          "新增的表单字段增加了复杂性",
          "页面布局变化导致信息查找困难"
        ],
        "recommendations": [
          "简化新增表单字段",
          "优化页面布局",
          "进行用户测试验证改进效果"
        ]
      }
    ],
    "improvements": [
      {
        "id": "imp-001",
        "dimension": "task",
        "metric": "completionRate",
        "baseline": 0.92,
        "current": 0.95,
        "change": +0.03,
        "percentChange": +3.26,
        "description": "任务完成率提升"
      }
    ],
    "alerts": [
      {
        "level": "warning",
        "message": "总体 UX 评分下降 3 分，接近阈值 -5",
        "action": "建议在发布前进行优化"
      }
    ]
  }
}
```

### Markdown Report

```markdown
## 回归测试报告

### 对比概览

| 项目 | 基线 (v2.0) | 当前 (latest) | 变化 |
|------|-----------|-------------|------|
| **总体评分** | 78 | 75 | -3 ⚠️ |
| **任务完成** | 85 | 88 | +3 ✅ |
| **认知负担** | 72 | 68 | -4 🔴 |
| **可访问性** | 76 | 74 | -2 ⚠️ |

### 回归警报

🔴 **高严重性回归**: 认知负担

**指标**: NASA-TLX 评分
**基线**: 33.6
**当前**: 38.2
**变化**: +4.6 (+13.69%)

**描述**: 认知负担显著增加

**可能原因**:
1. 新增的表单字段增加了复杂性
2. 页面布局变化导致信息查找困难

**建议**:
1. 简化新增表单字段
2. 优化页面布局
3. 进行用户测试验证改进效果

---

### 改进亮点

✅ **任务完成率提升**

**指标**: 完成率
**基线**: 92%
**当前**: 95%
**变化**: +3% (+3.26%)

**说明**: 用户任务完成率有所提升，表明核心流程优化有效

---

### 建议行动

#### 发布前必须处理
- [ ] 调查认知负担增加的原因
- [ ] 优化复杂表单
- [ ] 重新测试并验证改进

#### 发布后持续监控
- [ ] 跟踪认知负担指标趋势
- [ ] 收集用户反馈
- [ ] 持续优化页面布局

#### 质量门禁判断
**状态**: ⚠️ 警告
**决策**: 建议优化后发布
**理由**: 总体评分下降 3 分，接近阈值 -5；认知负担显著增加
```

## Regression Detection

### Threshold Configuration

Thresholds define when a change is considered a regression:

```json
{
  "score": -5,        // Overall score decrease > 5 points
  "task": -10%,       // Task metrics decrease > 10%
  "cognition": -5%,   // Cognition metrics decrease > 5%
  "accessibility": -5% // Accessibility metrics decrease > 5%
}
```

### Severity Levels

- **Critical**: Score decrease > 10 points or metric decrease > 20%
- **High**: Score decrease > 5 points or metric decrease > 10%
- **Moderate**: Score decrease > 2 points or metric decrease > 5%
- **Low**: Score decrease > 0 points or metric decrease > 0%

### Statistical Significance

Changes are assessed for statistical significance using:

1. **Sample Size**: Minimum 5 evaluation runs
2. **Confidence Interval**: 95% confidence level
3. **Effect Size**: Cohen's d for practical significance

## Integration Example

### CI/CD Regression Check

```yaml
# .github/workflows/ux-regression.yml
name: UX Regression Check

on:
  pull_request:
    branches: [main]

jobs:
  regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run UX Evaluation
        run: |
          uxq task evaluate --url ${{ env.PREVIEW_URL }} --task smoke-test
          uxq scoring compute --run-id latest
      
      - name: Compare with Baseline
        run: |
          uxq regression compare \
            --baseline main \
            --current pr-${{ github.event.pull_request.number }}
      
      - name: Detect Regressions
        run: |
          RESULT=$(uxq regression detect \
            --comparison latest \
            --thresholds score:-5,metrics:-10% \
            --format json)
          
          REGRESSIONS=$(echo $RESULT | jq '.regressions | length')
          if [ $REGRESSIONS -gt 0 ]; then
            echo "❌ Detected $REGRESSIONS regressions"
            echo "$RESULT" | jq '.regressions'
            exit 1
          fi
          
          echo "✅ No regressions detected"
```

### Automated Baseline Update

```typescript
import { UXQClient } from '@uxq/cli-client';

const uxq = new UXQClient();

// After successful release
if (release.successful) {
  // Create new baseline
  await uxq.regression.baseline({
    runId: 'latest',
    label: `v${release.version}`,
    description: `${release.version} production baseline`,
  });
  
  console.log(`Baseline created for v${release.version}`);
}
```

## Best Practices

1. **建立稳定基线**: 在每次重大发布前创建基线
2. **设置合理阈值**: 根据产品阶段调整阈值
3. **自动化检查**: 在 CI/CD 中集成回归检测
4. **分析根因**: 对每个回归进行根因分析
5. **跟踪趋势**: 定期回顾 UX 指标趋势
6. **及时更新基线**: 重大改进后更新基线

## Related Workflows

- [Metrics & Scoring](./metrics-scoring.md) - 评分计算
- [Diagnostic](./diagnostic.md) - 问题诊断
- [Report Generation](./report.md) - 生成报告
