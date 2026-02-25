const assert = require('assert');
const { determineActiveReviewers, shouldFireConditional } = require('../orchestrator.cjs');

// Test: all always-on reviewers are included
{
  const config = {
    reviewers: {
      domain_sme: { enabled: true, conditional: false },
      security: { enabled: true, conditional: false },
      clarity: { enabled: true, conditional: false },
      testing: { enabled: true, conditional: false },
      frontend_ux: { enabled: true, conditional: true, triggers: { prompt_keywords: ['UI'] } },
      documentation: { enabled: true, conditional: true, triggers: { prompt_keywords: ['feature'] } },
    }
  };
  const active = determineActiveReviewers(config, 'fix the bug', { stack: [] });
  assert.strictEqual(active.length, 4, 'Should have 4 always-on reviewers');
}

// Test: conditional frontend_ux fires on "UI" keyword
{
  const result = shouldFireConditional(
    { prompt_keywords: ['UI', 'component'], file_patterns: [], stack_markers: [] },
    'add a new UI component',
    { stack: [] }
  );
  assert.strictEqual(result, true, 'Should fire on UI keyword');
}

// Test: conditional documentation fires on "feature" keyword
{
  const result = shouldFireConditional(
    { prompt_keywords: ['feature', 'add'], skip_keywords: ['bugfix'] },
    'add a new feature',
    { stack: [] }
  );
  assert.strictEqual(result, true, 'Should fire on feature keyword');
}

// Test: conditional documentation skips on "bugfix" keyword
{
  const result = shouldFireConditional(
    { prompt_keywords: ['feature'], skip_keywords: ['bugfix'] },
    'bugfix for the parser',
    { stack: [] }
  );
  assert.strictEqual(result, false, 'Should skip on bugfix keyword');
}

// Test: disabled reviewer is excluded
{
  const config = {
    reviewers: {
      domain_sme: { enabled: false, conditional: false },
      security: { enabled: true, conditional: false },
    }
  };
  const active = determineActiveReviewers(config, 'test', { stack: [] });
  assert.strictEqual(active.length, 1, 'Disabled reviewer should be excluded');
  assert.strictEqual(active[0], 'security');
}

console.log('orchestrator.test: all tests passed');
