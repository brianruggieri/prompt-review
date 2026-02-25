// scripts/batch-manifest.cjs
// Batch manifest tracker for validation progress

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, '..', 'test-logs', 'batch-manifest.json');
const BATCHES_DIR = path.join(__dirname, '..', 'test-logs', 'validation-batches');

/**
 * Initialize a new batch manifest
 * @returns {Object} manifest object with structure: { version, started, batches: {}, total_prompts: 1309, status: "in_progress" }
 */
function initializeManifest() {
	const manifest = {
		version: '1.0',
		started: new Date().toISOString(),
		total_prompts: 1309,
		status: 'in_progress',
		batches: {}
	};

	// Initialize all 13 batches
	for (let i = 1; i <= 13; i++) {
		manifest.batches[i] = {
			batch_num: i,
			status: 'pending',
			completed_at: null,
			prompt_count: null,
			avg_score: null,
			findings_summary: {
				blocker: 0,
				major: 0,
				minor: 0,
				nit: 0
			},
			improvements_fired: {},
			file_path: null
		};
	}

	return manifest;
}

/**
 * Load manifest from disk or create new one if missing
 * @returns {Object} manifest object
 */
function loadManifest() {
	try {
		if (fs.existsSync(MANIFEST_PATH)) {
			const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
			return JSON.parse(content);
		}
	} catch (e) {
		// Fall through to create new
	}

	return initializeManifest();
}

/**
 * Save batch result to disk
 * @param {number} batchNum - Batch number (1-13)
 * @param {Array} results - Array of result objects
 * @returns {void}
 */
function saveBatchResult(batchNum, results) {
	try {
		// Ensure directories exist
		if (!fs.existsSync(BATCHES_DIR)) {
			fs.mkdirSync(BATCHES_DIR, { recursive: true });
		}

		// Write batch results to JSONL file
		const batchFileName = `batch-${String(batchNum).padStart(3, '0')}.jsonl`;
		const batchFilePath = path.join(BATCHES_DIR, batchFileName);

		let content = '';
		for (const result of results) {
			content += JSON.stringify(result) + '\n';
		}

		fs.writeFileSync(batchFilePath, content, 'utf-8');

		// Update manifest
		const manifest = loadManifest();
		const timestamp = new Date().toISOString();

		// Calculate metrics from results
		const promptCount = results.length;
		const avgScore = results.reduce((sum, r) => sum + (r.compositeScore || 0), 0) / promptCount;

		const findingsSummary = {
			blocker: 0,
			major: 0,
			minor: 0,
			nit: 0
		};

		const improvementsFired = {};

		for (const result of results) {
			if (result.findings && Array.isArray(result.findings)) {
				for (const finding of result.findings) {
					const severity = finding.severity || 'nit';
					if (findingsSummary.hasOwnProperty(severity)) {
						findingsSummary[severity]++;
					}
				}
			}

			if (result.improvementsActive && typeof result.improvementsActive === 'object') {
				for (const [key, value] of Object.entries(result.improvementsActive)) {
					if (value) {
						improvementsFired[key] = (improvementsFired[key] || 0) + 1;
					}
				}
			}
		}

		// Update batch status
		manifest.batches[batchNum] = {
			batch_num: batchNum,
			status: 'completed',
			completed_at: timestamp,
			prompt_count: promptCount,
			avg_score: Math.round(avgScore * 100) / 100,
			findings_summary: findingsSummary,
			improvements_fired: improvementsFired,
			file_path: batchFilePath
		};

		// Check if all batches are complete
		const allCompleted = Object.values(manifest.batches).every(b => b.status === 'completed');
		manifest.status = allCompleted ? 'completed' : 'in_progress';

		// Ensure test-logs dir exists
		const testLogsDir = path.dirname(MANIFEST_PATH);
		if (!fs.existsSync(testLogsDir)) {
			fs.mkdirSync(testLogsDir, { recursive: true });
		}

		fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
	} catch (e) {
		// Fail silently, don't block validation
	}
}

/**
 * Get current batch status
 * @returns {Object} status object with { completed: [...], pending: [...], total }
 */
function getBatchStatus() {
	const manifest = loadManifest();

	const completed = [];
	const pending = [];

	for (let i = 1; i <= 13; i++) {
		const batch = manifest.batches[i];
		if (batch && batch.status === 'completed') {
			completed.push(i);
		} else {
			pending.push(i);
		}
	}

	return {
		completed,
		pending,
		total: 13,
		manifest_status: manifest.status
	};
}

/**
 * Aggregate results from all completed batches
 * @returns {Object} aggregated metrics
 */
function aggregateBatchResults() {
	const manifest = loadManifest();
	const batches = manifest.batches;

	let totalPrompts = 0;
	let totalScore = 0;
	let scoreCount = 0;

	const findingsSummary = {
		blocker: 0,
		major: 0,
		minor: 0,
		nit: 0
	};

	const improvementsFired = {};
	const completedBatches = [];

	for (let i = 1; i <= 13; i++) {
		const batch = batches[i];
		if (!batch || batch.status !== 'completed') continue;

		completedBatches.push(i);
		totalPrompts += batch.prompt_count || 0;

		if (batch.avg_score !== null) {
			totalScore += (batch.avg_score * (batch.prompt_count || 1));
			scoreCount += (batch.prompt_count || 1);
		}

		// Aggregate findings
		if (batch.findings_summary) {
			for (const [severity, count] of Object.entries(batch.findings_summary)) {
				findingsSummary[severity] += count;
			}
		}

		// Aggregate improvements
		if (batch.improvements_fired) {
			for (const [key, count] of Object.entries(batch.improvements_fired)) {
				improvementsFired[key] = (improvementsFired[key] || 0) + count;
			}
		}
	}

	const overallAvgScore = scoreCount > 0 ? Math.round((totalScore / scoreCount) * 100) / 100 : 0;

	return {
		completed_batches: completedBatches,
		total_prompts_processed: totalPrompts,
		overall_avg_score: overallAvgScore,
		findings_summary: findingsSummary,
		improvements_fired: improvementsFired,
		completion_percentage: Math.round((completedBatches.length / 13) * 100)
	};
}

module.exports = {
	initializeManifest,
	loadManifest,
	saveBatchResult,
	getBatchStatus,
	aggregateBatchResults,
	MANIFEST_PATH,
	BATCHES_DIR
};
