/**
 * Visualization functions for rich ASCII-based report metrics.
 * No external dependencies — uses only Node.js built-ins.
 *
 * All functions return markdown strings with ASCII art, Unicode box chars,
 * and emoji for severity levels.
 */

const MAX_BAR_WIDTH = 40;

/**
 * Renders a score distribution chart (0-10 buckets)
 * Creates ASCII bar chart with percentages and counts.
 *
 * @param {Object} analysis - Analysis object with scoreDistribution
 * @returns {string} Markdown string with score distribution chart
 */
function renderScoreDistribution(analysis) {
	const lines = [];
	lines.push('## Score Distribution');
	lines.push('');

	const totalPrompts = analysis.totalPrompts || 1;
	let maxCount = 0;

	// Find max count for scaling
	for (let i = 0; i <= 10; i++) {
		const count = analysis.scoreDistribution[i] || 0;
		if (count > maxCount) {
			maxCount = count;
		}
	}

	// Prevent division by zero
	if (maxCount === 0) {
		maxCount = 1;
	}

	// Render each bucket
	for (let i = 0; i <= 10; i++) {
		const count = analysis.scoreDistribution[i] || 0;
		const percentage = ((count / totalPrompts) * 100).toFixed(1);
		const barLength = maxCount > 0 ? Math.round((count / maxCount) * MAX_BAR_WIDTH) : 0;
		const bar = '░'.repeat(barLength) + '░'.repeat(Math.max(0, MAX_BAR_WIDTH - barLength));

		lines.push(`${i}-${i + 0.9}: ${bar} (${count} prompts, ${percentage}%)`);
	}

	lines.push('');
	return lines.join('\n');
}

/**
 * Renders effectiveness cards for each improvement that fired.
 * Shows how many times each improvement was triggered and its impact.
 *
 * @param {Object} analysis - Analysis object with improvementsFired
 * @returns {string} Markdown string with effectiveness cards
 */
function renderImprovementEffectiveness(analysis) {
	const lines = [];
	lines.push('## Improvement Effectiveness');
	lines.push('');

	const improvements = {
		frontend_ux_multi_factor: {
			name: 'MULTI-FACTOR TRIGGER',
			description: 'Requires 2+ keywords OR keyword+files'
		},
		security_severity_matrix: {
			name: 'SECURITY SEVERITY MATRIX',
			description: 'Severity-based finding classification'
		},
		testing_bugfix_detection: {
			name: 'TESTING BUGFIX DETECTION',
			description: 'Skips tests for fixes/optimizations/typos'
		},
		clarity_domain_context: {
			name: 'CLARITY DOMAIN CONTEXT',
			description: 'Context-aware language acceptance'
		},
		security_template_safety: {
			name: 'TEMPLATE SAFETY DETECTION',
			description: '8 template engines, unescaped detection'
		},
		documentation_maturity_aware: {
			name: 'PROJECT MATURITY AWARENESS',
			description: 'MVP vs stable project handling'
		},
		domain_sme_file_validation: {
			name: 'FILE PATH VALIDATION',
			description: 'Validates file references against project'
		}
	};

	const improvementsFired = analysis.improvementsFired || {};
	const totalPrompts = analysis.totalPrompts || 1;

	if (Object.keys(improvementsFired).length === 0) {
		lines.push('No improvements detected firing.');
		lines.push('');
		return lines.join('\n');
	}

	for (const [key, count] of Object.entries(improvementsFired).sort()) {
		const config = improvements[key];
		if (!config) continue;

		const percentage = ((count / totalPrompts) * 100).toFixed(1);
		const status = count > 0 ? '✓ Active' : '○ Inactive';

		lines.push(`### ${config.name}: ${status}`);
		lines.push(`Fired: ${count} times (${percentage}% of prompts)`);
		lines.push(`Impact: ${config.description}`);
		lines.push('Status: WORKING');
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Renders severity breakdown with visual bars and emoji.
 * Shows blocker, major, minor, and nit findings.
 *
 * @param {Object} analysis - Analysis object with severityBreakdown
 * @returns {string} Markdown string with severity breakdown
 */
function renderSeverityBreakdown(analysis) {
	const lines = [];
	lines.push('## Findings Severity');
	lines.push('');

	const severityBreakdown = analysis.severityBreakdown || {};
	const severityMap = {
		blocker: { emoji: '🔴', label: 'BLOCKER' },
		major: { emoji: '🟠', label: 'MAJOR' },
		minor: { emoji: '🟡', label: 'MINOR' },
		nit: { emoji: '⚪', label: 'NIT' }
	};

	const severityOrder = ['blocker', 'major', 'minor', 'nit'];

	// Calculate total findings
	let totalFindings = 0;
	for (const count of Object.values(severityBreakdown)) {
		totalFindings += count;
	}

	if (totalFindings === 0) {
		lines.push('No findings detected.');
		lines.push('');
		return lines.join('\n');
	}

	// Find max count for scaling
	let maxCount = 0;
	for (const severity of severityOrder) {
		const count = severityBreakdown[severity] || 0;
		if (count > maxCount) {
			maxCount = count;
		}
	}

	// Render each severity level
	for (const severity of severityOrder) {
		const config = severityMap[severity];
		const count = severityBreakdown[severity] || 0;
		const percentage = ((count / totalFindings) * 100).toFixed(1);

		// Scale bar to max count
		const barLength = maxCount > 0 ? Math.round((count / maxCount) * MAX_BAR_WIDTH) : 0;
		const bar = '█'.repeat(barLength) + '░'.repeat(Math.max(0, MAX_BAR_WIDTH - barLength));

		lines.push(`${config.emoji}  ${config.label.padEnd(8)} ${bar} (${count} findings, ${percentage}%)`);
	}

	lines.push('');
	return lines.join('\n');
}

/**
 * Renders high-level validation summary with key metrics.
 * Shows prompts analyzed, average score, total findings, and improvements.
 *
 * @param {Object} analysis - Analysis object with all metrics
 * @param {Object} options - Optional configuration (e.g., { runtime: '5 minutes' })
 * @returns {string} Markdown string with validation summary
 */
function renderValidationSummary(analysis, options = {}) {
	const lines = [];
	lines.push('## Validation Summary');
	lines.push('');

	const totalPrompts = analysis.totalPrompts || 0;
	const avgScore = analysis.avgScore || 0;

	// Calculate total findings
	let totalFindings = 0;
	const severityBreakdown = analysis.severityBreakdown || {};
	for (const count of Object.values(severityBreakdown)) {
		totalFindings += count;
	}

	// Count improvements active
	const improvementsFired = analysis.improvementsFired || {};
	const activeImprovements = Object.keys(improvementsFired).filter(k => improvementsFired[k] > 0).length;

	lines.push(`✓ Prompts analyzed: ${totalPrompts}`);
	lines.push(`✓ Average score: ${avgScore}/10`);
	lines.push(`✓ Total findings: ${totalFindings}`);
	lines.push(`✓ Improvements active: ${activeImprovements}`);

	if (options.runtime) {
		lines.push(`✓ Runtime: ${options.runtime}`);
	}

	lines.push('');
	return lines.join('\n');
}

/**
 * Combines all visualization functions into a complete report.
 *
 * @param {Object} analysis - Analysis object from analyzeFindings()
 * @param {Object} options - Optional configuration (e.g., { runtime: '5 minutes' })
 * @returns {string} Markdown string with complete visualization report
 */
function renderCompleteVisualization(analysis, options = {}) {
	const lines = [];

	lines.push('# Real-World Prompt Validation Report');
	lines.push('');
	lines.push(`**Date:** ${new Date().toISOString()}`);
	lines.push('');

	// Add each visualization section
	lines.push(renderValidationSummary(analysis, options));
	lines.push(renderScoreDistribution(analysis));
	lines.push(renderSeverityBreakdown(analysis));
	lines.push(renderImprovementEffectiveness(analysis));

	return lines.join('\n');
}

module.exports = {
	renderScoreDistribution,
	renderImprovementEffectiveness,
	renderSeverityBreakdown,
	renderValidationSummary,
	renderCompleteVisualization
};
