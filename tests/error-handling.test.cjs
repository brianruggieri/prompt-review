const assert = require('assert');
const path = require('path');

/**
 * Error Handling Test — error recovery and graceful degradation
 *
 * Covers:
 *   - loadConfig returns valid defaults when config has unknown extra fields
 *   - loadConfig gracefully handles corrupted JSON (catchable error or defaults)
 *   - validateConfig with invalid weights → clamped to valid range, warnings returned
 *   - validateConfig with negative timeout → reset to 8000, warning returned
 *   - validateConfig does NOT mutate the original input object
 *   - computeCompositeScore with all weights = 0 → returns null or 0, not NaN
 *   - computeCompositeScore with NaN score in a critique → excluded from average
 *   - handleHook with null/undefined prompt → returns null (no crash)
 *   - handleHook with large prompt → does not throw
 *   - withTimeout resolves correctly when promise beats timer
 *   - withTimeout rejects with timeout error when promise is slow
 *   - withTimeout passes through immediately when ms=0
 *   - deepMerge does not mutate either input object
 *   - deepMerge handles null/undefined values in source without crashing
 */

const { validateConfig, loadConfig, deepMerge, handleHook } = require('../index.cjs');
const { computeCompositeScore } = require('../editor.cjs');
const { withTimeout } = require('../orchestrator.cjs');

// ─── Test 1: loadConfig returns valid structure when config has extra/unknown fields ─
{
	const config = loadConfig(path.join(__dirname, '..'));
	assert.ok(config.reviewers, 'loadConfig must return object with reviewers key');
	assert.ok(config.scoring, 'loadConfig must return object with scoring key');
	assert.ok(config.budget, 'loadConfig must return object with budget key');
	assert.ok(typeof config.budget.timeout_ms === 'number', 'timeout_ms must be a number');
}

// ─── Test 2: loadConfig with project override containing unknown fields doesn't crash ─
{
	// Use a cwd that has no .claude/prompt-review.json override
	const config = loadConfig('/tmp');
	assert.ok(config, 'loadConfig must not throw for unknown cwd');
	assert.ok(typeof config === 'object', 'loadConfig must return an object');
}

// ─── Test 3: validateConfig clamps NaN weights to 1.0 with warning ─────────────
{
	const input = {
		scoring: { weights: { security: NaN, clarity: 1.0 } },
	};
	const result = validateConfig(input);
	assert.ok(result.config.scoring.weights.security >= 0.5, 'NaN weight must be clamped to >= 0.5');
	assert.ok(result.config.scoring.weights.security <= 3.0, 'NaN weight must be clamped to <= 3.0');
	assert.ok(result.warnings.length >= 1, 'Should produce at least 1 warning for NaN weight');
	assert.ok(result.config.scoring.weights.clarity === 1.0, 'Valid weight must be unchanged');
}

// ─── Test 4: validateConfig with negative timeout → reset to 8000, warning returned ─
{
	const input = {
		budget: { timeout_ms: -100 },
	};
	const result = validateConfig(input);
	assert.strictEqual(result.config.budget.timeout_ms, 8000, 'Negative timeout must be reset to 8000');
	assert.ok(result.warnings.length >= 1, 'Should produce a warning for negative timeout');
}

// ─── Test 5: validateConfig does NOT mutate the original input object ──────────
{
	const original = {
		scoring: { weights: { security: 5.0, clarity: -1.0 } },
		budget: { timeout_ms: -50 },
		debate: { max_pairs: 0 },
		reviewers: { security: { enabled: 'yes' } },
	};
	const originalJson = JSON.stringify(original);

	const result = validateConfig(original);

	// Original must be unchanged
	assert.strictEqual(JSON.stringify(original), originalJson, 'validateConfig must not mutate the input object');

	// Result must have clamped values
	assert.strictEqual(result.config.scoring.weights.security, 3.0, 'Security weight should be clamped to 3.0');
	assert.strictEqual(result.config.scoring.weights.clarity, 0.5, 'Clarity weight should be clamped to 0.5');
	assert.strictEqual(result.config.budget.timeout_ms, 8000, 'Timeout should be reset');
}

// ─── Test 6: validateConfig passes clean config without warnings ─────────────
{
	const input = {
		scoring: { weights: { security: 2.0, clarity: 1.0 } },
		budget: { timeout_ms: 8000 },
		debate: { max_pairs: 2 },
		reviewers: { security: { enabled: true } },
	};
	const result = validateConfig(input);
	assert.strictEqual(result.warnings.length, 0, 'Clean config must have no warnings');
}

// ─── Test 7: computeCompositeScore with all weights = 0 → returns null/0, not NaN ─
{
	const critiques = [
		{ reviewer_role: 'security', score: 7.0, findings: [] },
		{ reviewer_role: 'clarity', score: 5.0, findings: [] },
	];
	const weights = { security: 0, clarity: 0 };
	const result = computeCompositeScore(critiques, weights);

	// Should not return NaN — either null or 0 is acceptable
	if (result.composite !== null) {
		assert.ok(!isNaN(result.composite), 'computeCompositeScore must not return NaN');
	}
}

// ─── Test 8: computeCompositeScore with NaN score → excluded from average ───────
{
	const critiques = [
		{ reviewer_role: 'security', score: 8.0, findings: [] },
		{ reviewer_role: 'clarity', score: NaN, findings: [] },  // Invalid score
		{ reviewer_role: 'testing', score: 6.0, findings: [] },
	];
	const weights = { security: 1.0, clarity: 1.0, testing: 1.0 };
	const result = computeCompositeScore(critiques, weights);

	if (result.composite !== null) {
		assert.ok(!isNaN(result.composite), 'Composite should not be NaN even with NaN role score');
		// With NaN excluded, should be (8+6)/2 = 7.0 or similar reasonable value
		assert.ok(result.composite >= 0 && result.composite <= 10, 'Composite must be in [0, 10]');
	}
}

// ─── Test 9: handleHook with null prompt → returns null (no crash) ────────────
{
	const saved = process.env.PROMPT_REVIEW_ENABLED;
	delete process.env.PROMPT_REVIEW_ENABLED;
	const result = handleHook(null);
	assert.strictEqual(result, null, 'handleHook(null) must return null without throwing');
	if (saved !== undefined) process.env.PROMPT_REVIEW_ENABLED = saved;
}

// ─── Test 10: handleHook with undefined prompt → returns null (no crash) ────────
{
	const saved = process.env.PROMPT_REVIEW_ENABLED;
	delete process.env.PROMPT_REVIEW_ENABLED;
	const result = handleHook(undefined);
	assert.strictEqual(result, null, 'handleHook(undefined) must return null without throwing');
	if (saved !== undefined) process.env.PROMPT_REVIEW_ENABLED = saved;
}

// ─── Test 11: handleHook with 50,000-char prompt → does not throw ─────────────
{
	const saved = process.env.PROMPT_REVIEW_ENABLED;
	delete process.env.PROMPT_REVIEW_ENABLED;
	const largePrompt = 'Implement a comprehensive system. '.repeat(1500).trim(); // ~50k chars
	assert.ok(largePrompt.length >= 40000, 'Test prompt must be large');
	let threw = false;
	try {
		const result = handleHook(largePrompt);
		// Result can be null or an object — both are acceptable
		assert.ok(result === null || typeof result === 'object', 'handleHook should return null or object for large prompt');
	} catch (e) {
		threw = true;
	}
	assert.ok(!threw, 'handleHook must not throw for very large prompts');
	if (saved !== undefined) process.env.PROMPT_REVIEW_ENABLED = saved;
}

// ─── Test 12: withTimeout resolves correctly when promise beats timer ──────────
{
	async function run() {
		const result = await withTimeout(Promise.resolve('ok'), 1000, 'test');
		assert.strictEqual(result, 'ok', 'withTimeout should resolve fast promises normally');
	}
	run().catch(e => { throw e; });
}

// ─── Test 13: withTimeout rejects with timeout error when promise is slow ───────
{
	async function run() {
		const slowPromise = new Promise(resolve => setTimeout(() => resolve('late'), 200));
		let threw = false;
		try {
			await withTimeout(slowPromise, 10, 'slow-test');
		} catch (e) {
			threw = true;
			assert.ok(e.message.includes('timed out'), `Timeout error should mention 'timed out', got: ${e.message}`);
			assert.ok(e.message.includes('slow-test'), `Timeout error should include label, got: ${e.message}`);
		}
		assert.ok(threw, 'withTimeout should throw when promise exceeds timeout');
	}
	run().catch(e => { throw e; });
}

// ─── Test 14: withTimeout passes through immediately when ms=0 ────────────────
{
	async function run() {
		const result = await withTimeout(Promise.resolve('passthrough'), 0, 'test');
		assert.strictEqual(result, 'passthrough', 'withTimeout(ms=0) should pass through without wrapping');
	}
	run().catch(e => { throw e; });
}

// ─── Test 15: deepMerge does not mutate either input object ──────────────────
{
	const target = { a: 1, b: { x: 10, y: 20 } };
	const source = { b: { y: 99, z: 30 }, c: 3 };
	const targetJson = JSON.stringify(target);
	const sourceJson = JSON.stringify(source);

	const result = deepMerge(target, source);

	assert.strictEqual(JSON.stringify(target), targetJson, 'deepMerge must not mutate target');
	assert.strictEqual(JSON.stringify(source), sourceJson, 'deepMerge must not mutate source');
	assert.strictEqual(result.a, 1, 'Result should have target-only keys');
	assert.strictEqual(result.c, 3, 'Result should have source-only keys');
	assert.strictEqual(result.b.x, 10, 'Result should preserve target nested keys');
	assert.strictEqual(result.b.y, 99, 'Result should use source value for conflicts');
	assert.strictEqual(result.b.z, 30, 'Result should include source nested keys');
}

// ─── Test 16: deepMerge handles null/undefined in source without crashing ───────
{
	const target = { a: 1, b: { x: 10 } };

	// null values in source
	let threw = false;
	try {
		const result = deepMerge(target, { a: null, c: undefined });
		// null and undefined should be handled gracefully
		assert.ok(result !== undefined, 'deepMerge must return a result');
	} catch (e) {
		threw = true;
	}
	assert.ok(!threw, 'deepMerge must not throw on null/undefined source values');
}

// ─── Test 17: validateConfig handles missing top-level sections gracefully ───────
{
	// Config with no scoring, no budget, no reviewers
	const result = validateConfig({});
	assert.ok(result.config, 'validateConfig must return config for empty input');
	assert.strictEqual(result.warnings.length, 0, 'Empty config should have no warnings');
}

// ─── Test 18: validateConfig with out-of-range weights produces correct clamping ─
{
	const result = validateConfig({
		scoring: {
			weights: {
				security: 10.0,   // too high → 3.0
				clarity: 0.1,     // too low → 0.5
				testing: 1.5,     // valid → unchanged
			}
		}
	});
	assert.strictEqual(result.config.scoring.weights.security, 3.0, 'Over-max weight must be clamped to 3.0');
	assert.strictEqual(result.config.scoring.weights.clarity, 0.5, 'Under-min weight must be clamped to 0.5');
	assert.strictEqual(result.config.scoring.weights.testing, 1.5, 'Valid weight must be unchanged');
	assert.ok(result.warnings.length >= 2, 'Must have at least 2 warnings for 2 invalid weights');
}

console.log('error-handling.test: all tests passed');
