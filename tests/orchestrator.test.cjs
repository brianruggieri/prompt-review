const assert = require('assert');
const { determineActiveReviewers, shouldFireConditional, shouldFireFrontendUX } = require('../orchestrator.cjs');

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

// Test: Frontend/UX multi-factor trigger — single "component" alone should NOT fire
{
  const result = shouldFireFrontendUX(
    { prompt_keywords: ['component', 'modal', 'UI'], file_patterns: ['*.tsx'] },
    'Review the component algorithm',
    { files: [] }
  );
  assert.strictEqual(result, false, 'Should NOT fire on "component" alone without UI context');
}

// Test: Frontend/UX multi-factor trigger — two UI keywords should fire
{
  const result = shouldFireFrontendUX(
    { prompt_keywords: ['component', 'modal', 'UI', 'CSS'], file_patterns: ['*.tsx'] },
    'Refactor the component modal UI',
    { files: [] }
  );
  assert.strictEqual(result, true, 'Should fire on multiple UI keywords');
}

// Test: Frontend/UX multi-factor trigger — one UI keyword + UI file should fire
{
  const result = shouldFireFrontendUX(
    { prompt_keywords: ['component', 'UI'], file_patterns: ['*.tsx', '*.css'] },
    'Update the component',
    { files: ['src/App.tsx', 'src/styles.css'] }
  );
  assert.strictEqual(result, true, 'Should fire on 1 UI keyword + UI files present');
}

// Test: Frontend/UX multi-factor trigger — UI files without backend keywords should fire
{
  const result = shouldFireFrontendUX(
    { prompt_keywords: ['component'], file_patterns: ['*.tsx'] },
    'Update button styling in new view',
    { files: ['src/Button.tsx'] }
  );
  assert.strictEqual(result, true, 'Should fire on UI files without backend context');
}

// Test: Frontend/UX multi-factor trigger — backend context should prevent fire
{
  const result = shouldFireFrontendUX(
    { prompt_keywords: ['component'], file_patterns: ['*.tsx'] },
    'Optimize the component query performance on database',
    { files: ['src/services.ts'] }
  );
  assert.strictEqual(result, false, 'Should NOT fire when backend keywords present');
}

console.log('orchestrator.test: all tests passed');
