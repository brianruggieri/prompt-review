const assert = require('assert');
const { computeTopPatterns } = require('../stats.cjs');
const { computeReviewerStats } = require('../cost.cjs');

// Test 1: computeTopPatterns returns patterns when entries have findings_detail
{
	const entries = [
		{
			timestamp: '2026-02-20T10:00:00Z',
			project: 'test',
			findings_detail: [
				{ reviewer_role: 'security', finding_id: 'SEC-001', severity: 'blocker', issue: 'Missing environment validation', op: 'AddGuardrail', target: 'constraints' },
				{ reviewer_role: 'testing', finding_id: 'TST-001', severity: 'major', issue: 'No test coverage example', op: 'AddGuardrail', target: 'examples' },
			]
		},
		{
			timestamp: '2026-02-21T10:00:00Z',
			project: 'test',
			findings_detail: [
				{ reviewer_role: 'security', finding_id: 'SEC-002', severity: 'major', issue: 'Missing environment validation', op: 'AddGuardrail', target: 'constraints' },
				{ reviewer_role: 'clarity', finding_id: 'CLR-001', severity: 'minor', issue: 'Ambiguous verb', op: 'ReplaceText', target: 'text' },
			]
		},
		{
			timestamp: '2026-02-22T10:00:00Z',
			project: 'test',
			findings_detail: [
				{ reviewer_role: 'security', finding_id: 'SEC-003', severity: 'blocker', issue: 'Missing environment validation', op: 'AddGuardrail', target: 'constraints' },
			]
		},
	];
	const patterns = computeTopPatterns(entries);
	assert.ok(patterns.length > 0, 'Should return non-empty patterns');
	assert.strictEqual(patterns[0].issue, 'Missing environment validation', 'Top pattern should be "Missing environment validation"');
	assert.strictEqual(patterns[0].count, 3, 'Top pattern should appear 3 times');
}

// Test 2: Repeated issues across entries aggregate correctly
{
	const entries = [
		{
			findings_detail: [
				{ issue: 'Issue A' },
				{ issue: 'Issue B' },
			]
		},
		{
			findings_detail: [
				{ issue: 'Issue A' },
			]
		},
		{
			findings_detail: [
				{ issue: 'Issue A' },
			]
		},
		{
			findings_detail: [
				{ issue: 'Issue C' },
			]
		},
	];
	const patterns = computeTopPatterns(entries);
	const issueAPattern = patterns.find(p => p.issue === 'Issue A');
	const issueBPattern = patterns.find(p => p.issue === 'Issue B');
	const issueCPattern = patterns.find(p => p.issue === 'Issue C');
	assert.strictEqual(issueAPattern.count, 3, 'Issue A should appear 3 times');
	assert.strictEqual(issueBPattern.count, 1, 'Issue B should appear 1 time');
	assert.strictEqual(issueCPattern.count, 1, 'Issue C should appear 1 time');
}

// Test 3: computeReviewerStats returns correct proposed/accepted/rejected counts per role
{
	const findingsDetail = [
		{ reviewer_role: 'security', finding_id: 'SEC-001', issue: 'Env variable leak' },
		{ reviewer_role: 'security', finding_id: 'SEC-002', issue: 'SQL injection risk' },
		{ reviewer_role: 'testing', finding_id: 'TST-001', issue: 'No test cases' },
		{ reviewer_role: 'clarity', finding_id: 'CLR-001', issue: 'Ambiguous instruction' },
		{ reviewer_role: 'clarity', finding_id: 'CLR-002', issue: 'Missing example' },
	];
	const acceptedIds = ['SEC-001', 'TST-001'];
	const rejectedIds = ['CLR-001'];

	const stats = computeReviewerStats(findingsDetail, acceptedIds, rejectedIds);

	assert.strictEqual(stats.security.proposed, 2, 'Security should have 2 proposed');
	assert.strictEqual(stats.security.accepted, 1, 'Security should have 1 accepted');
	assert.strictEqual(stats.security.rejected, 0, 'Security should have 0 rejected');

	assert.strictEqual(stats.testing.proposed, 1, 'Testing should have 1 proposed');
	assert.strictEqual(stats.testing.accepted, 1, 'Testing should have 1 accepted');
	assert.strictEqual(stats.testing.rejected, 0, 'Testing should have 0 rejected');

	assert.strictEqual(stats.clarity.proposed, 2, 'Clarity should have 2 proposed');
	assert.strictEqual(stats.clarity.accepted, 0, 'Clarity should have 0 accepted');
	assert.strictEqual(stats.clarity.rejected, 1, 'Clarity should have 1 rejected');
}

// Test 4: Entries without findings_detail don't crash computeTopPatterns (returns [])
{
	const entries = [
		{ timestamp: '2026-02-20T10:00:00Z', project: 'test' },
		{ timestamp: '2026-02-21T10:00:00Z', project: 'test', findings_detail: null },
		{ timestamp: '2026-02-22T10:00:00Z', project: 'test', findings_detail: [] },
	];
	const patterns = computeTopPatterns(entries);
	assert.strictEqual(patterns.length, 0, 'Should return empty patterns without crashing');
}

// Test 5: updateAuditOutcome round-trip: write entry → update outcome → read back accepted/rejected
{
	const { writeAuditLog, updateAuditOutcome } = require('../cost.cjs');
	const fs = require('fs');
	const path = require('path');

	const logsDir = path.join(__dirname, '..', 'logs');
	const testDate = '2026-02-25';
	const testLogFile = path.join(logsDir, `${testDate}.jsonl`);

	// Clean up before test
	try {
		if (fs.existsSync(testLogFile)) fs.unlinkSync(testLogFile);
	} catch (e) {
		// Ignore
	}

	// Write a test entry
	const testEntry = {
		timestamp: '2026-02-25T10:00:00Z',
		project: 'test-phase1',
		trigger: '!!!',
		mode: 'subscription',
		original_prompt_hash: 'abc123def456',
		reviewers_active: ['security', 'testing'],
		findings_count: 3,
		findings_detail: [
			{ reviewer_role: 'security', finding_id: 'SEC-001', severity: 'blocker', issue: 'Test issue', op: 'AddGuardrail', target: 'constraints' },
			{ reviewer_role: 'testing', finding_id: 'TST-001', severity: 'major', issue: 'Test coverage', op: 'AddGuardrail', target: 'examples' },
			{ reviewer_role: 'security', finding_id: 'SEC-002', severity: 'minor', issue: 'Another issue', op: 'ReplaceText', target: 'text' },
		],
		suggestions_accepted: [],
		suggestions_rejected: [],
		reviewer_stats: {},
		severity_max: 'blocker',
		conflicts: 0,
		outcome: 'pending',
		scores: { security: 8.0, testing: 7.0 },
		composite_score: 7.5,
		cost: { input_tokens: 1200, output_tokens: 450, usd: 0 },
		duration_ms: 2100,
	};

	writeAuditLog(testEntry);

	// Verify entry was written
	const content = fs.readFileSync(testLogFile, 'utf-8');
	const lines = content.split('\n').filter(l => l.trim());
	assert.strictEqual(lines.length, 1, 'Should have 1 entry in log');

	const writtenEntry = JSON.parse(lines[0]);
	assert.strictEqual(writtenEntry.outcome, 'pending', 'Entry should start with outcome=pending');

	// Update the outcome with accepted/rejected suggestions
	const acceptedIds = ['SEC-001', 'TST-001'];
	const rejectedIds = ['SEC-002'];

	const updated = updateAuditOutcome(testDate, 'abc123def456', 'approved', acceptedIds, rejectedIds);
	assert.strictEqual(updated, true, 'updateAuditOutcome should return true');

	// Read back and verify
	const updatedContent = fs.readFileSync(testLogFile, 'utf-8');
	const updatedLines = updatedContent.split('\n').filter(l => l.trim());
	const updatedEntry = JSON.parse(updatedLines[0]);

	assert.strictEqual(updatedEntry.outcome, 'approved', 'Outcome should be updated to approved');
	assert.deepStrictEqual(updatedEntry.suggestions_accepted, acceptedIds, 'suggestions_accepted should be set');
	assert.deepStrictEqual(updatedEntry.suggestions_rejected, rejectedIds, 'suggestions_rejected should be set');
	assert.ok(updatedEntry.reviewer_stats, 'reviewer_stats should be set');
	assert.strictEqual(updatedEntry.reviewer_stats.security.proposed, 2, 'Security should have 2 proposed');
	assert.strictEqual(updatedEntry.reviewer_stats.security.accepted, 1, 'Security should have 1 accepted');
	assert.strictEqual(updatedEntry.reviewer_stats.security.rejected, 1, 'Security should have 1 rejected');

	// Clean up after test
	try {
		if (fs.existsSync(testLogFile)) fs.unlinkSync(testLogFile);
	} catch (e) {
		// Ignore
	}
}

console.log('audit-schema.test: all tests passed');
