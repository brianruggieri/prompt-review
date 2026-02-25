const assert = require('assert');
const { buildJudgePrompt } = require('../judge.cjs');

// Test 1: buildJudgePrompt returns valid system + user pair
{
  const debateResult = {
    results: [
      {
        pair: { role_a: 'security', role_b: 'testing', conflict_description: 'Conflict on constraints' },
        role_a_argument: 'We need tight security',
        role_b_argument: 'We need test coverage',
        role_a_rebuttal: 'Security is paramount',
        role_b_rebuttal: 'But testing is critical too',
      }
    ],
    failed_pairs: [],
    total_tokens: 500,
  };

  const result = buildJudgePrompt(debateResult);
  assert.ok(result.system, 'Should have system prompt');
  assert.ok(result.user, 'Should have user prompt');
  assert.ok(typeof result.system === 'string', 'system should be string');
  assert.ok(typeof result.user === 'string', 'user should be string');
  assert.ok(result.system.length > 0, 'system should not be empty');
  assert.ok(result.user.length > 0, 'user should not be empty');
}

// Test 2: buildJudgePrompt includes all debate rounds in user content
{
  const debateResult = {
    results: [
      {
        pair: { role_a: 'security', role_b: 'testing', conflict_description: 'Conflict on constraints' },
        role_a_argument: 'Security argument here',
        role_b_argument: 'Testing argument here',
        role_a_rebuttal: 'Security rebuttal here',
        role_b_rebuttal: 'Testing rebuttal here',
      }
    ],
    failed_pairs: [],
    total_tokens: 500,
  };

  const result = buildJudgePrompt(debateResult);
  assert.ok(result.user.includes('Security argument here'), 'user should include role_a argument');
  assert.ok(result.user.includes('Testing argument here'), 'user should include role_b argument');
  assert.ok(result.user.includes('Security rebuttal here'), 'user should include role_a rebuttal');
  assert.ok(result.user.includes('Testing rebuttal here'), 'user should include role_b rebuttal');
}

// Test 3: buildJudgePrompt handles multiple debate results
{
  const debateResult = {
    results: [
      {
        pair: { role_a: 'security', role_b: 'testing', conflict_description: 'Conflict 1' },
        role_a_argument: 'Arg 1 A',
        role_b_argument: 'Arg 1 B',
        role_a_rebuttal: 'Rebut 1 A',
        role_b_rebuttal: 'Rebut 1 B',
      },
      {
        pair: { role_a: 'domain_sme', role_b: 'clarity', conflict_description: 'Conflict 2' },
        role_a_argument: 'Arg 2 A',
        role_b_argument: 'Arg 2 B',
        role_a_rebuttal: 'Rebut 2 A',
        role_b_rebuttal: 'Rebut 2 B',
      }
    ],
    failed_pairs: [],
    total_tokens: 1000,
  };

  const result = buildJudgePrompt(debateResult);
  // All arguments should be present
  assert.ok(result.user.includes('Arg 1 A'), 'Should include first debate');
  assert.ok(result.user.includes('Arg 2 A'), 'Should include second debate');
}

console.log('judge.test: all tests passed');
