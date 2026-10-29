---
name: uxq-ux-evaluation
description: Quantitatively inspect, analyze, diagnose, and verify rendered UI quality using UXQ CLI. Covers task completion, cognitive load, accessibility, metrics, scoring, diagnostic, regression, and report generation. Use when the user asks about UX quality, design evaluation, accessibility checks, cognitive load analysis, task completion metrics, regression comparison, or wants a UX evaluation report.
---

# UXQ UX Evaluation Skill

## Purpose

Use UXQ to quantitatively evaluate, measure, and improve user experience quality.

UXQ provides deterministic evidence for:

- Task Completion Analysis
- Cognitive Load Measurement
- Accessibility Evaluation
- User Research Integration
- Evidence Management & Traceability
- UX Metrics & Scoring
- Diagnostic & Recommendations
- Regression Testing
- Report Generation

## Source of Truth

UXQ is the source of truth for deterministic UX quality results.

Do not independently calculate or override:

- task completion rates
- cognitive load scores
- accessibility metrics
- evaluation states
- regression classifications
- user research findings

## Core Workflow

Resolve:

1. User intent (evaluate/measure/diagnose/compare)
2. Target (URL/page/component/task flow)
3. Scope (task-focused/cognitive/accessibility/comprehensive)
4. User profile (novice/expert/special needs)
5. Baseline if required
6. Evidence sources

Then execute the corresponding UXQ CLI workflow.

Prefer JSON output for programmatic consumption.

## Workflows

Detailed workflow documentation is available in the `workflows/` directory.

### Task Evaluation

Use for analyzing user task completion and interaction quality.

📖 [Detailed Documentation](./workflows/task-evaluation.md)

**Commands:**

```bash
# Evaluate task flow
uxq task evaluate --url <target> --task <task-definition>

# Measure completion metrics
uxq task measure --run-id <id> --metrics time,errors,success-rate

# Analyze interaction patterns
uxq task analyze --run-id <id> --focus interactions
```

**Outputs:**

- Task completion rate
- Time-on-task metrics
- Error frequency & severity
- Interaction efficiency score
- Task difficulty index

### Cognitive Load Measurement

Use for measuring user cognitive burden and mental effort.

📖 [Detailed Documentation](./workflows/cognitive-load.md)

**Commands:**

```bash
# Measure cognitive load
uxq cognition measure --url <target> --methods nasa-tlx,secondary-task

# Analyze information complexity
uxq cognition analyze --page <url> --metrics complexity,clarity

# Compare design alternatives
uxq cognition compare --baseline <a> --candidate <b>
```

**Outputs:**

- NASA-TLX scores (6 dimensions)
- Information complexity index
- Cognitive demand breakdown
- Mental effort ratio
- Design comparison matrix

### Accessibility Evaluation

Use for assessing accessibility compliance and inclusivity.

📖 [Detailed Documentation](./workflows/accessibility.md)

**Commands:**

```bash
# WCAG compliance check
uxq accessibility audit --url <target> --standard WCAG21-AA

# Screen reader compatibility
uxq accessibility screen-reader --url <target> --readers nvda,voiceover

# Keyboard navigation test
uxq accessibility keyboard --url <target> --test tab-order,shortcuts
```

**Outputs:**

- WCAG success criteria compliance
- Accessibility violations (by severity)
- Screen reader compatibility score
- Keyboard navigability index
- Inclusive design percentage

### Evidence Management

Use for collecting, linking, and tracing evaluation evidence.

📖 [Detailed Documentation](./workflows/evidence.md)

**Commands:**

```bash
# Collect evidence
uxq evidence collect --run-id <id> --type screenshot,video,metrics

# Link evidence to findings
uxq evidence link --evidence-id <id> --finding-id <id>

# Generate traceability report
uxq evidence trace --run-id <id> --format matrix
```

**Outputs:**

- Evidence catalog with metadata
- Finding-evidence linkages
- Traceability matrix
- Evidence completeness score
- Audit trail

### User Research Integration

Use for integrating qualitative user research data.

📖 [Detailed Documentation](./workflows/research.md)

**Commands:**

```bash
# Import research data
uxq research import --source <file> --format csv,json

# Code qualitative data
uxq research code --data <file> --method thematic

# Synthesize findings
uxq research synthesize --studies <ids> --output report
```

**Outputs:**

- Coded themes & patterns
- User persona insights
- Qualitative-quantitative correlation
- Research synthesis report
- Actionable recommendations

### Metrics & Scoring

Use for computing UX metrics and overall scores.

📖 [Detailed Documentation](./workflows/metrics-scoring.md)

**Commands:**

```bash
# Calculate metrics
uxq metrics calculate --run-id <id> --metrics all

# Compute weighted scores
uxq scoring compute --run-id <id> --weights task:0.4,cognition:0.3,a11y:0.3

# Benchmark against standards
uxq scoring benchmark --run-id <id> --industry <sector>
```

**Outputs:**

- Metric values with confidence intervals
- Weighted UX score (0-100)
- Dimension breakdown
- Industry percentile ranking
- Trend analysis

### Diagnostic & Recommendations

Use for diagnosing issues and generating improvement suggestions.

📖 [Detailed Documentation](./workflows/diagnostic.md)

**Commands:**

```bash
# Diagnose problems
uxq diagnostic analyze --run-id <id> --severity critical,high

# Generate recommendations
uxq diagnostic recommend --finding-ids <ids> --prioritize impact,effort

# Create improvement plan
uxq diagnostic plan --recommendations <ids> --timeline short,mid,long
```

**Outputs:**

- Root cause hypotheses
- Issue severity classification
- Prioritized recommendations
- Improvement roadmap
- Expected impact estimates

### Regression Testing

Use for comparing current UX against baselines.

📖 [Detailed Documentation](./workflows/regression.md)

**Commands:**

```bash
# Create baseline
uxq regression baseline --run-id <id> --label <version>

# Compare runs
uxq regression compare --baseline <id> --current <id>

# Detect regressions
uxq regression detect --comparison <id> --thresholds score:-5,metrics:+10%
```

**Outputs:**

- Baseline snapshot
- Comparison matrix
- Regression alerts (by severity)
- Improvement highlights
- Change impact analysis

### Report Generation

Use for generating comprehensive UX evaluation reports.

📖 [Detailed Documentation](./workflows/report.md)

**Commands:**

```bash
# Generate full report
uxq report generate --run-id <id> --format markdown,pdf

# Create executive summary
uxq report summary --run-id <id> --audience stakeholders

# Export findings
uxq report export --run-id <id> --format json,csv
```

**Outputs:**

- Comprehensive evaluation report
- Executive summary
- Technical findings document
- Stakeholder presentation
- Raw data export

### Design System Evaluation

Use for evaluating design system conformance and consistency.

📖 [Detailed Documentation](./workflows/design-system.md)

**Commands:**

```bash
# Token compliance
uxq design-system tokens --url <target> --spec <token-file>

# Theme consistency
uxq design-system theme --url <target> --themes light,dark

# Component usage
uxq design-system components --url <target> --library <name>
```

**Outputs:**

- Token conformance score
- Theme consistency index
- Component usage coverage
- Design system violations
- Alignment recommendations

## Integration Patterns

### With Playwright MCP

```typescript
// 1. Navigate to target
await playwright.navigate({ url: 'https://example.com' });

// 2. Run UXQ evaluation
const result = await uxq.evaluate({
  target: 'https://example.com',
  scope: 'comprehensive',
});

// 3. Extract evidence
const evidence = await uxq.evidence.collect({
  runId: result.runId,
  types: ['screenshot', 'metrics'],
});
```

### With Browser MCP

```javascript
// 1. Take snapshot
const snapshot = await browser.takeSnapshot();

// 2. Analyze with UXQ
const analysis = await uxq.analyze({
  snapshot,
  focus: 'cognitive-load',
});

// 3. Get recommendations
const recommendations = analysis.recommendations;
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: UXQ Evaluation
  run: |
    uxq task evaluate --url ${{ env.URL }} --task smoke-test
    uxq scoring compute --run-id latest --threshold 80
    uxq regression detect --baseline main --thresholds score:-5
```

## Best Practices

1. **Define Clear Tasks**: Task definitions should be specific, measurable, and user-centric
2. **Collect Multiple Evidence Types**: Combine screenshots, metrics, and user data
3. **Use Weighted Scoring**: Adjust weights based on your product priorities
4. **Establish Baselines**: Create baselines before major releases for regression tracking
5. **Iterate on Recommendations**: Prioritize by impact and effort
6. **Integrate Early**: Run evaluations in design review, not just after implementation
7. **Document User Profiles**: Different user types may have different UX patterns
8. **Track Trends**: Monitor UX scores over time to identify degradation

## Output Formats

All commands support:

- `--format json` - Machine-readable (default for automation)
- `--format markdown` - Human-readable reports
- `--format csv` - Tabular data export
- `--format html` - Interactive reports (when applicable)

## Error Handling

UXQ commands return structured errors:

```json
{
  "error": {
    "code": "TASK_TIMEOUT",
    "message": "Task completion exceeded threshold",
    "details": {
      "threshold": 30000,
      "actual": 45000
    },
    "suggestion": "Consider breaking task into smaller steps"
  }
}
```

## Versioning

This skill follows semantic versioning:

- Major: Breaking changes to workflows or outputs
- Minor: New workflows or enhanced capabilities
- Patch: Bug fixes and documentation updates
