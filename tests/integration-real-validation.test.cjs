const assert = require('assert');
const { extractRealPrompts } = require('../scripts/extract-real-prompts.cjs');
const { analyzeFindings } = require('../scripts/analyze-findings.cjs');

// Extract up to 10 real prompts from actual Claude Code sessions
const prompts = extractRealPrompts({ limit: 10 });

assert(prompts.length > 0, 'Should extract real prompts from session logs');
assert(prompts[0].hash, 'Prompts should have hashes');
assert(!prompts[0].text, 'Original text should not be stored');

// Mock results for testing analysis
const results = prompts.map(p => ({
	hash: p.hash,
	compositeScore: Math.random() * 10,
	findings: [],
	improvementsActive: {}
}));

const analysis = analyzeFindings(results);
assert.strictEqual(analysis.totalPrompts, prompts.length, 'Analysis should match prompt count');

console.log(`✓ Integration: Extracted ${prompts.length} real prompts, analyzed findings`);
