/** 定义文件与配置加载。 */

import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { parseContract } from '@uxq/contracts';
import type { EvaluationDefinition, ExecutionProfile } from '@uxq/contracts';

/** 加载并解析评价定义文件（支持 YAML/JSON）。 */
export async function loadDefinition(file: string): Promise<EvaluationDefinition> {
  const content = await readFile(file, 'utf8');
  const parsed = /\.ya?ml$/i.test(file)
    ? parseYaml(content, { maxAliasCount: 50 }) as unknown
    : JSON.parse(content) as unknown;
  return parseContract('EvaluationDefinition', parsed);
}

/** 加载执行配置（JSON）。 */
export async function loadConfig(file?: string): Promise<Partial<ExecutionProfile>> {
  if (!file) return {};
  const content = await readFile(file, 'utf8');
  return JSON.parse(content) as Partial<ExecutionProfile>;
}
