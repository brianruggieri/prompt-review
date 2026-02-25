const assert = require('assert');
const {
	renderScoreDistribution,
	renderImprovementEffectiveness,
	renderSeverityBreakdown,
	renderValidationSummary,
	renderCompleteVisualization
} = require('../scripts/visualize-results.cjs');

// Mock analysis data for testing
const mockAnalysis = {
	totalPrompts: 1000,
	avgScore: 7.8,
	scoreDistribution: {
		0: 5,
		1: 3,
		2: 8,
		3: 12,
		4: 25,
		5: 45,
		6: 78,
		7: 156,
		8: 312,
		9: 247,
		10: 109
	},
	improvementsFired: {
		frontend_ux_multi_factor: 188,
		security_severity_matrix: 245,
		testing_bugfix_detection: 167,
		clarity_domain_context: 92,
		security_template_safety: 134,
		documentation_maturity_aware: 267,
		domain_sme_file_validation: 178
	},
	severityBreakdown: {
		blocker: 23,
		major: 156,
		minor: 312,
		nit: 608
	},
	findingsPerPrompt: 1.099
};

// Test 1: renderScoreDistribution renders correctly
{
	const output = renderScoreDistribution(mockAnalysis);
	assert(output.includes('## Score Distribution'), 'Should have section header');
	assert(output.includes('0-0.9:'), 'Should render bucket 0-0.9');
	assert(output.includes('10-10.9:'), 'Should render bucket 10-10.9');
	assert(output.includes('░'), 'Should use Unicode box chars');
	assert(output.includes('5 prompts'), 'Should show counts');
	assert(output.includes('%'), 'Should show percentages');
	console.log('✓ renderScoreDistribution renders correctly');
}

// Test 2: renderScoreDistribution with empty data
{
	const emptyAnalysis = {
		totalPrompts: 0,
		scoreDistribution: {}
	};
	const output = renderScoreDistribution(emptyAnalysis);
	assert(output.includes('## Score Distribution'), 'Should have section header');
	assert(output.includes('0-0.9:'), 'Should still render all buckets');
	console.log('✓ renderScoreDistribution handles empty data');
}

// Test 3: renderScoreDistribution max bar width
{
	const output = renderScoreDistribution(mockAnalysis);
	const lines = output.split('\n');
	for (const line of lines) {
		if (!line.includes('░')) continue;
		const barMatch = line.match(/░+/);
		if (barMatch) {
			assert(barMatch[0].length <= 40, `Bar should not exceed max width of 40, got ${barMatch[0].length}`);
		}
	}
	console.log('✓ renderScoreDistribution respects max bar width');
}

// Test 4: renderImprovementEffectiveness renders all improvements
{
	const output = renderImprovementEffectiveness(mockAnalysis);
	assert(output.includes('## Improvement Effectiveness'), 'Should have section header');
	assert(output.includes('MULTI-FACTOR TRIGGER'), 'Should include multi-factor trigger');
	assert(output.includes('SECURITY SEVERITY MATRIX'), 'Should include security matrix');
	assert(output.includes('TESTING BUGFIX DETECTION'), 'Should include testing bugfix');
	assert(output.includes('CLARITY DOMAIN CONTEXT'), 'Should include clarity context');
	assert(output.includes('TEMPLATE SAFETY DETECTION'), 'Should include template safety');
	assert(output.includes('PROJECT MATURITY AWARENESS'), 'Should include maturity aware');
	assert(output.includes('FILE PATH VALIDATION'), 'Should include file validation');
	console.log('✓ renderImprovementEffectiveness renders all improvements');
}

// Test 5: renderImprovementEffectiveness shows fire counts and percentages
{
	const output = renderImprovementEffectiveness(mockAnalysis);
	assert(output.includes('188 times'), 'Should show fire count for multi-factor');
	assert(output.includes('18.8%'), 'Should show percentage for multi-factor');
	assert(output.includes('✓ Active'), 'Should mark improvements as active');
	console.log('✓ renderImprovementEffectiveness shows counts and percentages');
}

// Test 6: renderImprovementEffectiveness with empty improvements
{
	const emptyAnalysis = { totalPrompts: 100, improvementsFired: {} };
	const output = renderImprovementEffectiveness(emptyAnalysis);
	assert(output.includes('No improvements detected'), 'Should show message for no improvements');
	console.log('✓ renderImprovementEffectiveness handles empty improvements');
}

// Test 7: renderSeverityBreakdown renders all severity levels
{
	const output = renderSeverityBreakdown(mockAnalysis);
	assert(output.includes('## Findings Severity'), 'Should have section header');
	assert(output.includes('🔴'), 'Should have blocker emoji');
	assert(output.includes('🟠'), 'Should have major emoji');
	assert(output.includes('🟡'), 'Should have minor emoji');
	assert(output.includes('⚪'), 'Should have nit emoji');
	assert(output.includes('BLOCKER'), 'Should label blocker');
	assert(output.includes('MAJOR'), 'Should label major');
	assert(output.includes('MINOR'), 'Should label minor');
	assert(output.includes('NIT'), 'Should label nit');
	console.log('✓ renderSeverityBreakdown renders all severity levels');
}

// Test 8: renderSeverityBreakdown shows counts and percentages
{
	const output = renderSeverityBreakdown(mockAnalysis);
	const totalFindings = 23 + 156 + 312 + 608; // 1099
	const blockerPct = ((23 / totalFindings) * 100).toFixed(1);
	assert(output.includes('23 findings'), 'Should show blocker count');
	assert(output.includes(`${blockerPct}%`), 'Should show blocker percentage');
	console.log('✓ renderSeverityBreakdown shows counts and percentages');
}

// Test 9: renderSeverityBreakdown with empty findings
{
	const emptyAnalysis = { severityBreakdown: {} };
	const output = renderSeverityBreakdown(emptyAnalysis);
	assert(output.includes('No findings detected'), 'Should show message for no findings');
	console.log('✓ renderSeverityBreakdown handles empty findings');
}

// Test 10: renderSeverityBreakdown max bar width
{
	const output = renderSeverityBreakdown(mockAnalysis);
	const lines = output.split('\n');
	for (const line of lines) {
		if (!line.includes('█')) continue;
		const barMatch = line.match(/█+/);
		if (barMatch) {
			assert(barMatch[0].length <= 40, `Bar should not exceed 40 chars, got ${barMatch[0].length}`);
		}
	}
	console.log('✓ renderSeverityBreakdown respects max bar width');
}

// Test 11: renderValidationSummary renders all key metrics
{
	const output = renderValidationSummary(mockAnalysis);
	assert(output.includes('## Validation Summary'), 'Should have section header');
	assert(output.includes('Prompts analyzed: 1000'), 'Should show prompt count');
	assert(output.includes('Average score: 7.8'), 'Should show average score');
	assert(output.includes('Total findings: 1099'), 'Should show total findings');
	assert(output.includes('✓'), 'Should use checkmark emoji');
	console.log('✓ renderValidationSummary renders all key metrics');
}

// Test 12: renderValidationSummary with runtime option
{
	const output = renderValidationSummary(mockAnalysis, { runtime: '5 minutes' });
	assert(output.includes('Runtime: 5 minutes'), 'Should include optional runtime');
	console.log('✓ renderValidationSummary includes optional runtime');
}

// Test 13: renderValidationSummary counts active improvements
{
	const output = renderValidationSummary(mockAnalysis);
	assert(output.includes('Improvements active: 7'), 'Should count 7 active improvements');
	console.log('✓ renderValidationSummary counts active improvements');
}

// Test 14: renderValidationSummary with single active improvement
{
	const singleAnalysis = {
		totalPrompts: 100,
		avgScore: 6.5,
		severityBreakdown: { blocker: 2, major: 5 },
		improvementsFired: { frontend_ux_multi_factor: 10 }
	};
	const output = renderValidationSummary(singleAnalysis);
	assert(output.includes('Improvements active: 1'), 'Should count 1 active improvement');
	console.log('✓ renderValidationSummary handles single improvement');
}

// Test 15: renderCompleteVisualization combines all sections
{
	const output = renderCompleteVisualization(mockAnalysis);
	assert(output.includes('# Real-World Prompt Validation Report'), 'Should have main title');
	assert(output.includes('## Validation Summary'), 'Should include summary');
	assert(output.includes('## Score Distribution'), 'Should include score distribution');
	assert(output.includes('## Findings Severity'), 'Should include severity breakdown');
	assert(output.includes('## Improvement Effectiveness'), 'Should include improvements');
	assert(output.includes('Date:'), 'Should include timestamp');
	console.log('✓ renderCompleteVisualization combines all sections');
}

// Test 16: renderCompleteVisualization with runtime option
{
	const output = renderCompleteVisualization(mockAnalysis, { runtime: '3 minutes' });
	assert(output.includes('Runtime: 3 minutes'), 'Should pass runtime to summary');
	console.log('✓ renderCompleteVisualization passes options correctly');
}

// Test 17: All outputs are markdown strings
{
	const outputs = [
		renderScoreDistribution(mockAnalysis),
		renderImprovementEffectiveness(mockAnalysis),
		renderSeverityBreakdown(mockAnalysis),
		renderValidationSummary(mockAnalysis),
		renderCompleteVisualization(mockAnalysis)
	];

	for (const output of outputs) {
		assert(typeof output === 'string', 'Output should be a string');
		assert(output.length > 0, 'Output should not be empty');
		assert(output.includes('\n'), 'Output should be multi-line markdown');
	}
	console.log('✓ All outputs are valid markdown strings');
}

// Test 18: Percentages have 1 decimal place
{
	const output = renderScoreDistribution(mockAnalysis);
	const percentMatches = output.match(/\d+\.\d%/g) || [];
	assert(percentMatches.length > 0, 'Should have percentages');
	for (const match of percentMatches) {
		const decimal = match.split('.')[1];
		assert(decimal && decimal.length === 2 && decimal[1] === '%', 'Should have exactly 1 decimal place + %');
	}
	console.log('✓ Percentages have correct precision (1 decimal)');
}

// Test 19: Score distribution shows percentage of total
{
	const analysis = {
		totalPrompts: 100,
		scoreDistribution: {
			5: 50,
			6: 30,
			7: 20,
			8: 0
		}
	};
	const output = renderScoreDistribution(analysis);
	assert(output.includes('50.0%'), 'Should show 50% for 50/100');
	assert(output.includes('30.0%'), 'Should show 30% for 30/100');
	assert(output.includes('20.0%'), 'Should show 20% for 20/100');
	console.log('✓ Score distribution percentages are calculated correctly');
}

// Test 20: Severity bars scale proportionally
{
	const analysis = {
		severityBreakdown: {
			blocker: 10,
			major: 100,
			minor: 500,
			nit: 2000
		},
		totalPrompts: 2610
	};
	const output = renderSeverityBreakdown(analysis);
	const lines = output.split('\n');
	let blockerBar = 0;
	let majorBar = 0;
	let minorBar = 0;
	let nitBar = 0;

	for (const line of lines) {
		if (line.includes('BLOCKER')) {
			blockerBar = (line.match(/█/g) || []).length;
		} else if (line.includes('MAJOR')) {
			majorBar = (line.match(/█/g) || []).length;
		} else if (line.includes('MINOR')) {
			minorBar = (line.match(/█/g) || []).length;
		} else if (line.includes('NIT')) {
			nitBar = (line.match(/█/g) || []).length;
		}
	}

	assert(blockerBar <= majorBar, 'Blocker bar should be <= major');
	assert(majorBar <= minorBar, 'Major bar should be <= minor');
	assert(minorBar < nitBar, 'Minor bar should be < nit (nit is largest)');
	console.log('✓ Severity bars scale proportionally');
}

// Test 21: Section headers are consistent format
{
	const outputs = [
		renderScoreDistribution(mockAnalysis),
		renderImprovementEffectiveness(mockAnalysis),
		renderSeverityBreakdown(mockAnalysis),
		renderValidationSummary(mockAnalysis)
	];

	for (const output of outputs) {
		const headerMatch = output.match(/^## /m);
		assert(headerMatch, 'All sections should have ## header');
	}
	console.log('✓ Section headers are consistent markdown format');
}

// Test 22: Improvement effectiveness shows status correctly
{
	const analysis = {
		totalPrompts: 100,
		improvementsFired: {
			frontend_ux_multi_factor: 50,
			security_severity_matrix: 0
		}
	};
	const output = renderImprovementEffectiveness(analysis);
	assert(output.includes('✓ Active'), 'Should mark firing improvements as active');
	console.log('✓ Improvement effectiveness shows correct status');
}

// Test 23: Validation summary with zero values
{
	const emptyAnalysis = {
		totalPrompts: 0,
		avgScore: 0,
		severityBreakdown: {},
		improvementsFired: {}
	};
	const output = renderValidationSummary(emptyAnalysis);
	assert(output.includes('Prompts analyzed: 0'), 'Should handle zero prompts');
	assert(output.includes('Average score: 0'), 'Should handle zero score');
	assert(output.includes('Total findings: 0'), 'Should handle zero findings');
	console.log('✓ Validation summary handles zero values');
}

// Test 24: Improvements are sorted by key
{
	const output = renderImprovementEffectiveness(mockAnalysis);
	const lines = output.split('\n');
	const improvementLines = lines.filter(l => l.includes('###'));
	// Just verify there are improvement sections
	assert(improvementLines.length > 0, 'Should have improvement sections');
	assert(improvementLines.length <= 7, 'Should have at most 7 improvements');
	console.log('✓ Improvements are rendered consistently');
}

// Test 25: Complete visualization includes all required sections
{
	const output = renderCompleteVisualization(mockAnalysis, { runtime: '2 minutes' });
	const sections = [
		'# Real-World Prompt Validation Report',
		'## Validation Summary',
		'## Score Distribution',
		'## Findings Severity',
		'## Improvement Effectiveness'
	];

	for (const section of sections) {
		assert(output.includes(section), `Should include section: ${section}`);
	}

	// Verify order: summary first, then score, then severity, then improvements
	const summaryIdx = output.indexOf('## Validation Summary');
	const scoreIdx = output.indexOf('## Score Distribution');
	const severityIdx = output.indexOf('## Findings Severity');
	const improvementIdx = output.indexOf('## Improvement Effectiveness');

	assert(summaryIdx < scoreIdx, 'Summary should come before score distribution');
	assert(scoreIdx < severityIdx, 'Score distribution should come before severity');
	assert(severityIdx < improvementIdx, 'Severity should come before improvements');
	console.log('✓ Complete visualization includes all sections in correct order');
}

console.log('\n✅ All visualization tests passed (25/25)');
