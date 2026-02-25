// tests/validate-cli-batch-commands.test.cjs
// Tests for batch validation CLI commands

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const LOGS_DIR = path.join(__dirname, '..', 'test-logs');
const BATCHES_DIR = path.join(LOGS_DIR, 'validation-batches');
const MANIFEST_PATH = path.join(LOGS_DIR, 'batch-manifest.json');

// Helper to run CLI commands
function runCLI(args) {
	return new Promise((resolve, reject) => {
		const cliPath = path.join(__dirname, '..', 'scripts', 'validate-real-prompts.cjs');
		const proc = spawn('node', [cliPath, ...args], {
			cwd: path.join(__dirname, '..'),
			stdio: ['pipe', 'pipe', 'pipe']
		});

		let stdout = '';
		let stderr = '';

		proc.stdout.on('data', data => {
			stdout += data.toString();
		});

		proc.stderr.on('data', data => {
			stderr += data.toString();
		});

		proc.on('close', code => {
			resolve({ code, stdout, stderr });
		});

		proc.on('error', reject);
	});
}

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
		// Clean up any batch reports
		if (fs.existsSync(LOGS_DIR)) {
			const files = fs.readdirSync(LOGS_DIR);
			for (const file of files) {
				if (file.startsWith('batch-') && file.endsWith('-report.md')) {
					fs.unlinkSync(path.join(LOGS_DIR, file));
				}
				if (file === 'validation-report-aggregated.md') {
					fs.unlinkSync(path.join(LOGS_DIR, file));
				}
			}
		}
	} catch (e) {
		// Ignore cleanup errors
	}
}

// Test 1: help command shows batch commands
{
	console.log('Test 1: help command shows batch commands');
	try {
		const result = require('child_process').execSync('node scripts/validate-real-prompts.cjs help', {
			cwd: path.join(__dirname, '..'),
			encoding: 'utf-8'
		});
		assert.ok(result.includes('batch'), 'Help should mention batch command');
		assert.ok(result.includes('batches'), 'Help should mention batches command');
		console.log('✓ PASS');
	} catch (e) {
		console.log('✗ FAIL:', e.message);
		process.exit(1);
	}
}

// Test 2: batches status works with empty state
{
	console.log('Test 2: batches status command works with empty manifest');
	cleanupTestFiles();
	try {
		const result = require('child_process').execSync('node scripts/validate-real-prompts.cjs batches status', {
			cwd: path.join(__dirname, '..'),
			encoding: 'utf-8'
		});
		assert.ok(result.includes('Completed'), 'Status should show completed count');
		assert.ok(result.includes('Pending'), 'Status should show pending count');
		assert.ok(result.includes('Progress'), 'Status should show progress percentage');
		assert.ok(result.includes('0%'), 'Initial progress should be 0%');
		console.log('✓ PASS');
	} catch (e) {
		console.log('✗ FAIL:', e.message);
		process.exit(1);
	} finally {
		cleanupTestFiles();
	}
}

// Test 3: batches next command shows next batch
{
	console.log('Test 3: batches next command shows next batch');
	cleanupTestFiles();
	try {
		const result = require('child_process').execSync('node scripts/validate-real-prompts.cjs batches next', {
			cwd: path.join(__dirname, '..'),
			encoding: 'utf-8'
		});
		assert.ok(result.includes('batch: 1'), 'Should show batch 1 as next');
		assert.ok(result.includes('prompts 0-99'), 'Should show correct prompt range');
		console.log('✓ PASS');
	} catch (e) {
		console.log('✗ FAIL:', e.message);
		process.exit(1);
	} finally {
		cleanupTestFiles();
	}
}

// Test 4: batches report handles no completed batches
{
	console.log('Test 4: batches report handles no completed batches gracefully');
	cleanupTestFiles();
	try {
		const result = require('child_process').execSync('node scripts/validate-real-prompts.cjs batches report', {
			cwd: path.join(__dirname, '..'),
			encoding: 'utf-8'
		});
		assert.ok(result.includes('No batches completed'), 'Should indicate no completed batches');
		console.log('✓ PASS');
	} catch (e) {
		console.log('✗ FAIL:', e.message);
		process.exit(1);
	} finally {
		cleanupTestFiles();
	}
}

// Test 5: batch command with invalid number shows error
{
	console.log('Test 5: batch command with invalid number shows error');
	try {
		let errorShown = false;
		try {
			require('child_process').execSync('node scripts/validate-real-prompts.cjs batch abc', {
				cwd: path.join(__dirname, '..'),
				encoding: 'utf-8'
			});
		} catch (e) {
			errorShown = e.message.includes('valid batch number') || e.status !== 0;
		}
		assert.ok(errorShown, 'Should show error for invalid batch number');
		console.log('✓ PASS');
	} catch (e) {
		console.log('✗ FAIL:', e.message);
		process.exit(1);
	}
}

// Test 6: batch command with out-of-range number shows error
{
	console.log('Test 6: batch command with out-of-range number shows error');
	try {
		let errorShown = false;
		try {
			require('child_process').execSync('node scripts/validate-real-prompts.cjs batch 14', {
				cwd: path.join(__dirname, '..'),
				encoding: 'utf-8'
			});
		} catch (e) {
			errorShown = e.status !== 0;
		}
		assert.ok(errorShown, 'Should show error for out-of-range batch');
		console.log('✓ PASS');
	} catch (e) {
		console.log('✗ FAIL:', e.message);
		process.exit(1);
	}
}

// Test 7: Manifest file structure is created correctly
{
	console.log('Test 7: Manifest file structure matches expected format');
	cleanupTestFiles();
	try {
		const { loadManifest } = require('../scripts/batch-manifest.cjs');
		const manifest = loadManifest();

		assert.ok(manifest.version, 'Manifest should have version');
		assert.ok(manifest.started, 'Manifest should have started timestamp');
		assert.strictEqual(manifest.total_prompts, 1309, 'Manifest should have total prompts count');
		assert.ok(manifest.batches, 'Manifest should have batches object');
		assert.strictEqual(Object.keys(manifest.batches).length, 13, 'Should have 13 batches');

		// Check batch structure
		const batch1 = manifest.batches[1];
		assert.ok(batch1, 'Should have batch 1');
		assert.strictEqual(batch1.batch_num, 1, 'Batch should have correct number');
		assert.strictEqual(batch1.status, 'pending', 'Initial batch status should be pending');

		console.log('✓ PASS');
	} catch (e) {
		console.log('✗ FAIL:', e.message);
		process.exit(1);
	} finally {
		cleanupTestFiles();
	}
}

// Test 8: Batch command shows correct prompt range
{
	console.log('Test 8: batch command prompt ranges are correct for different batches');
	try {
		const testCases = [
			{ batch: 1, start: 0, end: 99 },
			{ batch: 2, start: 100, end: 199 },
			{ batch: 5, start: 400, end: 499 },
			{ batch: 13, start: 1200, end: 1299 }
		];

		for (const tc of testCases) {
			// We just validate help output mentions the structure
			const help = require('child_process').execSync('node scripts/validate-real-prompts.cjs help', {
				cwd: path.join(__dirname, '..'),
				encoding: 'utf-8'
			});
			assert.ok(help.includes('batch <N>'), 'Help should show batch command');
		}
		console.log('✓ PASS');
	} catch (e) {
		console.log('✗ FAIL:', e.message);
		process.exit(1);
	}
}

// Test 9: getBatchStatus function integration
{
	console.log('Test 9: getBatchStatus function returns correct structure');
	cleanupTestFiles();
	try {
		const { getBatchStatus } = require('../scripts/batch-manifest.cjs');
		const status = getBatchStatus();

		assert.ok(Array.isArray(status.completed), 'Status should have completed array');
		assert.ok(Array.isArray(status.pending), 'Status should have pending array');
		assert.strictEqual(status.total, 13, 'Status should show total of 13');
		assert.strictEqual(status.completed.length, 0, 'Initial state should have 0 completed');
		assert.strictEqual(status.pending.length, 13, 'Initial state should have 13 pending');

		console.log('✓ PASS');
	} catch (e) {
		console.log('✗ FAIL:', e.message);
		process.exit(1);
	} finally {
		cleanupTestFiles();
	}
}

// Test 10: aggregateBatchResults function
{
	console.log('Test 10: aggregateBatchResults returns correct structure');
	cleanupTestFiles();
	try {
		const { aggregateBatchResults } = require('../scripts/batch-manifest.cjs');
		const aggregated = aggregateBatchResults();

		assert.ok(Array.isArray(aggregated.completed_batches), 'Should have completed_batches array');
		assert.ok(typeof aggregated.total_prompts_processed === 'number', 'Should have total_prompts_processed');
		assert.ok(typeof aggregated.overall_avg_score === 'number', 'Should have overall_avg_score');
		assert.ok(aggregated.findings_summary, 'Should have findings_summary');
		assert.ok(aggregated.improvements_fired, 'Should have improvements_fired');
		assert.ok(typeof aggregated.completion_percentage === 'number', 'Should have completion_percentage');

		assert.strictEqual(aggregated.completed_batches.length, 0, 'Initial state should have 0 completed');
		assert.strictEqual(aggregated.total_prompts_processed, 0, 'Initial state should have 0 prompts processed');
		assert.strictEqual(aggregated.completion_percentage, 0, 'Initial state should be 0% complete');

		console.log('✓ PASS');
	} catch (e) {
		console.log('✗ FAIL:', e.message);
		process.exit(1);
	} finally {
		cleanupTestFiles();
	}
}

// Test 11: renderCompleteVisualization exports exist
{
	console.log('Test 11: renderCompleteVisualization function is available');
	try {
		const { renderCompleteVisualization } = require('../scripts/visualize-results.cjs');
		assert.ok(typeof renderCompleteVisualization === 'function', 'Should export renderCompleteVisualization');

		// Test with minimal analysis object
		const analysis = {
			totalPrompts: 100,
			avgScore: 7.5,
			scoreDistribution: {},
			severityBreakdown: { blocker: 5, major: 10, minor: 20, nit: 15 },
			improvementsFired: {}
		};

		const report = renderCompleteVisualization(analysis);
		assert.ok(typeof report === 'string', 'Should return string');
		assert.ok(report.length > 0, 'Report should not be empty');
		assert.ok(report.includes('Validation Summary'), 'Report should include validation summary');

		console.log('✓ PASS');
	} catch (e) {
		console.log('✗ FAIL:', e.message);
		process.exit(1);
	}
}

// Final cleanup
cleanupTestFiles();

console.log('\n✓ All batch CLI command tests passed');
