const assert = require('assert');
const { renderReviewBlock } = require('../renderer.cjs');

// Test: renders all sections
{
  const block = renderReviewBlock({
    reviewersActive: ['domain_sme', 'security', 'clarity', 'testing'],
    findings: [
      { reviewer_role: 'security', op: 'AddGuardrail', value: 'No secrets', severity: 'blocker' },
      { reviewer_role: 'clarity', op: 'ReplaceVague', original: 'optimize', value: 'reduce load time to <2s', severity: 'minor' },
    ],
    risks: ['Security: missing instruction hierarchy'],
    refinedPrompt: 'The refined prompt text here.',
    mode: 'subscription',
    cost: { inputTokens: 8000, outputTokens: 2000, usd: 0.00 },
    durationMs: 3200,
  });
  assert.ok(block.includes('Prompt Review'), 'Should have header');
  assert.ok(block.includes('Security'), 'Should list security reviewer');
  assert.ok(block.includes('No secrets'), 'Should include finding value');
  assert.ok(block.includes('The refined prompt text here'), 'Should include refined prompt');
  assert.ok(block.includes('Proceed with the refined prompt'), 'Should include approval question');
}

// Test: no changes case
{
  const block = renderReviewBlock({
    reviewersActive: ['domain_sme', 'security'],
    findings: [],
    risks: [],
    refinedPrompt: 'Same as original',
    mode: 'subscription',
    cost: { inputTokens: 4000, outputTokens: 800, usd: 0.00 },
    durationMs: 2100,
    noChanges: true,
  });
  assert.ok(block.includes('No changes'), 'Should indicate no changes');
}

// Test: score line present when scoring.display is true
{
  const block = renderReviewBlock({
    reviewersActive: ['domain_sme', 'security', 'clarity', 'testing'],
    findings: [
      { reviewer_role: 'security', op: 'AddGuardrail', value: 'No secrets', severity: 'blocker', issue: 'Prompt risks secret exposure' },
    ],
    risks: [],
    refinedPrompt: 'The refined prompt.',
    mode: 'subscription',
    cost: { inputTokens: 4000, outputTokens: 1000, usd: 0.00 },
    durationMs: 2000,
    scoring: {
      display: true,
      composite: 6.7,
      scores: { security: 8.5, testing: 5.0, domain_sme: 7.0, clarity: 6.5 },
    },
  });
  assert.ok(block.includes('Score: 6.7 / 10'), `Should include composite score line, got:\n${block}`);
  assert.ok(block.includes('Security 8.5'), 'Should include security subscore');
  assert.ok(block.includes('Testing 5.0'), 'Should include testing subscore');
}

// Test: score line absent when scoring.display is false
{
  const block = renderReviewBlock({
    reviewersActive: ['domain_sme', 'security'],
    findings: [],
    risks: [],
    refinedPrompt: 'Same prompt.',
    mode: 'subscription',
    cost: { inputTokens: 2000, outputTokens: 500, usd: 0.00 },
    durationMs: 1500,
    noChanges: true,
    scoring: {
      display: false,
      composite: 8.0,
      scores: { security: 9.0, domain_sme: 7.0 },
    },
  });
  assert.ok(!block.includes('Score:'), 'Score line should be absent when display=false');
}

// Test: score line absent when no scoring data
{
  const block = renderReviewBlock({
    reviewersActive: ['domain_sme', 'security'],
    findings: [],
    risks: [],
    refinedPrompt: 'Same prompt.',
    mode: 'subscription',
    cost: { inputTokens: 2000, outputTokens: 500, usd: 0.00 },
    durationMs: 1500,
    noChanges: true,
  });
  assert.ok(!block.includes('Score:'), 'Score line should be absent when no scoring data');
}

// Test: rationale (Why) lines present on findings
{
  const block = renderReviewBlock({
    reviewersActive: ['security', 'clarity'],
    findings: [
      { reviewer_role: 'security', op: 'AddGuardrail', value: 'No secrets', severity: 'blocker', issue: 'Prompt risks exposing API keys' },
      { reviewer_role: 'clarity', op: 'ReplaceVague', original: 'optimize', value: 'reduce load time', severity: 'minor', issue: 'Vague verb without criteria' },
    ],
    risks: [],
    refinedPrompt: 'Refined.',
    mode: 'subscription',
    cost: { inputTokens: 4000, outputTokens: 1000, usd: 0.00 },
    durationMs: 2500,
  });
  assert.ok(block.includes('Why: Prompt risks exposing API keys'), 'Should include security rationale');
  assert.ok(block.includes('Why: Vague verb without criteria'), 'Should include clarity rationale');
}

console.log('renderer.test: all tests passed');
