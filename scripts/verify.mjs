import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// 本地门禁证据，不代表未实现的浏览器或领域要求已经通过。
const artifactRoot = path.resolve('artifacts/verification');
await mkdir(artifactRoot, { recursive: true });
const ignored = new Set([
  'node_modules',
  'dist',
  '.git',
  '.uxq',
  'coverage',
  'artifacts',
  'test-results',
  'playwright-report',
]);
const files = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(filename);
    else if (entry.isFile()) files.push(filename);
  }
}
await scan('.');
const sourceHash = createHash('sha256');
for (const filename of files.sort()) {
  sourceHash
    .update(filename)
    .update('\0')
    .update(await readFile(filename))
    .update('\0');
}
const checks = [
  ['format:check'],
  ['contracts:check'],
  ['lint'],
  ['typecheck'],
  [
    'exec',
    'vitest',
    'run',
    '--reporter=default',
    '--reporter=json',
    '--outputFile=artifacts/verification/unit-tests.json',
  ],
  ['build'],
];
const report = {
  scope: '当前已实现的本地快速、契约、架构、治理、单元和构建门禁；不代表 G1–G3 或 M4 全部达成',
  startedAt: new Date().toISOString(),
  nodeVersion: process.version,
  sourceDigest: sourceHash.digest('hex'),
  checkedFiles: files.length,
  checks: [],
  passed: false,
};
for (const args of checks) {
  const startedAt = new Date().toISOString();
  const result = spawnSync('pnpm', args, {
    encoding: 'utf8',
    timeout: 600000,
    maxBuffer: 20 * 1024 * 1024,
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  report.checks.push({
    command: ['pnpm', ...args],
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  });
  if (result.status !== 0 || result.error) break;
}
report.passed =
  report.checks.length === checks.length &&
  report.checks.every((check) => check.exitCode === 0 && !check.error);
await writeFile(
  path.join(artifactRoot, 'local-gates.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.exitCode = report.passed ? 0 : 1;
