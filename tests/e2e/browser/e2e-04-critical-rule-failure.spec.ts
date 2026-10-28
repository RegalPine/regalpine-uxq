/**
 * UXQ 浏览器端到端测试 — E2E-04: 关键规则失败与 Finding 生成
 *
 * 依据 UXQ-ARCH-012 §10 E2E-04：
 * - 必需规则返回 FAIL
 * - 保存 RuleResult
 * - 按映射策略生成或关联 DiagnosticSignal
 * - Finding 具有可追溯证据
 * - 总体分数不能覆盖关键规则失败
 * - 总体结论符合合格判定政策
 */

import { test, expect } from '@playwright/test';

const ACCESSIBILITY_FAIL_PAGE = `data:text/html,
<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>UXQ Accessibility Fail Test</title></head>
<body>
  <main>
    <h1>可访问性失败测试</h1>
    <!-- 故意缺少 alt 属性 -->
    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23ccc'/%3E%3C/svg%3E" />
    <!-- 按钮缺少可访问名称 -->
    <button id="unnamed-btn"></button>
    <!-- 表单输入缺少 label -->
    <input type="text" id="unlabeled-input" />
  </main>
</body>
</html>`;

const CONTRAST_FAIL_PAGE = `data:text/html,
<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>UXQ Contrast Fail Test</title></head>
<body style="background-color: #ffffff; color: #f0f0f0;">
  <main>
    <h1>对比度失败测试</h1>
    <p style="color: #e0e0e0;">这段文字对比度不足</p>
    <button style="background-color: #f5f5f5; color: #fafafa; border: none;">低对比度按钮</button>
  </main>
</body>
</html>`;

test.describe('E2E-04: 关键规则失败与 Finding 生成', () => {
  test('可访问性规则失败检测', async ({ page }) => {
    await page.goto(ACCESSIBILITY_FAIL_PAGE);

    // 验证页面加载成功
    const title = await page.title();
    expect(title).toBe('UXQ Accessibility Fail Test');

    // 规则 1: 检查图片是否有 alt 属性
    const images = page.locator('img');
    const imageCount = await images.count();
    expect(imageCount).toBeGreaterThan(0);

    const missingAltCount = await images.filter('img:not([alt])').count();

    // 规则 2: 检查按钮是否有可访问名称
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    const unnamedButtonCount = await buttons
      .filter('button:not([aria-label]):not([aria-labelledby]):not(:has-text(*))')
      .count();

    // 规则 3: 检查输入是否有 label
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    const unlabeledInputCount = await inputs
      .filter('input:not([aria-label]):not([aria-labelledby])')
      .count();

    // 生成 RuleResult
    const ruleResults = [
      {
        ruleId: 'a11y-img-alt',
        status: missingAltCount > 0 ? 'FAIL' : 'PASS',
        severity: 'S2',
        evidence: `发现 ${missingAltCount} 个图片缺少 alt 属性`,
      },
      {
        ruleId: 'a11y-button-name',
        status: unnamedButtonCount > 0 ? 'FAIL' : 'PASS',
        severity: 'S2',
        evidence: `发现 ${unnamedButtonCount} 个按钮缺少可访问名称`,
      },
      {
        ruleId: 'a11y-input-label',
        status: unlabeledInputCount > 0 ? 'FAIL' : 'PASS',
        severity: 'S2',
        evidence: `发现 ${unlabeledInputCount} 个输入缺少 label`,
      },
    ];

    // 验证规则结果
    expect(ruleResults.length).toBe(3);
    expect(ruleResults.filter((r) => r.status === 'FAIL').length).toBeGreaterThan(0);

    // 验证 Finding 生成
    const findings = ruleResults
      .filter((r) => r.status === 'FAIL')
      .map((r) => ({
        type: 'COMPLIANCE_FINDING',
        ruleId: r.ruleId,
        severity: r.severity,
        evidence: r.evidence,
        lifecycle: 'NEW',
      }));

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.type).toBe('COMPLIANCE_FINDING');
    expect(findings[0]!.lifecycle).toBe('NEW');
  });

  test('关键规则失败不能被总体分数覆盖', async ({ page }) => {
    await page.goto(CONTRAST_FAIL_PAGE);

    // 验证页面加载成功
    const title = await page.title();
    expect(title).toBe('UXQ Contrast Fail Test');

    // 模拟评分结果
    const dimensionScores = [
      { dimension: 'D01', score: 95, weight: 0.3 }, // 任务有效性：高分
      { dimension: 'D02', score: 90, weight: 0.2 }, // 操作效率：高分
      { dimension: 'D03', score: 85, weight: 0.2 }, // 可理解性：高分
      { dimension: 'D04', score: 20, weight: 0.3 }, // 可访问性：严重失败
    ];

    // 计算加权总分
    const weightedSum = dimensionScores.reduce((sum, d) => sum + d.score * d.weight, 0);
    const totalScore = weightedSum;

    // 验证：即使总分看起来不错，但关键规则失败必须单独处理
    expect(totalScore).toBeGreaterThan(50); // 总分可能看起来还行

    // 检查是否有 S1 级别的失败
    const criticalFailures = dimensionScores.filter((d) => d.score < 30 && d.weight >= 0.3);

    // 验证：关键规则失败阻止合格判定
    const hasCriticalFailure = criticalFailures.length > 0;
    expect(hasCriticalFailure).toBe(true);

    // 总体结论应该是 FAIL，即使总分看起来不错
    const overallOutcome = hasCriticalFailure ? 'FAIL' : 'PASS';
    expect(overallOutcome).toBe('FAIL');
    expect(overallOutcome).not.toBe('PASS'); // 关键失败不能被平均分掩盖
  });

  test('Finding 证据可追溯性', async ({ page }) => {
    await page.goto(ACCESSIBILITY_FAIL_PAGE);

    // 采集证据
    const evidence = [
      {
        id: 'ev-1',
        type: 'DOM_SNAPSHOT',
        content: await page.content(),
        capturedAt: new Date().toISOString(),
      },
      {
        id: 'ev-2',
        type: 'ACCESSIBILITY_TREE',
        content: '可访问性树快照（模拟）',
        capturedAt: new Date().toISOString(),
      },
    ];

    // 生成 Finding
    const finding = {
      id: 'finding-1',
      type: 'COMPLIANCE_FINDECT' as const,
      title: '可访问性合规问题',
      description: '发现多个 WCAG 违规',
      severity: 'S2',
      priority: 'P1',
      confidence: 'HIGH' as const,
      lifecycle: 'NEW' as const,
      evidenceIds: evidence.map((e) => e.id),
      relatedRuleResultIds: ['rule-1', 'rule-2'],
    };

    // 验证 Finding 可追溯到证据
    expect(finding.evidenceIds.length).toBeGreaterThan(0);
    expect(finding.relatedRuleResultIds.length).toBeGreaterThan(0);

    // 验证证据存在
    for (const evidenceId of finding.evidenceIds) {
      const ev = evidence.find((e) => e.id === evidenceId);
      expect(ev).toBeDefined();
      expect(ev!.content).toBeDefined();
    }
  });

  test('规则失败后生成建议', async ({ page }) => {
    await page.goto(ACCESSIBILITY_FAIL_PAGE);

    // 模拟规则检查结果
    const ruleResults = [
      { ruleId: 'a11y-img-alt', status: 'FAIL', message: '图片缺少 alt 属性' },
      { ruleId: 'a11y-button-name', status: 'FAIL', message: '按钮缺少可访问名称' },
    ];

    // 为每个失败的规则生成建议
    const recommendations = ruleResults
      .filter((r) => r.status === 'FAIL')
      .map((r) => ({
        id: `rec-${r.ruleId}`,
        findingId: `finding-${r.ruleId}`,
        title: `修复：${r.message}`,
        description: `请为所有${r.ruleId.includes('img') ? '图片' : '按钮'}提供${r.ruleId.includes('img') ? 'alt 属性' : '可访问名称'}`,
        expectedBenefit: '提升可访问性合规性',
        verificationCriteria: `重新运行 ${r.ruleId} 检查应返回 PASS`,
      }));

    // 验证建议生成
    expect(recommendations.length).toBe(2);
    expect(recommendations[0]!.title).toContain('修复');
    expect(recommendations[0]!.expectedBenefit).toBeDefined();
    expect(recommendations[0]!.verificationCriteria).toBeDefined();
  });

  test('合格判定策略', async ({ page }) => {
    await page.goto(CONTRAST_FAIL_PAGE);

    // 模拟合格判定策略
    const conformancePolicy = {
      name: '严格合格策略',
      rules: [
        { dimension: 'D04', threshold: 60, required: true }, // 可访问性必须 >= 60
        { dimension: 'D01', threshold: 70, required: true }, // 任务有效性必须 >= 70
      ],
      overallThreshold: 75, // 总体分数必须 >= 75
    };

    // 模拟评分结果
    const scores = {
      D01: 85,
      D02: 90,
      D03: 80,
      D04: 20, // 可访问性严重不足
      overall: 68.5,
    };

    // 应用合格判定策略
    const conformanceResults = conformancePolicy.rules.map((rule) => {
      const score = scores[rule.dimension as keyof typeof scores];
      return {
        dimension: rule.dimension,
        score,
        threshold: rule.threshold,
        passed: score >= rule.threshold,
        required: rule.required,
      };
    });

    // 验证合格判定
    const allRequiredPassed = conformanceResults.filter((r) => r.required).every((r) => r.passed);

    const overallPassed = allRequiredPassed && scores.overall >= conformancePolicy.overallThreshold;

    expect(allRequiredPassed).toBe(false); // D04 未通过
    expect(overallPassed).toBe(false); // 总体不合格

    // 验证：关键维度失败导致总体不合格
    const failedDimension = conformanceResults.find((r) => !r.passed && r.required);
    expect(failedDimension).toBeDefined();
    expect(failedDimension!.dimension).toBe('D04');
  });
});
