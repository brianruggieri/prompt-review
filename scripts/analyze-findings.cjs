const fs = require('fs');
const path = require('path');

function analyzeFindings(results) {
	const analysis = {
		totalPrompts: results.length,
		avgScore: 0,
		scoreDistribution: {},
		improvementsFired: {},
		severityBreakdown: {},
		findingsPerPrompt: 0,
	};

	let totalScore = 0;
	let totalFindings = 0;

	for (const result of results) {
		if (result.compositeScore !== null && result.compositeScore !== undefined) {
			totalScore += result.compositeScore;
			const bucket = Math.floor(result.compositeScore);
			analysis.scoreDistribution[bucket] = (analysis.scoreDistribution[bucket] || 0) + 1;
		}

		// Track which improvements fired
		for (const [improvement, fired] of Object.entries(result.improvementsActive || {})) {
			if (fired) {
				analysis.improvementsFired[improvement] = (analysis.improvementsFired[improvement] || 0) + 1;
			}
		}

		// Count findings
		totalFindings += (result.findings || []).length;

		// Severity breakdown
		for (const finding of (result.findings || [])) {
			const sev = finding.severity || 'unknown';
			analysis.severityBreakdown[sev] = (analysis.severityBreakdown[sev] || 0) + 1;
		}
	}

	analysis.avgScore = results.length > 0 ? (totalScore / results.length).toFixed(2) : 0;
	analysis.findingsPerPrompt = results.length > 0 ? (totalFindings / results.length).toFixed(2) : 0;

	return analysis;
}

function generateAnalysisReport(analysis) {
	const lines = [];

	lines.push('# Real-World Prompt Validation Report');
	lines.push('');
	lines.push(`**Date:** ${new Date().toISOString()}`);
	lines.push(`**Prompts Analyzed:** ${analysis.totalPrompts}`);
	lines.push(`**Average Score:** ${analysis.avgScore}`);
	lines.push(`**Findings Per Prompt:** ${analysis.findingsPerPrompt}`);
	lines.push('');

	lines.push('## Score Distribution');
	lines.push('');
	for (let i = 0; i <= 10; i++) {
		const count = analysis.scoreDistribution[i] || 0;
		const bar = '█'.repeat(count);
		lines.push(`${i}-${i + 0.9}: ${bar} (${count})`);
	}

	lines.push('');
	lines.push('## Improvements Fired');
	lines.push('');
	if (Object.keys(analysis.improvementsFired).length === 0) {
		lines.push('No improvements detected firing.');
	} else {
		for (const [improvement, count] of Object.entries(analysis.improvementsFired)) {
			const pct = ((count / analysis.totalPrompts) * 100).toFixed(1);
			lines.push(`- **${improvement}**: ${count} times (${pct}%)`);
		}
	}

	lines.push('');
	lines.push('## Severity Breakdown');
	lines.push('');
	for (const [severity, count] of Object.entries(analysis.severityBreakdown).sort()) {
		lines.push(`- **${severity}**: ${count}`);
	}

	lines.push('');
	lines.push('## Validation Notes');
	lines.push('');
	lines.push('This report is generated from real prompts extracted from your Claude Code session logs.');
	lines.push('Original prompt text is NOT stored—only aggregated metrics and patterns.');
	lines.push('');

	return lines.join('\n');
}

module.exports = { analyzeFindings, generateAnalysisReport };
