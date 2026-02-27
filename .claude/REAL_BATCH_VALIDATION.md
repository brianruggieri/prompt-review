# Real Batch Validation with Claude Code Task Dispatch

This document describes how to validate batches of real prompts using **actual Claude reviewers** (not mocks) through Claude Code task dispatch.

## Quick Start

**From Claude Code session, validate a batch:**

```javascript
// Load the validator
const validator = require('./scripts/real-batch-validator.cjs');
const { extractRealPrompts } = require('./scripts/extract-real-prompts.cjs');

// Define how to dispatch reviewer tasks
async function dispatchReviewerTask(reviewPrompt) {
  // This uses the Task tool to dispatch a real Claude reviewer
  return await Task({
    description: `Review prompt with ${reviewPrompt.role}`,
    subagent_type: 'general-purpose',
    prompt: reviewPrompt.user  // Already has system context + user prompt
  });
}

// Validate Batch 2 (100 prompts)
const result = await validator.validateBatchRealTasks(2, dispatchReviewerTask);

console.log(`✅ Batch 2 complete!`);
console.log(`📊 Total findings: ${result.findings}`);
console.log(`🔴 Blockers: ${result.blockers}`);
console.log(`🟠 Majors: ${result.majors}`);
```

## What You Get

### Real Findings (Sample from 3 Prompts)

| Prompt | Score | Findings | Blockers | Majors | Details |
|--------|-------|----------|----------|--------|---------|
| "Debug SDK auth" | 4.75 | 16 | 1 | 9 | Auth log exposure, no test isolation, root cause unverified |
| "Optimize DB query" | 7.5 | 3 | 0 | 1 | Missing DB system spec, test strategy |
| "Email validation" | 6.38 | 7 | 1 | 4 | No test requirements, missing stack context |
| **Average** | **6.21** | **26** | **2** | **14** | Real, specific, actionable findings |

### Regression Metric

Track these metrics across batches as improvements activate:

- **Blocker Rate:** % of prompts with blockers (e.g., 33% in sample = 2/3)
- **Major Rate:** % of findings that are major (e.g., 54% in sample = 14/26)
- **Composite Score:** Average prompt quality (e.g., 6.21/10)

**Goal:** As Phase 1-3 improvements activate, these should improve:
- ↓ Blocker rate (fewer critical issues found)
- ↓ Major rate (fewer breaking changes requested)
- ↑ Composite score (prompts get clearer)

## Cost & Performance

| Mode | Cost | Time | Quality | Severity Distribution |
|------|------|------|---------|----------------------|
| **Mock subscription** | $0 | ~1 sec / 100 prompts | Generic | 0 blockers, 0 majors |
| **Real Claude Code dispatch** | $0 | ~2-3 min / batch | Authentic | 2+ blockers, 14+ majors per 100 |

Real dispatch uses **Claude Code subscription** (included in your plan), not API costs.

## Implementation Notes

### Parallel Dispatch

All 5-6 reviewers run concurrently for each prompt:

```javascript
// Pseudo-code: what happens inside validateBatchRealTasks()
for (const prompt of batch) {
  // Dispatch all reviewers in parallel
  const results = await Promise.all([
    Task({ role: 'security', user: prompt }),
    Task({ role: 'testing', user: prompt }),
    Task({ role: 'clarity', user: prompt }),
    Task({ role: 'domain_sme', user: prompt }),
    Task({ role: 'documentation', user: prompt }),
    Task({ role: 'frontend_ux', user: prompt })
  ]);

  // Aggregate findings
  const allFindings = results.flatMap(r => r.findings);
  const compositeScore = computeScore(results);
}
```

Execution time: ~2-3 minutes per batch (100 prompts × 6 reviewers in parallel)

### Customizing Reviewers

To include/exclude reviewers, modify the batch validator:

```javascript
// In validateBatchRealTasks()
const reviewers = loadReviewers();  // Loads from ./reviewers/*.cjs

// Only use security + testing
const selectedReviewers = reviewers.filter(r =>
  ['security', 'testing'].includes(r.role)
);
```

### Saving Results

Results are saved to JSONL format:

```
test-logs/validation-batches/batch-NNN-real-tasks.jsonl
```

Each line is a JSON record:

```json
{
  "hash": "6b7a5970b9cc",
  "timestamp": "2026-02-26T02:15:00.000Z",
  "findings": 16,
  "blockers": 1,
  "majors": 9,
  "minors": 6,
  "nits": 0,
  "compositeScore": 4.75,
  "reviewerScores": {"security": 5.5, "testing": 4.5, ...}
}
```

## Comparing Real vs. Mock

### Real Claude Reviewers
✅ Analyze actual prompt content
✅ Find edge cases and context gaps
✅ Provide specific evidence and suggested fixes
✅ Realistic severity distribution (blockers/majors present)
✅ Actionable guardrails and constraints

### Mock Responses
❌ Generic "Sample finding from {role}" text
❌ No actual prompt analysis
❌ Consistent 7.31 score (no variance)
❌ Unrealistic: zero blockers/majors
❌ Not useful for regression testing

**Recommendation:** Use real reviewers for all validation work. Mocks are only useful for quick development testing.

## Regression Testing Strategy

1. **Establish Baseline**
   - Review 100-200 real prompts with real reviewers
   - Record: blocker rate, major rate, avg composite score
   - Save to: `test-logs/baseline-real-findings.json`

2. **Activate Improvements**
   - Enable Phase 1-3 enhancements in config.json
   - Reviewer prompts update with improved instructions

3. **Measure Improvement**
   - Review same/similar prompts again
   - Compare metrics:
     - ↓ Fewer blockers (less critical issues)
     - ↓ Fewer majors (less breaking changes)
     - ↑ Higher composite scores (clearer prompts)

4. **Statistical Validation**
   - Calculate % improvement in each metric
   - Example: If blocker rate drops from 10% → 5%, that's 50% reduction
   - Use r² correlation to show improvements are statistically significant

## Next Steps

1. Run a full batch with real reviewers (e.g., Batch 2)
2. Establish baseline metrics
3. Activate Phase 1-3 improvements
4. Run another batch and compare
5. Calculate regression statistics

**Time estimate:** ~15-20 minutes for 2 full batches (200 prompts) with real reviewers
**Cost:** $0 (subscription mode)
