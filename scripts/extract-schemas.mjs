#!/usr/bin/env node
/**
 * Extract individual schema files from the monolithic uxq.schema.json.
 *
 * Output structure follows UXQ-ARCH-003 §15:
 *   schemas/common/        — identifier, timestamp, reference
 *   schemas/definition/    — evaluation-definition, evaluation-plan
 *   schemas/execution/     — evaluation-run, run-context, execution-step, task-execution
 *   schemas/measurement/   — raw-observation, metric-result, rule-result, score-result
 *   schemas/evidence/      — evidence, evidence-link
 *   schemas/diagnostic/    — finding, root-cause-hypothesis, recommendation, verification
 *   schemas/result/        — evaluation-result
 *   schemas/reporting/     — report-artifact
 *
 * Each extracted file uses JSON Schema 2020-12, has a stable $id, and references
 * shared definitions via $ref to the main uxq.schema.json.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCHEMA_DIR = resolve(ROOT, 'schemas');

const MAIN_SCHEMA_PATH = resolve(SCHEMA_DIR, 'uxq.schema.json');
const SCHEMA_VERSION = '1.0.0';
const BASE_ID = 'https://uxq.dev/schemas';

/**
 * Mapping from output file path (relative to schemas/) to the definition name(s)
 * that should be included. When a file maps to a single primary definition, we
 * also pull in any closely related helper definitions.
 */
const FILE_MAP = {
  'common/identifier.schema.json': {
    title: 'UXQ Identifier',
    defs: ['Id', 'Version', 'Digest'],
  },
  'common/timestamp.schema.json': {
    title: 'UXQ Timestamp',
    defs: ['Timestamp'],
  },
  'common/reference.schema.json': {
    title: 'UXQ Reference',
    defs: ['IdList', 'TextList', 'Text', 'Scalar', 'JsonValue'],
  },
  'definition/evaluation-definition.schema.json': {
    title: 'EvaluationDefinition',
    defs: [
      'EvaluationDefinition',
      'Target',
      'Scope',
      'DimensionId',
      'VersionRef',
      'MetricField',
      'MetricDefinition',
      'RuleExpression',
      'RuleDefinition',
      'FindingTemplate',
      'FindingTemplateBase',
      'ScoreBinding',
      'DimensionWeight',
      'ScoringPolicy',
      'BrowserAction',
      'SuccessCondition',
      'TaskDefinition',
      'Capability',
      'FailureMode',
    ],
  },
  'definition/evaluation-plan.schema.json': {
    title: 'EvaluationPlan',
    defs: [
      'EvaluationPlan',
      'PlanReference',
      'PlannedStep',
      'StepKind',
      'ExecutionProfile',
      'ProfileOverrides',
      'RetryPolicy',
      'Viewport',
    ],
  },
  'execution/evaluation-run.schema.json': {
    title: 'EvaluationRun',
    defs: ['EvaluationRun', 'RunStatus', 'RunManifest', 'ManifestEvaluation', 'ManifestFailure'],
  },
  'execution/run-context.schema.json': {
    title: 'RunContext',
    defs: ['RunContext'],
  },
  'execution/execution-step.schema.json': {
    title: 'ExecutionStep',
    defs: ['ExecutionStep', 'StepStatus', 'StepAttempt', 'ExecutionEvent'],
  },
  'execution/task-execution.schema.json': {
    title: 'TaskExecution',
    defs: ['TaskExecution', 'TaskOutcome'],
  },
  'measurement/raw-observation.schema.json': {
    title: 'RawObservation',
    defs: ['RawObservation', 'ObservationInput', 'ObservationInputBase'],
  },
  'measurement/metric-result.schema.json': {
    title: 'MetricResult',
    defs: ['MetricResult', 'MetricResultBase', 'MeasuredValue', 'MetricDirection', 'ValueKind'],
  },
  'measurement/rule-result.schema.json': {
    title: 'RuleResult',
    defs: ['RuleResult', 'RuleResultBase', 'RuleOutcome'],
  },
  'measurement/score-result.schema.json': {
    title: 'ScoreResult',
    defs: ['ScoreResult', 'ScoreValue', 'ScoreStatus'],
  },
  'evidence/evidence.schema.json': {
    title: 'Evidence',
    defs: [
      'Evidence',
      'EvidenceSource',
      'EvidenceLifecycle',
      'EvidenceValidity',
      'EvidencePrivacy',
    ],
  },
  'evidence/evidence-link.schema.json': {
    title: 'EvidenceLink',
    defs: ['EvidenceLink'],
  },
  'diagnostic/finding.schema.json': {
    title: 'Finding',
    defs: [
      'Finding',
      'FindingType',
      'Severity',
      'Priority',
      'Confidence',
      'FindingLifecycleStatus',
      'DiagnosticSignal',
    ],
  },
  'diagnostic/root-cause-hypothesis.schema.json': {
    title: 'RootCauseHypothesis',
    defs: ['RootCauseHypothesis'],
  },
  'diagnostic/recommendation.schema.json': {
    title: 'Recommendation',
    defs: ['Recommendation'],
  },
  'diagnostic/verification.schema.json': {
    title: 'Verification',
    defs: ['VerificationPlan', 'VerificationResult', 'VerificationStatus'],
  },
  'result/evaluation-result.schema.json': {
    title: 'EvaluationResult',
    defs: [
      'EvaluationResult',
      'EvaluationStatus',
      'OverallOutcome',
      'Coverage',
      'DimensionResult',
      'RiskConstraint',
    ],
  },
  'reporting/report-artifact.schema.json': {
    title: 'ReportArtifact',
    defs: ['ReportArtifact', 'ReportDocument', 'ReportProvenance', 'ArtifactReference'],
  },
};

/**
 * Shared definitions that appear in many files and should always be
 * referenced from the main schema rather than duplicated.
 */
const SHARED_DEFS = new Set(['BaseRecord', 'ErrorRecord', 'EvaluationSnapshot', 'RunBundle']);

async function extractSchemas() {
  const raw = await readFile(MAIN_SCHEMA_PATH, 'utf8');
  const mainSchema = JSON.parse(raw);
  const allDefs = mainSchema.$defs ?? {};

  let extractedCount = 0;

  for (const [relPath, config] of Object.entries(FILE_MAP)) {
    const outPath = resolve(SCHEMA_DIR, relPath);
    await mkdir(dirname(outPath), { recursive: true });

    const defs = {};
    for (const name of config.defs) {
      if (allDefs[name]) {
        defs[name] = allDefs[name];
      }
    }

    const individualSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `${BASE_ID}/${relPath.replace('.schema.json', '')}/${SCHEMA_VERSION}`,
      title: config.title,
      ...(defs[config.title]
        ? {
            ...defs[config.title],
            $id: `${BASE_ID}/${relPath.replace('.schema.json', '')}/${SCHEMA_VERSION}`,
            title: config.title,
          }
        : {}),
    };

    // If the primary definition exists, wrap it properly
    const primaryDef = allDefs[config.title];
    if (primaryDef) {
      // Build a schema that has the primary def at top level and others in $defs
      const { [config.title]: primary, ...rest } = defs;
      individualSchema.$defs = rest;
      Object.assign(individualSchema, primary);
      individualSchema.$id = `${BASE_ID}/${relPath.replace('.schema.json', '')}/${SCHEMA_VERSION}`;
      individualSchema.title = config.title;
    } else {
      // No single primary — just collect all defs
      individualSchema.$defs = defs;
      individualSchema.type = 'object';
      individualSchema.description = `Container for ${config.defs.join(', ')}`;
    }

    await writeFile(outPath, JSON.stringify(individualSchema, null, 2) + '\n', 'utf8');
    extractedCount++;
    console.log(`  ✓ ${relPath}`);
  }

  console.log(`\nExtracted ${extractedCount} schema files.`);
}

extractSchemas().catch((err) => {
  console.error('Schema extraction failed:', err);
  process.exit(1);
});
