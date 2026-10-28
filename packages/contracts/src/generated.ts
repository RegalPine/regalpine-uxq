/** 由 schemas/uxq.schema.json 自动生成，请勿手工修改。 */

export type Id = string;
export type Version = string;
export type Timestamp = string;
export type Digest = string;
export type Text = string;
/**
 * @maxItems 10000
 */
export type IdList = Id[];
/**
 * @maxItems 10000
 */
export type TextList = Text[];
export type Scalar = string | number | boolean | null;
export type JsonValue =
  | Scalar
  | JsonValue[]
  | {
      [k: string]: JsonValue;
    };
export type DimensionId = 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06';
export type RunStatus =
  'CREATED' | 'PREPARING' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
export type StepStatus =
  'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'SKIPPED' | 'BLOCKED' | 'ERROR';
export type TaskOutcome =
  'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE' | 'ABORTED' | 'TIMEOUT' | 'INVALID';
export type MeasurementStatus =
  | 'MEASURED'
  | 'NOT_EVALUATED'
  | 'NOT_APPLICABLE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'EXECUTION_FAILED'
  | 'INVALID';
export type RuleOutcome = 'PASS' | 'FAIL' | 'INDETERMINATE' | 'NOT_APPLICABLE' | 'EXECUTION_ERROR';
export type ScoreStatus = 'SCORED' | 'NOT_SCORED' | 'INSUFFICIENT_INPUTS' | 'CALCULATION_FAILED';
export type EvaluationStatus =
  'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE' | 'CONSTRAINED' | 'EXECUTION_FAILED';
export type OverallOutcome = 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'NOT_RATED';
export type EvidenceSource = 'E1' | 'E2' | 'E3' | 'E4' | 'E5';
export type EvidenceLifecycle = 'CAPTURED' | 'VALIDATED' | 'DERIVED' | 'RETIRED';
export type EvidenceValidity = 'UNVERIFIED' | 'VALID' | 'DISPUTED' | 'INVALID';
export type FindingLifecycleStatus =
  | 'NEW'
  | 'TRIAGED'
  | 'INVESTIGATING'
  | 'CONFIRMED'
  | 'ACCEPTED'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'FIXED'
  | 'VERIFIED'
  | 'REOPENED'
  | 'WONT_FIX'
  | 'INVALID'
  | 'CLOSED';
export type FindingType =
  | 'CONFIRMED_DEFECT'
  | 'POTENTIAL_DEFECT'
  | 'USABILITY_OBSERVATION'
  | 'DESIGN_INCONSISTENCY'
  | 'COMPLIANCE_FINDING'
  | 'IMPROVEMENT_OPPORTUNITY'
  | 'INSUFFICIENT_EVIDENCE';
export type Severity = 'S1' | 'S2' | 'S3' | 'S4';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type VerificationStatus =
  'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'INCONCLUSIVE' | 'BLOCKED' | 'CANCELLED';
export type Comparability = 'COMPARABLE' | 'COMPARABLE_WITH_CAVEATS' | 'NOT_COMPARABLE';
export type MetricDirection =
  | 'HIGHER_IS_BETTER'
  | 'LOWER_IS_BETTER'
  | 'TARGET_RANGE'
  | 'CONTEXT_DEPENDENT'
  | 'DESCRIPTIVE_ONLY';
export type ValueKind = 'NUMBER' | 'BOOLEAN' | 'CATEGORY' | 'STRUCTURED';
export type StepKind =
  | 'ENVIRONMENT_CHECK'
  | 'BROWSER_SETUP'
  | 'PAGE_NAVIGATION'
  | 'TASK_EXECUTION'
  | 'OBSERVATION_CAPTURE'
  | 'METRIC_CALCULATION'
  | 'RULE_EVALUATION'
  | 'SCORING'
  | 'EVIDENCE_VALIDATION'
  | 'RESULT_FINALIZATION';
export type Capability =
  | 'BROWSER_CHROMIUM'
  | 'BROWSER_FIREFOX'
  | 'BROWSER_WEBKIT'
  | 'SCREENSHOT_CAPTURE'
  | 'DOM_OBSERVATION'
  | 'ACCESSIBILITY_INSPECTION'
  | 'LOCAL_FILE_READ'
  | 'METRIC_CALCULATION'
  | 'RULE_EVALUATION';
export type FailureMode = 'CONTINUE_INDEPENDENT_STEPS' | 'STOP_ON_REQUIRED_FAILURE';
/**
 * @maxItems 100
 */
export type AllowedOrigins = string[];
export type MetricDefinition = BaseRecord & {
  version: Version;
  implementationVersion: Version;
  name: Text;
  description: Text;
  dimensionId: DimensionId;
  metricType: 'OBS' | 'CALC' | 'STRUCT' | 'PROXY' | 'SUBJECTIVE' | 'EXPERT';
  valueKind: ValueKind;
  direction: MetricDirection;
  sourceKey: Id;
  unit?: Text;
  aggregation: 'LATEST' | 'MEAN' | 'MEDIAN' | 'P95' | 'SUM' | 'COUNT' | 'RATIO' | 'SUCCESS_RATE';
  minimumSamples: number;
  minimum?: number;
  maximum?: number;
  categories?: TextList;
  /**
   * @minItems 1
   */
  structure?: [MetricField, ...MetricField[]];
  numeratorKey?: Id;
  denominatorKey?: Id;
  required: boolean;
  applicable: boolean;
  evidenceRequired: boolean;
  limitations: TextList;
};
export type RuleExpression =
  | {
      op: 'ALL' | 'ANY';
      /**
       * @minItems 1
       * @maxItems 128
       */
      children: [RuleExpression, ...RuleExpression[]];
    }
  | {
      op: 'NOT';
      child: RuleExpression;
    }
  | {
      op: 'LT' | 'LTE' | 'GT' | 'GTE';
      metricId: Id;
      expected: number;
    }
  | {
      op: 'EQ' | 'NE';
      metricId: Id;
      expected: Scalar;
    }
  | {
      op: 'BETWEEN';
      metricId: Id;
      lower: number;
      upper: number;
    }
  | {
      op: 'IN';
      metricId: Id;
      /**
       * @minItems 1
       * @maxItems 128
       */
      expected: [Scalar, ...Scalar[]];
    };
export type RuleDefinition = BaseRecord & {
  version: Version;
  name: Text;
  expression: RuleExpression;
  required: boolean;
  critical: boolean;
  finding?: FindingTemplate;
};
export type ScoringPolicy = BaseRecord & {
  version: Version;
  name: Text;
  mode: 'DESCRIPTIVE' | 'SCORE';
  /**
   * @maxItems 1000
   */
  bindings: ScoreBinding[];
  /**
   * @maxItems 6
   */
  dimensions: DimensionWeight[];
  missingPolicy: 'BLOCK' | 'EXCLUDE';
  minimumCoverage: number;
  allowPartial: boolean;
  overallThreshold?: number;
  criticalRuleIds: IdList;
  riskSeverities: Severity[];
  rationale: Text;
  limitations: TextList;
};
export type BrowserAction =
  | {
      action: 'NAVIGATE';
      url: string;
    }
  | {
      action: 'CLICK';
      selector: Text;
    }
  | {
      action: 'FILL';
      selector: Text;
      value: string;
    }
  | {
      action: 'FILL_SECRET';
      selector: Text;
      secretRef: Id;
    }
  | {
      action: 'PRESS';
      key:
        | 'Tab'
        | 'Shift+Tab'
        | 'Enter'
        | 'Space'
        | 'Escape'
        | 'ArrowDown'
        | 'ArrowUp'
        | 'ArrowLeft'
        | 'ArrowRight';
    }
  | {
      action: 'WAIT_FOR';
      selector: Text;
      state: 'visible' | 'hidden' | 'attached' | 'detached';
    }
  | {
      action: 'CAPTURE';
      selector: Text;
      key: Id;
      extractor: 'COUNT' | 'VISIBLE' | 'TEXT' | 'VALUE' | 'ACCESSIBLE_NAME';
      unit?: Text;
    }
  | {
      action: 'SCREENSHOT';
      name: Id;
    };
export type TaskDefinition = BaseRecord & {
  version: Version;
  name: Text;
  scenarioId: Id;
  /**
   * @minItems 1
   * @maxItems 100
   */
  actions: [BrowserAction, ...BrowserAction[]];
  /**
   * @minItems 1
   */
  businessConditions: [SuccessCondition, ...SuccessCondition[]];
  /**
   * @minItems 1
   */
  feedbackConditions: [SuccessCondition, ...SuccessCondition[]];
  sideEffect: 'NONE' | 'WRITE';
  authorized: boolean;
  testDataScope?: Text;
  idempotencyKey?: Id;
  timeoutMs?: number;
  limitations: TextList;
};
export type EvaluationDefinition = BaseRecord & {
  definitionVersion: Version;
  name: Text;
  description?: Text;
  target: Target;
  scope: Scope;
  /**
   * @minItems 1
   */
  dimensions: [DimensionId, ...DimensionId[]];
  /**
   * @minItems 1
   */
  methods: [
    'AUTOMATED' | 'EXPERT_REVIEW' | 'USER_RESEARCH' | 'PROXY',
    ...('AUTOMATED' | 'EXPERT_REVIEW' | 'USER_RESEARCH' | 'PROXY')[]
  ];
  /**
   * @minItems 1
   * @maxItems 1000
   */
  metrics: [MetricDefinition, ...MetricDefinition[]];
  /**
   * @maxItems 1000
   */
  rules: RuleDefinition[];
  policy: ScoringPolicy;
  /**
   * @maxItems 1000
   */
  tasks: TaskDefinition[];
  /**
   * @minItems 1
   * @maxItems 1000
   */
  steps: [PlannedStep, ...PlannedStep[]];
  profile?: ProfileOverrides;
  limitations: TextList;
};
export type EvaluationPlan = BaseRecord & {
  definitionId: Id;
  definitionVersion: Version;
  definitionDigest: Digest;
  compilerVersion: Version;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  steps: [PlannedStep, ...PlannedStep[]];
  profile: ExecutionProfile;
  metricVersions: VersionRef[];
  ruleVersions: VersionRef[];
  policyVersion: VersionRef;
  requiredCapabilities: Capability[];
  planDigest: Digest;
};
export type EvaluationRun = BaseRecord & {
  planId: Id;
  planDigest: Digest;
  definitionId: Id;
  status: RunStatus;
  revision: number;
  sourceRunId?: Id;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  endReason?: Text;
  contextId: Id;
  executionCommitted: boolean;
  limitations: TextList;
};
export type RunContext = BaseRecord & {
  runId: Id;
  engineVersion: Version;
  nodeVersion: Text;
  platform: Text;
  browserVersion?: Text;
  profile: ExecutionProfile;
  configSources: {
    [k: string]: 'DEFAULT' | 'CONFIG' | 'DEFINITION' | 'CLI';
  };
  environmentFingerprint: Digest;
  sampleDescription: Text;
  limitations: TextList;
};
export type ExecutionStep = BaseRecord & {
  runId: Id;
  stepId: Id;
  status: StepStatus;
  revision: number;
  attemptIds: IdList;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  reason?: Text;
  outputIds: IdList;
};
export type StepAttempt = BaseRecord & {
  runId: Id;
  stepId: Id;
  number: number;
  status: 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR';
  startedAt: Timestamp;
  endedAt?: Timestamp;
  durationMs?: number;
  retryReason?: Text;
  error?: ErrorRecord;
  evidenceIds: IdList;
  outputIds: IdList;
};
export type ExecutionEvent = BaseRecord & {
  runId: Id;
  stepId?: Id;
  attemptId?: Id;
  sequence: number;
  type:
    | 'RunCreated'
    | 'RunPreparationStarted'
    | 'RunStarted'
    | 'RunCompleted'
    | 'RunPartiallyCompleted'
    | 'RunFailed'
    | 'RunCancelRequested'
    | 'RunCancelled'
    | 'StepStarted'
    | 'StepPassed'
    | 'StepFailed'
    | 'StepError'
    | 'StepSkipped'
    | 'StepBlocked'
    | 'AttemptStarted'
    | 'AttemptFinished'
    | 'TaskStarted'
    | 'TaskFinished'
    | 'ObservationCaptured'
    | 'MetricMeasured'
    | 'MetricEvaluationSkipped'
    | 'RuleEvaluated'
    | 'EvidenceCaptured'
    | 'FindingCreated'
    | 'FindingConfirmed'
    | 'VerificationStarted'
    | 'VerificationFinished'
    | 'CleanupFailed'
    | 'ArtifactFailed';
  occurredAt: Timestamp;
  recordedAt: Timestamp;
  reason?: Text;
  error?: ErrorRecord;
  outputIds: IdList;
};
export type TaskExecution = BaseRecord & {
  runId: Id;
  stepId: Id;
  attemptId: Id;
  taskId: Id;
  taskVersion: Version;
  outcome: TaskOutcome;
  businessSuccess: boolean | null;
  feedbackSuccess: boolean | null;
  startedAt: Timestamp;
  endedAt: Timestamp;
  durationMs: number;
  userOperationMs?: number;
  systemWaitMs?: number;
  infrastructureMs?: number;
  method: 'AUTOMATED' | 'USER_RESEARCH';
  evidenceIds: IdList;
  errors: ErrorRecord[];
  limitations: TextList;
};
export type RawObservation = BaseRecord &
  ObservationInputBase & {
    runId: Id;
    stepId: Id;
    attemptId: Id;
    evidenceIds: IdList;
  };
export type MetricResultBase = BaseRecord & {
  runId: Id;
  metricId: Id;
  metricVersion: Version;
  implementationVersion: Version;
  dimensionId: DimensionId;
  measuredAt: Timestamp;
  evidenceIds: IdList;
  observationIds: IdList;
  excludedSampleIds: IdList;
  sampleCount: number;
  inputDigest: Digest;
  limitations: TextList;
  cacheSourceId?: Id;
};
export type MeasuredValue =
  | number
  | boolean
  | string
  | {
      [k: string]: JsonValue;
    };
export type MetricResult = MetricResultBase &
  (
    | {
        status: 'MEASURED';
        value: MeasuredValue;
        unit?: Text;
      }
    | {
        status:
          | 'NOT_EVALUATED'
          | 'NOT_APPLICABLE'
          | 'INSUFFICIENT_EVIDENCE'
          | 'EXECUTION_FAILED'
          | 'INVALID';
        reason: Text;
        error?: ErrorRecord;
      }
  );
export type RuleResultBase = BaseRecord & {
  runId: Id;
  ruleId: Id;
  ruleVersion: Version;
  configurationDigest: Digest;
  inputMetricResultIds: IdList;
  evidenceIds: IdList;
  evaluatedAt: Timestamp;
  reason: Text;
};
export type RuleResult = RuleResultBase &
  (
    | {
        executionStatus: 'COMPLETED';
        outcome: 'PASS' | 'FAIL' | 'INDETERMINATE' | 'NOT_APPLICABLE';
      }
    | {
        executionStatus: 'ERROR';
        outcome: 'EXECUTION_ERROR';
        error: ErrorRecord;
      }
  );
export type Evidence = BaseRecord & {
  runId: Id;
  stepId?: Id;
  attemptId?: Id;
  sourceCategory: EvidenceSource;
  materialType:
    | 'SCREENSHOT'
    | 'DOM'
    | 'TRACE'
    | 'TASK_RECORD'
    | 'OBSERVATION'
    | 'RULE_CHECK'
    | 'REVIEW'
    | 'RESEARCH'
    | 'EXTERNAL_CONSTRAINT';
  sourceMethod: Text;
  lifecycle: EvidenceLifecycle;
  validity: EvidenceValidity;
  summary: Text;
  artifact?: ArtifactReference;
  content?: JsonValue;
  derivedFromIds: IdList;
  observedAt: Timestamp;
  privacy: EvidencePrivacy;
  limitations: TextList;
};
export type ScoreValue =
  | {
      status: 'SCORED';
      value: number;
    }
  | {
      status: 'NOT_SCORED' | 'INSUFFICIENT_INPUTS' | 'CALCULATION_FAILED';
      reason: Text;
    };
export type ScoreResult = BaseRecord &
  ScoreValue & {
    runId: Id;
    metricResultId: Id;
    metricId: Id;
    policyId: Id;
    policyVersion: Version;
    weight: number;
    calculatedAt: Timestamp;
  };
export type DimensionResult = BaseRecord &
  ScoreValue & {
    runId: Id;
    dimensionId: DimensionId;
    scoreResultIds: IdList;
    excludedMetricIds: IdList;
    coverage: Coverage;
    weight: number;
    limitations: TextList;
  };
export type DiagnosticSignal = BaseRecord &
  FindingTemplateBase & {
    runId: Id;
    sourceResultIds: IdList;
    sourceType: 'RULE' | 'METRIC' | 'EXPERT' | 'RESEARCH';
    valid: boolean;
    reason: Text;
    evidenceIds: IdList;
  };
export type Finding = BaseRecord &
  FindingTemplateBase & {
    lifecycle: FindingLifecycleStatus;
    revision: number;
    evaluationRunIds: IdList;
    diagnosticSignalIds: IdList;
    evidenceLinks: EvidenceLink[];
    affectedEntityIds: IdList;
    rootCauseHypothesisIds: IdList;
    recommendationIds: IdList;
    verificationResultIds: IdList;
    firstObservedAt: Timestamp;
    lastObservedAt: Timestamp;
    duplicateOfFindingId?: Id;
    deduplicationKey: Digest;
    limitations: TextList;
  };
export type RootCauseHypothesis = BaseRecord & {
  findingIds: IdList;
  description: Text;
  status: 'HYPOTHESIS' | 'SUPPORTED' | 'REJECTED';
  confidence: Confidence;
  evidenceLinks: EvidenceLink[];
  limitations: TextList;
};
export type Recommendation = BaseRecord & {
  findingIds: IdList;
  rootCauseHypothesisIds: IdList;
  description: Text;
  expectedOutcomes: TextList;
  verificationPlanIds: IdList;
  confidence: Confidence;
  limitations: TextList;
};
export type VerificationPlan = BaseRecord & {
  findingIds: IdList;
  recommendationIds: IdList;
  baselineRunId: Id;
  definition: EvaluationDefinition;
  requiredRuleIds: IdList;
  requiredMetricIds: IdList;
  acceptanceCriteria: TextList;
  criteriaDigest: Digest;
  allowCaveats: boolean;
};
export type VerificationResult = BaseRecord & {
  planId: Id;
  criteriaDigest: Digest;
  findingIds: IdList;
  runId?: Id;
  status: VerificationStatus;
  comparability: Comparability;
  evidenceIds: IdList;
  reason: Text;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
};
export type EvaluationResult = BaseRecord & {
  runId: Id;
  policyId: Id;
  policyVersion: Version;
  policyDigest: Digest;
  evaluationStatus: EvaluationStatus;
  overallOutcome: OverallOutcome;
  overallScore: number | null;
  coverage: Coverage;
  metricResultIds: IdList;
  ruleResultIds: IdList;
  scoreResultIds: IdList;
  dimensionResultIds: IdList;
  findingIds: IdList;
  evidenceIds: IdList;
  constraints: RiskConstraint[];
  limitations: TextList;
};
export type ReportDocument = BaseRecord & {
  reportSchemaVersion: '1.0.0';
  templateVersion: Version;
  reportType:
    | 'FULL'
    | 'SUMMARY'
    | 'DIAGNOSTIC'
    | 'ACCESSIBILITY'
    | 'TASK'
    | 'EXECUTION'
    | 'EVIDENCE'
    | 'REGRESSION';
  generatedAt: Timestamp;
  provenance: ReportProvenance;
  target: Target;
  scope: Scope;
  methods: TextList;
  runStatus: RunStatus;
  evaluation: EvaluationResult;
  metrics: MetricResult[];
  rules: RuleResult[];
  scores: ScoreResult[];
  dimensions: DimensionResult[];
  findings: Finding[];
  evidenceIndex: Evidence[];
  limitations: TextList;
  contentDigest: Digest;
};
export type ReportArtifact = BaseRecord & {
  runId: Id;
  evaluationResultId: Id;
  templateVersion: Version;
  contentDigest: Digest;
  json: ArtifactReference;
  markdown: ArtifactReference;
};
export type RunManifest = BaseRecord & {
  runId: Id;
  revision: number;
  runStatus: RunStatus;
  executionCommitted: boolean;
  files: ArtifactReference[];
  evaluations: ManifestEvaluation[];
  reports: ReportArtifact[];
  failures: ManifestFailure[];
};

export interface ContractMap {
  Id: Id;
  Version: Version;
  Timestamp: Timestamp;
  Digest: Digest;
  Text: Text;
  IdList: IdList;
  TextList: TextList;
  Scalar: Scalar;
  JsonValue: JsonValue;
  DimensionId: DimensionId;
  RunStatus: RunStatus;
  StepStatus: StepStatus;
  TaskOutcome: TaskOutcome;
  MeasurementStatus: MeasurementStatus;
  RuleOutcome: RuleOutcome;
  ScoreStatus: ScoreStatus;
  EvaluationStatus: EvaluationStatus;
  OverallOutcome: OverallOutcome;
  EvidenceSource: EvidenceSource;
  EvidenceLifecycle: EvidenceLifecycle;
  EvidenceValidity: EvidenceValidity;
  FindingLifecycleStatus: FindingLifecycleStatus;
  FindingType: FindingType;
  Severity: Severity;
  Priority: Priority;
  Confidence: Confidence;
  VerificationStatus: VerificationStatus;
  Comparability: Comparability;
  MetricDirection: MetricDirection;
  ValueKind: ValueKind;
  StepKind: StepKind;
  Capability: Capability;
  FailureMode: FailureMode;
  BaseRecord: BaseRecord;
  ErrorRecord: ErrorRecord;
  Viewport: Viewport;
  ExecutionProfile: ExecutionProfile;
  ProfileOverrides: ProfileOverrides;
  RetryPolicy: RetryPolicy;
  Target: Target;
  Scope: Scope;
  MetricField: MetricField;
  MetricDefinition: MetricDefinition;
  RuleExpression: RuleExpression;
  FindingTemplate: FindingTemplate;
  RuleDefinition: RuleDefinition;
  ScoreBinding: ScoreBinding;
  DimensionWeight: DimensionWeight;
  ScoringPolicy: ScoringPolicy;
  BrowserAction: BrowserAction;
  SuccessCondition: SuccessCondition;
  TaskDefinition: TaskDefinition;
  ObservationInput: ObservationInput;
  PlanReference: PlanReference;
  PlannedStep: PlannedStep;
  EvaluationDefinition: EvaluationDefinition;
  VersionRef: VersionRef;
  EvaluationPlan: EvaluationPlan;
  EvaluationRun: EvaluationRun;
  RunContext: RunContext;
  ExecutionStep: ExecutionStep;
  StepAttempt: StepAttempt;
  ExecutionEvent: ExecutionEvent;
  TaskExecution: TaskExecution;
  RawObservation: RawObservation;
  ObservationInputBase: ObservationInputBase;
  MetricResultBase: MetricResultBase;
  MeasuredValue: MeasuredValue;
  MetricResult: MetricResult;
  RuleResultBase: RuleResultBase;
  RuleResult: RuleResult;
  ArtifactReference: ArtifactReference;
  EvidencePrivacy: EvidencePrivacy;
  Evidence: Evidence;
  EvidenceLink: EvidenceLink;
  ScoreValue: ScoreValue;
  ScoreResult: ScoreResult;
  Coverage: Coverage;
  DimensionResult: DimensionResult;
  DiagnosticSignal: DiagnosticSignal;
  FindingTemplateBase: FindingTemplateBase;
  Finding: Finding;
  RootCauseHypothesis: RootCauseHypothesis;
  Recommendation: Recommendation;
  VerificationPlan: VerificationPlan;
  VerificationResult: VerificationResult;
  RiskConstraint: RiskConstraint;
  EvaluationResult: EvaluationResult;
  EvaluationSnapshot: EvaluationSnapshot;
  RunBundle: RunBundle;
  ReportProvenance: ReportProvenance;
  ReportDocument: ReportDocument;
  ReportArtifact: ReportArtifact;
  ManifestEvaluation: ManifestEvaluation;
  ManifestFailure: ManifestFailure;
  RunManifest: RunManifest;
}
export interface BaseRecord {
  id: Id;
  schemaVersion: '1.0.0';
  createdAt: Timestamp;
}
export interface ErrorRecord {
  code: Id;
  message: Text;
  category:
    'INPUT' | 'ENVIRONMENT' | 'EXECUTION' | 'CONTRACT' | 'ARTIFACT' | 'CANCELLED' | 'QUALITY';
  path?: string;
}
export interface Viewport {
  width: number;
  height: number;
}
export interface ExecutionProfile {
  maxConcurrency: number;
  runTimeoutMs: number;
  stepTimeoutMs: number;
  taskTimeoutMs: number;
  cancellationGracePeriodMs: number;
  maxAttempts: number;
  retryableErrorCodes: IdList;
  initialDelayMs: number;
  maxDelayMs: number;
  backoff: 'FIXED' | 'EXPONENTIAL';
  failureMode: FailureMode;
  browser: 'chromium' | 'firefox' | 'webkit';
  viewport: Viewport;
  locale: string;
  colorScheme: 'light' | 'dark';
  allowedOrigins: AllowedOrigins;
  allowPrivateNetwork: boolean;
  allowSideEffects: boolean;
  maxPages: number;
  maxArtifactBytes: number;
  maxTotalArtifactBytes: number;
  cacheEnabled: boolean;
  headless: boolean;
}
export interface ProfileOverrides {
  maxConcurrency?: number;
  runTimeoutMs?: number;
  stepTimeoutMs?: number;
  taskTimeoutMs?: number;
  cancellationGracePeriodMs?: number;
  maxAttempts?: number;
  retryableErrorCodes?: IdList;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoff?: 'FIXED' | 'EXPONENTIAL';
  failureMode?: FailureMode;
  browser?: 'chromium' | 'firefox' | 'webkit';
  viewport?: Viewport;
  locale?: string;
  colorScheme?: 'light' | 'dark';
  allowedOrigins?: AllowedOrigins;
  allowPrivateNetwork?: boolean;
  allowSideEffects?: boolean;
  maxPages?: number;
  maxArtifactBytes?: number;
  maxTotalArtifactBytes?: number;
  cacheEnabled?: boolean;
  headless?: boolean;
}
export interface RetryPolicy {
  maxAttempts: number;
  retryableErrorCodes: IdList;
  initialDelayMs: number;
  maxDelayMs: number;
  backoff: 'FIXED' | 'EXPONENTIAL';
}
export interface Target {
  id: Id;
  name: Text;
  type: 'WEB_APP' | 'PAGE' | 'COMPONENT' | 'TASK' | 'JOURNEY' | 'OFFLINE';
  url?: string;
  version: Text;
  environment: Text;
}
export interface Scope {
  entityIds: IdList;
  routes: TextList;
  taskIds: IdList;
  exclusions: TextList;
  limitations: TextList;
}
export interface MetricField {
  key: Id;
  kind: 'NUMBER' | 'BOOLEAN' | 'CATEGORY';
  required: boolean;
  categories?: TextList;
}
export interface FindingTemplate {
  problemKey: Id;
  title: Text;
  description: Text;
  type: FindingType;
  severity: Severity;
  priority: Priority;
  confidence: Confidence;
  entityId: Id;
  scenarioId: Id;
}
export interface ScoreBinding {
  metricId: Id;
  weight: number;
  normalization: 'LINEAR_HIGHER' | 'LINEAR_LOWER' | 'TARGET_RANGE' | 'BOOLEAN';
  min?: number;
  max?: number;
  targetMin?: number;
  targetMax?: number;
  contextRationale?: Text;
  countingGroup?: Id;
}
export interface DimensionWeight {
  dimensionId: DimensionId;
  weight: number;
  minimumCoverage: number;
}
export interface SuccessCondition {
  kind: 'TEXT' | 'VISIBLE' | 'ATTRIBUTE' | 'URL' | 'BUSINESS_JSON';
  selector?: Text;
  attribute?: Id;
  url?: string;
  field?: Id;
  equals: Scalar;
}
export interface ObservationInput {
  key: Id;
  value: JsonValue;
  unit?: Text;
  entityId: Id;
  scenarioId: Id;
  source: EvidenceSource;
  method: 'AUTOMATED' | 'EXPERT_REVIEW' | 'USER_RESEARCH' | 'PROXY';
  observedAt: Timestamp;
  sampleId: Id;
  excluded: boolean;
  exclusionReason?: Text;
}
export interface PlanReference {
  stepId: Id;
  contract:
    'RawObservation' | 'MetricResult' | 'RuleResult' | 'TaskExecution' | 'Evidence' | 'ScoreResult';
}
export interface PlannedStep {
  stepId: Id;
  kind: StepKind;
  dependsOn: IdList;
  required: boolean;
  inputRefs: PlanReference[];
  outputContracts: (
    'RawObservation' | 'MetricResult' | 'RuleResult' | 'TaskExecution' | 'Evidence' | 'ScoreResult'
  )[];
  requiredCapabilities: Capability[];
  taskId?: Id;
  action?: BrowserAction;
  observation?: ObservationInput;
  metricIds?: IdList;
  ruleIds?: IdList;
  sessionId?: Id;
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
}
export interface VersionRef {
  id: Id;
  version: Version;
  implementationVersion?: Version;
}
export interface ObservationInputBase {
  key: Id;
  value: JsonValue;
  unit?: Text;
  entityId: Id;
  scenarioId: Id;
  source: EvidenceSource;
  method: 'AUTOMATED' | 'EXPERT_REVIEW' | 'USER_RESEARCH' | 'PROXY';
  observedAt: Timestamp;
  sampleId: Id;
  excluded: boolean;
  exclusionReason?: Text;
}
export interface ArtifactReference {
  path: string;
  digest: Digest;
  bytes: number;
  mediaType: Text;
}
export interface EvidencePrivacy {
  classification: 'PUBLIC' | 'INTERNAL' | 'SENSITIVE';
  redacted: boolean;
  /**
   * @minItems 1
   */
  allowedPurposes: [
    'EVALUATION' | 'VERIFICATION' | 'SHARING' | 'RESEARCH',
    ...('EVALUATION' | 'VERIFICATION' | 'SHARING' | 'RESEARCH')[]
  ];
  retentionUntil: Timestamp;
  consentRef?: Id;
}
export interface EvidenceLink {
  evidenceId: Id;
  subjectId: Id;
  subjectType:
    | 'MetricResult'
    | 'RuleResult'
    | 'Finding'
    | 'VerificationResult'
    | 'RootCauseHypothesis'
    | 'Recommendation';
  relation: 'SUPPORTS' | 'CONTRADICTS' | 'CONTEXT' | 'DERIVED_FROM';
  purpose: Text;
}
export interface Coverage {
  planned: number;
  applicable: number;
  measured: number;
  scored: number;
  ratio: number | null;
}
export interface FindingTemplateBase {
  problemKey: Id;
  title: Text;
  description: Text;
  type: FindingType;
  severity: Severity;
  priority: Priority;
  confidence: Confidence;
  entityId: Id;
  scenarioId: Id;
}
export interface RiskConstraint {
  kind: 'CRITICAL_RULE' | 'FINDING_SEVERITY' | 'COVERAGE' | 'EXECUTION';
  sourceIds: IdList;
  reason: Text;
}
export interface EvaluationSnapshot {
  evaluation: EvaluationResult;
  policy: ScoringPolicy;
  scores: ScoreResult[];
  dimensions: DimensionResult[];
  signals: DiagnosticSignal[];
  findings: Finding[];
}
export interface RunBundle {
  schemaVersion: '1.0.0';
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
}
export interface ReportProvenance {
  definitionId: Id;
  definitionVersion: Version;
  planId: Id;
  planDigest: Digest;
  runId: Id;
  evaluationResultId: Id;
  policyId: Id;
  policyVersion: Version;
  engineVersion: Version;
  environmentFingerprint: Digest;
  metricVersions: VersionRef[];
  ruleVersions: VersionRef[];
}
export interface ManifestEvaluation {
  evaluationResultId: Id;
  policyId: Id;
  policyVersion: Version;
  createdAt: Timestamp;
  artifact: ArtifactReference;
}
export interface ManifestFailure {
  stage: 'EXECUTION' | 'CLEANUP' | 'PERSISTENCE' | 'SETTLEMENT' | 'REPORT' | 'RECOVERY';
  at: Timestamp;
  error: ErrorRecord;
}
