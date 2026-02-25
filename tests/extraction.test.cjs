const assert = require('assert');
const { extractRealPrompts } = require('../scripts/extract-real-prompts.cjs');

const result = extractRealPrompts({
	claudeSessionsDir: process.env.HOME + '/.claude/projects',
	minLength: 10,
	maxLength: 5000,
	limit: 100
});

assert(Array.isArray(result), 'Should return array');
assert(result.length > 0, 'Should extract at least 1 prompt');
assert(result[0].hash, 'Each prompt should have hash');
assert(result[0].timestamp, 'Each prompt should have timestamp');
assert(!result[0].text, 'Original text should NOT be stored');

console.log(`✓ extraction.test.cjs: Extracted ${result.length} prompts, no text stored`);
