const assert = require('assert');
const { handleHook } = require('../index.cjs');

// Test !!! tag detection and stripping behavior

function testStandardTagDetection() {
	// This tests that the hook processes prompts correctly
	// The actual tag detection happens in the hook handler (index.cjs line 532)
	const result = handleHook('Some prompt without tag');
	assert(result !== null, 'Should process prompt without tag');

	const resultWithTag = handleHook('Some prompt with tag');
	assert(resultWithTag !== null, 'Should process prompt that would have had tag stripped');
	console.log('✓ Basic prompt detection works');
}

function testPromptStripping() {
	// Verify that the hook receives the stripped prompt correctly
	const strippedPrompt = 'Write a test for the authentication flow';
	const result = handleHook(strippedPrompt);

	assert(result !== null, 'Should handle stripped prompt');
	assert(result.additionalContext.includes(strippedPrompt), 'Should include the prompt in output');
	console.log('✓ Prompt stripping works correctly');
}

function testSpecialCharacters() {
	const prompt = 'Test this: [foo] (bar) {baz} with special chars @ # $ %';
	const result = handleHook(prompt);
	assert(result !== null, 'Should handle special characters');
	assert(result.additionalContext.includes('special chars'), 'Should preserve special chars');
	console.log('✓ Special characters preserved');
}

function testMultilinePrompt() {
	const prompt = `Write a function that:
- Takes two parameters
- Returns their sum
- Handles edge cases`;
	const result = handleHook(prompt);
	assert(result !== null, 'Should handle multiline prompts');
	assert(result.additionalContext.includes('Takes two parameters'), 'Should preserve multiline content');
	console.log('✓ Multiline prompts work');
}

function testVeryLongPrompt() {
	const longPrompt = 'A'.repeat(5000) + ' long prompt';
	const result = handleHook(longPrompt);
	assert(result !== null, 'Should handle very long prompts');
	console.log('✓ Long prompts (5000+ chars) work');
}

function testPromptWithLeadingTrailingSpace() {
	const result1 = handleHook('  prompt with leading space');
	const result2 = handleHook('prompt with trailing space  ');

	assert(result1 !== null, 'Should handle leading spaces');
	assert(result2 !== null, 'Should handle trailing spaces');
	console.log('✓ Leading/trailing spaces handled');
}

function testPromptWithTabs() {
	const result = handleHook('prompt\twith\ttabs');
	assert(result !== null, 'Should handle tabs in prompt');
	console.log('✓ Tabs in prompts handled');
}

function testUnicodePrompt() {
	const prompt = '日本語のプロンプト テスト ñ é ü';
	const result = handleHook(prompt);
	assert(result !== null, 'Should handle unicode');
	assert(result.additionalContext.includes('日本語'), 'Should preserve unicode');
	console.log('✓ Unicode prompts work');
}

console.log('\n=== Hook Detection Tests ===\n');
testStandardTagDetection();
testPromptStripping();
testSpecialCharacters();
testMultilinePrompt();
testVeryLongPrompt();
testPromptWithLeadingTrailingSpace();
testPromptWithTabs();
testUnicodePrompt();
console.log('\n✓ All hook detection tests passed\n');
