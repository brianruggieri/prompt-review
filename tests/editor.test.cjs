const assert = require('assert');
const { mergeCritiques, detectConflicts, applyPriorityOrder } = require('../editor.cjs');

// Test: non-conflicting ops merge cleanly
{
  const critiques = [
    { reviewer_role: 'security', findings: [{ id: 'S1', severity: 'blocker', suggested_ops: [{ op: 'AddGuardrail', target: 'constraints', value: 'No secrets' }] }], no_issues: false },
    { reviewer_role: 'testing', findings: [{ id: 'T1', severity: 'major', suggested_ops: [{ op: 'AddAcceptanceCriteria', target: 'constraints', value: 'Run tests' }] }], no_issues: false },
  ];
  const priority = ['security', 'testing', 'domain_sme', 'clarity'];
  const result = mergeCritiques(critiques, priority);
  assert.strictEqual(result.allOps.length, 2, 'Should have 2 ops');
  assert.strictEqual(result.conflicts.length, 0, 'No conflicts');
}

// Test: duplicate ops are deduplicated
{
  const critiques = [
    { reviewer_role: 'security', findings: [{ id: 'S1', severity: 'blocker', suggested_ops: [{ op: 'AddGuardrail', target: 'constraints', value: 'No secrets' }] }], no_issues: false },
    { reviewer_role: 'domain_sme', findings: [{ id: 'D1', severity: 'minor', suggested_ops: [{ op: 'AddGuardrail', target: 'constraints', value: 'No secrets' }] }], no_issues: false },
  ];
  const result = mergeCritiques(critiques, ['security', 'domain_sme']);
  assert.strictEqual(result.allOps.length, 1, 'Duplicate ops should be deduplicated');
}

// Test: all no_issues returns empty
{
  const critiques = [
    { reviewer_role: 'security', findings: [], no_issues: true },
    { reviewer_role: 'clarity', findings: [], no_issues: true },
  ];
  const result = mergeCritiques(critiques, ['security', 'clarity']);
  assert.strictEqual(result.allOps.length, 0, 'No ops when all clear');
  assert.strictEqual(result.noChanges, true);
}

// Test: priority ordering works
{
  const ops = [
    { reviewer_role: 'clarity', op: 'ReplaceVague', value: 'A' },
    { reviewer_role: 'security', op: 'AddGuardrail', value: 'B' },
    { reviewer_role: 'testing', op: 'AddAcceptanceCriteria', value: 'C' },
  ];
  const ordered = applyPriorityOrder(ops, ['security', 'testing', 'clarity']);
  assert.strictEqual(ordered[0].reviewer_role, 'security');
  assert.strictEqual(ordered[1].reviewer_role, 'testing');
  assert.strictEqual(ordered[2].reviewer_role, 'clarity');
}

const { computeCompositeScore } = require('../editor.cjs');

// Test: composite score with 4 reviewers
{
  const critiques = [
    { reviewer_role: 'security', score: 8.0 },
    { reviewer_role: 'testing', score: 5.0 },
    { reviewer_role: 'domain_sme', score: 7.0 },
    { reviewer_role: 'clarity', score: 6.0 },
  ];
  const weights = { security: 2.0, testing: 1.5, domain_sme: 1.5, clarity: 1.0 };
  const result = computeCompositeScore(critiques, weights);
  // Numerator: 8*2.0 + 5*1.5 + 7*1.5 + 6*1.0 = 16+7.5+10.5+6 = 40
  // Denominator: 2.0+1.5+1.5+1.0 = 6.0
  // Composite: 40/6.0 = 6.666...
  assert.ok(Math.abs(result.composite - 6.67) < 0.01, `Expected ~6.67, got ${result.composite}`);
  assert.strictEqual(Object.keys(result.scores).length, 4);
}

// Test: composite score with missing scores (some reviewers didn't return score)
{
  const critiques = [
    { reviewer_role: 'security', score: 9.0 },
    { reviewer_role: 'testing' },  // no score
    { reviewer_role: 'clarity', score: 7.0 },
  ];
  const weights = { security: 2.0, testing: 1.5, clarity: 1.0 };
  const result = computeCompositeScore(critiques, weights);
  // Only security and clarity contribute
  // Numerator: 9*2.0 + 7*1.0 = 18+7 = 25
  // Denominator: 2.0+1.0 = 3.0
  // Composite: 25/3.0 = 8.33
  assert.ok(Math.abs(result.composite - 8.33) < 0.01, `Expected ~8.33, got ${result.composite}`);
  assert.strictEqual(Object.keys(result.scores).length, 2, 'Only 2 reviewers with scores');
}

// Test: no scores at all returns null composite
{
  const critiques = [
    { reviewer_role: 'security' },
    { reviewer_role: 'testing' },
  ];
  const weights = { security: 2.0, testing: 1.5 };
  const result = computeCompositeScore(critiques, weights);
  assert.strictEqual(result.composite, null, 'No scores should return null');
  assert.strictEqual(Object.keys(result.scores).length, 0);
}

// Test: default weights used when reviewer has no weight entry
{
  const critiques = [
    { reviewer_role: 'security', score: 8.0 },
    { reviewer_role: 'frontend_ux', score: 6.0 },
  ];
  const weights = { security: 2.0 };  // no frontend_ux weight
  const result = computeCompositeScore(critiques, weights);
  // frontend_ux defaults to 1.0
  // Numerator: 8*2.0 + 6*1.0 = 22
  // Denominator: 2.0+1.0 = 3.0
  // Composite: 22/3.0 = 7.33
  assert.ok(Math.abs(result.composite - 7.33) < 0.01, `Expected ~7.33, got ${result.composite}`);
}

console.log('editor.test: all tests passed');
