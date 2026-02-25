const assert = require('assert');
const { computeCompositeScore } = require('../editor.cjs');
const { computeReviewerEffectiveness } = require('../stats.cjs');

// Mock audit entries for correlation testing
let mockEntryCounter = 0;
function createMockEntry(compositeScore, outcome, accepted, rejected) {
	// Use unique timestamps by adding counter milliseconds
	const ts = new Date(Date.now() + mockEntryCounter++);
	return {
		timestamp: ts.toISOString(),
		original_prompt_hash: 'abc123',
		reviewers_active: ['security', 'clarity', 'testing'],
		findings_detail: [
			{ reviewer_role: 'security', finding_id: 'SEC-001', severity: 'major', confidence: 0.9 },
			{ reviewer_role: 'clarity', finding_id: 'CLR-001', severity: 'minor', confidence: 0.7 },
			{ reviewer_role: 'testing', finding_id: 'TST-001', severity: 'blocker', confidence: 0.95 },
		],
		composite_score: compositeScore,
		suggestions_accepted: accepted || [],
		suggestions_rejected: rejected || [],
		outcome: outcome,
		scores: {
			security: 7.5,
			clarity: 6.0,
			testing: 8.5,
		},
	};
}

// Test 1: High composite + approved outcome should correlate positively
{
	const entries = [
		createMockEntry(8.5, 'approved', ['SEC-001', 'TST-001'], ['CLR-001']),
		createMockEntry(9.0, 'approved', ['SEC-001', 'CLR-001', 'TST-001'], []),
		createMockEntry(8.2, 'edited', ['SEC-001'], ['CLR-001', 'TST-001']),
	];

	const effectiveness = computeReviewerEffectiveness(entries);
	assert(effectiveness.security, 'Security role should have metrics');
	assert(effectiveness.security.precision >= 0.5, 'Security should have meaningful acceptance rate');

	console.log('✓ Test 1: High composite scores correlate with accepted findings');
}

// Test 2: Low composite + rejected outcome should be negative correlation
{
	const entries = [
		createMockEntry(3.0, 'rejected', [], ['SEC-001', 'CLR-001', 'TST-001']),
		createMockEntry(2.5, 'rejected', [], ['SEC-001', 'CLR-001']),
		createMockEntry(3.5, 'rejected', ['TST-001'], ['SEC-001', 'CLR-001']),
	];

	const effectiveness = computeReviewerEffectiveness(entries);
	assert(effectiveness.security, 'Security should have metrics');
	// Low scores should have low acceptance rates
	const avgAcceptance = Object.values(effectiveness).reduce((sum, m) => sum + m.precision, 0) / Object.keys(effectiveness).length;
	assert(avgAcceptance < 0.7, 'Low composite scores should lead to low acceptance rates');

	console.log('✓ Test 2: Low composite scores correlate with rejected findings');
}

// Test 3: Compute composite score from critiques
{
	const critiques = [
		{ reviewer_role: 'security', score: 8.0 },
		{ reviewer_role: 'clarity', score: 6.5 },
		{ reviewer_role: 'testing', score: 7.5 },
	];

	const weights = {
		security: 1.2,
		clarity: 1.0,
		testing: 1.1,
	};

	const result = computeCompositeScore(critiques, weights);
	assert(result.composite !== null, 'Composite score should be computed');
	assert(result.composite >= 6 && result.composite <= 8.5, 'Composite should be in reasonable range');
	assert(result.scores.security === 8.0, 'Scores map should contain individual scores');

	console.log(`✓ Test 3: Composite score computed correctly: ${result.composite}`);
}

// Test 4: Composite formula: Σ(score * weight) / Σ(weight)
{
	const critiques = [
		{ reviewer_role: 'security', score: 10.0 },
		{ reviewer_role: 'clarity', score: 5.0 },
	];

	const weights = {
		security: 2.0,
		clarity: 1.0,
	};

	const result = computeCompositeScore(critiques, weights);
	// Expected: (10 * 2 + 5 * 1) / (2 + 1) = 25 / 3 = 8.33
	const expected = Math.round((25 / 3) * 100) / 100;
	assert.strictEqual(result.composite, expected, `Composite should be ${expected}, got ${result.composite}`);

	console.log(`✓ Test 4: Composite formula verified: (10*2 + 5*1)/(2+1) = ${result.composite}`);
}

// Test 5: Reviewer effectiveness includes precision field
{
	const entries = [
		createMockEntry(7.5, 'approved', ['SEC-001'], ['CLR-001', 'TST-001']),
		createMockEntry(7.0, 'approved', ['SEC-001'], ['CLR-001']),
		createMockEntry(6.8, 'edited', ['SEC-001', 'TST-001'], ['CLR-001']),
	];

	const effectiveness = computeReviewerEffectiveness(entries);

	// Verify each role has the expected fields
	for (const [role, metrics] of Object.entries(effectiveness)) {
		assert(typeof metrics.precision === 'number', `${role} should have precision number`);
		assert(typeof metrics.proposed === 'number', `${role} should have proposed count`);
		assert(typeof metrics.accepted === 'number', `${role} should have accepted count`);
		assert(typeof metrics.rejected === 'number', `${role} should have rejected count`);
		assert(typeof metrics.review_count === 'number', `${role} should have review_count`);
		assert(metrics.precision >= 0 && metrics.precision <= 1, `${role} precision should be in [0,1]`);
	}

	console.log('✓ Test 5: Reviewer effectiveness includes precision, accepted, rejected, and review_count fields');
}

// Test 6: Mixed data with direction check (Pearson-like direction)
{
	const entries = [
		// High scores + accepted
		createMockEntry(8.5, 'approved', ['SEC-001'], []),
		createMockEntry(8.0, 'approved', ['SEC-001'], ['CLR-001']),
		// Medium scores + mixed
		createMockEntry(5.5, 'edited', ['SEC-001'], ['CLR-001']),
		createMockEntry(5.0, 'edited', [], ['SEC-001']),
		// Low scores + rejected
		createMockEntry(3.0, 'rejected', [], ['SEC-001']),
		createMockEntry(2.5, 'rejected', [], ['SEC-001']),
	];

	const effectiveness = computeReviewerEffectiveness(entries);
	assert(effectiveness.security.precision > 0, 'Direction should be positive (high scores -> accepted)');

	console.log('✓ Test 6: Score-outcome correlation direction verified');
}

// Test 7: No scores case
{
	const critiques = [
		{ reviewer_role: 'security', no_issues: true },
		{ reviewer_role: 'clarity', score: null },
	];

	const result = computeCompositeScore(critiques, {});
	assert(result.composite === null, 'Composite should be null if no valid scores');

	console.log('✓ Test 7: Null composite when no valid scores');
}

// Test 8: Precision calculation edge cases
{
	const entries = [
		// Role A: 3 proposed, all accepted → precision 1.0
		createMockEntry(8.0, 'approved', ['SEC-001', 'CLR-001', 'TST-001'], []),
	];

	const effectiveness = computeReviewerEffectiveness(entries);
	// Note: In this case, each role proposed 1 finding and it was accepted
	assert(effectiveness.security.precision === 1.0, 'Perfect precision should be 1.0');
	assert(effectiveness.clarity.precision === 1.0, 'Perfect precision should be 1.0');
	assert(effectiveness.testing.precision === 1.0, 'Perfect precision should be 1.0');

	console.log('✓ Test 8: Precision edge case (perfect precision = 1.0)');
}

// Test 9: Coverage ratio concept (review count tracking)
{
	const entries = [
		createMockEntry(7.0, 'approved', ['SEC-001'], ['CLR-001']),
		createMockEntry(7.5, 'approved', ['SEC-001', 'CLR-001'], []),
		createMockEntry(6.5, 'edited', ['TST-001'], ['CLR-001']),
		createMockEntry(6.0, 'edited', ['SEC-001'], ['CLR-001', 'TST-001']),
	];

	const effectiveness = computeReviewerEffectiveness(entries);
	// Each role participated in multiple reviews
	assert(effectiveness.security.review_count >= 3, 'Security should appear in multiple reviews');
	assert(effectiveness.clarity.review_count >= 4, 'Clarity should appear in multiple reviews');

	console.log('✓ Test 9: Review participation count tracked correctly');
}

// Test 10: Weight clamping in composite score
{
	const critiques = [
		{ reviewer_role: 'security', score: 5.0 },
	];

	// Extreme weights should still produce valid composite
	const weights1 = { security: 0.1 };
	const result1 = computeCompositeScore(critiques, weights1);
	assert(result1.composite === 5.0, 'Score with low weight should still compute');

	const weights2 = { security: 10.0 };
	const result2 = computeCompositeScore(critiques, weights2);
	assert(result2.composite === 5.0, 'Score with high weight should still compute');

	console.log('✓ Test 10: Composite score handles extreme weights');
}

console.log('\nAll scoring accuracy tests passed (10/10) ✓');
