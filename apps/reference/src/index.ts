#!/usr/bin/env node
/**
 * UXQ Reference - 参考实现与示例库
 *
 * 提供可控的测试页面、参考评价定义和演示数据。
 * 用于校验评价工具能力、教学和测试。
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const PAGES_DIR = join(ROOT, 'pages');
const DEFINITIONS_DIR = join(ROOT, 'definitions');

const program = new Command();

program
  .name('uxq-reference')
  .description('UXQ 参考实现与示例库')
  .version('0.1.0');

function header(title: string): void {
  const line = '═'.repeat(50);
  console.log(chalk.cyan(`\n${line}`));
  console.log(chalk.cyan.bold(`  ${title}`));
  console.log(chalk.cyan(`${line}\n`));
}

function subheader(title: string): void {
  console.log(chalk.yellow.bold(`\n▸ ${title}`));
}

// ─── pages 命令 ─────────────────────────────────────────

program
  .command('pages')
  .description('列出所有可用的参考测试页面')
  .action(() => {
    header('UXQ Reference 测试页面');

    const pages = getPages();
    if (pages.length === 0) {
      console.log(chalk.yellow('  未找到测试页面'));
      return;
    }

    console.log(chalk.gray('  序号  页面名称                    场景描述'));
    console.log(chalk.gray('  ' + '─'.repeat(56)));

    for (const [i, page] of pages.entries()) {
      const num = String(i + 1).padStart(4);
      const name = page.name.padEnd(28);
      console.log(`  ${num}  ${chalk.cyan(name)} ${page.description}`);
    }

    subheader('页面路径');
    for (const page of pages) {
      const relPath = relative(ROOT, page.path);
      console.log(`  ${chalk.gray('•')} ${relPath}`);
    }

    subheader('使用方式');
    console.log(`  在浏览器中直接打开 HTML 文件，或使用 Playwright 进行自动化测试：`);
    console.log(`  ${chalk.gray('$')} await page.goto('file://${PAGES_DIR}/<page-name>.html');`);
  });

// ─── definitions 命令 ───────────────────────────────────

program
  .command('definitions')
  .description('列出所有参考评价定义')
  .action(() => {
    header('UXQ Reference 评价定义');

    const defs = getDefinitions();
    if (defs.length === 0) {
      console.log(chalk.yellow('  未找到评价定义'));
      return;
    }

    for (const def of defs) {
      subheader(def.data.name);
      console.log(`  ID:       ${chalk.gray(def.data.id)}`);
      console.log(`  版本:     ${chalk.gray(def.data.definitionVersion)}`);
      console.log(`  文件:     ${chalk.gray(relative(ROOT, def.path))}`);
      console.log(`  维度:     ${chalk.gray(def.data.dimensions?.join(', ') ?? 'N/A')}`);
      console.log(`  方法:     ${chalk.gray(def.data.methods?.join(', ') ?? 'N/A')}`);
      console.log(`  指标数:   ${chalk.gray(String(def.data.metrics?.length ?? 0))}`);
      console.log(`  规则数:   ${chalk.gray(String(def.data.rules?.length ?? 0))}`);
      console.log(`  任务数:   ${chalk.gray(String(def.data.tasks?.length ?? 0))}`);
      console.log(`  步骤数:   ${chalk.gray(String(def.data.steps?.length ?? 0))}`);
      if (def.data.policy) {
        console.log(`  策略:     ${chalk.gray(def.data.policy.name)}`);
        console.log(`  模式:     ${chalk.gray(def.data.policy.mode)}`);
        console.log(`  合格线:   ${chalk.gray(String(def.data.policy.overallThreshold ?? 'N/A'))}`);
      }
      if (def.data.description) {
        console.log(`  描述:     ${chalk.gray(def.data.description)}`);
      }
    }
  });

// ─── inspect 命令 ───────────────────────────────────────

program
  .command('inspect <definition-file>')
  .description('查看评价定义的详细内容')
  .action((file) => {
    const filePath = resolveDefinitionPath(file);
    if (!filePath) {
      console.log(chalk.red(`未找到定义文件: ${file}`));
      return;
    }

    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    header(`评价定义详情: ${data.name ?? data.id}`);

    if (data.target) {
      subheader('目标');
      console.log(`  名称: ${chalk.bold(data.target.name)}`);
      console.log(`  类型: ${data.target.type}`);
      console.log(`  版本: ${data.target.version}`);
      console.log(`  环境: ${data.target.environment}`);
    }

    if (data.dimensions) {
      subheader('评价维度');
      const dimNames: Record<string, string> = {
        D01: '任务效率', D02: '交互质量', D03: '认知负担',
        D04: '可访问性', D05: '包容性', D06: '主观体验',
      };
      for (const dim of data.dimensions) {
        console.log(`  ${chalk.cyan(dim)} — ${dimNames[dim] ?? '未知'}`);
      }
    }

    if (data.metrics?.length > 0) {
      subheader(`指标 (${data.metrics.length})`);
      for (const metric of data.metrics) {
        const dirSymbol = metric.direction === 'HIGHER_IS_BETTER' ? '↑' : metric.direction === 'LOWER_IS_BETTER' ? '↓' : '→';
        console.log(`  ${chalk.cyan(dirSymbol)} ${metric.name} (${metric.id})`);
        console.log(`    维度: ${metric.dimensionId}  类型: ${metric.metricType}  单位: ${metric.unit ?? 'N/A'}`);
        if (metric.required) console.log(chalk.red(`    ⚠ 必需指标`));
      }
    }

    if (data.rules?.length > 0) {
      subheader(`规则 (${data.rules.length})`);
      for (const rule of data.rules) {
        const icon = rule.critical ? chalk.red('⚠') : chalk.gray('○');
        console.log(`  ${icon} ${rule.name} (${rule.id})`);
        console.log(`    表达式: ${JSON.stringify(rule.expression)}`);
      }
    }

    if (data.policy) {
      subheader('评分策略');
      console.log(`  名称: ${chalk.bold(data.policy.name)}`);
      console.log(`  模式: ${data.policy.mode}`);
      console.log(`  合格线: ${data.policy.overallThreshold ?? 'N/A'}`);
      console.log(`  最低覆盖率: ${(data.policy.minimumCoverage * 100).toFixed(0)}%`);
      console.log(`  关键规则: ${data.policy.criticalRuleIds?.join(', ') ?? '无'}`);

      if (data.policy.bindings?.length > 0) {
        console.log(chalk.gray('\n  评分绑定:'));
        for (const binding of data.policy.bindings) {
          console.log(`    ${binding.metricId}: 权重=${binding.weight} 标准化=${binding.normalization}`);
        }
      }

      if (data.policy.dimensions?.length > 0) {
        console.log(chalk.gray('\n  维度权重:'));
        for (const dim of data.policy.dimensions) {
          const bar = '█'.repeat(Math.round(dim.weight * 20));
          console.log(`    ${dim.dimensionId}: ${(dim.weight * 100).toFixed(0).padStart(3)}% ${chalk.cyan(bar)}`);
        }
      }
    }

    if (data.steps?.length > 0) {
      subheader(`执行步骤 (${data.steps.length})`);
      for (const step of data.steps) {
        const reqIcon = step.required ? chalk.red('●') : chalk.gray('○');
        console.log(`  ${reqIcon} ${step.stepId} [${step.kind}]`);
        if (step.dependsOn?.length > 0) {
          console.log(`    依赖: ${step.dependsOn.join(' → ')}`);
        }
      }
    }
  });

// ─── validate 命令 ──────────────────────────────────────

program
  .command('validate <definition-file>')
  .description('验证评价定义的结构完整性')
  .action((file) => {
    const filePath = resolveDefinitionPath(file);
    if (!filePath) {
      console.log(chalk.red(`未找到定义文件: ${file}`));
      return;
    }

    header('评价定义验证');

    let data;
    try {
      data = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (error) {
      console.log(chalk.red(`✗ JSON 解析失败: ${error instanceof Error ? error.message : '未知错误'}`));
      return;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // 必需字段检查
    if (!data.id) errors.push('缺少 id 字段');
    if (!data.schemaVersion) errors.push('缺少 schemaVersion 字段');
    if (!data.name) warnings.push('缺少 name 字段');
    if (!data.definitionVersion) warnings.push('缺少 definitionVersion 字段');

    // 目标检查
    if (!data.target) errors.push('缺少 target 定义');
    else {
      if (!data.target.id) errors.push('target 缺少 id');
      if (!data.target.name) errors.push('target 缺少 name');
      if (!data.target.type) errors.push('target 缺少 type');
    }

    // 维度检查
    if (!data.dimensions || data.dimensions.length === 0) {
      errors.push('至少需要定义一个评价维度');
    }

    // 指标检查
    if (!data.metrics || data.metrics.length === 0) {
      warnings.push('未定义任何指标');
    } else {
      for (const metric of data.metrics) {
        if (!metric.id) errors.push(`指标缺少 id`);
        if (!metric.name) errors.push(`指标 ${metric.id} 缺少 name`);
        if (!metric.dimensionId) errors.push(`指标 ${metric.id} 缺少 dimensionId`);
        if (!metric.direction) errors.push(`指标 ${metric.id} 缺少 direction`);
      }
    }

    // 规则检查
    if (data.rules) {
      for (const rule of data.rules) {
        if (!rule.id) errors.push(`规则缺少 id`);
        if (!rule.expression) errors.push(`规则 ${rule.id} 缺少 expression`);
      }
    }

    // 策略检查
    if (!data.policy) errors.push('缺少 policy 评分策略');
    else {
      if (!data.policy.bindings || data.policy.bindings.length === 0) {
        errors.push('policy 缺少 bindings');
      }
      if (!data.policy.dimensions || data.policy.dimensions.length === 0) {
        errors.push('policy 缺少 dimensions 权重');
      }
    }

    // 步骤检查
    if (!data.steps || data.steps.length === 0) {
      warnings.push('未定义执行步骤');
    }

    // 输出结果
    if (errors.length === 0 && warnings.length === 0) {
      console.log(chalk.green.bold('  ✓ 验证通过 — 定义结构完整'));
    } else {
      if (errors.length > 0) {
        console.log(chalk.red.bold(`\n  ✗ 错误 (${errors.length}):`));
        for (const err of errors) {
          console.log(chalk.red(`    • ${err}`));
        }
      }
      if (warnings.length > 0) {
        console.log(chalk.yellow.bold(`\n  ⚠ 警告 (${warnings.length}):`));
        for (const warn of warnings) {
          console.log(chalk.yellow(`    • ${warn}`));
        }
      }
    }

    console.log(`\n  文件: ${chalk.gray(relative(ROOT, filePath))}`);
    console.log(`  错误: ${errors.length === 0 ? chalk.green('0') : chalk.red(String(errors.length))}`);
    console.log(`  警告: ${warnings.length === 0 ? chalk.green('0') : chalk.yellow(String(warnings.length))}`);
  });

// ─── path 命令 ──────────────────────────────────────────

program
  .command('path')
  .description('显示参考资源的文件系统路径')
  .action(() => {
    header('UXQ Reference 路径');
    console.log(`  根目录:     ${chalk.cyan(ROOT)}`);
    console.log(`  测试页面:   ${chalk.cyan(PAGES_DIR)}`);
    console.log(`  评价定义:   ${chalk.cyan(DEFINITIONS_DIR)}`);
  });

// ─── 辅助函数 ───────────────────────────────────────────

interface PageInfo {
  name: string;
  path: string;
  description: string;
}

interface DefinitionInfo {
  path: string;
  data: Record<string, any>;
}

function getPages(): PageInfo[] {
  if (!existsSync(PAGES_DIR)) return [];
  const files = readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html'));
  const descriptions: Record<string, string> = {
    'task-flow': '多步骤任务流程与进度反馈',
    'form-validation': '表单验证与错误反馈模式',
    'accessibility-issues': '故意包含的可访问性问题（用于检测验证）',
  };
  return files.map((file) => ({
    name: file.replace('.html', ''),
    path: join(PAGES_DIR, file),
    description: descriptions[file.replace('.html', '')] ?? '参考测试页面',
  }));
}

function getDefinitions(): DefinitionInfo[] {
  if (!existsSync(DEFINITIONS_DIR)) return [];
  const files = readdirSync(DEFINITIONS_DIR).filter((f) => f.endsWith('.json'));
  return files.map((file) => ({
    path: join(DEFINITIONS_DIR, file),
    data: JSON.parse(readFileSync(join(DEFINITIONS_DIR, file), 'utf-8')),
  }));
}

function resolveDefinitionPath(input: string): string | null {
  // 先尝试直接路径
  if (existsSync(input)) return input;
  // 再尝试 definitions 目录
  const inDefs = join(DEFINITIONS_DIR, input);
  if (existsSync(inDefs)) return inDefs;
  // 尝试加 .json 后缀
  const withExt = input.endsWith('.json') ? input : `${input}.json`;
  const inDefsWithExt = join(DEFINITIONS_DIR, withExt);
  if (existsSync(inDefsWithExt)) return inDefsWithExt;
  return null;
}

program.parse();
