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
  return path.join(root, 'runs', runId);
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
  await rename(tmp, filePath);
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
        manifest,
      };
    },

    async saveRun(stored) {
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
      await writeJson(path.join(dir, MANIFEST_FILE), stored.manifest);
    },

    async appendEvent(rid, event) {
      const dir = runDir(rootDir, rid);
      const line = JSON.stringify(event) + '\n';
      await appendFile(path.join(dir, EVENTS_FILE), line, 'utf8');
    },

    async appendArtifact(rid, relativePath, content) {
      const ref = computeRef(content, 'application/octet-stream');
      const fullPath = path.join(artifactsDir(rootDir, rid), relativePath);
      await mkdir(path.dirname(fullPath), { recursive: true });
      const tmp = `${fullPath}.tmp`;
      await writeFile(tmp, content);
      await rename(tmp, fullPath);
      return { ...ref, path: relativePath };
    },

    async readArtifact(rid, ref) {
      const fullPath = path.join(artifactsDir(rootDir, rid), ref.path);
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
      if (await fileExists(lockPath)) {
        const lockContent = await readFile(lockPath, 'utf8');
        invariant(false, 'STORE_LOCKED', `运行 ${rid} 已被锁定：${lockContent}`);
      }
      const lockId = `${process.pid}-${Date.now()}`;
      await writeFile(lockPath, lockId, 'utf8');
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
