const assert = require('assert');
const path = require('path');

/**
 * Reviewer Prompt Unit Tests
 *
 * Tests all 6 reviewer modules to verify:
 * - buildPrompt() returns {system, user} with correct content
 * - System prompts contain role-specific instructions and schema
 * - User prompts include the original prompt and context
 * - Module exports match expected interface (role, buildPrompt, conditional, triggers)
 */

const REVIEWER_MODULES = {
	security: require('../reviewers/security.cjs'),
	clarity: require('../reviewers/clarity.cjs'),
	testing: require('../reviewers/testing.cjs'),
	domain_sme: require('../reviewers/domain-sme.cjs'),
	frontend_ux: require('../reviewers/frontend-ux.cjs'),
	documentation: require('../reviewers/documentation.cjs'),
};

const MOCK_CONTEXT = {
	projectName: 'test-project',
	stack: ['node', 'express'],
	testFramework: 'jest',
	buildTool: 'npm',
	conventions: [
		'Use TypeScript strict mode',
		'Never commit .env files',
		'Tests required for all new features',
		'Use CSS custom properties for theming',
		'Update README for new features',
	],
	structure: 'src/\n  index.ts\n  auth/\ntests/\npackage.json',
	claudeMd: '# Test Project\nSome project docs here.',
};

const SAMPLE_PROMPT = 'Add a login form component with email and password fields that calls the /auth/login endpoint.';

// ---------- Tests ----------

// Test 1: All reviewer modules export required interface
{
	for (const [name, mod] of Object.entries(REVIEWER_MODULES)) {
		assert.ok(typeof mod.role === 'string', `${name} should export a string role`);
		assert.ok(typeof mod.buildPrompt === 'function', `${name} should export buildPrompt function`);
		assert.ok(typeof mod.conditional === 'boolean', `${name} should export boolean conditional`);
		assert.ok(typeof mod.triggers === 'object', `${name} should export triggers object`);
	}
}

// Test 2: All reviewer roles match their file names
{
	assert.strictEqual(REVIEWER_MODULES.security.role, 'security');
	assert.strictEqual(REVIEWER_MODULES.clarity.role, 'clarity');
	assert.strictEqual(REVIEWER_MODULES.testing.role, 'testing');
	assert.strictEqual(REVIEWER_MODULES.domain_sme.role, 'domain_sme');
	assert.strictEqual(REVIEWER_MODULES.frontend_ux.role, 'frontend_ux');
	assert.strictEqual(REVIEWER_MODULES.documentation.role, 'documentation');
}

// Test 3: Conditional flags are correct
{
	assert.strictEqual(REVIEWER_MODULES.security.conditional, false, 'security should be always-on');
	assert.strictEqual(REVIEWER_MODULES.clarity.conditional, false, 'clarity should be always-on');
	assert.strictEqual(REVIEWER_MODULES.testing.conditional, false, 'testing should be always-on');
	assert.strictEqual(REVIEWER_MODULES.domain_sme.conditional, false, 'domain_sme should be always-on');
	assert.strictEqual(REVIEWER_MODULES.frontend_ux.conditional, true, 'frontend_ux should be conditional');
	assert.strictEqual(REVIEWER_MODULES.documentation.conditional, true, 'documentation should be conditional');
}

// Test 4: buildPrompt returns {system, user} for all reviewers
{
	for (const [name, mod] of Object.entries(REVIEWER_MODULES)) {
		const result = mod.buildPrompt(SAMPLE_PROMPT, MOCK_CONTEXT);
		assert.ok(result.system, `${name}.buildPrompt should return system`);
		assert.ok(result.user, `${name}.buildPrompt should return user`);
		assert.ok(typeof result.system === 'string', `${name} system should be a string`);
		assert.ok(typeof result.user === 'string', `${name} user should be a string`);
	}
}

// Test 5: System prompts contain role identifier and JSON schema
{
	for (const [name, mod] of Object.entries(REVIEWER_MODULES)) {
		const { system } = mod.buildPrompt(SAMPLE_PROMPT, MOCK_CONTEXT);

		// System prompt should mention the reviewer role
		assert.ok(
			system.toLowerCase().includes('reviewer'),
			`${name} system prompt should mention 'reviewer'`
		);

		// System prompt should contain JSON schema example
		assert.ok(
			system.includes('reviewer_role'),
			`${name} system prompt should include JSON schema with reviewer_role`
		);
		assert.ok(
			system.includes('findings'),
			`${name} system prompt should include JSON schema with findings`
		);
		assert.ok(
			system.includes('severity'),
			`${name} system prompt should include severity in schema`
		);
		assert.ok(
			system.includes('score'),
			`${name} system prompt should include score field`
		);
	}
}

// Test 6: User prompts include the original prompt text
{
	for (const [name, mod] of Object.entries(REVIEWER_MODULES)) {
		const { user } = mod.buildPrompt(SAMPLE_PROMPT, MOCK_CONTEXT);
		assert.ok(
			user.includes(SAMPLE_PROMPT),
			`${name} user prompt should include the original prompt`
		);
	}
}

// Test 7: User prompts include project context
{
	for (const [name, mod] of Object.entries(REVIEWER_MODULES)) {
		const { user } = mod.buildPrompt(SAMPLE_PROMPT, MOCK_CONTEXT);
		assert.ok(
			user.includes('test-project'),
			`${name} user prompt should include project name`
		);
	}
}

// Test 8: Security reviewer system prompt covers injection, secrets, unsafe tool use
{
	const { system } = REVIEWER_MODULES.security.buildPrompt(SAMPLE_PROMPT, MOCK_CONTEXT);
	assert.ok(system.includes('njection'), 'Security system prompt should mention injection');
	assert.ok(system.includes('ecret') || system.includes('eakage'), 'Security system prompt should mention secrets/leakage');
	assert.ok(system.includes('AddGuardrail'), 'Security system prompt should mention AddGuardrail op');
}

// Test 9: Security reviewer includes security-relevant conventions
{
	const { user } = REVIEWER_MODULES.security.buildPrompt(SAMPLE_PROMPT, MOCK_CONTEXT);
	// "Never commit .env files" is a security convention that should be included
	assert.ok(
		user.includes('.env') || user.includes('commit'),
		'Security user prompt should include security-relevant conventions'
	);
}

// Test 10: Clarity reviewer system prompt covers vague verbs, missing output format
{
	const { system } = REVIEWER_MODULES.clarity.buildPrompt(SAMPLE_PROMPT, MOCK_CONTEXT);
	assert.ok(system.includes('ague'), 'Clarity system prompt should mention vague');
	assert.ok(system.includes('ReplaceVague'), 'Clarity system prompt should mention ReplaceVague op');
	assert.ok(system.includes('RefactorStructure'), 'Clarity system prompt should mention RefactorStructure op');
}

// Test 11: Testing reviewer system prompt covers test requirements
{
	const { system } = REVIEWER_MODULES.testing.buildPrompt(SAMPLE_PROMPT, MOCK_CONTEXT);
	assert.ok(system.includes('est requirement'), 'Testing system prompt should mention test requirements');
	assert.ok(system.includes('cceptance criteria'), 'Testing system prompt should mention acceptance criteria');
	assert.ok(system.includes('AddAcceptanceCriteria'), 'Testing system prompt should mention AddAcceptanceCriteria op');
}

// Test 12: Testing reviewer includes detected test framework
{
	const { user } = REVIEWER_MODULES.testing.buildPrompt(SAMPLE_PROMPT, MOCK_CONTEXT);
	assert.ok(
		user.includes('jest'),
		'Testing user prompt should include detected test framework'
	);
}

// Test 13: Domain SME reviewer includes CLAUDE.md content
{
	const { user } = REVIEWER_MODULES.domain_sme.buildPrompt(SAMPLE_PROMPT, MOCK_CONTEXT);
	assert.ok(
		user.includes('Test Project') || user.includes('CLAUDE.md'),
		'Domain SME user prompt should include CLAUDE.md content'
	);
}

// Test 14: Frontend UX reviewer checks accessibility
{
	const { system } = REVIEWER_MODULES.frontend_ux.buildPrompt(SAMPLE_PROMPT, MOCK_CONTEXT);
	assert.ok(system.includes('ccessibility') || system.includes('a11y'), 'Frontend UX should mention accessibility');
	assert.ok(system.includes('keyboard'), 'Frontend UX should mention keyboard navigation');
	assert.ok(system.includes('theme') || system.includes('Theme'), 'Frontend UX should mention theme compatibility');
}

// Test 15: Frontend UX has proper trigger keywords
{
	const triggers = REVIEWER_MODULES.frontend_ux.triggers;
	assert.ok(Array.isArray(triggers.prompt_keywords), 'frontend_ux should have prompt_keywords array');
	assert.ok(triggers.prompt_keywords.includes('component'), 'frontend_ux triggers should include component');
	assert.ok(triggers.prompt_keywords.includes('modal'), 'frontend_ux triggers should include modal');
	assert.ok(triggers.prompt_keywords.includes('form'), 'frontend_ux triggers should include form');
}

// Test 16: Documentation reviewer checks for README/docs
{
	const { system } = REVIEWER_MODULES.documentation.buildPrompt(SAMPLE_PROMPT, MOCK_CONTEXT);
	assert.ok(system.includes('README') || system.includes('docs'), 'Documentation should mention README/docs');
	assert.ok(system.includes('CHANGELOG'), 'Documentation should mention CHANGELOG');
}

// Test 17: Documentation has skip_keywords in triggers
{
	const triggers = REVIEWER_MODULES.documentation.triggers;
	assert.ok(Array.isArray(triggers.skip_keywords), 'documentation should have skip_keywords');
	assert.ok(triggers.skip_keywords.includes('bugfix'), 'documentation skip_keywords should include bugfix');
	assert.ok(triggers.skip_keywords.includes('typo'), 'documentation skip_keywords should include typo');
}

// Test 18: buildPrompt handles minimal context gracefully
{
	const minimalContext = {};
	for (const [name, mod] of Object.entries(REVIEWER_MODULES)) {
		const result = mod.buildPrompt('Simple prompt', minimalContext);
		assert.ok(result.system, `${name} should handle minimal context (system)`);
		assert.ok(result.user, `${name} should handle minimal context (user)`);
		assert.ok(result.user.includes('Simple prompt'), `${name} should include prompt even with minimal context`);
	}
}

// Test 19: buildPrompt handles empty prompt
{
	for (const [name, mod] of Object.entries(REVIEWER_MODULES)) {
		const result = mod.buildPrompt('', MOCK_CONTEXT);
		assert.ok(result.system, `${name} should handle empty prompt (system)`);
		assert.ok(result.user, `${name} should handle empty prompt (user)`);
	}
}

// Test 20: System prompts include score rubric (0-10 scale)
{
	for (const [name, mod] of Object.entries(REVIEWER_MODULES)) {
		const { system } = mod.buildPrompt(SAMPLE_PROMPT, MOCK_CONTEXT);
		assert.ok(
			system.includes('10:') || system.includes('10 —') || system.includes('10—'),
			`${name} system prompt should include score rubric with 10`
		);
		assert.ok(
			system.includes('0-3') || system.includes('0–3'),
			`${name} system prompt should include score rubric low range`
		);
	}
}

console.log('reviewer-prompts.test: all tests passed');
