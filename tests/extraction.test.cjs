const assert = require('assert');
const { extractRealPrompts } = require('../scripts/extract-real-prompts.cjs');

// This test reads real local Claude session files. Skip in CI or on machines
// without Claude Code session logs unless the env flag is explicitly set.
if (!process.env.RUN_REAL_PROMPTS_TESTS) {
	console.log('extraction.test.cjs: skipped (set RUN_REAL_PROMPTS_TESTS=1 to run)');
	process.exit(0);
}

const result = extractRealPrompts({
	claudeSessionsDir: require('os').homedir() + '/.claude/projects',
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
