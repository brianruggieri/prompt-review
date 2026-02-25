const fs = require('fs');
const path = require('path');
const { generateReflectionReport, computeWeightSuggestions } = require('./reflection.cjs');

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

	if (shouldApply) {
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
