// tests/run-batch.test.cjs
// Tests for batch runner

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
	runBatch,
	generateBatchReport,
	getBatchReportPath,
	saveBatchReport,
	runBatchAndReport
} = require('../scripts/run-batch.cjs');

const LOGS_DIR = path.join(__dirname, '..', 'test-logs');
const BATCHES_DIR = path.join(LOGS_DIR, 'validation-batches');
const MANIFEST_PATH = path.join(LOGS_DIR, 'batch-manifest.json');

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
			}
		}
	} catch (e) {
		// Ignore cleanup errors
	}
}

// Test 1: getBatchReportPath returns correct filepath
{
	const reportPath = getBatchReportPath(1);
	assert.ok(reportPath.includes('batch-001-report.md'), 'Report path should include batch-001-report.md');
	assert.ok(reportPath.includes('test-logs'), 'Report path should be in test-logs');

	const reportPath5 = getBatchReportPath(5);
	assert.ok(reportPath5.includes('batch-005-report.md'), 'Report path should pad batch number');

	const reportPath13 = getBatchReportPath(13);
	assert.ok(reportPath13.includes('batch-013-report.md'), 'Report path should handle batch 13');
}

// Test 2: runBatch returns correct structure with dryRun
async function testRunBatchDryRun() {
	cleanupTestFiles();

	const res = await runBatch(1, { dryRun: true });
	assert.strictEqual(res.success, true, 'dryRun should succeed');
	assert.strictEqual(res.batchNum, 1, 'Should return batch number');
	assert.strictEqual(res.promptCount, 100, 'Should return prompt count of 100');
	assert.strictEqual(res.avgScore, 0, 'dryRun should have avgScore 0');
	assert.ok(Array.isArray(res.results), 'Should return results array');
	assert.strictEqual(res.results.length, 0, 'dryRun results should be empty array');
	assert.strictEqual(res.dryRun, true, 'Should indicate dryRun');
}

// Test 3: runBatch rejects invalid batch numbers
async function testRunBatchInvalidNumbers() {
	const resultNegative = await runBatch(-1, { dryRun: true });
	assert.strictEqual(resultNegative.success, false, 'Should reject negative batch number');

	const resultTooHigh = await runBatch(14, { dryRun: true });
	assert.strictEqual(resultTooHigh.success, false, 'Should reject batch 14+');
}

// Test 4: saveBatchReport creates file with correct content
{
	cleanupTestFiles();

	const testContent = '# Test Report\n\nThis is a test batch report.';
	const savedPath = saveBatchReport(1, testContent);

	assert.ok(fs.existsSync(savedPath), 'Report file should exist');
	const content = fs.readFileSync(savedPath, 'utf-8');
	assert.strictEqual(content, testContent, 'Report content should match');

	cleanupTestFiles();
}

// Test 5: saveBatchReport creates directories if needed
{
	cleanupTestFiles();

	// Ensure directory doesn't exist
	if (fs.existsSync(LOGS_DIR)) {
		try {
			fs.rmdirSync(LOGS_DIR);
		} catch (e) {
			// May contain files, that's ok
		}
	}

	const testContent = 'Test content';
	const savedPath = saveBatchReport(2, testContent);

	assert.ok(fs.existsSync(savedPath), 'File should be created even if directory missing');
	assert.ok(fs.existsSync(LOGS_DIR), 'Directory should be created');

	cleanupTestFiles();
}

// Test 6: generateBatchReport throws when batch doesn't exist
{
	cleanupTestFiles();

	try {
		generateBatchReport(1);
		assert.fail('Should throw when batch not found');
	} catch (e) {
		assert.ok(e.message.includes('not found'), 'Should indicate batch not found');
	}

	cleanupTestFiles();
}

// Test 7: generateBatchReport parses batch results correctly
{
	cleanupTestFiles();

	// Create a mock batch file
	if (!fs.existsSync(BATCHES_DIR)) {
		fs.mkdirSync(BATCHES_DIR, { recursive: true });
	}

	const mockResults = [
		{
			hash: 'abc123def456',
			compositeScore: 7.5,
			findings: [
				{ severity: 'blocker', issue: 'Missing auth' },
				{ severity: 'major', issue: 'No validation' }
			],
			improvementsActive: { 'template-safety': true }
		},
		{
			hash: 'xyz789uvw012',
			compositeScore: 6.2,
			findings: [
				{ severity: 'minor', issue: 'Unclear language' }
			],
			improvementsActive: { 'template-safety': false }
		}
	];

	const batchFilePath = path.join(BATCHES_DIR, 'batch-001.jsonl');
	let content = '';
	for (const result of mockResults) {
		content += JSON.stringify(result) + '\n';
	}
	fs.writeFileSync(batchFilePath, content, 'utf-8');

	const report = generateBatchReport(1);

	assert.ok(report.includes('Batch'), 'Report should mention batch number');
	assert.ok(report.includes('Prompts in Batch'), 'Report should show prompt count');
	assert.ok(report.includes('Score Distribution'), 'Report should include score distribution');
	assert.ok(report.includes('Validation Summary'), 'Report should include summary');

	cleanupTestFiles();
}

// Test 8: runBatchAndReport combines batch execution and reporting
async function testRunBatchAndReport() {
	cleanupTestFiles();

	const res = await runBatchAndReport(1, { dryRun: true, saveReport: false });
	assert.strictEqual(res.success, true, 'Should succeed');
	assert.strictEqual(res.batchNum, 1, 'Should return batch number');
	assert.strictEqual(res.promptCount, 100, 'Should show prompt count');
	assert.ok(typeof res.report === 'string', 'Should return report text');
	assert.ok(res.report.includes('dry run'), 'Report should indicate dry run');
}

// Test 9: getBatchReportPath handles all batch numbers correctly
function testGetBatchReportPathNumbers() {
	for (let i = 1; i <= 13; i++) {
		const reportPath = getBatchReportPath(i);
		const paddedNum = String(i).padStart(3, '0');
		assert.ok(
			reportPath.includes(`batch-${paddedNum}-report.md`),
			`Batch ${i} should have correct padded format`
		);
	}
}

// Test 10: runBatchAndReport with saveReport=true saves the report
async function testRunBatchAndReportWithSave() {
	cleanupTestFiles();

	const res = await runBatchAndReport(1, { dryRun: true, saveReport: true });
	assert.strictEqual(res.success, true, 'Should succeed');
	assert.strictEqual(res.reportPath, null, 'reportPath should be null in dryRun even with saveReport=true');

	cleanupTestFiles();
}

// Run all async tests
async function runAllTests() {
	try {
		await testRunBatchDryRun();
		await testRunBatchInvalidNumbers();
		testGetBatchReportPathNumbers();
		await testRunBatchAndReport();
		await testRunBatchAndReportWithSave();

		console.log('All run-batch tests passed');
	} catch (e) {
		console.error('Test failed:', e.message);
		process.exit(1);
	}
}

runAllTests();
