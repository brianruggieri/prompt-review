const assert = require('assert');
const path = require('path');
const fs = require('fs');

/**
 * Eval Harness Test
 *
 * Validates reviewer critique outputs against golden prompt expectations.
 * Uses mock critiques that simulate realistic reviewer responses, then
 * scores them against the expected findings schema to compute:
 *   - True positives (correct detections)
 *   - False negatives (missed detections)
 *   - False positives (spurious detections)
 *   - Score range compliance
 *   - Keyword coverage in findings
 */

const { validateCritique, VALID_SEVERITIES } = require('../schemas.cjs');
const { determineActiveReviewers } = require('../orchestrator.cjs');
const { mergeCritiques, computeCompositeScore } = require('../editor.cjs');
const { loadConfig } = require('../index.cjs');

// Load golden prompts
const GOLDEN_PROMPTS = JSON.parse(
	fs.readFileSync(path.join(__dirname, 'fixtures', 'golden-prompts.json'), 'utf-8')
);

// ---------- Mock critique generator ----------

// Generates realistic mock critiques for a given golden prompt.
// These simulate what an LLM reviewer would return for each role.
function generateMockCritique(role, goldenPrompt) {
	const expected = goldenPrompt.expectedFindings[role];

	if (!expected) {
		// Reviewer not expected to have opinions — return clean
		return {
			reviewer_role: role,
			severity_max: 'nit',
			confidence: 0.5,
			no_issues: true,
			score: 7.0,
			findings: [],
		};
	}

	if (expected.shouldFind) {
		// Build a finding that matches expectations
		const idPrefix = role.toUpperCase().slice(0, 3);
		const finding = {
			id: `${idPrefix}-EVAL-001`,
			severity: expected.minSeverity || 'major',
			confidence: 0.85,
			issue: `Mock ${role} finding: ${expected.mustMention.join(', ')}`,
			evidence: `Detected in prompt: "${goldenPrompt.prompt.slice(0, 60)}..."`,
			suggested_ops: [{
				op: role === 'security' ? 'AddGuardrail' : 'AddConstraint',
				target: 'constraints',
				value: `Mock suggestion addressing ${expected.mustMention.join(' and ')}`,
			}],
		};

		const scoreRange = goldenPrompt.expectedScoreRange[role];
		const score = scoreRange ? (scoreRange[0] + scoreRange[1]) / 2 : 4.0;

		return {
			reviewer_role: role,
			severity_max: expected.minSeverity || 'major',
			confidence: 0.85,
			no_issues: false,
			score,
			findings: [finding],
		};
	} else {
		// Reviewer should NOT find issues
		const scoreRange = goldenPrompt.expectedScoreRange[role];
		const score = scoreRange ? (scoreRange[0] + scoreRange[1]) / 2 : 8.0;

		return {
			reviewer_role: role,
			severity_max: 'nit',
			confidence: 0.7,
			no_issues: true,
			score,
			findings: [],
		};
	}
}

// ---------- Eval scoring functions ----------

const SEVERITY_RANK = { blocker: 4, major: 3, minor: 2, nit: 1 };

/**
 * Score a single reviewer's critique against expected findings.
 * Returns { tp, fn, fp, severityOk, scoreInRange, keywordHits }.
 */
function scoreReviewerCritique(critique, expected, scoreRange) {
	const result = {
		tp: 0,       // true positives
		fn: 0,       // false negatives
		fp: 0,       // false positives
		severityOk: true,
		scoreInRange: true,
		keywordHits: [],
		keywordMisses: [],
	};

	if (!expected) {
		// No expectations — any findings are FP
		result.fp = critique.findings.length;
		return result;
	}

	if (expected.shouldFind) {
		if (critique.findings.length > 0) {
			result.tp = 1;  // Correctly detected

			// Check severity meets minimum
			const critiqueSevRank = SEVERITY_RANK[critique.severity_max] || 0;
			const expectedSevRank = SEVERITY_RANK[expected.minSeverity] || 0;
			result.severityOk = critiqueSevRank >= expectedSevRank;

			// Check keyword coverage
			if (expected.mustMention && expected.mustMention.length > 0) {
				const critiqueText = JSON.stringify(critique).toLowerCase();
				for (const keyword of expected.mustMention) {
					if (critiqueText.includes(keyword.toLowerCase())) {
						result.keywordHits.push(keyword);
					} else {
						result.keywordMisses.push(keyword);
					}
				}
			}
		} else {
			result.fn = 1;  // Missed detection
		}
	} else {
		// Should NOT find issues
		if (critique.findings.length > 0) {
			result.fp = critique.findings.length;
		} else {
			result.tp = 1;  // Correctly found no issues
		}
	}

	// Check score range
	if (scoreRange && critique.score !== undefined) {
		result.scoreInRange = critique.score >= scoreRange[0] && critique.score <= scoreRange[1];
	}

	return result;
}

/**
 * Run full eval across all golden prompts, returning aggregate stats.
 */
function runEval(goldenPrompts) {
	const results = [];

	for (const gp of goldenPrompts) {
		// Skip empty prompt edge case for reviewer eval
		if (gp.prompt === '') continue;

		const promptResult = {
			id: gp.id,
			category: gp.category,
			quality: gp.quality,
			reviewerScores: {},
			totalTp: 0,
			totalFn: 0,
			totalFp: 0,
		};

		// Generate mock critiques for all expected reviewers
		const roles = Object.keys(gp.expectedFindings);
		for (const role of roles) {
			const critique = generateMockCritique(role, gp);
			const expected = gp.expectedFindings[role];
			const scoreRange = gp.expectedScoreRange[role];
			const score = scoreReviewerCritique(critique, expected, scoreRange);

			promptResult.reviewerScores[role] = score;
			promptResult.totalTp += score.tp;
			promptResult.totalFn += score.fn;
			promptResult.totalFp += score.fp;
		}

		results.push(promptResult);
	}

	// Aggregate
	const totals = results.reduce(
		(acc, r) => ({
			tp: acc.tp + r.totalTp,
			fn: acc.fn + r.totalFn,
			fp: acc.fp + r.totalFp,
		}),
		{ tp: 0, fn: 0, fp: 0 }
	);

	const precision = totals.tp + totals.fp > 0
		? totals.tp / (totals.tp + totals.fp)
		: 1.0;
	const recall = totals.tp + totals.fn > 0
		? totals.tp / (totals.tp + totals.fn)
		: 1.0;
	const f1 = precision + recall > 0
		? 2 * (precision * recall) / (precision + recall)
		: 0;

	return { results, totals, precision, recall, f1 };
}

// ---------- Tests ----------

// Test 1: Golden prompts fixture is valid
{
	assert.ok(Array.isArray(GOLDEN_PROMPTS), 'Golden prompts should be an array');
	assert.ok(GOLDEN_PROMPTS.length >= 10, `Should have at least 10 golden prompts, got ${GOLDEN_PROMPTS.length}`);

	for (const gp of GOLDEN_PROMPTS) {
		assert.ok(gp.id, `Golden prompt must have an id`);
		assert.ok(gp.category, `Golden prompt ${gp.id} must have a category`);
		assert.ok(gp.quality, `Golden prompt ${gp.id} must have a quality`);
		assert.ok(typeof gp.prompt === 'string', `Golden prompt ${gp.id} must have a string prompt`);
		assert.ok(typeof gp.expectedFindings === 'object', `Golden prompt ${gp.id} must have expectedFindings`);
		assert.ok(typeof gp.expectedScoreRange === 'object', `Golden prompt ${gp.id} must have expectedScoreRange`);
	}
}

// Test 2: Mock critique generator produces valid critiques
{
	const securityGp = GOLDEN_PROMPTS.find(gp => gp.id === 'SEC-INJECTION-001');
	assert.ok(securityGp, 'Should have SEC-INJECTION-001 golden prompt');

	const critique = generateMockCritique('security', securityGp);
	const validation = validateCritique(critique);
	assert.ok(validation.valid, `Mock critique should be valid: ${validation.errors.join(', ')}`);
	assert.strictEqual(critique.reviewer_role, 'security');
	assert.ok(critique.findings.length > 0, 'Security critique should have findings for injection prompt');
}

// Test 3: Mock critique generator returns no findings for good prompts
{
	const goodGp = GOLDEN_PROMPTS.find(gp => gp.id === 'GOOD-SPECIFIC-001');
	assert.ok(goodGp, 'Should have GOOD-SPECIFIC-001 golden prompt');

	const critique = generateMockCritique('security', goodGp);
	const validation = validateCritique(critique);
	assert.ok(validation.valid, `Good-prompt critique should be valid: ${validation.errors.join(', ')}`);
	assert.ok(critique.no_issues, 'Good prompt should produce no_issues=true for security');
	assert.strictEqual(critique.findings.length, 0, 'Good prompt should have 0 security findings');
}

// Test 4: Scoring function correctly identifies true positives
{
	const gp = GOLDEN_PROMPTS.find(gp => gp.id === 'SEC-INJECTION-001');
	const critique = generateMockCritique('security', gp);
	const score = scoreReviewerCritique(critique, gp.expectedFindings.security, gp.expectedScoreRange.security);

	assert.strictEqual(score.tp, 1, 'Should be a true positive');
	assert.strictEqual(score.fn, 0, 'Should have no false negatives');
	assert.strictEqual(score.fp, 0, 'Should have no false positives');
	assert.ok(score.severityOk, 'Severity should meet minimum');
}

// Test 5: Scoring function correctly identifies false negatives
{
	// Simulate a reviewer that misses a finding
	const gp = GOLDEN_PROMPTS.find(gp => gp.id === 'SEC-INJECTION-001');
	const emptyCritique = {
		reviewer_role: 'security',
		severity_max: 'nit',
		confidence: 0.5,
		no_issues: true,
		score: 8.0,
		findings: [],
	};
	const score = scoreReviewerCritique(emptyCritique, gp.expectedFindings.security, gp.expectedScoreRange.security);

	assert.strictEqual(score.fn, 1, 'Should be a false negative');
	assert.strictEqual(score.tp, 0, 'Should have no true positives');
}

// Test 6: Scoring function correctly identifies false positives
{
	const gp = GOLDEN_PROMPTS.find(gp => gp.id === 'GOOD-SPECIFIC-001');
	// Simulate a reviewer that incorrectly flags a good prompt
	const spuriousCritique = {
		reviewer_role: 'security',
		severity_max: 'major',
		confidence: 0.8,
		no_issues: false,
		score: 4.0,
		findings: [{
			id: 'SEC-SPURIOUS-001',
			severity: 'major',
			confidence: 0.8,
			issue: 'Spurious finding',
			evidence: 'Not actually an issue',
			suggested_ops: [],
		}],
	};
	const score = scoreReviewerCritique(spuriousCritique, gp.expectedFindings.security, gp.expectedScoreRange.security);

	assert.strictEqual(score.fp, 1, 'Should be a false positive');
	assert.strictEqual(score.tp, 0, 'Should have no true positives');
}

// Test 7: Score range validation works
{
	const gp = GOLDEN_PROMPTS.find(gp => gp.id === 'SEC-INJECTION-001');
	const critique = generateMockCritique('security', gp);

	// Score should be in expected range [0, 3]
	const score = scoreReviewerCritique(critique, gp.expectedFindings.security, gp.expectedScoreRange.security);
	assert.ok(score.scoreInRange, `Score ${critique.score} should be in range [0, 3]`);

	// Now test out-of-range
	const badScoreCritique = { ...critique, score: 9.0 };
	const badScore = scoreReviewerCritique(badScoreCritique, gp.expectedFindings.security, gp.expectedScoreRange.security);
	assert.ok(!badScore.scoreInRange, 'Score 9.0 should be out of range [0, 3]');
}

// Test 8: Full eval produces valid aggregate metrics
{
	const evalResult = runEval(GOLDEN_PROMPTS);

	assert.ok(evalResult.results.length > 0, 'Should have results');
	assert.ok(evalResult.totals.tp > 0, 'Should have true positives');
	assert.ok(evalResult.precision >= 0 && evalResult.precision <= 1, 'Precision should be in [0, 1]');
	assert.ok(evalResult.recall >= 0 && evalResult.recall <= 1, 'Recall should be in [0, 1]');
	assert.ok(evalResult.f1 >= 0 && evalResult.f1 <= 1, 'F1 should be in [0, 1]');

	// With mock critiques that match expectations, we should have perfect scores
	assert.strictEqual(evalResult.precision, 1.0, 'Mock critiques should have perfect precision');
	assert.strictEqual(evalResult.recall, 1.0, 'Mock critiques should have perfect recall');
	assert.strictEqual(evalResult.f1, 1.0, 'Mock critiques should have perfect F1');
}

// Test 9: Eval covers all categories
{
	const evalResult = runEval(GOLDEN_PROMPTS);
	const categories = new Set(evalResult.results.map(r => r.category));

	assert.ok(categories.has('security'), 'Eval should cover security category');
	assert.ok(categories.has('clarity'), 'Eval should cover clarity category');
	assert.ok(categories.has('testing'), 'Eval should cover testing category');
	assert.ok(categories.has('good'), 'Eval should cover good-prompt category');
}

// Test 10: Merge of mock critiques produces expected structure
{
	const gp = GOLDEN_PROMPTS.find(gp => gp.id === 'SEC-INJECTION-001');
	const roles = Object.keys(gp.expectedFindings);
	const critiques = roles.map(role => generateMockCritique(role, gp));

	const priorityOrder = ['security', 'testing', 'domain_sme', 'documentation', 'frontend_ux', 'clarity'];
	const merged = mergeCritiques(critiques, priorityOrder);

	assert.ok(!merged.noChanges, 'Injection prompt should produce changes');
	assert.ok(merged.allOps.length > 0, 'Should have merged ops');
	assert.ok(
		SEVERITY_RANK[merged.severityMax] >= SEVERITY_RANK.major,
		`Severity should be at least major for injection prompt, got: ${merged.severityMax}`
	);
}

// Test 11: Composite score computation works with mock critiques
{
	const gp = GOLDEN_PROMPTS.find(gp => gp.id === 'SEC-INJECTION-001');
	const roles = Object.keys(gp.expectedFindings);
	const critiques = roles.map(role => generateMockCritique(role, gp));

	const weights = { security: 2.0, testing: 1.5, clarity: 1.0, domain_sme: 1.5 };
	const result = computeCompositeScore(critiques, weights);

	assert.ok(result.composite !== null, 'Should compute a composite score');
	assert.ok(typeof result.composite === 'number', 'Composite score should be a number');
	assert.ok(result.composite >= 0 && result.composite <= 10, 'Composite should be in [0, 10]');
	assert.ok(Object.keys(result.scores).length > 0, 'Should have per-role scores');
}

// Test 12: Severity check catches insufficient severity
{
	const gp = GOLDEN_PROMPTS.find(gp => gp.id === 'SEC-INJECTION-001');
	const weakCritique = {
		reviewer_role: 'security',
		severity_max: 'nit',
		confidence: 0.5,
		no_issues: false,
		score: 5.0,
		findings: [{
			id: 'SEC-WEAK-001',
			severity: 'nit',
			confidence: 0.5,
			issue: 'Minor concern',
			evidence: 'Not serious enough',
			suggested_ops: [],
		}],
	};
	const score = scoreReviewerCritique(weakCritique, gp.expectedFindings.security, gp.expectedScoreRange.security);

	assert.strictEqual(score.tp, 1, 'Found something, so it is a TP');
	assert.ok(!score.severityOk, 'Severity nit should not meet blocker minimum');
}

// Test 13: determineActiveReviewers activates conditional reviewers correctly
{
	const config = loadConfig(path.join(__dirname, '..'));

	// UX prompt should activate frontend_ux (conditional)
	const uxGp = GOLDEN_PROMPTS.find(gp => gp.id === 'UX-MISSING-001');
	const mockContext = { stack: [], structure: [], conventions: [] };
	const activeForUx = determineActiveReviewers(config, uxGp.prompt, mockContext);
	assert.ok(activeForUx.includes('frontend_ux'), 'UX prompt should activate frontend_ux reviewer');

	// Documentation prompt should activate documentation (conditional)
	// Note: DOC-MISSING-001 contains "--format" which matches skip_keywords, so use a custom prompt
	const docTestPrompt = 'Add a new CLI command called export that dumps all user data to a CSV file.';
	const activeForDoc = determineActiveReviewers(config, docTestPrompt, mockContext);
	assert.ok(activeForDoc.includes('documentation'), 'Documentation prompt should activate documentation reviewer');
}

console.log('eval-harness.test: all tests passed');
