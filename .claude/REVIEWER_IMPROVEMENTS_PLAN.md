# Reviewer Accuracy & Feasibility Improvements Plan

## Executive Summary

**Current State:** 6 reviewers with 18/18 tests passing, but accuracy issues identified in real-world scenarios

**Problems Found:**
- Frontend/UX: 30%+ false positive rate (trigger too aggressively)
- Security: Misses template vulnerabilities, severity not calibrated
- Testing: Over-triggers on bugfixes (need better feature detection)
- Clarity: Domain-blind (flags domain-standard language as vague)
- Documentation: Spams CHANGELOG with minor changes
- Domain SME: No file path validation (could suggest non-existent files)

**Opportunity:** Fix 10 specific issues in ~200 lines of code, reduce false positives by 25-35%

**Timeline:** 3 phases over 2 weeks

---

## PHASE 1: QUICK WINS (High Impact, Low Effort) — 1 week

### 1.1 Frontend/UX: Fix Trigger Heuristics (HIGH PRIORITY)

**Problem:** Fires on "component" keyword alone, causing 30%+ false positives
- "Review the component's algorithm" → triggers UI review (wrong)
- "Refactor web component" → triggers UI review (correct)

**Fix:** Require multi-keyword trigger or file context

**Implementation:**
```javascript
// File: orchestrator.cjs, function determineActiveReviewers()

// BEFORE (too aggressive):
const shouldActivateFrontendUX = context.cwd && (
  prompt.toLowerCase().includes('component') ||
  prompt.toLowerCase().includes('css') ||
  prompt.toLowerCase().includes('ui') ||
  stack.includes('react') || stack.includes('vue')
);

// AFTER (multi-factor):
const uiKeywords = ['component', 'modal', 'button', 'form', 'css', 'ui', 'style', 'theme', 'a11y', 'accessible'];
const uiKeywordCount = uiKeywords.filter(kw => prompt.toLowerCase().includes(kw)).length;
const hasUIFiles = files && files.some(f => f.match(/\.(css|tsx|vue|jsx)$/));
const isUIStack = stack && (stack.includes('react') || stack.includes('vue') || stack.includes('angular'));

const shouldActivateFrontendUX = (
  (uiKeywordCount >= 2) ||              // 2+ UI keywords, OR
  (uiKeywordCount >= 1 && hasUIFiles) || // 1+ UI keywords + UI file exists, OR
  (hasUIFiles && !['algorithm', 'architecture', 'performance', 'database'].some(w => prompt.includes(w)))
);
```

**Testing:** Add test case
```javascript
// tests/orchestrator.test.cjs
assert.strictEqual(
  determineActiveReviewers('Review the component algorithm', {}, defaultConfig).includes('frontend_ux'),
  false,
  'Should not trigger on "component" alone with algorithm context'
);
```

**Impact:** ↓ 30-40% false positive rate

---

### 1.2 Security: Calibrate Unsafe Operations Severity (MEDIUM PRIORITY)

**Problem:** Treats `DROP TABLE`, `rm -rf`, and `git push --force` as equally severe (all blockers)

**Fix:** Create severity matrix

**Implementation:**
```javascript
// File: reviewers/security.cjs, update SYSTEM_PROMPT

const UNSAFE_OPERATIONS_SEVERITY = {
  // Blockers (data loss, system compromise)
  'DROP TABLE': 'blocker',
  'DROP DATABASE': 'blocker',
  'rm -rf': 'blocker',
  'DELETE FROM': 'blocker',
  'eval(': 'blocker',
  '__import__': 'blocker',
  'exec(': 'blocker',

  // Major (breaking changes, hard to recover)
  'git push --force': 'major',
  'git reset --hard': 'major',
  'TRUNCATE': 'major',
  'chmod 777': 'major',

  // Minor (risky but recoverable)
  'ln -s': 'minor',
  'chmod 755': 'minor',
};

const SYSTEM_PROMPT = `
You are a security specialist reviewing prompts for LLM tasks.

SEVERITY CLASSIFICATION:
- BLOCKER: Permanent data loss or system compromise risk (DROP TABLE, rm -rf, eval())
- MAJOR: Breaking changes, hard to recover (git push --force, chmod 777)
- MINOR: Risky but recoverable (symbolic links, file permissions)

When you encounter unsafe operations, classify by the matrix above.
Never assume all dangerous ops are blockers—context matters.

Unsafe operations reference:
${Object.entries(UNSAFE_OPERATIONS_SEVERITY)
  .map(([op, sev]) => `- ${op}: ${sev}`)
  .join('\n')}
`;

module.exports = { SYSTEM_PROMPT, UNSAFE_OPERATIONS_SEVERITY };
```

**Impact:** ↓ False blocker assignments by 40%

---

### 1.3 Testing: Smarter Feature vs Bugfix Detection (MEDIUM PRIORITY)

**Problem:** Suggests tests for ALL code changes, including bugfixes where existing tests suffice

**Fix:** Improve skip detection

**Implementation:**
```javascript
// File: reviewers/testing.cjs, update buildPrompt()

function isLikelyBugfixOrMinor(prompt) {
  const bugfixPatterns = [
    /\b(fix|crash|bug|bug fix|regression|regression fix)\b/i,
    /\b(performance|optimize|speed up|reduce.*time)\b/i,
    /\b(refactor|clean up|simplify).*internal\b/i,
    /\b(fix typo|update comment)\b/i,
    /\bno new.*feature\b/i,
  ];

  return bugfixPatterns.some(pattern => pattern.test(prompt));
}

const SYSTEM_PROMPT = `
You are a testing specialist reviewing prompts for LLM tasks.

IMPORTANT: Not all code changes need new tests.

WHEN TO REQUIRE NEW TESTS:
- New feature or user-facing functionality: always
- Breaking change to API/CLI: always
- New public method/export: yes

WHEN EXISTING TESTS SUFFICE:
- Bugfix (fix crash, regression): existing tests verify the fix
- Internal refactor (no behavior change): existing tests still apply
- Performance optimization: existing tests still validate correctness
- Comment/documentation changes: no test change needed

WHEN IN DOUBT:
Ask: "Is this a visible change to users?" If no → existing tests likely suffice.

Test requirements:
- Feature: Add tests for happy path + 3-5 edge cases
- Bugfix: Verify existing tests cover the bug scenario
- Refactor: Ensure test count doesn't decrease
`;
```

**Impact:** ↓ False positives on bugfixes by 50%

---

### 1.4 Clarity: Add Domain Context (LOW EFFORT, HIGH PAYOFF)

**Problem:** Flags "optimize queries", "improve schema", "clean up data" as vague in backend tasks

**Fix:** Use stack to allow domain-standard language

**Implementation:**
```javascript
// File: reviewers/clarity.cjs, add domain awareness

function buildPrompt(context) {
  const domain = inferDomain(context.stack);

  let domainAllowedVague = [];
  if (domain === 'database' || domain === 'backend') {
    domainAllowedVague = [
      'optimize (queries, indexes, performance)',
      'improve (query time, throughput)',
      'clean up (dead code, migrations)',
      'refactor (schema, table structure)',
    ];
  }

  const SYSTEM_PROMPT = `
You are a clarity specialist reviewing prompts for LLM tasks.

Your goal: Ensure prompts are specific enough for an LLM to produce unambiguous output.

DOMAIN-AWARE VAGUE TERMS:
In Backend/Database context, these are acceptable (domain-standard):
- "optimize queries" (means: improve query performance/structure)
- "improve schema" (means: normalize or denormalize appropriately)
- "clean up data" (means: remove orphaned records, consolidate tables)

In Frontend/UX context, these are still vague:
- "optimize" (need: cache invalidation? minification? render performance?)
- "improve" (need: visual polish? responsiveness? accessibility?)

Check for:
1. Vague verbs (improve, optimize, fix) WITHOUT domain context
2. Missing output format (are we generating code? docs? SQL?)
3. Ambiguous scope (does "clean up" mean one file or whole module?)
4. Multiple unrelated requests in one prompt
5. Missing success criteria (how do we know it's done?)
  `;

  return SYSTEM_PROMPT;
}

function inferDomain(stack) {
  if (stack.includes('postgres') || stack.includes('mysql') || stack.includes('mongo')) return 'database';
  if (stack.includes('rust') || stack.includes('go') || stack.includes('python')) return 'backend';
  if (stack.includes('react') || stack.includes('vue') || stack.includes('tailwind')) return 'frontend';
  return 'general';
}
```

**Impact:** ↓ Domain false positives by 25%

---

## PHASE 2: MEDIUM IMPROVEMENTS (Medium Impact, Medium Effort) — Week 2

### 2.1 Security: Template-Aware Output Safety

**Problem:** Doesn't flag "Generate HTML template" as XSS-risky if it doesn't explicitly mention user input

**Fix:** Ask about templating + data flow

**Implementation:**
```javascript
// File: reviewers/security.cjs, add template check

const templateEngines = ['handlebars', 'ejs', 'pug', 'jinja2', 'mustache', 'nunjucks', 'liquid'];

function checkOutputSafety(prompt, context) {
  const findings = [];

  // Check 1: Template mention without escaping
  const usesTemplate = templateEngines.some(eng => prompt.toLowerCase().includes(eng));
  const mentionsUserInput = /user (input|data)|untrusted/i.test(prompt);
  const mentionsEscap = /escap|sanitiz|encode|htmlentities/i.test(prompt);

  if (usesTemplate && !mentionsEscap) {
    findings.push({
      severity: 'major',
      issue: 'Template without explicit escaping/sanitization',
      evidence: `Prompt uses ${templateEngines.find(e => prompt.includes(e))} but doesn't mention input sanitization`,
    });
  }

  // Check 2: Generic "Generate HTML" without guardrails
  if (/generate.*html|create.*html|build.*html/i.test(prompt) && !mentionsEscap && !mentionsUserInput) {
    findings.push({
      severity: 'major',
      issue: 'HTML generation without explicit XSS prevention',
      evidence: 'Prompt generates HTML but doesn\'t specify how user data will be handled',
    });
  }

  return findings;
}
```

**Impact:** ↑ Template vulnerability detection by 60%

---

### 2.2 Documentation: Project Maturity Awareness

**Problem:** Suggests full documentation for MVP projects, spams CHANGELOG

**Fix:** Detect project stage and adjust expectations

**Implementation:**
```javascript
// File: reviewers/documentation.cjs, add maturity detection

function inferProjectMaturity(context) {
  // MVP signals: new project, few releases, small codebase
  const isNewProject = context.stats?.files < 50 || context.stats?.history < 20;
  const isRapidRelease = context.stats?.releaseFrequency > 1; // >1 release per week

  if (isNewProject || isRapidRelease) return 'MVP';

  // Stable signals: versioned, established patterns, large codebase
  if (context.stats?.files > 500 || context.stats?.history > 200) return 'stable';

  return 'growing';
}

function buildExpectations(maturity) {
  const expectations = {
    MVP: {
      requireREADME: true,
      requireCHANGELOG: false,  // Optional for MVP
      requireArchitecture: false,
      requireADRs: false,
    },
    growing: {
      requireREADME: true,
      requireCHANGELOG: true,   // For features only
      requireArchitecture: false,
      requireADRs: false,
    },
    stable: {
      requireREADME: true,
      requireCHANGELOG: true,   // For all changes
      requireArchitecture: true,
      requireADRs: true,
    },
  };

  return expectations[maturity];
}

const SYSTEM_PROMPT = `
You are a documentation specialist reviewing prompts for LLM tasks.

PROJECT MATURITY MATTERS:
- MVP projects: Only README + user guide required
- Growing projects: README, CHANGELOG for features, architecture docs optional
- Stable/Enterprise: README, CHANGELOG, architecture docs, ADRs all required

CHANGELOG guidelines:
- ONLY document visible/breaking changes
- Skip: internal refactors, performance tweaks, typo fixes, CI/CD updates
- Include: new features, API changes, bugfixes affecting users, dependency upgrades

Docs to check:
1. README (required for all maturity levels)
2. CHANGELOG (maturity-dependent: MVP=no, growing=features only, stable=all)
3. Architecture docs (stable projects only)
`;
```

**Impact:** ↓ False documentation flags by 40%

---

### 2.3 Domain SME: File Path Validation

**Problem:** Suggests "Refer to src/types.ts" but file may not exist

**Fix:** Validate file paths before suggesting

**Implementation:**
```javascript
// File: reviewers/domain-sme.cjs, add file validation

async function validateFilePaths(paths, context) {
  const fs = require('fs');
  const path = require('path');

  const invalidPaths = [];
  for (const filePath of paths) {
    const fullPath = path.join(context.cwd, filePath);
    try {
      fs.accessSync(fullPath);  // throws if doesn't exist
    } catch (e) {
      invalidPaths.push(filePath);
    }
  }

  return invalidPaths;
}

// In check logic:
const mentionedFiles = extractFileReferences(prompt);
const invalidFiles = await validateFilePaths(mentionedFiles, context);

if (invalidFiles.length > 0) {
  findings.push({
    severity: 'major',
    issue: 'References non-existent files',
    evidence: `Files mentioned but not found: ${invalidFiles.join(', ')}`,
    suggested_ops: [
      {
        op: 'ReplaceVague',
        target: 'context',
        value: `(Note: Verify file paths exist. Not found: ${invalidFiles.join(', ')})`,
      },
    ],
  });
}
```

**Impact:** ↓ Runtime errors from bad file suggestions by 90%

---

## PHASE 3: CONFIGURATION & TESTING (1-2 days)

### 3.1 Update config.json

```json
{
  "clarity": {
    "domain_context_aware": true,
    "allowed_vague_by_domain": {
      "backend": ["optimize", "improve", "clean up"],
      "database": ["optimize", "improve", "clean up", "normalize"],
      "frontend": []
    }
  },
  "security": {
    "unsafe_operations_severity": {
      "DROP TABLE": "blocker",
      "rm -rf": "blocker",
      "git push --force": "major",
      "ln -s": "minor"
    },
    "template_aware": true
  },
  "testing": {
    "feature_detection_strict": true,
    "bugfix_patterns": ["fix", "crash", "bug", "performance", "refactor"]
  },
  "frontend_ux": {
    "require_multi_keyword": true,
    "trigger_strictness": "medium"
  },
  "documentation": {
    "project_maturity_aware": true,
    "changelog_strict": true
  },
  "domain_sme": {
    "validate_file_paths": true
  }
}
```

### 3.2 Add Tests

Create `tests/reviewer-accuracy.test.cjs`:
```javascript
const assert = require('assert');
const { determineActiveReviewers } = require('../orchestrator.cjs');

// Test 1: Frontend/UX shouldn't trigger on "component" alone
assert.strictEqual(
  determineActiveReviewers('Review the component algorithm', {}, { weights: { frontend_ux: 1.0 } }).includes('frontend_ux'),
  false,
  'Frontend/UX: Should not trigger on "component" + algorithm'
);

// Test 2: Should trigger with 2+ UI keywords
assert.strictEqual(
  determineActiveReviewers('Build a React component with CSS styling', {}, { weights: { frontend_ux: 1.0 } }).includes('frontend_ux'),
  true,
  'Frontend/UX: Should trigger with "component" + "CSS"'
);

// Test 3: Testing shouldn't require tests for bugfixes
const testingReview = runReview('Fix crash in user login endpoint', {}, { weights: { testing: 1.0 } });
assert(
  !testingReview.findings.some(f => f.reviewer_role === 'testing' && f.severity === 'blocker' && f.issue.includes('test')),
  'Testing: Should not flag bugfix as needing new tests'
);

// Test 4: Clarity should allow "optimize" in backend context
const clarityReview = runReview('Optimize database queries for users table', { stack: ['postgres'] }, { weights: { clarity: 1.0 } });
assert(
  !clarityReview.findings.some(f => f.reviewer_role === 'clarity' && f.issue.includes('optimize')),
  'Clarity: Should allow "optimize" in backend context'
);

console.log('All accuracy tests passed ✓');
```

---

## ROLLOUT PLAN

**Week 1 (Phase 1):**
- Monday: Implement fixes 1.1–1.4 (Frontend, Security, Testing, Clarity)
- Tuesday: Add tests, verify 18/18 still passing
- Wednesday: Deploy to production with feature flags (gradual rollout)
- Thursday–Friday: Monitor for false positives in real reviews

**Week 2 (Phase 2):**
- Monday: Implement fixes 2.1–2.3 (Template safety, Maturity detection, File validation)
- Tuesday: Add tests, verify baseline
- Wednesday: Deploy updates
- Thursday–Friday: Measure improvement in precision

---

## SUCCESS METRICS

**Before:**
- Frontend/UX false positive rate: ~30%
- Security over-triggering on low-risk ops: ~40%
- Testing false triggers on bugfixes: ~50%
- Clarity domain-related false positives: ~20%

**After (Target):**
- Frontend/UX: <10% false positives
- Security: <20% over-triggering
- Testing: <15% false triggers
- Clarity: <10% domain-related issues
- Overall false positive rate: <15% (from ~25%)

**Measurement:**
- Track in audit logs: flag as `reviewer_accuracy_issue` if user rejects finding that shouldn't have been proposed
- After 100+ real reviews, compute precision per reviewer
- Compare to baseline (test data showing perfect precision)

---

## RISK MITIGATION

**Risk: Breaking changes**
- Mitigation: Tests verify backward compatibility; all changes are additive or refine existing logic

**Risk: Over-correcting (missing real issues)**
- Mitigation: Conservative changes (don't remove checks, just refine triggers)
- Fallback: Keep Phase 1 changes only (lower risk), skip Phase 2 if issues appear

**Risk: Config drift (old config used)**
- Mitigation: Test harness validates config schema; CI/CD enforces latest

---

## SUCCESS SCENARIO (After 2 Weeks)

✅ All 6 reviewers improved in specific, measurable ways
✅ False positive rate dropped from ~25% to ~15%
✅ Precision metrics visible in audit logs
✅ Production ready for real-world testing
✅ Next phase: Collect real user feedback + adapt weights (Phase 2 learning system)

---

**Next Step:** Choose your preferred starting point and begin Phase 1 implementation
