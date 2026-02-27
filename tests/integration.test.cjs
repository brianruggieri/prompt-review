const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Test 1: handleHook returns additionalContext for a non-trivial prompt
{
	const { handleHook } = require('../index.cjs');
	// Ensure not disabled
	delete process.env.PROMPT_REVIEW_ENABLED;

	const result = handleHook('Write a function that validates email addresses');
	assert.ok(result !== null, 'Hook should return a result for non-empty prompt');
	assert.ok(result.additionalContext, 'Result should have additionalContext');
	assert.ok(result.additionalContext.includes('PROMPT REVIEW TRIGGERED'), 'Should contain trigger header');
	assert.ok(result.additionalContext.includes('security'), 'Should include security reviewer');
}

// Test 2: handleHook returns null when disabled via env
{
	const { handleHook } = require('../index.cjs');
	process.env.PROMPT_REVIEW_ENABLED = 'false';
	const result = handleHook('Write a function');
	assert.strictEqual(result, null, 'Should return null when disabled');
	delete process.env.PROMPT_REVIEW_ENABLED;
}

// Test 3: handleSkill returns structured data with active reviewers
{
	const { handleSkill } = require('../index.cjs');
	delete process.env.PROMPT_REVIEW_ENABLED;

	const result = handleSkill('Add a new API endpoint for user settings');
	assert.ok(result.activeReviewers.length > 0, 'Should have active reviewers');
	assert.ok(result.reviewerPrompts.length > 0, 'Should have reviewer prompts');
	assert.ok(result.config, 'Should include config');
	assert.ok(result.priorityOrder.length > 0, 'Should have priority order');
}

// Test 4: loadConfig returns valid config with expected structure
{
	const { loadConfig } = require('../index.cjs');
	const config = loadConfig(__dirname);
	assert.ok(config.reviewers, 'Config should have reviewers');
	assert.ok(config.scoring, 'Config should have scoring');
	assert.ok(config.budget, 'Config should have budget');
	assert.strictEqual(typeof config.budget.timeout_ms, 'number', 'timeout_ms should be a number');
}

// Test 5: Audit round-trip works within pipeline context
{
	const { writeAuditLog, updateAuditOutcome } = require('../cost.cjs');

	const prompt = 'integration test prompt ' + Date.now();
	const hash = crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 12);
	const today = new Date().toISOString().slice(0, 10);
	const logFile = path.join(__dirname, '..', 'logs', `${today}.jsonl`);

	writeAuditLog({
		timestamp: new Date().toISOString(),
		project: 'integration-test',
		original_prompt_hash: hash,
		reviewers_active: ['security', 'testing'],
		findings_detail: [
			{ reviewer_role: 'security', finding_id: 'INT-001', severity: 'major', issue: 'Test finding', op: 'AddGuardrail', target: 'constraints' },
		],
		suggestions_accepted: [],
		suggestions_rejected: [],
		reviewer_stats: {},
		outcome: 'pending',
		composite_score: 7.0,
		cost: { input_tokens: 0, output_tokens: 0, usd: 0 },
		duration_ms: 100,
	});

	const updated = updateAuditOutcome(today, hash, 'approved', ['INT-001'], []);
	assert.strictEqual(updated, true, 'Should successfully update outcome');

	// Verify the updated entry
	const content = fs.readFileSync(logFile, 'utf-8');
	const lines = content.split('\n').filter(l => l.trim());
	const ourEntry = lines.map(l => JSON.parse(l)).find(e => e.original_prompt_hash === hash);
	assert.ok(ourEntry, 'Should find our entry in the log');
	assert.strictEqual(ourEntry.outcome, 'approved', 'Outcome should be updated');
	assert.deepStrictEqual(ourEntry.suggestions_accepted, ['INT-001'], 'Accepted IDs should match');

	// Cleanup: remove our entry from the log file
	const cleanedLines = lines.filter(l => {
		try { return JSON.parse(l).original_prompt_hash !== hash; }
		catch { return true; }
	});
	fs.writeFileSync(logFile, cleanedLines.join('\n') + (cleanedLines.length ? '\n' : ''));
}

// Test 6: validateConfig clamps invalid weight values
{
	const { validateConfig } = require('../index.cjs');
	const config = {
		scoring: { weights: { security: 5.0, clarity: -1.0, testing: 1.5 } },
		budget: { timeout_ms: -100 },
		debate: { max_pairs: 0 },
		reviewers: { security: { enabled: 'yes' } },
	};
	const result = validateConfig(config);
	assert.strictEqual(result.config.scoring.weights.security, 3.0, 'Should clamp high weight to 3.0');
	assert.strictEqual(result.config.scoring.weights.clarity, 0.5, 'Should clamp low weight to 0.5');
	assert.strictEqual(result.config.scoring.weights.testing, 1.5, 'Should leave valid weight alone');
	assert.strictEqual(result.config.budget.timeout_ms, 8000, 'Should default invalid timeout');
	assert.strictEqual(result.config.debate.max_pairs, 2, 'Should default invalid max_pairs');
	assert.strictEqual(result.config.reviewers.security.enabled, true, 'Should default non-boolean enabled');
	assert.ok(result.warnings.length >= 4, `Should have at least 4 warnings, got ${result.warnings.length}`);
}

// Test 7: validateConfig passes clean config without warnings
{
	const { validateConfig } = require('../index.cjs');
	const config = {
		scoring: { weights: { security: 2.0, clarity: 1.0 } },
		budget: { timeout_ms: 8000 },
		debate: { max_pairs: 2 },
		reviewers: { security: { enabled: true } },
	};
	const result = validateConfig(config);
	assert.strictEqual(result.warnings.length, 0, 'Clean config should have no warnings');
}

// Test 8: withTimeout helper works correctly
{
	const { withTimeout } = require('../orchestrator.cjs');

	// Should resolve for fast promises
	(async () => {
		const result = await withTimeout(Promise.resolve('ok'), 1000, 'test');
		assert.strictEqual(result, 'ok', 'Should resolve fast promises');
	})();

	// Should pass through when ms is 0
	(async () => {
		const result = await withTimeout(Promise.resolve('ok'), 0, 'test');
		assert.strictEqual(result, 'ok', 'Should pass through when timeout is 0');
	})();
}

console.log('integration.test: all tests passed');
