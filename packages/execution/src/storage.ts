import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { invariant, sha256, systemClock, newId } from '@uxq/core';
import type { Clock } from '@uxq/core';
import type {
  ArtifactReference,
  EvaluationRun,
  ExecutionEvent,
  ExecutionStep,
  StepAttempt,
  RunManifest,
  Evidence,
  MetricResult,
  RuleResult,
  TaskExecution,
  RawObservation,
  EvaluationResult,
  RunContext,
  EvaluationPlan,
  EvaluationDefinition,
  EvaluationSnapshot,
  ScoreResult,
} from '@uxq/contracts';
import { parseContract } from '@uxq/contracts';

const MANIFEST_FILE = 'manifest.json';
const EVENTS_FILE = 'events.jsonl';
const LOCK_FILE = '.lock';

export interface StoredRun {
  definition: EvaluationDefinition;
  plan: EvaluationPlan;
  run: EvaluationRun;
  context: RunContext;
  steps: ExecutionStep[];
  attempts: StepAttempt[];
  events: ExecutionEvent[];
  tasks: TaskExecution[];
  observations: RawObservation[];
  metrics: MetricResult[];
  rules: RuleResult[];
  evidence: Evidence[];
  evaluations: EvaluationResult[];
  snapshots?: EvaluationSnapshot[];
  scores?: ScoreResult[];
  manifest: RunManifest;
}

export interface RunStore {
  readonly rootDir: string;
  createRun(
    definition: EvaluationDefinition,
    plan: EvaluationPlan,
    run: EvaluationRun,
    context: RunContext,
  ): Promise<void>;
  loadRun(runId: string): Promise<StoredRun>;
  saveRun(run: StoredRun): Promise<void>;
  appendEvent(runId: string, event: ExecutionEvent): Promise<void>;
  appendArtifact(
    runId: string,
    relativePath: string,
    content: Uint8Array,
  ): Promise<ArtifactReference>;
  readArtifact(runId: string, ref: ArtifactReference): Promise<Uint8Array>;
  updateManifest(
    runId: string,
    updater: (manifest: RunManifest) => RunManifest,
  ): Promise<RunManifest>;
  listRuns(): Promise<string[]>;
  acquireLock(runId: string): Promise<() => Promise<void>>;
  deleteRun(runId: string): Promise<void>;
}

function runDir(root: string, runId: string): string {
  invariant(/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(runId), 'RUN_ID', '运行 ID 不能包含路径片段');
  return path.join(root, 'runs', runId);
}

function artifactPath(root: string, runId: string, relativePath: string): string {
  invariant(relativePath.length > 0 && !relativePath.includes('\\') &&
    !relativePath.includes(':') && !path.isAbsolute(relativePath) &&
    relativePath.split('/').every((part) => part !== '..' && part !== '.' && part.length > 0),
    'ARTIFACT_PATH', '工件路径必须是安全的相对路径');
  return path.join(artifactsDir(root, runId), relativePath);
}

function artifactsDir(root: string, runId: string): string {
  return path.join(runDir(root, runId), 'artifacts');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeRecursive(dirPath: string): Promise<void> {
  if (!(await fileExists(dirPath))) return;
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await removeRecursive(fullPath);
    } else {
      await unlink(fullPath);
    }
  }
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await writeFile(tmp, content, 'utf8');
  // Windows 上 rename 覆盖已有文件时可能短暂返回 EPERM（防病毒扫描或文件系统刷新）。
  await retryRename(tmp, filePath);
}

export async function retryRename(source: string, target: string, attempts = 5): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM' && attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

function computeRef(content: Uint8Array, mediaType: string): ArtifactReference {
  return {
    path: '',
    digest: sha256(content),
    bytes: content.byteLength,
    mediaType,
  };
}

export async function openLocalStore(
  rootDir: string,
  clock: Clock = systemClock,
): Promise<RunStore & { clock: Clock }> {
  await mkdir(path.join(rootDir, 'runs'), { recursive: true });

  async function readJson<T>(filePath: string): Promise<T> {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  }

  async function writeJson(filePath: string, value: unknown): Promise<void> {
    await atomicWrite(filePath, JSON.stringify(value, null, 2));
  }

  async function loadManifest(rid: string): Promise<RunManifest> {
    const manifestPath = path.join(runDir(rootDir, rid), MANIFEST_FILE);
    invariant(await fileExists(manifestPath), 'MANIFEST_MISSING', `运行 ${rid} 清单不存在`);
    const manifest = await readJson<RunManifest>(manifestPath);
    return parseContract('RunManifest', manifest);
  }

  let pending = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.then(() => undefined, () => undefined);
    return result;
  }

  const store: RunStore & { clock: Clock } = {
    rootDir,
    clock,

    async createRun(definition, plan, run, context) {
      const dir = runDir(rootDir, run.id);
      await mkdir(dir, { recursive: true });
      await mkdir(artifactsDir(rootDir, run.id), { recursive: true });
      await writeJson(path.join(dir, 'definition.json'), definition);
      await writeJson(path.join(dir, 'plan.json'), plan);
      await writeJson(path.join(dir, 'run.json'), run);
      await writeJson(path.join(dir, 'context.json'), context);
      await writeJson(path.join(dir, 'steps.json'), []);
      await writeJson(path.join(dir, 'attempts.json'), []);
      await writeFile(path.join(dir, EVENTS_FILE), '', 'utf8');
      await writeJson(path.join(dir, 'tasks.json'), []);
      await writeJson(path.join(dir, 'observations.json'), []);
      await writeJson(path.join(dir, 'metrics.json'), []);
      await writeJson(path.join(dir, 'rules.json'), []);
      await writeJson(path.join(dir, 'evidence.json'), []);
      await writeJson(path.join(dir, 'evaluations.json'), []);
      const manifest: RunManifest = {
        id: newId('manifest'),
        schemaVersion: '1.0.0',
        createdAt: clock.now(),
        runId: run.id,
        revision: 0,
        runStatus: run.status,
        executionCommitted: false,
        files: [],
        evaluations: [],
        reports: [],
        failures: [],
      };
      await writeJson(path.join(dir, MANIFEST_FILE), manifest);
    },

    async loadRun(rid) {
      const dir = runDir(rootDir, rid);
      invariant(await fileExists(dir), 'RUN_NOT_FOUND', `运行目录不存在：${rid}`);
      const definition = await readJson<EvaluationDefinition>(path.join(dir, 'definition.json'));
      const plan = await readJson<EvaluationPlan>(path.join(dir, 'plan.json'));
      const run = await readJson<EvaluationRun>(path.join(dir, 'run.json'));
      const context = await readJson<RunContext>(path.join(dir, 'context.json'));
      const steps = await readJson<ExecutionStep[]>(path.join(dir, 'steps.json'));
      const attempts = await readJson<StepAttempt[]>(path.join(dir, 'attempts.json'));
      const eventsPath = path.join(dir, EVENTS_FILE);
      const eventsRaw = (await fileExists(eventsPath)) ? await readFile(eventsPath, 'utf8') : '';
      const events = eventsRaw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as ExecutionEvent);
      const tasks = await readJson<TaskExecution[]>(path.join(dir, 'tasks.json'));
      const observations = await readJson<RawObservation[]>(path.join(dir, 'observations.json'));
      const metrics = await readJson<MetricResult[]>(path.join(dir, 'metrics.json'));
      const rules = await readJson<RuleResult[]>(path.join(dir, 'rules.json'));
      const evidence = await readJson<Evidence[]>(path.join(dir, 'evidence.json'));
      const evaluations = await readJson<EvaluationResult[]>(path.join(dir, 'evaluations.json'));
      const snapshots = await fileExists(path.join(dir, 'snapshots.json'))
        ? await readJson<EvaluationSnapshot[]>(path.join(dir, 'snapshots.json')) : [];
      const scores = await fileExists(path.join(dir, 'scores.json'))
        ? await readJson<ScoreResult[]>(path.join(dir, 'scores.json')) : [];
      const manifest = await loadManifest(rid);
      return {
        definition,
        plan,
        run,
        context,
        steps,
        attempts,
        events,
        tasks,
        observations,
        metrics,
        rules,
        evidence,
        evaluations,
        snapshots,
        scores,
        manifest,
      };
    },

    async saveRun(input) {
      const stored = structuredClone(input);
      return enqueue(async () => {
      const dir = runDir(rootDir, stored.run.id);
      await writeJson(path.join(dir, 'run.json'), stored.run);
      await writeJson(path.join(dir, 'steps.json'), stored.steps);
      await writeJson(path.join(dir, 'attempts.json'), stored.attempts);
      await writeJson(path.join(dir, 'tasks.json'), stored.tasks);
      await writeJson(path.join(dir, 'observations.json'), stored.observations);
      await writeJson(path.join(dir, 'metrics.json'), stored.metrics);
      await writeJson(path.join(dir, 'rules.json'), stored.rules);
      await writeJson(path.join(dir, 'evidence.json'), stored.evidence);
      await writeJson(path.join(dir, 'evaluations.json'), stored.evaluations);
      await writeJson(path.join(dir, 'snapshots.json'), stored.snapshots ?? []);
      await writeJson(path.join(dir, 'scores.json'), stored.scores ?? []);
      await writeJson(path.join(dir, 'context.json'), stored.context);
      await writeJson(path.join(dir, MANIFEST_FILE), stored.manifest);
      });
    },

    async appendEvent(rid, event) {
      return enqueue(async () => {
        const file = path.join(runDir(rootDir, rid), EVENTS_FILE);
        const previous = await readFile(file, 'utf8');
        const sequence = previous.split('\n').filter((line) => line.trim()).length + 1;
        await appendFile(file, JSON.stringify({ ...event, sequence }) + '\n', 'utf8');
      });
    },

    async appendArtifact(rid, relativePath, content) {
      const ref = computeRef(content, 'application/octet-stream');
      const fullPath = artifactPath(rootDir, rid, relativePath);
      await mkdir(path.dirname(fullPath), { recursive: true });
      const tmp = `${fullPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await writeFile(tmp, content);
      await retryRename(tmp, fullPath);
      return { ...ref, path: relativePath };
    },

    async readArtifact(rid, ref) {
      const fullPath = artifactPath(rootDir, rid, ref.path);
      const content = await readFile(fullPath);
      const actual = sha256(content);
      invariant(actual === ref.digest, 'ARTIFACT_DIGEST', `工件摘要不匹配：${ref.path}`);
      return content;
    },

    async updateManifest(rid, updater) {
      const dir = runDir(rootDir, rid);
      const manifestPath = path.join(dir, MANIFEST_FILE);
      const current = await readJson<RunManifest>(manifestPath);
      const updated = updater(current);
      await writeJson(manifestPath, updated);
      return updated;
    },

    async listRuns() {
      const runsDir = path.join(rootDir, 'runs');
      if (!(await fileExists(runsDir))) return [];
      const entries = await readdir(runsDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    },

    async acquireLock(rid) {
      const dir = runDir(rootDir, rid);
      const lockPath = path.join(dir, LOCK_FILE);
      const lockId = newId('lock');
      try {
        await writeFile(lockPath, lockId, { encoding: 'utf8', flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') invariant(false, 'STORE_LOCKED', `运行 ${rid} 已被锁定`);
        throw error;
      }
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        const current = await readFile(lockPath, 'utf8');
        invariant(current === lockId, 'LOCK_STOLEN', '锁已被其他进程占用');
        await unlink(lockPath);
      };
    },

    async deleteRun(rid) {
      const dir = runDir(rootDir, rid);
      if (await fileExists(dir)) {
        await removeRecursive(dir);
      }
    },
  };

  return store;
}
