const assert = require('assert');
const { generateReflectionReport, computeWeightSuggestions } = require('../reflection.cjs');

// Helper: Create mock audit entries
function createMockEntries(count, options = {}) {
	const entries = [];
	const now = new Date();
	const daysAgo = options.daysAgo || 5;
	const minDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

	for (let i = 0; i < count; i++) {
		const date = new Date(minDate.getTime() + Math.random() * (now.getTime() - minDate.getTime()));
		const outcome = options.outcomes ? options.outcomes[i % options.outcomes.length] : 'approved';

		entries.push({
			timestamp: date.toISOString(),
			project: 'test',
			outcome,
			findings_detail: options.findings ? options.findings[i % options.findings.length] : [
				{ reviewer_role: 'security', finding_id: 'SEC-001', severity: 'blocker', issue: 'Test' },
			],
			suggestions_accepted: options.accepted ? options.accepted[i % options.accepted.length] : [],
			suggestions_rejected: options.rejected ? options.rejected[i % options.rejected.length] : [],
			reviewer_stats: options.stats ? options.stats[i % options.stats.length] : {},
		});
	}

	return entries;
}

// Test 1: No logs → empty metrics, sufficient_data: false
{
	const report = generateReflectionReport(30, { entries: [] });
	assert.strictEqual(report.sufficient_data, false, 'No logs should have sufficient_data: false');
	assert.strictEqual(Object.keys(report.reviewers).length, 0, 'No reviewers with no logs');
	assert.ok(report.generated_at, 'Should have generated_at timestamp');
	assert.strictEqual(report.total_reviews, 0, 'Should have 0 total reviews');
}

// Test 2: With 5+ reviews, precision computed correctly
{
	const findingsDetail = [
		{ reviewer_role: 'security', finding_id: 'SEC-001' },
		{ reviewer_role: 'security', finding_id: 'SEC-002' },
		{ reviewer_role: 'security', finding_id: 'SEC-003' },
		{ reviewer_role: 'testing', finding_id: 'TST-001' },
		{ reviewer_role: 'testing', finding_id: 'TST-002' },
	];

	const entries = [
		{
			timestamp: new Date().toISOString(),
			project: 'test',
			outcome: 'approved',
			findings_detail: findingsDetail,
			suggestions_accepted: ['SEC-001', 'SEC-002', 'TST-001'], // 3 accepted
			suggestions_rejected: ['SEC-003', 'TST-002'], // 2 rejected
			reviewer_stats: {
				security: { proposed: 3, accepted: 2, rejected: 1 },
				testing: { proposed: 2, accepted: 1, rejected: 1 },
			}
		},
		{
			timestamp: new Date(Date.now() - 24*3600*1000).toISOString(),
			project: 'test',
			outcome: 'approved',
			findings_detail: [
				{ reviewer_role: 'security', finding_id: 'SEC-004' },
				{ reviewer_role: 'testing', finding_id: 'TST-003' },
			],
			suggestions_accepted: ['SEC-004', 'TST-003'],
			suggestions_rejected: [],
			reviewer_stats: {
				security: { proposed: 1, accepted: 1, rejected: 0 },
				testing: { proposed: 1, accepted: 1, rejected: 0 },
			}
		},
	];

	const report = generateReflectionReport(30, { entries });
	assert.strictEqual(report.total_reviews, 2, 'Should have 2 reviews');
	assert.strictEqual(report.reviews_with_outcome, 2, 'Should have 2 reviews with outcome');

	// Security: 3 accepted out of 4 proposed = 0.75
	assert.ok(report.reviewers.security, 'Should have security role');
	assert.strictEqual(report.reviewers.security.proposed, 4, 'Security should have 4 proposed');
	assert.strictEqual(report.reviewers.security.accepted, 3, 'Security should have 3 accepted');
	const secPrecision = 3 / 4;
	assert.ok(Math.abs(report.reviewers.security.precision - secPrecision) < 0.01,
		`Security precision should be ~${secPrecision}, got ${report.reviewers.security.precision}`);

	// Testing: 2 accepted out of 3 proposed = 0.667
	assert.ok(report.reviewers.testing, 'Should have testing role');
	const testPrecision = 2 / 3;
	assert.ok(Math.abs(report.reviewers.testing.precision - testPrecision) < 0.01,
		`Testing precision should be ~${testPrecision}, got ${report.reviewers.testing.precision}`);
}

// Test 3: computeWeightSuggestions scales proportionally, clamps at 0.5/3.0
{
	const reviewerMetrics = {
		security: { precision: 0.9, proposed: 10, accepted: 9, review_count: 5 },
		testing: { precision: 0.6, proposed: 10, accepted: 6, review_count: 5 },
		clarity: { precision: 0.3, proposed: 5, accepted: 1, review_count: 2 }, // < min_reviews
	};
	const currentWeights = {
		security: 2.0,
		testing: 1.5,
		clarity: 1.0,
		domain_sme: 1.5, // not in metrics
	};
	const suggestions = computeWeightSuggestions(reviewerMetrics, currentWeights, 5);

	// Average of those with >= 5 reviews: (0.9 + 0.6) / 2 = 0.75
	// security: 2.0 * (0.9 / 0.75) = 2.0 * 1.2 = 2.4
	// testing: 1.5 * (0.6 / 0.75) = 1.5 * 0.8 = 1.2
	// clarity: < min_reviews, should not be in suggestions

	assert.ok(suggestions.security, 'Should have security suggestion');
	assert.ok(suggestions.testing, 'Should have testing suggestion');
	assert.strictEqual(suggestions.clarity, undefined, 'Should not have clarity (< min_reviews)');
	assert.strictEqual(suggestions.domain_sme, undefined, 'Should not have domain_sme (not in metrics)');

	assert.strictEqual(suggestions.security.current, 2.0, 'Security current should be 2.0');
	assert.ok(Math.abs(suggestions.security.suggested - 2.4) < 0.01, 'Security suggested should be ~2.4');

	assert.strictEqual(suggestions.testing.current, 1.5, 'Testing current should be 1.5');
	assert.ok(Math.abs(suggestions.testing.suggested - 1.2) < 0.01, 'Testing suggested should be ~1.2');
}

// Test 4: Weight clamping at 0.5 and 3.0
{
	const reviewerMetrics = {
		low: { precision: 0.1, proposed: 10, accepted: 1, review_count: 5 },
		high: { precision: 0.95, proposed: 10, accepted: 9, review_count: 5 },
	};
	const currentWeights = {
		low: 1.0,
		high: 1.0,
	};
	const suggestions = computeWeightSuggestions(reviewerMetrics, currentWeights, 5);

	// Average precision: (0.1 + 0.95) / 2 = 0.525
	// low: 1.0 * (0.1 / 0.525) = 0.19... → clamped to 0.5
	// high: 1.0 * (0.95 / 0.525) = 1.81... → no clamp
	assert.ok(suggestions.low.suggested >= 0.5, 'Low should be clamped to min 0.5');
	assert.ok(suggestions.high.suggested <= 3.0, 'High should be clamped to max 3.0');
}

// Test 5: Reviewer with < min_reviews excluded from suggestions
{
	const reviewerMetrics = {
		security: { precision: 0.9, proposed: 10, accepted: 9, review_count: 5 },
		testing: { precision: 0.7, proposed: 3, accepted: 2, review_count: 2 }, // Only 2 reviews
	};
	const currentWeights = {
		security: 2.0,
		testing: 1.5,
	};
	const suggestions = computeWeightSuggestions(reviewerMetrics, currentWeights, 5);

	assert.ok(suggestions.security, 'Security should be included');
	assert.strictEqual(suggestions.testing, undefined, 'Testing should be excluded (< 5 reviews)');
}

// Test 6: outcome_correlation counts approved/edited, not rejected
{
	const baseTime = new Date();
	const entries = [
		// Review 1: security proposes finding, gets accepted, outcome is approved
		{
			timestamp: new Date(baseTime.getTime()).toISOString(),
			project: 'test',
			outcome: 'approved', // ✓ counts for correlation
			findings_detail: [
				{ reviewer_role: 'security', finding_id: 'SEC-001' },
			],
			suggestions_accepted: ['SEC-001'],
			suggestions_rejected: [],
			reviewer_stats: { security: { proposed: 1, accepted: 1, rejected: 0 } },
		},
		// Review 2: security proposes finding, gets accepted, outcome is edited
		{
			timestamp: new Date(baseTime.getTime() + 1000).toISOString(),
			project: 'test',
			outcome: 'edited', // ✓ counts for correlation
			findings_detail: [
				{ reviewer_role: 'security', finding_id: 'SEC-002' },
			],
			suggestions_accepted: ['SEC-002'],
			suggestions_rejected: [],
			reviewer_stats: { security: { proposed: 1, accepted: 1, rejected: 0 } },
		},
		// Review 3: security proposes finding, gets accepted, outcome is rejected
		{
			timestamp: new Date(baseTime.getTime() + 2000).toISOString(),
			project: 'test',
			outcome: 'rejected', // ✗ does NOT count for correlation
			findings_detail: [
				{ reviewer_role: 'security', finding_id: 'SEC-003' },
			],
			suggestions_accepted: ['SEC-003'],
			suggestions_rejected: [],
			reviewer_stats: { security: { proposed: 1, accepted: 1, rejected: 0 } },
		},
		// Review 4: security proposes but gets rejected
		{
			timestamp: new Date(baseTime.getTime() + 3000).toISOString(),
			project: 'test',
			outcome: 'approved',
			findings_detail: [
				{ reviewer_role: 'security', finding_id: 'SEC-004' },
			],
			suggestions_accepted: [],
			suggestions_rejected: ['SEC-004'],
			reviewer_stats: { security: { proposed: 1, accepted: 0, rejected: 1 } },
		},
	];

	const report = generateReflectionReport(30, { entries });
	// Security participated in 4 reviews, had >= 1 accepted finding AND outcome in (approved|edited) for 2
	// correlation = 2 / 4 = 0.5
	const expectedCorrelation = 2 / 4;
	assert.ok(Math.abs(report.reviewers.security.outcome_correlation - expectedCorrelation) < 0.01,
		`Security outcome_correlation should be ${expectedCorrelation}, got ${report.reviewers.security.outcome_correlation}`);
}

// Test: Weight delta cap prevents aggressive swings
{
	const { computeWeightSuggestions } = require('../reflection.cjs');
	// Create a scenario with extreme precision divergence
	const reviewerMetrics = {
		security: { review_count: 10, precision: 1.0, proposed: 20, accepted: 20, rejected: 0, outcome_correlation: 1.0 },
		clarity: { review_count: 10, precision: 0.1, proposed: 20, accepted: 2, rejected: 18, outcome_correlation: 0.2 },
	};
	const currentWeights = { security: 1.0, clarity: 1.0 };
	const suggestions = computeWeightSuggestions(reviewerMetrics, currentWeights, 5);

	// With avg precision = 0.55, security scale = 1.0/0.55 = 1.82, clarity scale = 0.1/0.55 = 0.18
	// Without delta cap: security would go to 1.82, clarity to 0.18 (clamped to 0.5)
	// With delta cap: max change is ±0.5 per run
	const secDelta = Math.abs(suggestions.security.suggested - currentWeights.security);
	const clrDelta = Math.abs(suggestions.clarity.suggested - currentWeights.clarity);
	assert.ok(secDelta <= 0.5 + 0.01, `Security delta ${secDelta} should be <= 0.5`);
	assert.ok(clrDelta <= 0.5 + 0.01, `Clarity delta ${clrDelta} should be <= 0.5`);
}

console.log('reflection.test: all tests passed');
