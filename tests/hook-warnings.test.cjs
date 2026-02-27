const assert = require('assert');
const { handleHook } = require('../index.cjs');

// Test hook behavior in subscription-only mode (no API fallback)

function testSubscriptionModeOnly() {
	const result = handleHook('Test prompt');
	assert(result !== null, 'Should return result');
	assert(result.additionalContext, 'Should have additionalContext');
	// No warning field since we're subscription-only now
	assert(!result.hasOwnProperty('warning'), 'No warning field in subscription-only mode');
	console.log('✓ Subscription mode (no API) is active');
}

function testContextStructureValid() {
	const result = handleHook('Test prompt');
	assert(result !== null, 'Should return result');
	assert(result.additionalContext, 'Should have additionalContext');
	assert(typeof result.additionalContext === 'string', 'Context should be string');
	assert(result.additionalContext.includes('[PROMPT REVIEW TRIGGERED]'), 'Should have trigger marker');
	console.log('✓ Context structure is valid in subscription mode');
}

function testMultipleCallsConsistent() {
	// Calling hook multiple times should produce consistent results
	const result1 = handleHook('First prompt');
	const result2 = handleHook('Second prompt');
	const result3 = handleHook('Third prompt');

	// All should have valid context (no warnings to compare)
	assert(result1.additionalContext && result2.additionalContext && result3.additionalContext, 'All should have context');
	console.log('✓ Multiple calls produce consistent results');
}

function testNoWarningField() {
	const result = handleHook('Test prompt');
	const resultKeys = Object.keys(result);
	assert(!resultKeys.includes('warning'), 'No warning field in subscription mode');
	assert(resultKeys.includes('additionalContext'), 'Should have additionalContext');
	console.log('✓ No warning field in subscription-only implementation');
}

function testEmptyPromptHandling() {
	const result = handleHook('');
	assert(result === null, 'Should return null for empty prompt');
	console.log('✓ Empty prompts handled correctly');
}

console.log('\n=== Hook Subscription Mode Tests ===\n');
testSubscriptionModeOnly();
testContextStructureValid();
testMultipleCallsConsistent();
testNoWarningField();
testEmptyPromptHandling();
console.log('\n✓ All subscription mode tests passed\n');
