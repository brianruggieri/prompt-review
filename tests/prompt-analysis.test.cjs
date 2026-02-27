// tests/prompt-analysis.test.cjs
// Research and analysis suite: measures reviewability characteristics of prompts,
// validates reviewer coverage, detects vagueness/security/testing signals, and
// stress-tests reviewer sub-agent prompt builders with edge-case inputs.
// All analysis logic is self-contained — no API calls required.

const assert = require('assert');
const path = require('path');
const { buildReviewerPrompts, shouldFireConditional } = require('../orchestrator.cjs');

// ─── Load fixtures ──────────────────────────────────────────────────────────
const SWE_PROMPTS = require('./fixtures/swe-bench-prompts.json').prompts;

// ─── Analysis utilities ──────────────────────────────────────────────────────
// These lightweight heuristics mirror the reviewer sub-agents' intent, letting
// us validate reviewability without live API calls.

const VAGUE_VERBS = ['optimize', 'improve', 'clean up', 'make better', 'better', 'enhance', 'revamp'];
const SECURITY_SIGNALS = ['.env', 'api key', 'api_key', 'secret', 'password', 'token', 'credential',
  'sql', 'delete all', 'deletes all', 'rm -rf', 'drop table', 'exec(', 'eval(', 'user input', 'query string',
  'exfiltrat', 'ignore your previous', 'no restriction', 'attacker'];
const TESTING_SIGNALS = ['npm run test', 'npm test', 'jest', 'pytest', 'go test', 'rspec',
  'playwright', 'cypress', 'unit test', 'integration test', 'all existing tests must pass', 'tests must pass'];
const PII_SIGNALS = ['ssn', 'social security', 'password', 'credit card', 'email', 'phone', 'address'];
const INJECTION_PATTERNS = ['ignore your previous', 'previous instructions', 'previous safety',
  'no restriction', 'no restrictions', 'you are now a', 'disregard', 'jailbreak', 'no longer apply'];

function countSignals(prompt, signals) {
  const lower = prompt.toLowerCase();
  return signals.filter(sig => lower.includes(sig.toLowerCase())).length;
}

function detectVagueVerbs(prompt) {
  const lower = prompt.toLowerCase();
  return VAGUE_VERBS.filter(v => lower.includes(v));
}

function hasTestingRequirement(prompt) {
  return countSignals(prompt, TESTING_SIGNALS) > 0;
}

function hasSecurityRisk(prompt) {
  return countSignals(prompt, SECURITY_SIGNALS) > 0;
}

function hasPiiRisk(prompt) {
  return countSignals(prompt, PII_SIGNALS) > 0;
}

function hasInjectionPattern(prompt) {
  return countSignals(prompt, INJECTION_PATTERNS) > 0;
}

// Reviewability score: higher = more issues to review
// Factors: vagueness, missing tests, security risks, prompt length
function computeReviewabilityScore(prompt) {
  let score = 0;
  score += detectVagueVerbs(prompt).length * 2;
  if (!hasTestingRequirement(prompt)) score += 1;
  if (hasSecurityRisk(prompt)) score += 3;
  if (hasPiiRisk(prompt)) score += 2;
  if (hasInjectionPattern(prompt)) score += 5;
  if (prompt.trim().length < 20) score += 3; // too short
  return score;
}

// ─── Test 1: Vague verb detector identifies known-vague fixtures ─────────────
{
  const vagueFix = SWE_PROMPTS.filter(p => p.vagueness_score >= 2);
  for (const fixture of vagueFix) {
    if (fixture.prompt.trim().length === 0) continue; // skip empty
    const found = detectVagueVerbs(fixture.prompt);
    const hasKnownVagueIssue = fixture.known_issues.some(i =>
      i.includes('vague') || i.includes('entirely_vague') || i.includes('no_scope')
    );
    if (hasKnownVagueIssue) {
      // At least something in the vague-issue list should register a vague verb
      // (or the prompt itself is just too short/empty to matter)
      const promptLower = fixture.prompt.toLowerCase();
      const isMinimal = fixture.prompt.trim().length < 20;
      assert.ok(found.length > 0 || isMinimal,
        `Vague fixture "${fixture.id}" (score ${fixture.vagueness_score}) should contain at least one vague verb. Prompt: "${fixture.prompt}"`);
    }
  }
}

// ─── Test 2: Specific prompts (vagueness_score 0) contain no vague verbs ────
{
  const specificFix = SWE_PROMPTS.filter(p => p.vagueness_score === 0 && p.prompt.trim().length > 0);
  for (const fixture of specificFix) {
    const found = detectVagueVerbs(fixture.prompt);
    assert.strictEqual(found.length, 0,
      `Specific prompt "${fixture.id}" should have no vague verbs, found: [${found.join(', ')}]`);
  }
}

// ─── Test 3: Security signal detector flags known-risky fixtures ─────────────
{
  const secRiskyFix = SWE_PROMPTS.filter(p =>
    p.known_issues.some(i =>
      i.includes('secret') || i.includes('sql_injection') || i.includes('injection_risk') ||
      i.includes('prompt_injection') || i.includes('exfiltration')
    )
  );
  assert.ok(secRiskyFix.length >= 3, 'Expected at least 3 security-risky fixtures');
  for (const fixture of secRiskyFix) {
    assert.ok(hasSecurityRisk(fixture.prompt),
      `Security-risky fixture "${fixture.id}" must trigger security signal detector`);
  }
}

// ─── Test 4: Injection pattern detector catches adversarial prompts ──────────
{
  const injectionFix = SWE_PROMPTS.filter(p => p.known_issues.includes('prompt_injection'));
  assert.ok(injectionFix.length >= 2, 'Expected at least 2 injection fixtures');
  for (const fixture of injectionFix) {
    assert.ok(hasInjectionPattern(fixture.prompt),
      `Injection fixture "${fixture.id}" must trigger injection pattern detector`);
  }
}

// ─── Test 5: Testing requirement detector identifies prompts with test steps ──
{
  // Prompts that explicitly mention running tests
  const withTests = SWE_PROMPTS.filter(p =>
    p.prompt.toLowerCase().includes('npm run test') ||
    p.prompt.toLowerCase().includes('must pass') ||
    p.prompt.toLowerCase().includes('jest') ||
    p.prompt.toLowerCase().includes('playwright') ||
    p.prompt.toLowerCase().includes('pytest')
  );
  assert.ok(withTests.length >= 3, 'Expected at least 3 prompts with explicit test requirements');
  for (const fixture of withTests) {
    assert.ok(hasTestingRequirement(fixture.prompt),
      `Fixture "${fixture.id}" with test keywords must be detected by testing signal detector`);
  }
}

// ─── Test 6: PII signal detector flags data-heavy prompts ────────────────────
{
  const piiFix = SWE_PROMPTS.filter(p =>
    p.known_issues.some(i => i.includes('pii') || i.includes('ssn'))
  );
  assert.ok(piiFix.length >= 1, 'Expected at least 1 PII-risky fixture');
  for (const fixture of piiFix) {
    assert.ok(hasPiiRisk(fixture.prompt),
      `PII fixture "${fixture.id}" must trigger PII signal detector`);
  }
}

// ─── Test 7: Reviewability score ordering — risky > vague > specific ─────────
{
  // Adversarial injection prompt should score highest
  const injectionFix = SWE_PROMPTS.find(p => p.id === 'SWE-INJECT-002');
  const secretFix    = SWE_PROMPTS.find(p => p.id === 'SWE-SEC-001');
  const vagueFix     = SWE_PROMPTS.find(p => p.id === 'SWE-VAGUE-001');
  const specificFix  = SWE_PROMPTS.find(p => p.id === 'SWE-EDGE-003');

  assert.ok(injectionFix && secretFix && vagueFix && specificFix, 'All four reference fixtures must exist');

  const injectionScore  = computeReviewabilityScore(injectionFix.prompt);
  const secretScore     = computeReviewabilityScore(secretFix.prompt);
  const vagueScore      = computeReviewabilityScore(vagueFix.prompt);
  const specificScore   = computeReviewabilityScore(specificFix.prompt);

  assert.ok(injectionScore > vagueScore,
    `Injection score (${injectionScore}) must exceed vague score (${vagueScore})`);
  assert.ok(secretScore > specificScore,
    `Secret-exposure score (${secretScore}) must exceed specific-clean score (${specificScore})`);
}

// ─── Test 8: Reviewer prompt system content is stable across multiple calls ───
{
  const fixture = SWE_PROMPTS.find(p => p.id === 'SWE-BUG-001');
  const roles = ['security', 'clarity', 'testing', 'domain_sme'];
  const result1 = buildReviewerPrompts(roles, fixture.prompt, fixture.context);
  const result2 = buildReviewerPrompts(roles, fixture.prompt, fixture.context);

  for (let i = 0; i < result1.length; i++) {
    assert.strictEqual(result1[i].system, result2[i].system,
      `Role "${result1[i].role}" system prompt must be deterministic`);
    assert.strictEqual(result1[i].user, result2[i].user,
      `Role "${result1[i].role}" user prompt must be deterministic`);
  }
}

// ─── Test 9: Very long prompt is handled without truncation ──────────────────
{
  const longPrompt = 'Implement a comprehensive user management system. '.repeat(60).trim();
  assert.ok(longPrompt.length > 2000, 'Test prompt must be > 2000 chars');

  const context = { stack: ['Node.js', 'TypeScript'], projectName: 'platform' };
  let result;
  try {
    result = buildReviewerPrompts(['security', 'clarity'], longPrompt, context);
  } catch (e) {
    assert.fail(`buildReviewerPrompts must not throw on long prompt: ${e.message}`);
  }
  assert.ok(Array.isArray(result) && result.length === 2, 'Must return 2 prompts for long input');
  // Full prompt text must appear in user content
  for (const p of result) {
    assert.ok(p.user.includes(longPrompt),
      `Role "${p.role}" must embed the full long prompt without truncation`);
  }
}

// ─── Test 10: Special characters in prompts do not break builders ─────────────
{
  const specialPrompt = 'Fix the bug in `parser.ts` where `"quoted"` and `{JSON: "objects"}` fail. Use `\`backticks\`` and <angle> tags. Cost: ~$100. File: C:\\Users\\dev\\app.ts.';
  const context = { stack: ['TypeScript'], projectName: 'parser-lib' };
  let result;
  try {
    result = buildReviewerPrompts(['security', 'clarity', 'testing'], specialPrompt, context);
  } catch (e) {
    assert.fail(`Special chars must not crash builder: ${e.message}`);
  }
  assert.ok(result.length === 3, 'Must return 3 prompts for special-char input');
}

// ─── Test 11: Unicode prompts are handled correctly ───────────────────────────
{
  const unicodePrompt = 'Corregir el error en validación de formulario: el campo "correo electrónico" acepta 日本語テスト y emojis 🔴🟡✅ sin error. Los datos deben ser sanitizados.';
  const context = { stack: ['JavaScript'], projectName: 'i18n-app' };
  let result;
  try {
    result = buildReviewerPrompts(['security', 'clarity'], unicodePrompt, context);
  } catch (e) {
    assert.fail(`Unicode prompts must not crash builder: ${e.message}`);
  }
  assert.ok(result.length === 2, 'Must return 2 prompts for unicode input');
  for (const p of result) {
    assert.ok(p.user.includes(unicodePrompt), `Role "${p.role}" must embed unicode prompt verbatim`);
  }
}

// ─── Test 12: Empty context fields do not crash builders ─────────────────────
{
  const contexts = [
    {},
    { stack: [] },
    { stack: null },
    { stack: undefined },
    { projectName: null },
    { stack: [], projectName: '', structure: '', conventions: [] },
  ];
  for (const ctx of contexts) {
    try {
      buildReviewerPrompts(['security'], 'Do something.', ctx);
    } catch (e) {
      assert.fail(`buildReviewerPrompts must not throw for empty context variant: ${e.message}`);
    }
  }
}

// ─── Test 13: shouldFireConditional correctly handles edge-case trigger configs ─
{
  // No triggers object
  assert.strictEqual(shouldFireConditional(null, 'add a UI modal', {}), false,
    'Null triggers should return false');

  // Empty trigger arrays
  assert.strictEqual(shouldFireConditional({ prompt_keywords: [] }, 'add a UI modal', {}), false,
    'Empty keyword list should return false');

  // skip_keywords override prompt_keywords
  assert.strictEqual(
    shouldFireConditional({ prompt_keywords: ['feature'], skip_keywords: ['bugfix'] }, 'add a feature bugfix', {}),
    false,
    'skip_keywords should prevent firing even when prompt_keywords match'
  );

  // Case-insensitive keyword matching
  assert.strictEqual(
    shouldFireConditional({ prompt_keywords: ['UI'] }, 'Add a ui component', {}),
    true,
    'Keyword match must be case-insensitive'
  );
}

// ─── Test 14: Coverage analysis — every reviewer domain has ≥3 fixtures targeting it ─
{
  const domainCoverage = {
    security:      SWE_PROMPTS.filter(p => p.expected_reviewers_to_fire.includes('security')).length,
    clarity:       SWE_PROMPTS.filter(p => p.expected_reviewers_to_fire.includes('clarity')).length,
    testing:       SWE_PROMPTS.filter(p => p.expected_reviewers_to_fire.includes('testing')).length,
    domain_sme:    SWE_PROMPTS.filter(p => p.expected_reviewers_to_fire.includes('domain_sme')).length,
    frontend_ux:   SWE_PROMPTS.filter(p => p.expected_conditional_reviewers.includes('frontend_ux')).length,
    documentation: SWE_PROMPTS.filter(p => p.expected_conditional_reviewers.includes('documentation')).length,
  };

  assert.ok(domainCoverage.security   >= 10, `Security must cover ≥10 fixtures, got ${domainCoverage.security}`);
  assert.ok(domainCoverage.clarity    >= 10, `Clarity must cover ≥10 fixtures, got ${domainCoverage.clarity}`);
  assert.ok(domainCoverage.testing    >= 10, `Testing must cover ≥10 fixtures, got ${domainCoverage.testing}`);
  assert.ok(domainCoverage.domain_sme >= 10, `Domain SME must cover ≥10 fixtures, got ${domainCoverage.domain_sme}`);
  assert.ok(domainCoverage.frontend_ux   >= 3, `frontend_ux must cover ≥3 fixtures, got ${domainCoverage.frontend_ux}`);
  assert.ok(domainCoverage.documentation >= 2, `documentation must cover ≥2 fixtures, got ${domainCoverage.documentation}`);
}

// ─── Test 15: Reviewability distribution — fixture set is balanced ────────────
{
  const vagueness = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const p of SWE_PROMPTS) vagueness[p.vagueness_score]++;

  // Must have specific prompts (score 0) to prove the system doesn't over-flag good prompts
  assert.ok(vagueness[0] >= 4, `Must have ≥4 specific prompts (vagueness 0), got ${vagueness[0]}`);
  // Must have vague prompts (score 2-3) to prove the system catches poor prompts
  assert.ok(vagueness[2] + vagueness[3] >= 4, `Must have ≥4 vague prompts (score 2-3), got ${vagueness[2] + vagueness[3]}`);
}

// ─── Test 16: Reviewer sub-agent system prompts contain role-specific vocabulary ─
{
  const roleKeywords = {
    security:   ['injection', 'secret', 'guardrail', 'vulnerability', 'owasp'],
    clarity:    ['vague', 'ambiguous', 'scope', 'criteria', 'specific'],
    testing:    ['test', 'coverage', 'acceptance', 'pass'],
    domain_sme: ['domain', 'expert', 'architecture', 'implementation', 'design'],
  };

  const referencePrompt = 'Implement user authentication.';
  const context = { stack: ['Node.js'], projectName: 'auth' };
  const built = buildReviewerPrompts(Object.keys(roleKeywords), referencePrompt, context);

  for (const { role, system } of built) {
    const keywords = roleKeywords[role];
    if (!keywords) continue;
    const sysLower = system.toLowerCase();
    const matchedKeywords = keywords.filter(kw => sysLower.includes(kw));
    assert.ok(matchedKeywords.length >= 2,
      `Role "${role}" system prompt must contain at least 2 role-specific keywords from [${keywords.join(', ')}]. Found: [${matchedKeywords.join(', ')}]`);
  }
}

// ─── Test 17: Prompts with SSN/PII have security as an expected reviewer ──────
{
  const piiPrompts = SWE_PROMPTS.filter(p =>
    p.known_issues.some(i => i.includes('pii') || i.includes('ssn'))
  );
  for (const fixture of piiPrompts) {
    assert.ok(fixture.expected_reviewers_to_fire.includes('security'),
      `PII fixture "${fixture.id}" must list security as expected reviewer`);
  }
}

// ─── Test 18: Injection stress prompts are categorised as 'stress' ─────────────
{
  const injectionFix = SWE_PROMPTS.filter(p => p.known_issues.includes('prompt_injection'));
  for (const fixture of injectionFix) {
    assert.strictEqual(fixture.category, 'stress',
      `Injection fixture "${fixture.id}" must be in the 'stress' category`);
  }
}

// ─── Test 19: buildReviewerPrompts handles unknown/extra context fields ────────
{
  const extraContext = {
    stack: ['Node.js'],
    projectName: 'test',
    unknownField: 'should be ignored',
    nested: { deep: 'value' },
    array: [1, 2, 3],
  };
  let result;
  try {
    result = buildReviewerPrompts(['security'], 'Fix the bug.', extraContext);
  } catch (e) {
    assert.fail(`buildReviewerPrompts must tolerate unknown context fields: ${e.message}`);
  }
  assert.ok(result.length === 1, 'Must return 1 prompt despite extra context fields');
}

// ─── Test 20: All fixture notes are non-empty strings (documentation quality) ─
{
  for (const p of SWE_PROMPTS) {
    assert.ok(typeof p.notes === 'string' && p.notes.trim().length > 0,
      `Fixture "${p.id}" must have a non-empty notes field`);
  }
}

console.log('prompt-analysis.test: all tests passed');
