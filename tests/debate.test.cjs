const assert = require('assert');
const { selectDebatePairs, buildDebatePrompt } = require('../debate.cjs');

// Test 1: selectDebatePairs returns [] when no conflicts
{
  const conflicts = [];
  const allOps = [];
  const result = selectDebatePairs(conflicts, allOps);
  assert.strictEqual(Array.isArray(result), true, 'Should return array');
  assert.strictEqual(result.length, 0, 'Should return empty array with no conflicts');
}

// Test 2: selectDebatePairs selects correct role pairs from conflicts
{
  const conflicts = [
    {
      type: 'add_remove_conflict',
      target: 'constraints',
      ops: [
        { reviewer_role: 'security', op: 'AddGuardrail', value: 'No secrets' },
        { reviewer_role: 'testing', op: 'RemoveConstraint', value: 'No secrets' }
      ],
      resolution: 'Higher-priority reviewer wins',
    }
  ];
  const allOps = [
    { reviewer_role: 'security', op: 'AddGuardrail', target: 'constraints', value: 'No secrets' },
    { reviewer_role: 'testing', op: 'RemoveConstraint', target: 'constraints', value: 'No secrets' }
  ];
  const result = selectDebatePairs(conflicts, allOps);
  assert.strictEqual(result.length, 1, 'Should return 1 pair');
  assert.strictEqual(result[0].role_a, 'security', 'Should have security as role_a');
  assert.strictEqual(result[0].role_b, 'testing', 'Should have testing as role_b');
  assert.ok(result[0].conflict_description, 'Should have conflict description');
}

// Test 3: selectDebatePairs caps at max_pairs even with 5+ conflicts
{
  const conflicts = [];
  for (let i = 0; i < 5; i++) {
    conflicts.push({
      type: 'add_remove_conflict',
      target: `target${i}`,
      ops: [
        { reviewer_role: 'security', op: 'AddGuardrail', value: `val${i}` },
        { reviewer_role: 'testing', op: 'RemoveConstraint', value: `val${i}` }
      ],
    });
  }
  const allOps = [];
  for (const conf of conflicts) {
    allOps.push(...conf.ops);
  }
  const result = selectDebatePairs(conflicts, allOps, { max_pairs: 2 });
  assert.strictEqual(result.length, 2, 'Should cap at max_pairs of 2');
}

// Test 4: buildDebatePrompt returns non-empty system + user for both roles
{
  const result = buildDebatePrompt(
    'security',
    'testing',
    'Conflict on environment access constraints',
    'Security wants tight controls',
    'Testing wants flexibility',
    'Write a careful prompt',
    { projectName: 'my-app' }
  );
  assert.ok(result.roleA, 'Should have roleA');
  assert.ok(result.roleB, 'Should have roleB');
  assert.ok(result.roleA.system, 'roleA should have system prompt');
  assert.ok(result.roleA.user, 'roleA should have user prompt');
  assert.ok(result.roleB.system, 'roleB should have system prompt');
  assert.ok(result.roleB.user, 'roleB should have user prompt');
  assert.ok(result.roleA.system.length > 0, 'roleA system should not be empty');
  assert.ok(result.roleA.user.length > 0, 'roleA user should not be empty');
}

// Test 5: buildDebatePrompt includes conflict description in user content
{
  const conflictDesc = 'Conflict on environment access constraints';
  const result = buildDebatePrompt(
    'security',
    'testing',
    conflictDesc,
    'Security wants tight controls',
    'Testing wants flexibility',
    'Write a careful prompt',
    { projectName: 'my-app' }
  );
  assert.ok(result.roleA.user.includes(conflictDesc), 'roleA user should include conflict description');
  assert.ok(result.roleB.user.includes(conflictDesc), 'roleB user should include conflict description');
}

console.log('debate.test: all tests passed');
