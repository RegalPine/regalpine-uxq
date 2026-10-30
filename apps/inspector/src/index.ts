#!/usr/bin/env node
/**
 * UXQ Inspector - 交互式评价结果查看器
 *
 * 提供可视化浏览评价结果、Finding、证据和回归对比的功能。
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { EvaluationResult, Finding, Evidence, ScoreResult } from '@uxq/contracts';
import { dimensionName } from '@uxq/contracts';

const program = new Command();

program.name('uxq-inspector').description('交互式 UXQ 评价结果查看器').version('0.1.0');

/**
 * 加载评价结果
 */
function loadEvaluationResult(filePath: string): EvaluationResult {
  if (!existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as EvaluationResult;
}

/**
 * 显示总体评价概览
 */
function displayOverview(result: EvaluationResult): void {
  console.log('\n' + chalk.bold.cyan('═══════════════════════════════════════════'));
  console.log(chalk.bold.cyan('  UXQ 评价结果概览'));
  console.log(chalk.bold.cyan('═══════════════════════════════════════════\n'));

  console.log(chalk.bold('运行标识:'), result.runId);
  console.log(chalk.bold('评价状态:'), formatEvaluationStatus(result.evaluationStatus));
  console.log(chalk.bold('总体结论:'), formatOverallOutcome(result.overallOutcome));
  console.log(chalk.bold('创建时间:'), result.createdAt);

  if (result.coverage) {
    console.log(chalk.bold('\n覆盖率:'));
    console.log(`  计划评价: ${result.coverage.planned}`);
    console.log(`  适用: ${result.coverage.applicable}`);
    console.log(`  已测量: ${result.coverage.measured}`);
    console.log(`  已评分: ${result.coverage.scored}`);
    console.log(
      `  覆盖率: ${result.coverage.ratio !== null ? `${(result.coverage.ratio * 100).toFixed(1)}%` : 'N/A'}`,
    );
  }

  console.log(chalk.bold('\n统计:'));
  console.log(`  评分结果: ${result.scoreResultIds?.length ?? 0} 个`);
  console.log(`  发现问题: ${result.findingIds?.length ?? 0} 个`);

  if (result.limitations && result.limitations.length > 0) {
    console.log(chalk.bold.yellow('\n⚠️  评价限制:'));
    for (const limitation of result.limitations) {
      console.log(`  - ${limitation}`);
    }
  }
}

/**
 * 格式化评价状态
 */
function formatEvaluationStatus(status: string): string {
  const statusMap: Record<string, string> = {
    COMPLETE: chalk.green('✓ 完整'),
    PARTIAL: chalk.yellow('⚠ 部分'),
    INSUFFICIENT_EVIDENCE: chalk.red('✗ 证据不足'),
    CONSTRAINED: chalk.yellow('⚠ 受限'),
    EXECUTION_FAILED: chalk.red('✗ 执行失败'),
  };
  return statusMap[status] ?? status;
}

/**
 * 格式化总体结论
 */
function formatOverallOutcome(outcome: string): string {
  const outcomeMap: Record<string, string> = {
    PASS: chalk.green('✓ 合格'),
    FAIL: chalk.red('✗ 不合格'),
    INCONCLUSIVE: chalk.yellow('? 不确定'),
    NOT_RATED: chalk.gray('- 未评级'),
  };
  return outcomeMap[outcome] ?? outcome;
}

/**
 * 显示维度评分详情
 */
function displayDimensionScores(result: EvaluationResult, scores: ScoreResult[]): void {
  console.log('\n' + chalk.bold.cyan('═══════════════════════════════════════════'));
  console.log(chalk.bold.cyan('  维度评分详情'));
  console.log(chalk.bold.cyan('═══════════════════════════════════════════\n'));

  if (scores.length === 0) {
    console.log(chalk.yellow('暂无评分数据'));
    return;
  }

  for (const score of scores) {
    const dimensionName = getDimensionName(score.metricId);
    const scoreValue = score.status === 'SCORED' ? score.value : null;
    const scoreColor = scoreValue !== null ? getScoreColor(scoreValue) : (text: string) => text;

    console.log(chalk.bold(`${dimensionName}:`));
    if (scoreValue !== null) {
      console.log(`  分数: ${scoreColor(scoreValue.toFixed(2))}`);
    } else {
      console.log(`  状态: ${chalk.gray('未评分')}`);
    }
    console.log(`  权重: ${score.weight}`);
    console.log(`  状态: ${formatScoreStatus(score.status)}`);
    console.log();
  }
}

/**
 * 获取维度名称
 */
function getDimensionName(dimensionId: string): string {
  return dimensionName(dimensionId);
}

/**
 * 根据分数返回颜色
 */
function getScoreColor(score: number): (text: string) => string {
  if (score >= 80) return chalk.green;
  if (score >= 60) return chalk.yellow;
  return chalk.red;
}

/**
 * 格式化评分状态
 */
function formatScoreStatus(status: string): string {
  const statusMap: Record<string, string> = {
    SCORED: chalk.green('✓ 已评分'),
    NOT_SCORED: chalk.gray('- 未评分'),
    INSUFFICIENT_INPUTS: chalk.yellow('⚠ 输入不足'),
    CALCULATION_FAILED: chalk.red('✗ 计算失败'),
  };
  return statusMap[status] ?? status;
}

/**
 * 显示 Finding 列表
 */
function displayFindings(result: EvaluationResult, findings: Finding[]): void {
  console.log('\n' + chalk.bold.cyan('═══════════════════════════════════════════'));
  console.log(chalk.bold.cyan('  发现的问题'));
  console.log(chalk.bold.cyan('═══════════════════════════════════════════\n'));

  if (findings.length === 0) {
    console.log(chalk.green('✓ 未发现问题'));
    return;
  }

  // 按严重程度分组
  const grouped = groupFindingsBySeverity(findings);

  for (const [severity, items] of Object.entries(grouped)) {
    console.log(chalk.bold(`${formatSeverity(severity)} (${items.length} 个)`));
    for (const finding of items) {
      console.log(`  [${finding.id}] ${finding.title}`);
      console.log(`    类型: ${formatFindingType(finding.type)}`);
      console.log(`    状态: ${formatLifecycle(finding.lifecycle)}`);
      console.log(`    置信度: ${finding.confidence}`);
      console.log(`    关联证据: ${finding.evidenceLinks?.length ?? 0} 个`);
      console.log();
    }
  }
}

/**
 * 按严重程度分组 Finding
 */
function groupFindingsBySeverity(findings: Finding[]): Record<string, Finding[]> {
  const grouped: Record<string, Finding[]> = {};
  for (const finding of findings) {
    const severity = finding.severity ?? 'UNKNOWN';
    if (!grouped[severity]) {
      grouped[severity] = [];
    }
    grouped[severity].push(finding);
  }
  return grouped;
}

/**
 * 格式化严重程度
 */
function formatSeverity(severity: string): string {
  const severityMap: Record<string, string> = {
    S1: chalk.red('🔴 S1 - 严重'),
    S2: chalk.yellow('🟡 S2 - 重要'),
    S3: chalk.blue('🔵 S3 - 一般'),
    S4: chalk.gray('⚪ S4 - 轻微'),
  };
  return severityMap[severity] ?? severity;
}

/**
 * 格式化 Finding 类型
 */
function formatFindingType(type: string): string {
  const typeMap: Record<string, string> = {
    CONFIRMED_DEFECT: '确认缺陷',
    POTENTIAL_DEFECT: '潜在缺陷',
    USABILITY_OBSERVATION: '可用性观察',
    DESIGN_INCONSISTENCY: '设计不一致',
    COMPLIANCE_FINDING: '合规发现',
    IMPROVEMENT_OPPORTUNITY: '改进机会',
    INSUFFICIENT_EVIDENCE: '证据不足',
  };
  return typeMap[type] ?? type;
}

/**
 * 格式化生命周期
 */
function formatLifecycle(lifecycle: string): string {
  const lifecycleMap: Record<string, string> = {
    NEW: chalk.blue('新建'),
    TRIAGED: chalk.cyan('已分类'),
    INVESTIGATING: chalk.yellow('调查中'),
    CONFIRMED: chalk.green('已确认'),
    ACCEPTED: chalk.green('已接受'),
    PLANNED: chalk.cyan('已计划'),
    IN_PROGRESS: chalk.yellow('处理中'),
    FIXED: chalk.green('已修复'),
    VERIFIED: chalk.green('✓ 已验证'),
    REOPENED: chalk.red('重新打开'),
    WONT_FIX: chalk.gray('不修复'),
    INVALID: chalk.red('无效'),
    CLOSED: chalk.gray('已关闭'),
  };
  return lifecycleMap[lifecycle] ?? lifecycle;
}

/**
 * 显示 Finding 详情
 */
function displayFindingDetail(finding: Finding, evidences: Evidence[]): void {
  console.log('\n' + chalk.bold.cyan('═══════════════════════════════════════════'));
  console.log(chalk.bold.cyan(`  Finding: ${finding.title}`));
  console.log(chalk.bold.cyan('═══════════════════════════════════════════\n'));

  console.log(chalk.bold('标识:'), finding.id);
  console.log(chalk.bold('类型:'), formatFindingType(finding.type));
  console.log(chalk.bold('严重程度:'), formatSeverity(finding.severity ?? 'UNKNOWN'));
  console.log(chalk.bold('优先级:'), finding.priority ?? 'N/A');
  console.log(chalk.bold('状态:'), formatLifecycle(finding.lifecycle));
  console.log(chalk.bold('置信度:'), finding.confidence ?? 'N/A');

  console.log(chalk.bold('\n描述:'));
  console.log(finding.description);

  if (finding.evidenceLinks && finding.evidenceLinks.length > 0) {
    console.log(chalk.bold('\n关联证据:'));
    for (const link of finding.evidenceLinks) {
      const evidence = evidences.find((e) => e.id === link.evidenceId);
      if (evidence) {
        console.log(`  - [${evidence.id}] ${evidence.materialType}`);
        console.log(`    采集时间: ${evidence.observedAt}`);
        console.log(`    有效性: ${evidence.validity}`);
      }
    }
  }

  if (finding.diagnosticSignalIds && finding.diagnosticSignalIds.length > 0) {
    console.log(chalk.bold('\n关联诊断信号:'));
    for (const signalId of finding.diagnosticSignalIds) {
      console.log(`  - ${signalId}`);
    }
  }
}

/**
 * 主菜单
 */
async function mainMenu(resultPath: string): Promise<void> {
  const result = loadEvaluationResult(resultPath);

  // 加载关联数据（如果存在）
  const scores: ScoreResult[] = [];
  const findings: Finding[] = [];
  const evidences: Evidence[] = [];

  // TODO: 从实际存储中加载这些数据

  while (true) {
    displayOverview(result);

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '请选择操作:',
        choices: [
          { name: '📊 查看维度评分', value: 'scores' },
          { name: '🔍 查看发现的问题', value: 'findings' },
          { name: '📋 查看详细 Finding', value: 'finding-detail' },
          { name: '🔗 查看证据', value: 'evidence' },
          { name: '📈 回归对比', value: 'regression' },
          { name: '❌ 退出', value: 'exit' },
        ],
      },
    ]);

    switch (action) {
      case 'scores':
        displayDimensionScores(result, scores);
        await inquirer.prompt([{ type: 'input', message: '按回车继续...' }]);
        break;

      case 'findings':
        displayFindings(result, findings);
        await inquirer.prompt([{ type: 'input', message: '按回车继续...' }]);
        break;

      case 'finding-detail': {
        if (findings.length === 0) {
          console.log(chalk.yellow('\n暂无 Finding 数据'));
          await inquirer.prompt([{ type: 'input', message: '按回车继续...' }]);
          break;
        }
        const { findingId } = await inquirer.prompt([
          {
            type: 'list',
            name: 'findingId',
            message: '选择 Finding:',
            choices: findings.map((f) => ({ name: `${f.id}: ${f.title}`, value: f.id })),
          },
        ]);
        const finding = findings.find((f) => f.id === findingId);
        if (finding) {
          displayFindingDetail(finding, evidences);
          await inquirer.prompt([{ type: 'input', message: '按回车继续...' }]);
        }
        break;
      }

      case 'evidence':
        console.log('\n' + chalk.bold.cyan('═══════════════════════════════════════════'));
        console.log(chalk.bold.cyan('  证据列表'));
        console.log(chalk.bold.cyan('═══════════════════════════════════════════\n'));
        if (evidences.length === 0) {
          console.log(chalk.yellow('暂无证据数据'));
        } else {
          for (const evidence of evidences) {
            console.log(`[${evidence.id}] ${evidence.materialType}`);
            console.log(`  采集时间: ${evidence.observedAt}`);
            console.log(`  有效性: ${evidence.validity}`);
            console.log();
          }
        }
        await inquirer.prompt([{ type: 'input', message: '按回车继续...' }]);
        break;

      case 'regression':
        console.log('\n' + chalk.bold.cyan('═══════════════════════════════════════════'));
        console.log(chalk.bold.cyan('  回归对比'));
        console.log(chalk.bold.cyan('═══════════════════════════════════════════\n'));
        console.log(chalk.yellow('功能开发中...'));
        await inquirer.prompt([{ type: 'input', message: '按回车继续...' }]);
        break;

      case 'exit':
        console.log(chalk.green('\n再见！\n'));
        return;
    }
  }
}

/**
 * inspect 命令 - 交互式查看评价结果
 */
program
  .command('inspect <result-file>')
  .description('交互式查看评价结果')
  .action(async (resultFile: string) => {
    try {
      await mainMenu(resultFile);
    } catch (error) {
      console.error(chalk.red('错误:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * overview 命令 - 快速查看评价概览
 */
program
  .command('overview <result-file>')
  .description('快速查看评价结果概览')
  .action((resultFile: string) => {
    try {
      const result = loadEvaluationResult(resultFile);
      displayOverview(result);
    } catch (error) {
      console.error(chalk.red('错误:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * findings 命令 - 列出所有 Finding
 */
program
  .command('findings <result-file>')
  .description('列出评价结果中的所有 Finding')
  .action((resultFile: string) => {
    try {
      const result = loadEvaluationResult(resultFile);
      // TODO: 加载 Finding 数据
      console.log(chalk.yellow('功能开发中...'));
    } catch (error) {
      console.error(chalk.red('错误:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * compare 命令 - 对比两个评价结果
 */
program
  .command('compare <baseline-file> <current-file>')
  .description('对比基线和当前评价结果')
  .action((baselineFile: string, currentFile: string) => {
    try {
      const baseline = loadEvaluationResult(baselineFile);
      const current = loadEvaluationResult(currentFile);

      console.log('\n' + chalk.bold.cyan('═══════════════════════════════════════════'));
      console.log(chalk.bold.cyan('  评价结果对比'));
      console.log(chalk.bold.cyan('═══════════════════════════════════════════\n'));

      console.log(chalk.bold('基线版本:'), baseline.runId);
      console.log(chalk.bold('当前版本:'), current.runId);
      console.log();

      console.log(chalk.bold('评价状态:'));
      console.log(`  基线: ${formatEvaluationStatus(baseline.evaluationStatus)}`);
      console.log(`  当前: ${formatEvaluationStatus(current.evaluationStatus)}`);
      console.log();

      console.log(chalk.bold('总体结论:'));
      console.log(`  基线: ${formatOverallOutcome(baseline.overallOutcome)}`);
      console.log(`  当前: ${formatOverallOutcome(current.overallOutcome)}`);
      console.log();

      console.log(chalk.bold('Finding 数量:'));
      console.log(`  基线: ${baseline.findingIds?.length ?? 0} 个`);
      console.log(`  当前: ${current.findingIds?.length ?? 0} 个`);
    } catch (error) {
      console.error(chalk.red('错误:'), (error as Error).message);
      process.exit(1);
    }
  });

// 解析命令行参数
program.parse();
