const assert = require('assert');
const { analyzeFindings, generateAnalysisReport } = require('../scripts/analyze-findings.cjs');

const mockResults = [
	{ hash: 'abc123', compositeScore: 7.5, findings: [{severity: 'major'}, {severity: 'minor'}], improvementsActive: {multiFactorTrigger: true} },
	{ hash: 'def456', compositeScore: 6.0, findings: [{severity: 'nit'}], improvementsActive: {} },
	{ hash: 'ghi789', compositeScore: 8.2, findings: [], improvementsActive: {templateSafety: true} }
];

const analysis = analyzeFindings(mockResults);
assert.strictEqual(analysis.totalPrompts, 3, 'Should count 3 prompts');
assert.strictEqual(analysis.findingsPerPrompt, '1.00', 'Should average findings correctly');
assert.strictEqual(analysis.improvementsFired.multiFactorTrigger, 1, 'Should track improvements');

const report = generateAnalysisReport(analysis);
assert(report.includes('Real-World Prompt Validation Report'), 'Report should have title');
assert(report.includes('Average Score'), 'Report should have score');

console.log('✓ analysis.test.cjs passed');
