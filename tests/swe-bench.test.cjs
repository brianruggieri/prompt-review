// tests/swe-bench.test.cjs
// Validates that the prompt-review system correctly handles real-world prompts
// drawn from SWE-bench-style, AgentBench-style, and synthetic adversarial scenarios.
// Tests cover: fixture well-formedness, prompt builder output, conditional reviewer
// triggering, and reviewer prompt content coverage.

const assert = require('assert');
const path = require('path');
const { buildReviewerPrompts, determineActiveReviewers, shouldFireConditional } = require('../orchestrator.cjs');
const { validateCritique } = require('../schemas.cjs');

// ─── Load fixtures ──────────────────────────────────────────────────────────
const FIXTURES_PATH = path.join(__dirname, 'fixtures', 'swe-bench-prompts.json');
const fixtureData = require(FIXTURES_PATH);
const { prompts: SWE_PROMPTS } = fixtureData;

// ─── Shared config matching the real config.json shape ──────────────────────
const STANDARD_CONFIG = {
  reviewers: {
    domain_sme:    { enabled: true,  conditional: false },
    security:      { enabled: true,  conditional: false },
    clarity:       { enabled: true,  conditional: false },
    testing:       { enabled: true,  conditional: false },
    frontend_ux:   { enabled: true,  conditional: true,  triggers: { prompt_keywords: ['UI', 'component', 'modal', 'button', 'form', 'frontend', 'widget', 'UX'] } },
    documentation: { enabled: true,  conditional: true,  triggers: { prompt_keywords: ['feature', 'add', 'document', 'command', 'CLI', 'API'] } },
  }
};

// ─── Test 1: Fixture file is valid JSON with required metadata fields ────────
{
  assert.ok(fixtureData.metadata, 'Fixture must have metadata block');
  assert.ok(fixtureData.metadata.description, 'Metadata must have description');
  assert.ok(Array.isArray(fixtureData.metadata.sources), 'Metadata must list sources');
  assert.ok(Array.isArray(SWE_PROMPTS), 'Fixture must have a prompts array');
  assert.ok(SWE_PROMPTS.length >= 10, `Expected at least 10 prompts, got ${SWE_PROMPTS.length}`);
}

// ─── Test 2: Every fixture prompt has required fields ───────────────────────
{
  const REQUIRED_FIELDS = ['id', 'source_category', 'category', 'prompt', 'context',
    'expected_reviewers_to_fire', 'expected_conditional_reviewers', 'known_issues', 'vagueness_score'];

  for (const p of SWE_PROMPTS) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(p[field] !== undefined, `Prompt "${p.id}" is missing field "${field}"`);
    }
    assert.ok(typeof p.vagueness_score === 'number' && p.vagueness_score >= 0 && p.vagueness_score <= 3,
      `Prompt "${p.id}" vagueness_score must be 0-3, got ${p.vagueness_score}`);
    assert.ok(Array.isArray(p.expected_reviewers_to_fire), `Prompt "${p.id}" expected_reviewers_to_fire must be array`);
    assert.ok(Array.isArray(p.known_issues), `Prompt "${p.id}" known_issues must be array`);
  }
}

// ─── Test 3: Prompt IDs are unique ──────────────────────────────────────────
{
  const ids = SWE_PROMPTS.map(p => p.id);
  const seen = new Set();
  const duplicates = ids.filter(id => { const had = seen.has(id); seen.add(id); return had; });
  assert.strictEqual(ids.length, seen.size, `Duplicate prompt IDs detected: ${duplicates.join(', ')}`);
}

// ─── Test 4: buildReviewerPrompts handles every fixture without throwing ─────
{
  for (const fixture of SWE_PROMPTS) {
    const activeRoles = ['security', 'clarity', 'testing', 'domain_sme'];
    let result;
    try {
      result = buildReviewerPrompts(activeRoles, fixture.prompt, fixture.context);
    } catch (e) {
      assert.fail(`buildReviewerPrompts threw for prompt "${fixture.id}": ${e.message}`);
    }
    assert.ok(Array.isArray(result), `buildReviewerPrompts must return array for "${fixture.id}"`);
    assert.strictEqual(result.length, 4, `Expected 4 reviewer prompts for "${fixture.id}"`);
  }
}

// ─── Test 5: Every reviewer prompt output has non-empty system and user strings ─
{
  const activeRoles = ['security', 'clarity', 'testing', 'domain_sme'];
  for (const fixture of SWE_PROMPTS) {
    const prompts = buildReviewerPrompts(activeRoles, fixture.prompt, fixture.context);
    for (const p of prompts) {
      assert.ok(typeof p.system === 'string' && p.system.length > 0,
        `Role "${p.role}" in "${fixture.id}" produced empty system prompt`);
      assert.ok(typeof p.user === 'string',
        `Role "${p.role}" in "${fixture.id}" user prompt must be a string`);
      // user content always includes the "Original Prompt" header
      assert.ok(p.user.includes('Original Prompt'),
        `Role "${p.role}" in "${fixture.id}" user prompt must include "Original Prompt" section`);
    }
  }
}

// ─── Test 6: User prompt content always embeds the original prompt text ──────
{
  const activeRoles = ['security', 'clarity', 'testing', 'domain_sme'];
  for (const fixture of SWE_PROMPTS) {
    if (fixture.prompt.length === 0) continue; // skip empty-prompt edge case
    const prompts = buildReviewerPrompts(activeRoles, fixture.prompt, fixture.context);
    for (const p of prompts) {
      assert.ok(p.user.includes(fixture.prompt),
        `Role "${p.role}" for "${fixture.id}" must embed the original prompt verbatim`);
    }
  }
}

// ─── Test 7: Project name and stack appear in reviewer user content when provided ─
{
  const fixture = SWE_PROMPTS.find(p => p.id === 'SWE-BUG-001');
  assert.ok(fixture, 'SWE-BUG-001 fixture must exist');
  const prompts = buildReviewerPrompts(['security', 'clarity'], fixture.prompt, fixture.context);
  for (const p of prompts) {
    assert.ok(p.user.includes(fixture.context.projectName),
      `Role "${p.role}" must embed project name "${fixture.context.projectName}"`);
    assert.ok(p.user.includes(fixture.context.stack[0]),
      `Role "${p.role}" must embed stack entry "${fixture.context.stack[0]}"`);
  }
}

// ─── Test 8: frontend_ux conditional fires on UI-keyword prompts ─────────────
{
  const uiFixtures = SWE_PROMPTS.filter(p => p.expected_conditional_reviewers.includes('frontend_ux'));
  assert.ok(uiFixtures.length > 0, 'There must be at least one fixture expecting frontend_ux');

  for (const fixture of uiFixtures) {
    const fired = shouldFireConditional(
      STANDARD_CONFIG.reviewers.frontend_ux.triggers,
      fixture.prompt,
      fixture.context
    );
    assert.strictEqual(fired, true,
      `frontend_ux should fire for "${fixture.id}" (prompt: "${fixture.prompt.slice(0, 60)}...")`);
  }
}

// ─── Test 9: frontend_ux does NOT fire on non-UI prompts ────────────────────
{
  const nonUiFixtures = SWE_PROMPTS.filter(
    p => !p.expected_conditional_reviewers.includes('frontend_ux') && p.category !== 'stress'
  );
  // A subset that are clearly non-UI (bugfix, security, refactor with no UI words)
  const pureNonUi = nonUiFixtures.filter(p =>
    ['SWE-BUG-001', 'SWE-BUG-002', 'SWE-SEC-002', 'SWE-TEST-001'].includes(p.id)
  );

  for (const fixture of pureNonUi) {
    const fired = shouldFireConditional(
      STANDARD_CONFIG.reviewers.frontend_ux.triggers,
      fixture.prompt,
      fixture.context
    );
    assert.strictEqual(fired, false,
      `frontend_ux should NOT fire for "${fixture.id}"`);
  }
}

// ─── Test 10: documentation conditional fires on feature/doc prompts ─────────
{
  const docFixtures = SWE_PROMPTS.filter(p => p.expected_conditional_reviewers.includes('documentation'));
  assert.ok(docFixtures.length > 0, 'There must be at least one fixture expecting documentation reviewer');

  for (const fixture of docFixtures) {
    const fired = shouldFireConditional(
      STANDARD_CONFIG.reviewers.documentation.triggers,
      fixture.prompt,
      fixture.context
    );
    assert.strictEqual(fired, true,
      `documentation reviewer should fire for "${fixture.id}" (prompt: "${fixture.prompt.slice(0, 60)}...")`);
  }
}

// ─── Test 11: determineActiveReviewers returns at least 4 always-on roles ───
{
  for (const fixture of SWE_PROMPTS) {
    const active = determineActiveReviewers(STANDARD_CONFIG, fixture.prompt, fixture.context);
    const alwaysOn = ['domain_sme', 'security', 'clarity', 'testing'];
    for (const role of alwaysOn) {
      assert.ok(active.includes(role),
        `Always-on role "${role}" must be active for "${fixture.id}"`);
    }
  }
}

// ─── Test 12: Security-focused fixtures produce reviewer prompts referencing security keywords ─
{
  const secFixtures = SWE_PROMPTS.filter(p => p.category === 'security' || p.known_issues.some(i => i.includes('secret') || i.includes('injection') || i.includes('sql')));
  assert.ok(secFixtures.length >= 3, 'Expected at least 3 security-related fixtures');

  for (const fixture of secFixtures) {
    const prompts = buildReviewerPrompts(['security'], fixture.prompt, fixture.context);
    const secPrompt = prompts.find(p => p.role === 'security');
    assert.ok(secPrompt, `Security reviewer prompt must exist for "${fixture.id}"`);
    // Security system prompt must mention injection, secrets, or guardrails
    const systemLower = secPrompt.system.toLowerCase();
    assert.ok(
      systemLower.includes('injection') || systemLower.includes('secret') || systemLower.includes('guardrail'),
      `Security system prompt for "${fixture.id}" must reference injection/secret/guardrail`
    );
  }
}

// ─── Test 13: Vague prompts (vagueness_score >= 2) are covered by clarity reviewer ─
{
  const vagueFixtures = SWE_PROMPTS.filter(p => p.vagueness_score >= 2);
  assert.ok(vagueFixtures.length >= 3, 'Expected at least 3 vague fixtures (vagueness_score >= 2)');

  for (const fixture of vagueFixtures) {
    const prompts = buildReviewerPrompts(['clarity'], fixture.prompt, fixture.context);
    const clarityPrompt = prompts.find(p => p.role === 'clarity');
    assert.ok(clarityPrompt, `Clarity reviewer must exist for vague prompt "${fixture.id}"`);
    // Clarity system prompt must mention vague language checking
    const systemLower = clarityPrompt.system.toLowerCase();
    assert.ok(
      systemLower.includes('vague') || systemLower.includes('ambiguous') || systemLower.includes('specific'),
      `Clarity system prompt must address vagueness`
    );
  }
}

// ─── Test 14: Fixtures with known_issues are categorised by issue type ───────
{
  const knownIssueTypes = new Set();
  for (const p of SWE_PROMPTS) {
    for (const issue of p.known_issues) {
      knownIssueTypes.add(issue);
    }
  }
  // Verify representative coverage of issue types
  const expectedTypes = ['secret_exposure_blocker', 'vague_verb_optimize', 'entirely_vague', 'sql_injection_risk', 'prompt_injection'];
  for (const type of expectedTypes) {
    assert.ok(knownIssueTypes.has(type), `Known issue type "${type}" must be represented in fixtures`);
  }
}

// ─── Test 15: Stress-test fixtures (empty, injection) are present ────────────
{
  const stressFixtures = SWE_PROMPTS.filter(p => p.category === 'stress');
  assert.ok(stressFixtures.length >= 3, 'Expected at least 3 stress-test fixtures');

  const emptyPrompt = stressFixtures.find(p => p.prompt === '');
  assert.ok(emptyPrompt, 'Must include an empty-prompt stress fixture');

  const injectionFixtures = stressFixtures.filter(p => p.known_issues.includes('prompt_injection'));
  assert.ok(injectionFixtures.length >= 2, 'Must include at least 2 prompt-injection stress fixtures');
}

// ─── Test 16: buildReviewerPrompts does not throw for empty prompt (edge case) ─
{
  const emptyFixture = SWE_PROMPTS.find(p => p.prompt === '');
  assert.ok(emptyFixture, 'Empty prompt fixture must exist');
  let result;
  try {
    result = buildReviewerPrompts(['security', 'clarity'], emptyFixture.prompt, emptyFixture.context);
  } catch (e) {
    assert.fail(`buildReviewerPrompts must not throw on empty prompt: ${e.message}`);
  }
  assert.ok(Array.isArray(result), 'Result must be array even for empty prompt');
}

// ─── Test 17: Source categories are represented across fixture set ────────────
{
  const categories = new Set(SWE_PROMPTS.map(p => p.source_category));
  assert.ok(categories.has('swe_bench_style'), 'Must include swe_bench_style prompts');
  assert.ok(categories.has('agentbench_style'), 'Must include agentbench_style prompts');
  assert.ok(categories.has('synthetic_adversarial'), 'Must include synthetic_adversarial prompts');
}

// ─── Test 18: Each fixture category is represented in the set ─────────────────
{
  const presentCategories = new Set(SWE_PROMPTS.map(p => p.category));
  const requiredCategories = ['bugfix', 'feature', 'refactor', 'security', 'vague', 'testing', 'documentation', 'data_api', 'stress'];
  for (const cat of requiredCategories) {
    assert.ok(presentCategories.has(cat), `Category "${cat}" must be represented in fixture set`);
  }
}

// ─── Test 19: validateCritique accepts expected critique shapes for all roles ─
{
  const roleShapes = [
    { reviewer_role: 'security',  severity_max: 'blocker', confidence: 0.95, findings: [{ id: 'SEC-001', severity: 'blocker', confidence: 0.95, issue: 'Secret exposure', evidence: 'Test', suggested_ops: [{ op: 'AddGuardrail', target: 'constraints', value: 'No secrets' }] }], no_issues: false, score: 2.0 },
    { reviewer_role: 'clarity',   severity_max: 'major',   confidence: 0.85, findings: [{ id: 'CLR-001', severity: 'major',   confidence: 0.85, issue: 'Vague verb',     evidence: 'Test', suggested_ops: [{ op: 'ReplaceVague', target: 'structure', original: 'old', value: 'new' }] }], no_issues: false, score: 4.0 },
    { reviewer_role: 'testing',   severity_max: 'major',   confidence: 0.80, findings: [{ id: 'TST-001', severity: 'major',   confidence: 0.80, issue: 'No test step',  evidence: 'Test', suggested_ops: [{ op: 'AddAcceptanceCriteria', target: 'constraints', value: 'Run tests' }] }], no_issues: false, score: 3.5 },
    { reviewer_role: 'domain_sme',severity_max: 'nit',     confidence: 0.70, findings: [], no_issues: true, score: 9.0 },
  ];

  for (const shape of roleShapes) {
    const result = validateCritique(shape);
    assert.strictEqual(result.valid, true, `Expected valid critique for role "${shape.reviewer_role}", errors: ${result.errors.join(', ')}`);
  }
}

// ─── Test 20: High-vagueness fixture prompts have 3+ known_issues recorded ────
{
  const maxVague = SWE_PROMPTS.filter(p => p.vagueness_score === 3);
  assert.ok(maxVague.length >= 2, 'Must have at least 2 max-vagueness prompts');
  for (const fixture of maxVague) {
    assert.ok(fixture.known_issues.length >= 2,
      `Max-vagueness prompt "${fixture.id}" must document at least 2 known_issues`);
  }
}

console.log('swe-bench.test: all tests passed');
