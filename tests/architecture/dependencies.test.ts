import { readdir, readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  name: string;
  type?: string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const allowed: Record<string, string[]> = {
  core: [],
  contracts: ['core'],
  measurement: ['core', 'contracts'],
  metrics: ['core', 'contracts', 'measurement'],
  rules: ['core', 'contracts'],
  tasks: ['core', 'contracts', 'browser'],
  evidence: ['core', 'contracts'],
  scoring: ['core', 'contracts'],
  diagnostic: ['core', 'contracts'],
  browser: ['core', 'contracts'],
  regression: ['core', 'contracts'],
  reporting: ['core', 'contracts'],
  execution: [
    'core',
    'contracts',
    'measurement',
    'metrics',
    'rules',
    'tasks',
    'evidence',
    'scoring',
    'diagnostic',
    'browser',
    'regression',
    'reporting',
  ],
  cognition: ['core', 'contracts'],
  research: ['core', 'contracts'],
  accessibility: ['core', 'contracts'],
  conformance: ['core', 'contracts'],
  tokens: ['core'],
  theme: ['core', 'tokens'],
  color: ['core'],
  geometry: ['core'],
};

async function directories(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(directory, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? sources(file) : entry.name.endsWith('.ts') ? [file] : [];
      }),
    )
  ).flat();
}

function moduleReferences(file: string, source: string): string[] {
  const result: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      result.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const argument = node.arguments[0];
      if (!argument || !ts.isStringLiteral(argument))
        throw new Error(`${file}: 禁止不可分析的动态导入`);
      result.push(argument.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true));
  return result;
}

describe('公开导出与依赖边界', () => {
  it('所有实际包均有公开入口，依赖白名单与源码导入一致且无环', async () => {
    const roots = [...(await directories('packages')), ...(await directories('apps'))];
    expect(roots.length).toBeGreaterThan(0);
    const manifests = new Map<string, { root: string; manifest: PackageManifest }>();
    for (const root of roots) {
      const manifest = JSON.parse(
        await readFile(path.join(root, 'package.json'), 'utf8'),
      ) as PackageManifest;
      expect(manifests.has(manifest.name)).toBe(false);
      expect(manifest.type).toBe('module');
      if (root.startsWith('packages')) expect(manifest.exports?.['.']).toBeDefined();
      manifests.set(manifest.name, { root, manifest });
    }
    const graph = new Map<string, string[]>();
    for (const [name, { root, manifest }] of manifests) {
      const declared = { ...manifest.dependencies, ...manifest.devDependencies };
      const workspaceDeps = Object.keys(declared).filter((dep) => dep.startsWith('@uxq/'));
      graph.set(name, workspaceDeps);
      const shortName = name.replace('@uxq/', '');
      if (root.startsWith('packages')) {
        expect(allowed[shortName], `${name} 必须登记依赖白名单`).toBeDefined();
        for (const dep of workspaceDeps)
          expect(allowed[shortName]).toContain(dep.replace('@uxq/', ''));
      }
      for (const dep of workspaceDeps)
        expect(manifests.has(dep), `${name} 依赖未创建的 ${dep}`).toBe(true);
      for (const file of await sources(path.join(root, 'src'))) {
        const source = await readFile(file, 'utf8');
        for (const specifier of moduleReferences(file, source)) {
          if (specifier.startsWith('.')) {
            const relative = path.relative(
              path.resolve(root),
              path.resolve(path.dirname(file), specifier),
            );
            expect(relative.startsWith('..'), `${file} 不得相对路径跨包`).toBe(false);
            continue;
          }
          if (specifier.startsWith('node:') || builtinModules.includes(specifier)) {
            if (
              [
                'core',
                'measurement',
                'metrics',
                'rules',
                'scoring',
                'diagnostic',
                'reporting',
                'regression',
              ].includes(shortName)
            ) {
              expect(specifier.replace('node:', ''), `${file} 不得执行外部 IO`).not.toMatch(
                /^(fs|http|https|net|child_process|worker_threads)(\/|$)/,
              );
            }
            continue;
          }
          const dep = specifier.startsWith('@')
            ? specifier.split('/').slice(0, 2).join('/')
            : specifier.split('/')[0]!;
          expect(declared[dep], `${file} 未声明依赖 ${dep}`).toBeDefined();
          if (dep.startsWith('@uxq/')) expect(specifier, '跨包仅使用公开根入口').toBe(dep);
          if (dep.includes('playwright'))
            expect(['browser', 'reference'].includes(shortName), `${name} 泄漏浏览器依赖`).toBe(
              true,
            );
        }
        if (shortName !== 'contracts') {
          expect(source, `${file} 不得另定义公共状态`).not.toMatch(
            /(?:type|enum)\s+(?:RunStatus|MeasurementStatus|RuleOutcome|EvaluationStatus|OverallOutcome|FindingLifecycleStatus)\s*[={]/,
          );
        }
      }
    }
    const visit = (name: string, active: Set<string>, done: Set<string>): void => {
      if (active.has(name)) throw new Error(`循环依赖：${[...active, name].join(' → ')}`);
      if (done.has(name)) return;
      active.add(name);
      for (const dep of graph.get(name) ?? []) visit(dep, active, done);
      active.delete(name);
      done.add(name);
    };
    const done = new Set<string>();
    for (const name of graph.keys()) visit(name, new Set(), done);
  });
});
