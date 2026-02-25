// tests/batch-manifest.test.cjs
// Tests for batch manifest tracker

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
	initializeManifest,
	loadManifest,
	saveBatchResult,
	getBatchStatus,
	aggregateBatchResults,
	MANIFEST_PATH,
	BATCHES_DIR
} = require('../scripts/batch-manifest.cjs');

// Cleanup helper
function cleanupTestFiles() {
	try {
		if (fs.existsSync(MANIFEST_PATH)) {
			fs.unlinkSync(MANIFEST_PATH);
		}
		if (fs.existsSync(BATCHES_DIR)) {
			const files = fs.readdirSync(BATCHES_DIR);
			for (const file of files) {
				fs.unlinkSync(path.join(BATCHES_DIR, file));
			}
			fs.rmdirSync(BATCHES_DIR);
		}
	} catch (e) {
		// Ignore cleanup errors
	}
}

// Test 1: initializeManifest creates proper structure
{
	const manifest = initializeManifest();

	assert.strictEqual(manifest.version, '1.0', 'Manifest should have version 1.0');
	assert.strictEqual(manifest.total_prompts, 1309, 'Manifest should have 1309 total prompts');
	assert.strictEqual(manifest.status, 'in_progress', 'Initial status should be in_progress');
	assert.ok(manifest.started, 'Manifest should have started timestamp');
	assert.ok(typeof manifest.batches === 'object', 'Manifest should have batches object');
	assert.strictEqual(Object.keys(manifest.batches).length, 13, 'Should have 13 batches');

	// Verify first batch structure
	const batch1 = manifest.batches[1];
	assert.strictEqual(batch1.batch_num, 1, 'Batch 1 should have correct batch_num');
	assert.strictEqual(batch1.status, 'pending', 'Initial batch status should be pending');
	assert.strictEqual(batch1.completed_at, null, 'Initial completed_at should be null');
	assert.strictEqual(batch1.prompt_count, null, 'Initial prompt_count should be null');
	assert.strictEqual(batch1.avg_score, null, 'Initial avg_score should be null');
	assert.deepStrictEqual(batch1.findings_summary, { blocker: 0, major: 0, minor: 0, nit: 0 }, 'findings_summary should be initialized');
}

// Test 2: loadManifest returns new manifest when file doesn't exist
{
	cleanupTestFiles();

	const manifest = loadManifest();
	assert.strictEqual(manifest.version, '1.0', 'Should create default manifest when missing');
	assert.strictEqual(Object.keys(manifest.batches).length, 13, 'Should have 13 batches');
}

// Test 3: saveBatchResult writes batch file and updates manifest
{
	cleanupTestFiles();

	// Create mock results
	const mockResults = [
		{
			hash: 'abc123def456',
			compositeScore: 7.5,
			findings: [
				{ severity: 'blocker', issue: 'Missing auth' },
				{ severity: 'major', issue: 'No validation' }
			],
			improvementsActive: {
				'template-safety': true,
				'file-validation': false
			}
		},
		{
			hash: 'xyz789uvw012',
			compositeScore: 6.2,
			findings: [
				{ severity: 'minor', issue: 'Unclear language' }
			],
			improvementsActive: {
				'template-safety': false,
				'file-validation': true
			}
		}
	];

	saveBatchResult(1, mockResults);

	// Verify batch file was created
	const batchFile = path.join(BATCHES_DIR, 'batch-001.jsonl');
	assert.ok(fs.existsSync(batchFile), 'Batch file should be created');

	// Verify batch file content
	const content = fs.readFileSync(batchFile, 'utf-8');
	const lines = content.trim().split('\n');
	assert.strictEqual(lines.length, 2, 'Batch file should have 2 lines');

	const firstResult = JSON.parse(lines[0]);
	assert.strictEqual(firstResult.hash, 'abc123def456', 'First result hash should match');
	assert.strictEqual(firstResult.compositeScore, 7.5, 'First result score should match');

	// Verify manifest was updated
	const manifest = loadManifest();
	const batch1 = manifest.batches[1];
	assert.strictEqual(batch1.status, 'completed', 'Batch should be marked completed');
	assert.strictEqual(batch1.prompt_count, 2, 'Prompt count should be 2');
	assert.strictEqual(batch1.avg_score, 6.85, 'Average score should be 6.85');
	assert.strictEqual(batch1.findings_summary.blocker, 1, 'Should have 1 blocker');
	assert.strictEqual(batch1.findings_summary.major, 1, 'Should have 1 major');
	assert.strictEqual(batch1.findings_summary.minor, 1, 'Should have 1 minor');
	assert.strictEqual(batch1.improvements_fired['template-safety'], 1, 'template-safety fired 1 time');
	assert.strictEqual(batch1.improvements_fired['file-validation'], 1, 'file-validation fired 1 time');
	assert.ok(batch1.completed_at, 'Should have completed_at timestamp');
	assert.ok(batch1.file_path, 'Should have file_path');
}

// Test 4: Multiple batches can be saved independently
{
	cleanupTestFiles();

	const batch1Results = [
		{ hash: 'batch1-1', compositeScore: 8.0, findings: [], improvementsActive: {} },
		{ hash: 'batch1-2', compositeScore: 7.0, findings: [], improvementsActive: {} }
	];

	const batch2Results = [
		{ hash: 'batch2-1', compositeScore: 6.5, findings: [{ severity: 'blocker' }], improvementsActive: {} },
		{ hash: 'batch2-2', compositeScore: 5.5, findings: [], improvementsActive: { 'test-improvement': true } }
	];

	saveBatchResult(1, batch1Results);
	saveBatchResult(2, batch2Results);

	// Verify both batch files exist
	assert.ok(fs.existsSync(path.join(BATCHES_DIR, 'batch-001.jsonl')), 'Batch 1 file should exist');
	assert.ok(fs.existsSync(path.join(BATCHES_DIR, 'batch-002.jsonl')), 'Batch 2 file should exist');

	// Verify manifest has both batches completed
	const manifest = loadManifest();
	assert.strictEqual(manifest.batches[1].status, 'completed', 'Batch 1 should be completed');
	assert.strictEqual(manifest.batches[2].status, 'completed', 'Batch 2 should be completed');
	assert.strictEqual(manifest.batches[3].status, 'pending', 'Batch 3 should still be pending');

	// Verify manifest status is still in_progress (not all batches done)
	assert.strictEqual(manifest.status, 'in_progress', 'Overall status should be in_progress');
}

// Test 5: getBatchStatus returns correct completed/pending lists
{
	cleanupTestFiles();

	const results = Array(3).fill({
		hash: 'test', compositeScore: 7.0, findings: [], improvementsActive: {}
	});

	saveBatchResult(1, results);
	saveBatchResult(5, results);
	saveBatchResult(13, results);

	const status = getBatchStatus();
	assert.deepStrictEqual(status.completed, [1, 5, 13], 'Completed should list batches 1, 5, 13');
	assert.deepStrictEqual(status.pending.length, 10, 'Pending should have 10 batches');
	assert.strictEqual(status.total, 13, 'Total should be 13');
	assert.strictEqual(status.manifest_status, 'in_progress', 'Manifest status should be in_progress');
}

// Test 6: getBatchStatus shows all completed when all batches are done
{
	cleanupTestFiles();

	const results = Array(1).fill({ hash: 'test', compositeScore: 7.0, findings: [], improvementsActive: {} });

	// Complete all 13 batches
	for (let i = 1; i <= 13; i++) {
		saveBatchResult(i, results);
	}

	const status = getBatchStatus();
	assert.strictEqual(status.completed.length, 13, 'All batches should be completed');
	assert.strictEqual(status.pending.length, 0, 'No batches should be pending');
	assert.strictEqual(status.manifest_status, 'completed', 'Manifest status should be completed');
}

// Test 7: aggregateBatchResults sums metrics correctly
{
	cleanupTestFiles();

	const batch1Results = [
		{
			hash: 'b1-1',
			compositeScore: 8.0,
			findings: [
				{ severity: 'blocker' },
				{ severity: 'blocker' }
			],
			improvementsActive: { 'improvement-a': true }
		},
		{
			hash: 'b1-2',
			compositeScore: 6.0,
			findings: [{ severity: 'minor' }],
			improvementsActive: { 'improvement-a': true, 'improvement-b': true }
		}
	];

	const batch2Results = [
		{
			hash: 'b2-1',
			compositeScore: 7.0,
			findings: [{ severity: 'major' }, { severity: 'nit' }],
			improvementsActive: { 'improvement-a': true }
		}
	];

	saveBatchResult(1, batch1Results);
	saveBatchResult(2, batch2Results);

	const aggregated = aggregateBatchResults();

	assert.deepStrictEqual(aggregated.completed_batches, [1, 2], 'Should list completed batches');
	assert.strictEqual(aggregated.total_prompts_processed, 3, 'Should have 3 total prompts');
	assert.strictEqual(aggregated.overall_avg_score, 7, 'Overall avg should be 7.0');
	assert.strictEqual(aggregated.findings_summary.blocker, 2, 'Should have 2 blockers');
	assert.strictEqual(aggregated.findings_summary.major, 1, 'Should have 1 major');
	assert.strictEqual(aggregated.findings_summary.minor, 1, 'Should have 1 minor');
	assert.strictEqual(aggregated.findings_summary.nit, 1, 'Should have 1 nit');
	assert.strictEqual(aggregated.improvements_fired['improvement-a'], 3, 'improvement-a should fire 3 times');
	assert.strictEqual(aggregated.improvements_fired['improvement-b'], 1, 'improvement-b should fire 1 time');
	assert.strictEqual(aggregated.completion_percentage, Math.round((2 / 13) * 100), 'Should be 15% complete');
}

// Test 8: aggregateBatchResults handles empty state
{
	cleanupTestFiles();

	const aggregated = aggregateBatchResults();

	assert.deepStrictEqual(aggregated.completed_batches, [], 'Should have no completed batches');
	assert.strictEqual(aggregated.total_prompts_processed, 0, 'Should have 0 prompts');
	assert.strictEqual(aggregated.overall_avg_score, 0, 'Score should be 0');
	assert.deepStrictEqual(aggregated.findings_summary, { blocker: 0, major: 0, minor: 0, nit: 0 }, 'All findings should be 0');
	assert.deepStrictEqual(aggregated.improvements_fired, {}, 'No improvements fired');
	assert.strictEqual(aggregated.completion_percentage, 0, 'Should be 0% complete');
}

// Test 9: Batch results with null/missing findings are handled gracefully
{
	cleanupTestFiles();

	const results = [
		{ hash: 'test1', compositeScore: 5.0, findings: null, improvementsActive: null },
		{ hash: 'test2', compositeScore: 8.0, improvementsActive: undefined },
		{ hash: 'test3', compositeScore: 7.0 }
	];

	saveBatchResult(3, results);

	const manifest = loadManifest();
	const batch3 = manifest.batches[3];

	assert.strictEqual(batch3.prompt_count, 3, 'Should count 3 prompts');
	assert.strictEqual(batch3.avg_score, Math.round((5 + 8 + 7) / 3 * 100) / 100, 'Should average scores correctly');
	assert.deepStrictEqual(batch3.improvements_fired, {}, 'Should handle missing improvements');
}

// Test 10: Manifest persists across sessions
{
	cleanupTestFiles();

	// First session: save batch 1
	const batch1Results = [
		{ hash: 'b1', compositeScore: 7.5, findings: [], improvementsActive: {} }
	];
	saveBatchResult(1, batch1Results);

	// Verify first save
	let manifest = loadManifest();
	assert.strictEqual(manifest.batches[1].status, 'completed', 'Batch 1 should be completed after first save');

	// Simulate new session: load manifest
	manifest = loadManifest();
	assert.strictEqual(Object.keys(manifest.batches).length, 13, 'Manifest should reload all 13 batches');
	assert.strictEqual(manifest.batches[1].status, 'completed', 'Batch 1 should still be completed');
	assert.strictEqual(manifest.batches[2].status, 'pending', 'Batch 2 should still be pending');

	// Second session: complete batch 2
	const batch2Results = [
		{ hash: 'b2', compositeScore: 6.0, findings: [], improvementsActive: {} }
	];
	saveBatchResult(2, batch2Results);

	// Verify both batches are saved
	manifest = loadManifest();
	assert.strictEqual(manifest.batches[1].status, 'completed', 'Batch 1 should remain completed');
	assert.strictEqual(manifest.batches[2].status, 'completed', 'Batch 2 should now be completed');
}

// Test 11: Batch file paths are correct
{
	cleanupTestFiles();

	const results = [{ hash: 'test', compositeScore: 7.0, findings: [], improvementsActive: {} }];

	saveBatchResult(7, results);

	const manifest = loadManifest();
	const batch7 = manifest.batches[7];

	assert.ok(batch7.file_path, 'Batch should have file_path');
	assert.ok(batch7.file_path.includes('batch-007.jsonl'), 'File path should contain correct batch number');
	assert.ok(batch7.file_path.includes('validation-batches'), 'File path should include validation-batches directory');
}

// Test 12: Large batch processing
{
	cleanupTestFiles();

	// Create 100 results in a batch
	const largeResults = Array(100).fill(null).map((_, i) => ({
		hash: `large-${i}`,
		compositeScore: 5 + Math.random() * 5,
		findings: [{ severity: 'minor' }],
		improvementsActive: { 'test': i % 2 === 0 }
	}));

	saveBatchResult(6, largeResults);

	const manifest = loadManifest();
	const batch6 = manifest.batches[6];

	assert.strictEqual(batch6.prompt_count, 100, 'Should handle 100 prompts');
	assert.ok(batch6.avg_score > 5 && batch6.avg_score < 10, 'Should compute valid average score');
	assert.strictEqual(batch6.findings_summary.minor, 100, 'Should count all minor findings');
	assert.strictEqual(batch6.improvements_fired['test'], 50, 'Should track improvements correctly');
}

// Cleanup after all tests
cleanupTestFiles();

console.log('✓ All batch manifest tests passed');
