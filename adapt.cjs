const fs = require('fs');
const path = require('path');
const { generateReflectionReport, computeWeightSuggestions, computeAdaptationImpact, renderAdaptationHistoryTable } = require('./reflection.cjs');

const LOGS_DIR = path.join(__dirname, 'logs');
const WEIGHT_HISTORY_FILE = path.join(LOGS_DIR, 'weight-history.jsonl');

function previewAdaptation(days, options = {}) {
	options = options || {};
	const configPath = options.configPath || path.join(__dirname, 'config.json');

	// Load config
	let config;
	try {
		const configContent = fs.readFileSync(configPath, 'utf-8');
		config = JSON.parse(configContent);
	} catch (e) {
		return {
			report: null,
			diff: [],
			sufficient_data: false,
		};
	}

	const reflectionSettings = config.reflection || {};
	const minReviews = reflectionSettings.min_reviews_for_adaptation || 5;
	const precisionThreshold = reflectionSettings.precision_threshold || 0.70;

	// Generate reflection report (with optional entries for testing)
	const report = generateReflectionReport(days, {
		entries: options.entries,
		min_reviews: minReviews,
		precision_threshold: precisionThreshold,
	});

	if (!report.sufficient_data) {
		return {
			report,
			diff: [],
			sufficient_data: false,
		};
	}

	// Get current weights
	const currentWeights = config.scoring && config.scoring.weights ? config.scoring.weights : {};

	// Compute suggestions
	const suggestions = computeWeightSuggestions(report.reviewers, currentWeights, minReviews);

	// Build diff
	const diff = [];
	for (const [role, suggestion] of Object.entries(suggestions)) {
		diff.push({
			role,
			current: suggestion.current,
			suggested: suggestion.suggested,
			delta: suggestion.delta,
			reason: suggestion.reason,
		});
	}

	return {
		report,
		diff,
		sufficient_data: true,
	};
}

function applyAdaptation(days, options = {}) {
	options = options || {};
	const configPath = options.configPath || path.join(__dirname, 'config.json');

	// Preview first
	const preview = previewAdaptation(days, options);

	if (!preview.sufficient_data) {
		return {
			success: false,
			diff: [],
			report: preview.report,
		};
	}

	// Load config again for modification
	let config;
	try {
		const configContent = fs.readFileSync(configPath, 'utf-8');
		config = JSON.parse(configContent);
	} catch (e) {
		return {
			success: false,
			diff: [],
			report: preview.report,
		};
	}

	// Save current weights to history before modifying
	if (!config.scoring) config.scoring = {};
	if (!config.scoring.weights_history) config.scoring.weights_history = [];

	const historyEntry = {
		timestamp: new Date().toISOString(),
		weights: { ...config.scoring.weights },
	};

	config.scoring.weights_history.push(historyEntry);

	// Cap history at 10 entries (FIFO)
	if (config.scoring.weights_history.length > 10) {
		config.scoring.weights_history = config.scoring.weights_history.slice(-10);
	}

	// Apply suggestions
	for (const diff of preview.diff) {
		config.scoring.weights[diff.role] = diff.suggested;
	}

	// Write updated config
	try {
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
	} catch (e) {
		return {
			success: false,
			diff: preview.diff,
			report: preview.report,
		};
	}

	// Write weight change event to weight-history.jsonl
	try {
		if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

		const weightChangeEntry = {
			timestamp: new Date().toISOString(),
			weights_before: historyEntry.weights,
			weights_after: config.scoring.weights,
			precision_at_change: preview.report.reviewers,
			measurement_period_days: days,
		};

		fs.appendFileSync(WEIGHT_HISTORY_FILE, JSON.stringify(weightChangeEntry) + '\n');
	} catch (e) {
		// Fail silently; don't block if weight history write fails
	}

	return {
		success: true,
		diff: preview.diff,
		report: preview.report,
	};
}

// CLI usage
if (require.main === module) {
	const args = process.argv.slice(2);
	const days = parseInt(args[0]) || 30;
	const shouldApply = args.includes('--apply');
	const showHistory = args.includes('--history');
	const showBenchmark = args.includes('--benchmark');

	if (showHistory) {
		const { renderAdaptationHistoryTable } = require('./reflection.cjs');
		const impact = computeAdaptationImpact(days);
		console.log(renderAdaptationHistoryTable(impact));
		process.exit(0);
	} else if (showBenchmark) {
		const result = previewAdaptation(days);
		if (!result.sufficient_data) {
			console.log('Insufficient data for benchmark (need >= 5 reviews with outcomes)');
			process.exit(1);
		}

		console.log('Weight Adaptation Benchmark');
		console.log('============================\n');
		console.log('Comparing: Current Weights vs Equal Weights (all 1.0)\n');

		// Compute impact of equal weights
		const equalWeights = {};
		const currentWeights = {};
		for (const role of Object.keys(result.report.reviewers)) {
			equalWeights[role] = 1.0;
			currentWeights[role] = result.report.reviewers[role];
		}

		console.log('Role            Current  Equal   Precision  Coverage  Change');
		console.log('---             -------  -----   ---------  --------  ------');

		for (const [role, metrics] of Object.entries(result.report.reviewers)) {
			const current = String(currentWeights[role] || 1.0).padStart(7);
			const equal = String(equalWeights[role]).padStart(5);
			const precision = String((metrics.precision * 100).toFixed(0) + '%').padStart(9);
			const coverage = String((metrics.coverage_ratio * 100).toFixed(0) + '%').padStart(8);
			const isBenefit = metrics.precision > 0.7 ? '↑ yes' : '— no';
			console.log(`${role.padEnd(15)}${current}  ${equal}   ${precision}  ${coverage}  ${isBenefit}`);
		}

		console.log('\nInterpretation: "Change" indicates roles benefiting from current weighting strategy');
		process.exit(0);
	} else if (shouldApply) {
		const result = applyAdaptation(days);
		console.log('Weight Adaptation Applied');
		console.log('========================\n');
		console.log(JSON.stringify(result, null, 2));
		process.exit(result.success ? 0 : 1);
	} else {
		const result = previewAdaptation(days);
		console.log('Weight Adaptation Preview');
		console.log('========================\n');
		console.log(JSON.stringify(result, null, 2));
		process.exit(0);
	}
}

module.exports = {
	previewAdaptation,
	applyAdaptation,
};
