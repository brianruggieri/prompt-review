const assert = require('assert');
const path = require('path');
const fs = require('fs');

/**
 * E2E Pipeline Test
 *
 * Tests the full pipeline from prompt input through reviewer fan-out,
 * critique merging, editor response, and audit logging — using a mock
 * Anthropic client that returns realistic reviewer responses.
 */

// ---------- Mock Anthropic SDK ----------

// Build mock critiques that match the schema for each reviewer role
const MOCK_CRITIQUES = {
	security: {
		reviewer_role: 'security',
		severity_max: 'blocker',
		confidence: 0.95,
		no_issues: false,
		score: 2.0,
		findings: [
			{
				id: 'SEC-001',
				severity: 'blocker',
				confidence: 0.95,
				issue: 'SQL injection via string concatenation',
				evidence: 'The prompt instructs to concatenate user input directly into SQL query',
				suggested_ops: [
					{ op: 'AddGuardrail', target: 'constraints', value: 'Use parameterized queries instead of string concatenation for all SQL operations' }
				]
			}
		]
	},
	clarity: {
		reviewer_role: 'clarity',
		severity_max: 'minor',
		confidence: 0.7,
		no_issues: false,
		score: 6.0,
		findings: [
			{
				id: 'CLR-001',
				severity: 'minor',
				confidence: 0.7,
				issue: 'Missing output format specification',
				evidence: 'Prompt does not specify what format the output should take',
				suggested_ops: [
					{ op: 'AddConstraint', target: 'output', value: 'Return the query results as a JSON array of objects' }
				]
			}
		]
	},
	testing: {
		reviewer_role: 'testing',
		severity_max: 'major',
		confidence: 0.85,
		no_issues: false,
		score: 3.0,
		findings: [
			{
				id: 'TST-001',
				severity: 'major',
				confidence: 0.85,
				issue: 'No test requirements for database query changes',
				evidence: 'Prompt changes SQL query logic but mentions no tests',
				suggested_ops: [
					{ op: 'AddAcceptanceCriteria', target: 'constraints', value: 'Add unit tests for the query function covering valid input, empty results, and injection attempts' }
				]
			}
		]
	},
	domain_sme: {
		reviewer_role: 'domain_sme',
		severity_max: 'nit',
		confidence: 0.6,
		no_issues: true,
		score: 7.0,
		findings: []
	},
	documentation: {
		reviewer_role: 'documentation',
		severity_max: 'nit',
		confidence: 0.5,
		no_issues: true,
		score: 8.0,
		findings: []
	},
	frontend_ux: {
		reviewer_role: 'frontend_ux',
		severity_max: 'nit',
		confidence: 0.5,
		no_issues: true,
		score: 8.0,
		findings: []
	},
};

const MOCK_EDITOR_RESPONSE = `<refined_prompt>
Use parameterized queries to look up user accounts by username. The query function should accept a username parameter and return matching account records as a JSON array of objects. Add unit tests covering valid input, empty results, and injection attempts.
</refined_prompt>

<diff_summary>
- [security] AddGuardrail: Use parameterized queries instead of string concatenation
- [clarity] AddConstraint: Specify JSON output format
- [testing] AddAcceptanceCriteria: Add unit tests for query function
</diff_summary>

<risks>
- Ensure the database driver supports parameterized queries for the target database
</risks>`;

// Track all API calls for assertions
const apiCalls = [];

// Mock module that replaces @anthropic-ai/sdk
function createMockAnthropicModule() {
	class MockAnthropic {
		constructor(opts) {
			this.apiKey = opts?.apiKey || 'test-key';
			this.messages = {
				create: async (params) => {
					apiCalls.push({
						model: params.model,
						system: params.system,
						user: params.messages?.[0]?.content,
						max_tokens: params.max_tokens,
					});

					// Determine which reviewer is calling based on the system prompt
					let responseText;
					const systemText = typeof params.system === 'string' ? params.system : '';

					if (systemText.includes('prompt editor')) {
						// This is the editor call
						responseText = MOCK_EDITOR_RESPONSE;
					} else {
						// This is a reviewer call — find which role
						const role = Object.keys(MOCK_CRITIQUES).find(r =>
							systemText.toLowerCase().includes(`${r.replace('_', ' ')} reviewer`) ||
							systemText.toLowerCase().includes(`${r} reviewer`)
						);
						responseText = JSON.stringify(MOCK_CRITIQUES[role] || MOCK_CRITIQUES.domain_sme);
					}

					return {
						content: [{ type: 'text', text: responseText }],
						usage: { input_tokens: 500, output_tokens: 200 },
					};
				}
			};
		}
	}
	return MockAnthropic;
}

// Install the mock before requiring index.cjs
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
	if (id === '@anthropic-ai/sdk') {
		return createMockAnthropicModule();
	}
	return originalRequire.apply(this, arguments);
};

// Now require the pipeline
const { runFullPipeline } = require('../index.cjs');
const { validateCritique, VALID_SEVERITIES } = require('../schemas.cjs');

// ---------- Tests ----------

const TEST_PROMPT = 'Take the user input and use it directly in the SQL query to look up their account. Build the query string by concatenating the username variable into the SELECT statement.';

async function runTests() {
	// Test 1: Full pipeline returns expected structure
	{
		apiCalls.length = 0;

		const result = await runFullPipeline(TEST_PROMPT, {
			cwd: path.join(__dirname, '..'),
			apiKey: 'test-key-123',
		});

		assert.ok(!result.error, `Pipeline should not error: ${result.error}`);
		assert.ok(!result.skipped, 'Pipeline should not be skipped');

		if (result.noChanges) {
			// Even if no changes, it ran without crashing
			assert.ok(result.block, 'Should have a rendered block');
		} else {
			assert.ok(result.block, 'Result should have a rendered block');
			assert.ok(result.refinedPrompt, 'Result should have a refined prompt');
			assert.ok(Array.isArray(result.findings), 'Result should have findings array');
			assert.ok(Array.isArray(result.risks), 'Result should have risks array');
		}
	}

	// Test 2: Verify API calls were made to reviewers
	{
		// Should have at least 4 reviewer calls (security, clarity, testing, domain_sme are always-on)
		const reviewerCalls = apiCalls.filter(c => !c.system.includes('prompt editor'));
		assert.ok(reviewerCalls.length >= 4, `Should have at least 4 reviewer calls, got ${reviewerCalls.length}`);

		// All reviewer calls should use the reviewer model
		for (const call of reviewerCalls) {
			assert.ok(call.model, 'Reviewer call should have a model');
			assert.ok(call.user.includes('Original Prompt'), 'Reviewer call should include the original prompt');
		}
	}

	// Test 3: Verify editor was called (if there were findings)
	{
		const editorCalls = apiCalls.filter(c =>
			typeof c.system === 'string' && c.system.includes('prompt editor')
		);
		// Editor should be called since our mock reviewers return findings
		assert.ok(editorCalls.length === 1, `Should have exactly 1 editor call, got ${editorCalls.length}`);
		assert.ok(editorCalls[0].user.includes('Edit Operations'), 'Editor should receive edit operations');
	}

	// Test 4: Findings should be merged and ordered by priority
	{
		apiCalls.length = 0;
		const result = await runFullPipeline(TEST_PROMPT, {
			cwd: path.join(__dirname, '..'),
			apiKey: 'test-key-123',
		});

		if (!result.noChanges && result.findings) {
			// Security should come first (highest priority)
			const secFindings = result.findings.filter(f => f.reviewer_role === 'security');
			if (secFindings.length > 0 && result.findings.length > 1) {
				const secIdx = result.findings.indexOf(secFindings[0]);
				assert.ok(secIdx === 0, 'Security findings should be first in priority order');
			}
		}
	}

	// Test 5: Audit log was written
	{
		const today = new Date().toISOString().slice(0, 10);
		const logFile = path.join(__dirname, '..', 'logs', `${today}.jsonl`);

		assert.ok(fs.existsSync(logFile), 'Audit log file should exist after pipeline run');

		const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(l => l.trim());
		const lastEntry = JSON.parse(lines[lines.length - 1]);

		assert.ok(lastEntry.timestamp, 'Log entry should have timestamp');
		assert.ok(lastEntry.reviewers_active, 'Log entry should have reviewers_active');
		assert.ok(Array.isArray(lastEntry.reviewers_active), 'reviewers_active should be array');
		assert.ok(lastEntry.reviewers_active.length >= 4, 'Should have at least 4 active reviewers');
		assert.ok(lastEntry.cost, 'Log entry should have cost');
		assert.ok(typeof lastEntry.duration_ms === 'number', 'Log entry should have duration_ms');
		assert.ok(lastEntry.composite_score !== undefined, 'Log entry should have composite_score');

		// Clean up our test entries
		const crypto = require('crypto');
		const testHash = crypto.createHash('sha256').update(TEST_PROMPT).digest('hex').slice(0, 12);
		const cleaned = lines.filter(l => {
			try { return JSON.parse(l).original_prompt_hash !== testHash; }
			catch { return true; }
		});
		fs.writeFileSync(logFile, cleaned.join('\n') + (cleaned.length ? '\n' : ''));
	}

	// Test 6: Pipeline handles missing API key gracefully
	{
		const saved = process.env.ANTHROPIC_API_KEY;
		delete process.env.ANTHROPIC_API_KEY;

		const result = await runFullPipeline(TEST_PROMPT, {
			cwd: path.join(__dirname, '..'),
			// No apiKey passed either
		});

		assert.ok(result.error, 'Should return an error when no API key');
		assert.ok(result.error.includes('API key'), 'Error should mention API key');

		if (saved) process.env.ANTHROPIC_API_KEY = saved;
	}

	// Test 7: Pipeline handles empty prompt (no reviewers fire)
	{
		const result = await runFullPipeline('', {
			cwd: path.join(__dirname, '..'),
			apiKey: 'test-key-123',
		});

		// Empty prompt might or might not trigger reviewers depending on config
		// but it should NOT crash
		assert.ok(result !== undefined, 'Pipeline should return something for empty prompt');
	}

	// Test 8: Pipeline handles disabled state
	{
		process.env.PROMPT_REVIEW_ENABLED = 'false';
		const result = await runFullPipeline(TEST_PROMPT, {
			cwd: path.join(__dirname, '..'),
			apiKey: 'test-key-123',
		});
		assert.ok(result.skipped, 'Should be skipped when disabled');
		delete process.env.PROMPT_REVIEW_ENABLED;
	}
}

runTests().then(() => {
	// Restore original require
	Module.prototype.require = originalRequire;
	console.log('e2e-pipeline.test: all tests passed');
}).catch(err => {
	Module.prototype.require = originalRequire;
	console.error('e2e-pipeline.test FAILED:', err.message);
	console.error(err.stack);
	process.exit(1);
});
