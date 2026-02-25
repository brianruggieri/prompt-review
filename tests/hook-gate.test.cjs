const assert = require('assert');
const { runClarityGateCheck, determineGateAction } = require('../index.cjs');

// Test clarity gate logic

function testGateDisabledReturnsProceed() {
	const config = {
		clarity_gate: {
			enabled: false,
		}
	};
	const action = determineGateAction('blocker', config);
	assert.strictEqual(action, 'proceed', 'Should proceed when gate is disabled');
	console.log('✓ Gate disabled returns proceed');
}

function testGateBlocksOnBlockerSeverity() {
	const config = {
		clarity_gate: {
			enabled: true,
			reject_on: ['blocker'],
			warn_on: ['major'],
			strict_mode: false,
		}
	};
	const action = determineGateAction('blocker', config);
	assert.strictEqual(action, 'block', 'Should block on blocker severity');
	console.log('✓ Gate blocks on blocker severity');
}

function testGateWarnsOnMajorSeverity() {
	const config = {
		clarity_gate: {
			enabled: true,
			reject_on: ['blocker'],
			warn_on: ['major'],
			strict_mode: false,
		}
	};
	const action = determineGateAction('major', config);
	assert.strictEqual(action, 'warn', 'Should warn on major severity in non-strict mode');
	console.log('✓ Gate warns on major severity (non-strict)');
}

function testGateBlocksOnMajorInStrictMode() {
	const config = {
		clarity_gate: {
			enabled: true,
			reject_on: ['blocker'],
			warn_on: ['major'],
			strict_mode: true,
		}
	};
	const action = determineGateAction('major', config);
	assert.strictEqual(action, 'block', 'Should block on major severity in strict mode');
	console.log('✓ Gate blocks on major severity (strict mode)');
}

function testGateProceedsOnMinorSeverity() {
	const config = {
		clarity_gate: {
			enabled: true,
			reject_on: ['blocker'],
			warn_on: ['major'],
			strict_mode: false,
		}
	};
	const action1 = determineGateAction('minor', config);
	const action2 = determineGateAction('nit', config);

	assert.strictEqual(action1, 'proceed', 'Should proceed on minor severity');
	assert.strictEqual(action2, 'proceed', 'Should proceed on nit severity');
	console.log('✓ Gate proceeds on minor/nit severity');
}

function testGateWithCustomRejectList() {
	const config = {
		clarity_gate: {
			enabled: true,
			reject_on: ['blocker', 'major'],
			warn_on: ['minor'],
			strict_mode: false,
		}
	};
	const action1 = determineGateAction('blocker', config);
	const action2 = determineGateAction('major', config);
	const action3 = determineGateAction('minor', config);
	const action4 = determineGateAction('nit', config);

	assert.strictEqual(action1, 'block', 'Should block on blocker');
	assert.strictEqual(action2, 'block', 'Should block on major');
	assert.strictEqual(action3, 'warn', 'Should warn on minor');
	assert.strictEqual(action4, 'proceed', 'Should proceed on nit');
	console.log('✓ Gate respects custom reject/warn lists');
}

function testGateNullConfigReturnsNull() {
	const config = {};
	const action = determineGateAction('blocker', config);
	assert.strictEqual(action, 'proceed', 'Should proceed when clarity_gate config missing');
	console.log('✓ Gate handles missing config gracefully');
}

function testGateConsistentAcrossCalls() {
	const config = {
		clarity_gate: {
			enabled: true,
			reject_on: ['blocker'],
			warn_on: ['major'],
			strict_mode: false,
		}
	};
	const action1 = determineGateAction('blocker', config);
	const action2 = determineGateAction('blocker', config);
	const action3 = determineGateAction('blocker', config);

	assert.strictEqual(action1, action2, 'Actions should be consistent');
	assert.strictEqual(action2, action3, 'Actions should be consistent');
	console.log('✓ Gate is consistent across multiple calls');
}

function testGateActionEnumValues() {
	// Valid actions are: 'proceed', 'warn', 'block'
	const config = {
		clarity_gate: {
			enabled: true,
			reject_on: ['blocker'],
			warn_on: ['major'],
			strict_mode: false,
		}
	};

	const validActions = ['proceed', 'warn', 'block'];
	const severities = ['blocker', 'major', 'minor', 'nit'];

	for (const severity of severities) {
		const action = determineGateAction(severity, config);
		assert(validActions.includes(action), `Action ${action} should be valid for severity ${severity}`);
	}
	console.log('✓ Gate only returns valid action enums');
}

function testRunClarityGateCheckStructure() {
	const context = {
		projectName: 'test-project',
		stack: ['node', 'js'],
		testFramework: 'jest',
	};

	const config = {
		clarity_gate: { enabled: true }
	};

	const prompt = 'Write a function that does something';
	const gateCheck = runClarityGateCheck(prompt, context, config);

	assert(gateCheck !== null, 'Should return gate check structure');
	assert.strictEqual(gateCheck.reviewer_role, 'clarity', 'Should be clarity reviewer');
	assert(gateCheck.system, 'Should have system prompt');
	assert(gateCheck.user, 'Should have user prompt');
	assert.strictEqual(gateCheck._is_gate_check, true, 'Should be marked as gate check');
	console.log('✓ Gate check returns proper structure');
}

function testGateCheckIncludesPrompt() {
	const context = {
		projectName: 'test-project',
		stack: ['node'],
	};

	const config = {
		clarity_gate: { enabled: true }
	};

	const prompt = 'My specific test prompt for clarity gate';
	const gateCheck = runClarityGateCheck(prompt, context, config);

	assert(gateCheck.user.includes(prompt), 'Gate check should include original prompt');
	console.log('✓ Gate check includes original prompt');
}

console.log('\n=== Clarity Gate Tests ===\n');
testGateDisabledReturnsProceed();
testGateBlocksOnBlockerSeverity();
testGateWarnsOnMajorSeverity();
testGateBlocksOnMajorInStrictMode();
testGateProceedsOnMinorSeverity();
testGateWithCustomRejectList();
testGateNullConfigReturnsNull();
testGateConsistentAcrossCalls();
testGateActionEnumValues();
testRunClarityGateCheckStructure();
testGateCheckIncludesPrompt();
console.log('\n✓ All clarity gate tests passed\n');
