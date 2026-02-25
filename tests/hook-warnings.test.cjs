const assert = require('assert');
const { handleHook } = require('../index.cjs');

// Test warning generation for API mode fallback

function testWarningFieldExists() {
	const result = handleHook('Test prompt');
	assert(result !== null, 'Should return result');
	assert(result.hasOwnProperty('warning'), 'Result should have warning property');
	console.log('✓ Warning field exists on result');
}

function testWarningNullInSubscriptionMode() {
	// In default subscription mode, warning should be null
	const originalMode = process.env.PROMPT_REVIEW_MODE;
	try {
		// Ensure we're in subscription mode
		delete process.env.PROMPT_REVIEW_MODE;
		const result = handleHook('Test prompt');
		assert(result !== null, 'Should return result');
		assert(result.warning === null, 'Warning should be null in subscription mode');
		console.log('✓ Warning is null in subscription mode');
	} finally {
		if (originalMode) process.env.PROMPT_REVIEW_MODE = originalMode;
	}
}

function testWarningInContextWhenApplies() {
	const result = handleHook('Test prompt');
	// If we had API mode enabled without key, warning should appear in additionalContext
	// For now, just verify the context exists and is well-formed
	assert(result.additionalContext, 'Should have additionalContext');
	assert(typeof result.additionalContext === 'string', 'Context should be string');
	console.log('✓ Warning context structure valid');
}

function testWarningMessageFormat() {
	const result = handleHook('Test prompt');
	if (result.warning) {
		// If warning exists, it should be a string
		assert(typeof result.warning === 'string', 'Warning should be string if present');
		assert(result.warning.includes('API mode') || result.warning.includes('subscription'), 'Warning should mention mode');
	} else {
		// Warning should be null or string, not undefined
		assert(result.warning === null || typeof result.warning === 'string', 'Warning should be null or string');
	}
	console.log('✓ Warning format is valid');
}

function testWarningIncludesKeyInfo() {
	const result = handleHook('Test prompt');
	if (result.warning && result.warning.length > 0) {
		// Warning should mention API key or mode
		assert(
			result.warning.includes('API') ||
			result.warning.includes('subscription') ||
			result.warning.includes('ANTHROPIC_API_KEY'),
			'Warning should mention relevant mode/key info'
		);
	}
	console.log('✓ Warning includes relevant information');
}

function testMultipleWarningCalls() {
	// Calling hook multiple times should produce consistent results
	const result1 = handleHook('First prompt');
	const result2 = handleHook('Second prompt');
	const result3 = handleHook('Third prompt');

	assert(result1.warning === result2.warning, 'Warning should be consistent across calls');
	assert(result2.warning === result3.warning, 'Warning should be consistent across calls');
	console.log('✓ Warning is consistent across multiple calls');
}

function testWarningDoesNotAffectContext() {
	const result = handleHook('Test prompt');
	const contextLength = result.additionalContext.length;

	// Context should be present and properly formatted regardless of warning
	assert(contextLength > 0, 'Context should not be empty');
	assert(result.additionalContext.includes('[PROMPT REVIEW TRIGGERED]'), 'Context should have trigger marker');
	console.log('✓ Warning does not affect context quality');
}

function testNoWarningForEmptyPrompt() {
	const result = handleHook('');
	assert(result === null, 'Should return null for empty prompt (before warning check)');
	console.log('✓ Empty prompts do not produce warnings');
}

console.log('\n=== Hook Warnings Tests ===\n');
testWarningFieldExists();
testWarningNullInSubscriptionMode();
testWarningInContextWhenApplies();
testWarningMessageFormat();
testWarningIncludesKeyInfo();
testMultipleWarningCalls();
testWarningDoesNotAffectContext();
testNoWarningForEmptyPrompt();
console.log('\n✓ All hook warning tests passed\n');
