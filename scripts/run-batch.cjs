// scripts/run-batch.cjs
// Batch execution engine for validation batches

const fs = require('fs');
const path = require('path');
const { extractRealPrompts } = require('./extract-real-prompts.cjs');
const { analyzeFindings } = require('./analyze-findings.cjs');
const { renderCompleteVisualization } = require('./visualize-results.cjs');
const { saveBatchResult, loadManifest } = require('./batch-manifest.cjs');
const { runSinglePrompt } = require('./run-real-prompts.cjs');

const LOGS_DIR = path.join(__dirname, '..', 'test-logs');
const BATCHES_DIR = path.join(LOGS_DIR, 'validation-batches');

/**
 * Run a validation batch of 100 prompts
 * @param {number} batchNum - Batch number (1-13)
 * @param {Object} options - { dryRun, verbose }
 * @returns {Promise<Object>} { success, batchNum, promptCount, avgScore, results }
 */
async function runBatch(batchNum, options = {}) {
	const { dryRun = false, verbose = false } = options;

	try {
		if (batchNum < 1 || batchNum > 13) {
			throw new Error(`Invalid batch number ${batchNum}. Must be 1-13.`);
		}

		// Calculate offset: batch 1 = 0-99, batch 2 = 100-199, etc.
		const offset = (batchNum - 1) * 100;
		const limit = 100;

		if (verbose) {
			console.log(`[Batch ${batchNum}] Extracting ${limit} prompts from offset ${offset}...`);
		}

		// Extract real prompts for this batch
		const allPrompts = extractRealPrompts({ limit: offset + limit });
		if (allPrompts.length < offset + limit) {
			throw new Error(`Not enough prompts. Requested ${offset + limit}, got ${allPrompts.length}`);
		}

		const batchPrompts = allPrompts.slice(offset, offset + limit);

		if (verbose) {
			console.log(`[Batch ${batchNum}] Extracted ${batchPrompts.length} prompts`);
		}

		if (dryRun) {
			console.log(`[DRY RUN] Would process ${batchPrompts.length} prompts`);
			return {
				success: true,
				batchNum,
				promptCount: batchPrompts.length,
				avgScore: 0,
				results: [],
				dryRun: true
			};
		}

		// Run each prompt through orchestrator
		const results = [];
		for (let i = 0; i < batchPrompts.length; i++) {
			const prompt = batchPrompts[i];
			if (verbose && (i + 1) % 10 === 0) {
				console.log(`[Batch ${batchNum}] Processing prompt ${i + 1}/${batchPrompts.length}...`);
			}

			try {
				const result = await runSinglePrompt(prompt.hash);
				results.push(result);
			} catch (e) {
				if (verbose) {
					console.error(`[Batch ${batchNum}] Error processing prompt ${prompt.hash}: ${e.message}`);
				}
				results.push({
					hash: prompt.hash,
					error: e.message,
					compositeScore: null,
					findings: []
				});
			}
		}

		// Calculate average score
		let totalScore = 0;
		let scoreCount = 0;
		for (const result of results) {
			if (result.compositeScore !== null && result.compositeScore !== undefined) {
				totalScore += result.compositeScore;
				scoreCount++;
			}
		}
		const avgScore = scoreCount > 0 ? Math.round((totalScore / scoreCount) * 100) / 100 : 0;

		// Save results to disk
		saveBatchResult(batchNum, results);

		if (verbose) {
			console.log(`[Batch ${batchNum}] Completed: ${results.length} prompts, avg score ${avgScore}`);
		}

		return {
			success: true,
			batchNum,
			promptCount: results.length,
			avgScore,
			results
		};
	} catch (error) {
		console.error(`[Batch ${batchNum}] Error: ${error.message}`);
		return {
			success: false,
			batchNum,
			error: error.message,
			promptCount: 0,
			avgScore: 0,
			results: []
		};
	}
}

/**
 * Generate a markdown report for a completed batch
 * @param {number} batchNum - Batch number (1-13)
 * @param {Object} options - { include_improvements, include_severity }
 * @returns {string} Markdown report
 */
function generateBatchReport(batchNum, options = {}) {
	try {
		// Read batch results from disk
		const batchFileName = `batch-${String(batchNum).padStart(3, '0')}.jsonl`;
		const batchFilePath = path.join(BATCHES_DIR, batchFileName);

		if (!fs.existsSync(batchFilePath)) {
			throw new Error(`Batch ${batchNum} results not found at ${batchFilePath}`);
		}

		// Parse JSONL results
		const content = fs.readFileSync(batchFilePath, 'utf-8');
		const resultLines = content.split('\n').filter(l => l.trim());
		const results = resultLines.map(line => JSON.parse(line));

		if (results.length === 0) {
			throw new Error(`No results in batch ${batchNum}`);
		}

		// Analyze findings
		const analysis = analyzeFindings(results);

		// Generate complete visualization
		const report = renderCompleteVisualization(analysis, {
			runtime: 'batch processing',
			batchNum
		});

		// Add batch-specific header
		const reportLines = report.split('\n');
		reportLines.splice(1, 0, `**Batch:** ${batchNum} of 13`);
		reportLines.splice(2, 0, `**Prompts in Batch:** ${results.length}`);

		return reportLines.join('\n');
	} catch (error) {
		throw new Error(`Failed to generate report for batch ${batchNum}: ${error.message}`);
	}
}

/**
 * Get the filepath where a batch report should be saved
 * @param {number} batchNum - Batch number (1-13)
 * @returns {string} Full filepath
 */
function getBatchReportPath(batchNum) {
	const reportFileName = `batch-${String(batchNum).padStart(3, '0')}-report.md`;
	return path.join(LOGS_DIR, reportFileName);
}

/**
 * Save a batch report to disk
 * @param {number} batchNum - Batch number (1-13)
 * @param {string} reportContent - Markdown report content
 * @returns {string} Path to saved report
 */
function saveBatchReport(batchNum, reportContent) {
	try {
		const reportPath = getBatchReportPath(batchNum);

		// Ensure directory exists
		const logsDir = path.dirname(reportPath);
		if (!fs.existsSync(logsDir)) {
			fs.mkdirSync(logsDir, { recursive: true });
		}

		fs.writeFileSync(reportPath, reportContent, 'utf-8');
		return reportPath;
	} catch (error) {
		throw new Error(`Failed to save batch report: ${error.message}`);
	}
}

/**
 * Run batch and generate report in one operation
 * @param {number} batchNum - Batch number (1-13)
 * @param {Object} options - { dryRun, verbose, saveReport }
 * @returns {Promise<Object>} { success, batchNum, results, reportPath }
 */
async function runBatchAndReport(batchNum, options = {}) {
	const { saveReport = true, ...batchOptions } = options;

	try {
		// Run the batch
		const batchResult = await runBatch(batchNum, batchOptions);

		if (!batchResult.success) {
			return {
				success: false,
				batchNum,
				error: batchResult.error
			};
		}

		// In dryRun mode, return early without generating report
		if (batchOptions.dryRun) {
			return {
				success: true,
				batchNum,
				promptCount: batchResult.promptCount,
				avgScore: batchResult.avgScore,
				results: batchResult.results,
				reportPath: null,
				report: '(dry run - no report generated)'
			};
		}

		// Generate the report for real batch runs
		const reportContent = generateBatchReport(batchNum);

		// Optionally save report to disk
		let reportPath = null;
		if (saveReport) {
			reportPath = saveBatchReport(batchNum, reportContent);
		}

		return {
			success: true,
			batchNum,
			promptCount: batchResult.promptCount,
			avgScore: batchResult.avgScore,
			results: batchResult.results,
			reportPath,
			report: reportContent
		};
	} catch (error) {
		return {
			success: false,
			batchNum,
			error: error.message
		};
	}
}

module.exports = {
	runBatch,
	generateBatchReport,
	getBatchReportPath,
	saveBatchReport,
	runBatchAndReport
};
