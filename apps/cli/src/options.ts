/** 命令行参数解析。 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { UxqError } from '@uxq/core';

export const DEFAULT_ROOT = '.uxq';

export interface CliOptions {
  root: string;
  config?: string;
  json: boolean;
  gate?: string;
  sourceRun?: string;
  findingId?: string;
  policy?: string;
  agent?: string;
  copy?: boolean;
  url?: string;
  reason?: string;
  profile?: string;
}

export type SupportedAgent = 'qoder' | 'claude' | 'codex' | 'kiro';
export type AgentTarget = SupportedAgent | 'all';

export const ALL_AGENTS: SupportedAgent[] = ['qoder', 'claude', 'codex', 'kiro'];

export const AGENT_SKILL_DIRS: Record<SupportedAgent, string> = {
  qoder: join(homedir(), '.qoder', 'skills'),
  claude: join(homedir(), '.claude', '.claude', 'skills'),
  codex: join(homedir(), '.codex', 'skills'),
  kiro: join(homedir(), '.kiro', 'skills'),
};

export interface ParsedArgs {
  command: string;
  positional: string[];
  options: CliOptions;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let command = '';
  const positional: string[] = [];
  const options: CliOptions = { root: DEFAULT_ROOT, json: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!command && !arg.startsWith('-')) {
      command = arg;
      continue;
    }
    if (arg === '--root' && i + 1 < args.length) {
      options.root = args[++i]!;
    } else if (arg === '--config' && i + 1 < args.length) {
      options.config = args[++i]!;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--gate' && i + 1 < args.length) {
      options.gate = args[++i]!;
    } else if (arg === '--source-run' && i + 1 < args.length) {
      options.sourceRun = args[++i]!;
    } else if (arg === '--finding-id' && i + 1 < args.length) {
      options.findingId = args[++i]!;
    } else if (arg === '--policy' && i + 1 < args.length) {
      options.policy = args[++i]!;
    } else if (arg === '--agent' && i + 1 < args.length) {
      options.agent = args[++i]!;
    } else if (arg === '--url' && i + 1 < args.length) {
      options.url = args[++i]!;
    } else if (arg === '--reason' && i + 1 < args.length) {
      options.reason = args[++i]!;
    } else if (arg === '--profile' && i + 1 < args.length) {
      options.profile = args[++i]!;
    } else if (arg === '--copy') {
      options.copy = true;
    } else if (arg === '--help' || arg === '-h') {
      command = 'help';
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      throw new UxqError('INVALID_OPTION', `未知选项：${arg}`, 'INPUT');
    }
  }

  return { command, positional, options };
}
