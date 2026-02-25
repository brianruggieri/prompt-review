const assert = require('assert');
const { handleHook } = require('../index.cjs');

// Test hook behavior in different modes

function testHookWithValidPrompt() {
	const result = handleHook('Test prompt for review');
	assert(result !== null, 'Should return result for valid non-empty prompt');
	assert(result.additionalContext, 'Should have additionalContext');
	assert(result.additionalContext.includes('[PROMPT REVIEW TRIGGERED]'), 'Should include trigger marker');
	console.log('✓ Hook returns context for valid prompt');
}

function testHookWithEmptyPrompt() {
	const result1 = handleHook('');
	const result2 = handleHook('   ');
	const result3 = handleHook(null);
	const result4 = handleHook(undefined);

	assert(result1 === null, 'Should return null for empty string');
	assert(result2 === null, 'Should return null for whitespace-only string');
	assert(result3 === null, 'Should return null for null');
	assert(result4 === null, 'Should return null for undefined');
	console.log('✓ Hook rejects empty/whitespace-only prompts');
}

function testHookWarningFieldPresent() {
	const result = handleHook('Test prompt');
	assert(result.hasOwnProperty('warning'), 'Result should have warning field');
	// In default subscription mode, warning should be null
	assert(result.warning === null, 'Warning should be null in subscription mode (default)');
	console.log('✓ Hook includes warning field (null when not applicable)');
}

function testHookActivatesReviewers() {
	const result = handleHook('Write a function that validates emails !!!');
	assert(result !== null, 'Should activate reviewers for domain-specific prompt');
	assert(result.additionalContext.includes('- security'), 'Should include security reviewer');
	assert(result.additionalContext.includes('- testing'), 'Should include testing reviewer');
	assert(result.additionalContext.includes('- clarity'), 'Should include clarity reviewer');
	console.log('✓ Hook activates appropriate reviewers');
}

function testHookWithKillSwitch() {
	const originalEnv = process.env.PROMPT_REVIEW_ENABLED;
	try {
		process.env.PROMPT_REVIEW_ENABLED = 'false';
		const result = handleHook('Test prompt');
		assert(result === null, 'Should return null when killed switch is enabled');
		console.log('✓ Kill switch (PROMPT_REVIEW_ENABLED=false) works');
	} finally {
		process.env.PROMPT_REVIEW_ENABLED = originalEnv;
	}
}

function testHookContextStructure() {
	const result = handleHook('Fix the bug in the parser');
	assert(result.additionalContext.includes('## Original Prompt'), 'Should include original prompt section');
	assert(result.additionalContext.includes('## Active Reviewers'), 'Should include active reviewers section');
	assert(result.additionalContext.includes('## Instructions'), 'Should include instructions section');
	console.log('✓ Hook context has expected sections');
}

console.log('\n=== Hook Mode Tests ===\n');
testHookWithValidPrompt();
testHookWithEmptyPrompt();
testHookWarningFieldPresent();
testHookActivatesReviewers();
testHookWithKillSwitch();
testHookContextStructure();
console.log('\n✓ All hook mode tests passed\n');
