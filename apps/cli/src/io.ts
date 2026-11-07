/** CLI I/O：stdout 只输出 JSON response，stderr 只输出日志。 */

import type { CliResponse } from './response.js';

export interface CliIO {
  out(line: string): void;
  err(line: string): void;
}

/** 创建默认 CLI I/O（stdout/stderr）。 */
export function createDefaultIO(): CliIO {
  return {
    out: (line) => process.stdout.write(line),
    err: (line) => process.stderr.write(line),
  };
}

/** 输出 JSON 响应到 stdout。 */
export function outputJson(io: CliIO, response: CliResponse<unknown>): void {
  io.out(JSON.stringify(response, null, 2) + '\n');
}

/** 输出日志到 stderr（带 [uxq] 前缀）。 */
export function logInfo(io: CliIO, message: string): void {
  io.err(`[uxq] ${message}\n`);
}

/** 输出帮助信息到 stderr。 */
export function printHelp(io: CliIO, version: string): void {
  const help = `uxq - UX 评价工具 v${version}

用法：uxq <命令> [选项]

命令：
  --help, -h              显示帮助
  version                 显示版本
  doctor                  诊断环境
  capabilities            输出当前版本支持的动作、步骤类型与提取器
  init <file>             生成示例定义
  validate <file>         校验定义
  plan <file>             编译执行计划
  evaluate <file>         执行评价
  list                    列出运行
  inspect <run-id>        查看运行详情
  cancel <run-id>         取消运行
  report <run-id>         生成报告
  baseline <action>       基线管理 (create|update|list|delete)
  compare <run-id> [baseline-name]  与基线比较（默认基线名：default）
  finding <action>        Finding 查询 (list)
  settle <run-id>         重新结算并保存（需 --policy 指定策略）
  quality-gate <run-id>   质量门禁检查
  verify <action>         复测验证 (plan|result)
  conformance <run-id>    规范符合性检查
  install-skill           安装 UXQ Skill 到 Agent
  uninstall-skill         从 Agent 卸载 UXQ Skill
  auth-save <file>        打开浏览器，手动登录后保存认证状态
  auth-clean <file>       删除认证状态文件，清理敏感数据

通用选项：
  --root <dir>            存储根目录（默认 .uxq）
  --config <file>         运行配置文件
  --json                  机器输出格式
  --gate <file>           质量门禁配置
  --source-run <id>       关联源运行
  --finding-id <id>       关联 Finding ID
  --policy <file>         评分策略文件
  --url <url>             init/auth-save 的目标 URL
  --reason <text>         baseline update 的更新原因
  --agent <name>          Agent 名称 (qoder|claude|codex|kiro|all)
  --auth-state <file>     认证状态文件（Playwright storageState JSON）
  --copy                  复制而非符号链接

退出码：
  0  成功
  1  门禁策略失败
  2  输入/配置无效
  3  环境不可用
  4  运行失败
  5  契约/不变量失败
  6  持久化/工件失败
  130 用户取消
`;
  io.err(help);
}
