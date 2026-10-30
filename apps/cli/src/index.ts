#!/usr/bin/env node
/**
 * UXQ CLI 入口 — 路由 + 统一错误处理。
 *
 * stdout 只输出 JSON response，stderr 只输出日志。
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { UxqError } from '@uxq/core';
import { createDefaultIO, outputJson, logInfo, printHelp } from './io.js';
import { parseArgs } from './options.js';
import { buildResponse } from './response.js';
import { categoryToExitCode, EXIT_CODES } from './errors.js';
import { VERSION } from './version.js';
import type { CliResponse } from './response.js';
import type { CommandContext, CommandResult } from './commands/types.js';

import * as versionCmd from './commands/version.js';
import * as doctorCmd from './commands/doctor.js';
import * as capabilitiesCmd from './commands/capabilities.js';
import * as initCmd from './commands/init.js';
import * as validateCmd from './commands/validate.js';
import * as planCmd from './commands/plan.js';
import * as evaluateCmd from './commands/evaluate.js';
import * as listCmd from './commands/list.js';
import * as inspectCmd from './commands/inspect.js';
import * as cancelCmd from './commands/cancel.js';
import * as reportCmd from './commands/report.js';
import * as baselineCmd from './commands/baseline.js';
import * as compareCmd from './commands/compare.js';
import * as findingCmd from './commands/finding.js';
import * as settleCmd from './commands/settle.js';
import * as qualityGateCmd from './commands/quality-gate.js';
import * as verifyCmd from './commands/verify.js';
import * as conformanceCmd from './commands/conformance.js';
import * as installSkillCmd from './commands/install-skill.js';

/** 支持的命令列表。 */
const SUPPORTED_COMMANDS = new Set([
  'version', 'doctor', 'capabilities', 'init', 'validate', 'plan',
  'evaluate', 'list', 'inspect', 'cancel', 'report', 'baseline',
  'compare', 'finding', 'settle', 'quality-gate', 'verify',
  'conformance', 'install-skill', 'uninstall-skill',
]);

/** 命令路由表。 */
const COMMAND_ROUTERS: Record<string, (ctx: CommandContext) => Promise<CommandResult>> = {
  version: versionCmd.run,
  doctor: doctorCmd.run,
  capabilities: capabilitiesCmd.run,
  init: initCmd.run,
  validate: validateCmd.run,
  plan: planCmd.run,
  evaluate: evaluateCmd.run,
  list: listCmd.run,
  inspect: inspectCmd.run,
  cancel: cancelCmd.run,
  report: reportCmd.run,
  baseline: baselineCmd.run,
  compare: compareCmd.run,
  finding: findingCmd.run,
  settle: settleCmd.run,
  'quality-gate': qualityGateCmd.run,
  verify: verifyCmd.run,
  conformance: conformanceCmd.run,
  'install-skill': installSkillCmd.runInstall,
  'uninstall-skill': installSkillCmd.runUninstall,
};

/** CLI 主运行逻辑（可注入 IO 便于测试）。 */
export async function runCli(argv: string[]): Promise<number> {
  const io = createDefaultIO();

  try {
    const { command, positional, options } = parseArgs(argv);

    // help / 空命令
    if (command === '' || command === 'help') {
      printHelp(io, VERSION);
      return EXIT_CODES.SUCCESS;
    }

    // 未知命令
    if (!SUPPORTED_COMMANDS.has(command)) {
      printHelp(io, VERSION);
      const response = buildResponse(VERSION, command, {
        status: 'ERROR',
        errors: [{ code: 'UNKNOWN_COMMAND', message: `未知命令：${command}` }],
      });
      outputJson(io, response);
      return EXIT_CODES.INPUT_ERROR;
    }

    // 路由到命令模块
    const router = COMMAND_ROUTERS[command];
    if (!router) {
      const response = buildResponse(VERSION, command, {
        status: 'ERROR',
        errors: [{ code: 'NOT_IMPLEMENTED', message: `命令未实现：${command}` }],
      });
      outputJson(io, response);
      return EXIT_CODES.EXECUTION_ERROR;
    }

    const ctx: CommandContext = { io, options, positional };
    const result = await router(ctx);

    // report 命令在非 --json 模式下已经直接输出了 markdown
    // 此时不再重复输出 JSON response
    if (command === 'report' && !options.json) {
      return result.code;
    }

    outputJson(io, result.response);
    return result.code;
  } catch (error) {
    // UxqError → 结构化错误响应
    if (error instanceof UxqError) {
      const errors = [{ code: error.code, message: error.message }];

      // 附加验证问题详情
      if (error.issues.length > 0) {
        logInfo(io, `验证问题（${error.issues.length} 项）：`);
        for (const issue of error.issues) {
          const path = issue.path || '(根)';
          logInfo(io, `  - ${path}: [${issue.code}] ${issue.message}`);
        }
      }

      const response: CliResponse<never> = buildResponse(VERSION, 'unknown', {
        status: 'ERROR',
        errors,
      });
      outputJson(io, response);
      return categoryToExitCode(error.category);
    }

    // 未知错误
    const message = error instanceof Error ? error.message : String(error);
    const response: CliResponse<never> = buildResponse(VERSION, 'unknown', {
      status: 'ERROR',
      errors: [{ code: 'UNKNOWN_ERROR', message }],
    });
    outputJson(io, response);
    return 1;
  }
}

/** Node 进程入口。 */
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runCli(process.argv).then((code) => {
    process.exitCode = code;
  });
}
