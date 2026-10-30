/** install-skill / uninstall-skill 命令 — Skill 安装与卸载。 */

import { existsSync, rmSync, symlinkSync, cpSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';
import { UxqError } from '@uxq/core';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import { logInfo } from '../io.js';
import { AGENT_SKILL_DIRS, ALL_AGENTS } from '../options.js';
import type { SupportedAgent, AgentTarget } from '../options.js';
import type { CommandContext, CommandResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findSkillSource(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i += 1) {
    const candidate = join(dir, 'skills', 'uxq-ux-evaluation');
    if (existsSync(candidate)) return candidate;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new UxqError(
    'SKILL_NOT_FOUND',
    `Skill 源目录不存在（从 ${__dirname} 向上查找失败）`,
    'EXECUTION',
  );
}

interface InstallResult {
  agent: string;
  targetPath: string;
  mode: 'symlink' | 'copy' | 'skipped';
  error?: string;
}

export async function runInstall(ctx: CommandContext): Promise<CommandResult> {
  const agent = (ctx.options.agent ?? 'qoder') as AgentTarget;
  const copy = ctx.options.copy ?? false;
  const agents = agent === 'all' ? ALL_AGENTS : [agent as SupportedAgent];
  const skillSource = findSkillSource();

  const results: InstallResult[] = [];

  for (const a of agents) {
    const targetDir = AGENT_SKILL_DIRS[a];
    if (!targetDir) {
      logInfo(ctx.io, `[skip] ${a} — 未知 agent`);
      results.push({ agent: a, targetPath: '', mode: 'skipped', error: '未知 agent' });
      continue;
    }

    const dest = join(targetDir, 'uxq-ux-evaluation');

    if (!existsSync(targetDir)) {
      logInfo(ctx.io, `[skip] ${a} — 目录不存在：${targetDir}`);
      results.push({ agent: a, targetPath: dest, mode: 'skipped', error: 'Agent 目录不存在' });
      continue;
    }

    if (existsSync(dest)) {
      try { rmSync(dest, { recursive: true, force: true }); } catch { /* 忽略清理失败 */ }
    }

    try {
      if (copy) {
        cpSync(skillSource, dest, { recursive: true });
        logInfo(ctx.io, `[ok] ${a} — 已复制 skill → ${dest}`);
        results.push({ agent: a, targetPath: dest, mode: 'copy' });
      } else {
        try {
          symlinkSync(skillSource, dest, 'dir');
          logInfo(ctx.io, `[ok] ${a} — 已链接 skill → ${dest}`);
          results.push({ agent: a, targetPath: dest, mode: 'symlink' });
        } catch (symlinkError) {
          if (platform() === 'win32') {
            cpSync(skillSource, dest, { recursive: true });
            logInfo(ctx.io, `[ok] ${a} — 已复制 skill（符号链接失败）→ ${dest}`);
            results.push({ agent: a, targetPath: dest, mode: 'copy' });
          } else {
            throw symlinkError;
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logInfo(ctx.io, `[error] ${a} — 安装失败：${message}`);
      results.push({ agent: a, targetPath: dest, mode: 'skipped', error: message });
    }
  }

  const successCount = results.filter((r) => r.mode !== 'skipped').length;
  logInfo(ctx.io, `\n完成（${successCount}/${agents.length}）。重启 Agent 后 skill 生效。`);

  return {
    code: successCount === 0 ? EXIT_CODES.EXECUTION_ERROR : EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'install-skill', {
      status: successCount > 0 ? 'COMPLETED' : 'ERROR',
      data: { command: 'install-skill', results },
    }),
  };
}

export async function runUninstall(ctx: CommandContext): Promise<CommandResult> {
  const agent = (ctx.options.agent ?? 'qoder') as SupportedAgent;
  const targetDir = AGENT_SKILL_DIRS[agent];

  if (!targetDir) {
    throw new UxqError(
      'INVALID_CONFIGURATION',
      `未知 agent：${agent}。支持：qoder、claude、codex、kiro`,
      'INPUT',
    );
  }

  const dest = join(targetDir, 'uxq-ux-evaluation');

  if (!existsSync(dest)) {
    logInfo(ctx.io, `[uxq] Skill 未安装：${dest}`);
    return {
      code: EXIT_CODES.SUCCESS,
      response: buildResponse(VERSION, 'uninstall-skill', {
        status: 'COMPLETED',
        data: { command: 'uninstall-skill', agent, removed: false, wasSymlink: false },
      }),
    };
  }

  let wasSymlink = false;
  try {
    const stats = lstatSync(dest);
    wasSymlink = stats.isSymbolicLink();
  } catch { /* 忽略 */ }

  try {
    rmSync(dest, { recursive: true, force: true });
    logInfo(ctx.io, `[uxq] 已卸载 skill ← ${dest}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UxqError('EXECUTION_ERROR', `卸载失败：${message}`, 'EXECUTION');
  }

  return {
    code: EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'uninstall-skill', {
      status: 'COMPLETED',
      data: { command: 'uninstall-skill', agent, removed: true, wasSymlink },
    }),
  };
}
