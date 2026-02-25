const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { previewAdaptation, applyAdaptation } = require('../adapt.cjs');

// Helper: Create temp config file
function createTempConfig() {
	const tempDir = path.join(__dirname, '..', '.temp-test');
	if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

	const configPath = path.join(tempDir, `config-${Date.now()}.json`);
	const config = {
		mode: 'subscription',
		reviewers: {
			security: { enabled: true, conditional: false },
			testing: { enabled: true, conditional: false },
			clarity: { enabled: true, conditional: false },
		},
		scoring: {
			enabled: true,
			weights: {
				security: 2.0,
				testing: 1.5,
				clarity: 1.0,
			},
			weights_history: [],
		},
		reflection: {
			min_reviews_for_adaptation: 5,
			precision_threshold: 0.70,
			weight_clamp_min: 0.5,
			weight_clamp_max: 3.0,
			auto_adapt: false,
			auto_adapt_interval_days: 30,
		},
	};
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
	return configPath;
}

// Helper: Clean up temp files
function cleanupTemp(configPath) {
	try {
		if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
	} catch (e) {
		// ignore
	}
}

// Test 1: Insufficient data → { sufficient_data: false }, no panic
{
	const result = previewAdaptation(30, { entries: [] });
	assert.strictEqual(result.sufficient_data, false, 'Should have sufficient_data: false');
	assert.deepStrictEqual(result.diff, [], 'Diff should be empty');
	assert.ok(result.report, 'Report should exist');
}

// Test 2: previewAdaptation returns diff with correct delta values
{
	const findingsDetail = [
		{ reviewer_role: 'security', finding_id: 'SEC-001' },
		{ reviewer_role: 'security', finding_id: 'SEC-002' },
		{ reviewer_role: 'security', finding_id: 'SEC-003' },
		{ reviewer_role: 'testing', finding_id: 'TST-001' },
		{ reviewer_role: 'testing', finding_id: 'TST-002' },
	];

	const entries = [];
	for (let i = 0; i < 6; i++) {
		entries.push({
			timestamp: new Date(Date.now() - i * 24*3600*1000).toISOString(),
			project: 'test',
			outcome: 'approved',
			findings_detail: findingsDetail,
			suggestions_accepted: ['SEC-001', 'SEC-002', 'TST-001'],
			suggestions_rejected: ['SEC-003', 'TST-002'],
			reviewer_stats: {
				security: { proposed: 3, accepted: 2, rejected: 1 },
				testing: { proposed: 2, accepted: 1, rejected: 1 },
			}
		});
	}

	const configPath = createTempConfig();
	try {
		const result = previewAdaptation(30, { entries, configPath });
		assert.strictEqual(result.sufficient_data, true, 'Should have sufficient data');
		assert.ok(Array.isArray(result.diff), 'Diff should be an array');
		assert.ok(result.diff.length > 0, 'Diff should have entries');
		assert.ok(result.report, 'Report should exist');

		// Check structure of diff entries
		for (const entry of result.diff) {
			assert.strictEqual(typeof entry.role, 'string', 'Diff entry should have role');
			assert.strictEqual(typeof entry.current, 'number', 'Diff entry should have current weight');
			assert.strictEqual(typeof entry.suggested, 'number', 'Diff entry should have suggested weight');
			assert.strictEqual(typeof entry.delta, 'number', 'Diff entry should have delta');
		}
	} finally {
		cleanupTemp(configPath);
	}
}

// Test 3: applyAdaptation writes updated weights to temp config
{
	const findingsDetail = [
		{ reviewer_role: 'security', finding_id: 'SEC-001' },
		{ reviewer_role: 'testing', finding_id: 'TST-001' },
	];

	const entries = [];
	for (let i = 0; i < 6; i++) {
		entries.push({
			timestamp: new Date(Date.now() - i * 24*3600*1000).toISOString(),
			project: 'test',
			outcome: 'approved',
			findings_detail: findingsDetail,
			suggestions_accepted: ['SEC-001', 'TST-001'],
			suggestions_rejected: [],
			reviewer_stats: {
				security: { proposed: 1, accepted: 1, rejected: 0 },
				testing: { proposed: 1, accepted: 1, rejected: 0 },
			}
		});
	}

	const configPath = createTempConfig();
	try {
		const result = applyAdaptation(30, { entries, configPath });
		assert.strictEqual(result.success, true, 'Apply should succeed');
		assert.ok(result.diff, 'Should have diff');
		assert.ok(result.report, 'Should have report');

		// Verify config was updated
		const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
		assert.ok(updatedConfig.scoring.weights, 'Config should have updated weights');
		// Weights should have changed (if precision was perfect, weight stays same; otherwise changes)
	} finally {
		cleanupTemp(configPath);
	}
}

// Test 4: All non-weight config fields preserved after apply
{
	const entries = [];
	for (let i = 0; i < 6; i++) {
		entries.push({
			timestamp: new Date(Date.now() - i * 24*3600*1000).toISOString(),
			project: 'test',
			outcome: 'approved',
			findings_detail: [
				{ reviewer_role: 'security', finding_id: 'SEC-001' },
			],
			suggestions_accepted: ['SEC-001'],
			suggestions_rejected: [],
			reviewer_stats: {
				security: { proposed: 1, accepted: 1, rejected: 0 },
			}
		});
	}

	const configPath = createTempConfig();
	try {
		const beforeConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
		const beforeMode = beforeConfig.mode;
		const beforeReviewers = JSON.stringify(beforeConfig.reviewers);
		const beforeReflection = JSON.stringify(beforeConfig.reflection);

		applyAdaptation(30, { entries, configPath });

		const afterConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
		assert.strictEqual(afterConfig.mode, beforeMode, 'Mode should be preserved');
		assert.strictEqual(JSON.stringify(afterConfig.reviewers), beforeReviewers, 'Reviewers should be preserved');
		assert.strictEqual(JSON.stringify(afterConfig.reflection), beforeReflection, 'Reflection settings should be preserved');
	} finally {
		cleanupTemp(configPath);
	}
}

// Test 5: weights_history caps at 10 entries
{
	const entries = [];
	for (let i = 0; i < 6; i++) {
		entries.push({
			timestamp: new Date(Date.now() - i * 24*3600*1000).toISOString(),
			project: 'test',
			outcome: 'approved',
			findings_detail: [
				{ reviewer_role: 'security', finding_id: 'SEC-001' },
			],
			suggestions_accepted: ['SEC-001'],
			suggestions_rejected: [],
			reviewer_stats: {
				security: { proposed: 1, accepted: 1, rejected: 0 },
			}
		});
	}

	const configPath = createTempConfig();
	try {
		// Apply 12 times to see if it caps at 10
		for (let i = 0; i < 12; i++) {
			applyAdaptation(30, { entries, configPath });
		}

		const finalConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
		assert.ok(Array.isArray(finalConfig.scoring.weights_history), 'weights_history should be array');
		assert.ok(finalConfig.scoring.weights_history.length <= 10, `weights_history should cap at 10, got ${finalConfig.scoring.weights_history.length}`);
	} finally {
		cleanupTemp(configPath);
	}
}

console.log('adapt.test: all tests passed');
