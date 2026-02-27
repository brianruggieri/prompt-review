# Mock Data & Stress Testing Strategy for prompt-review

**Goal:** Generate realistic mock review data across ambiguity spectrum to prove tool effectiveness, stress test scoring, and validate learning system.

---

## Phase 0: Hello World — Minimal Viable Demo

### Single Canonical Test Case

Create ONE perfect example that demonstrates the entire system end-to-end:

```javascript
// mock-data/hello-world.cjs
module.exports = {
  category: "hello-world",
  prompt: "Write a function that validates email addresses",
  expected_clarity_score: 3.5,  // Major issues detected
  expected_findings: {
    clarity: [
      {
        severity: "major",
        issue: "Vague validation requirement",
        evidence: "What constitutes a valid email? RFC 5322? Simple regex?",
      },
    ],
    security: [
      {
        severity: "minor",
        issue: "No mention of sanitization",
        evidence: "Should input be sanitized before validation?",
      },
    ],
  },
  refinements: [
    {
      iteration: 1,
      refined_prompt: "Write a function that validates email addresses using RFC 5322 standard. Return true if valid, false otherwise. Should handle edge cases: empty string, spaces, special characters. Do NOT sanitize input.",
      expected_clarity_score: 7.8,
    },
  ],
};
```

**Why?** Gives immediate proof that the system works. User can run:
```bash
node tests/hello-world.test.cjs
# Output: PASS - Clarity detected vagueness, refinement improved score
```

---

## Phase 1: Tier 1 Mock Data — Basic Coverage (Week 1)

### 1.1 Ambiguity Spectrum (5 Prompts × 5 Dimensions)

Create 25 base prompts covering ambiguity across key dimensions:

#### **Dimension 1: Vagueness (Clear → Vague)**

| Clarity Score | Prompt | Issue |
|---|---|---|
| **9.5** | "Write a Python function that takes a list of integers and returns their sum, handling empty lists by returning 0" | Extremely specific |
| **7.0** | "Write a function that sums numbers in a list" | Missing: type spec, empty list handling |
| **4.5** | "Make a sum function" | Ambiguous: language? input type? output type? |
| **2.0** | "Fix the summing thing" | No context, vague verb |
| **0.5** | "Do the math thing" | Completely unclear |

#### **Dimension 2: Scope Ambiguity (Narrow → Broad)**

| Clarity Score | Prompt | Issue |
|---|---|---|
| **9.0** | "Add login validation to auth.ts: check email format using RFC 5322, password >= 12 chars, handle 3 failure states: no email, weak password, already logged in" | Precise boundaries |
| **6.5** | "Add login validation to the auth module" | Missing: which fields? which rules? |
| **3.5** | "Improve the login flow" | Undefined boundaries, multiple interpretations |
| **1.5** | "Fix authentication" | Could mean anything from bug fixes to redesign |

#### **Dimension 3: Missing Output Spec (Defined → Undefined)**

| Clarity Score | Prompt | Issue |
|---|---|---|
| **8.5** | "Return a JSON object: { success: bool, error: string or null, data: User or null }" | Precise format |
| **6.0** | "Return success or failure indication" | Ambiguous: boolean? object? HTTP status? |
| **3.0** | "Tell me if it works" | Undefined output format |

#### **Dimension 4: Missing Context (Rich → Bare)**

| Clarity Score | Prompt | Issue |
|---|---|---|
| **8.0** | "Refactor calculatePrice() to use new PricingService v2.1 (see docs/pricing-v2.1.md). Maintain backward compat. Add unit tests for: bulk discount (10%+ items), clearance items (< cost), no negative prices" | Full context |
| **5.5** | "Refactor the price calculation to be more efficient" | Missing: new API, compat needs, test cases |
| **2.0** | "Make pricing work better" | Vague verb + no context |

#### **Dimension 5: Implicit Assumptions (Explicit → Implicit)**

| Clarity Score | Prompt | Issue |
|---|---|---|
| **8.5** | "Add rate limiting to API: 100 requests/minute per IP, return 429 status, use Redis for state, clients get X-RateLimit headers" | All assumptions explicit |
| **5.0** | "Add rate limiting to the API endpoint" | Assumptions: per what unit? which backend? which response? |
| **2.0** | "Make it faster" | All assumptions implicit |

#### **JSON Schema for Tier 1**

```javascript
// mock-data/tier-1-spectrum.cjs
const tier1Prompts = [
  {
    id: "vague-001",
    category: "vagueness",
    prompt: "Write a function that validates email addresses",
    expected_gate_action: "warn",  // major severity
    expected_severity_max: "major",
    expected_clarity_score: 3.5,
    ambiguity_dimensions: {
      vagueness: 7,           // on 0-10 scale (high = vague)
      scope: 4,
      output_spec: 6,
      context: 3,
      implicit_assumptions: 5,
    },
    expected_findings: {
      clarity: {
        blocker: 0,
        major: 2,
        minor: 1,
      },
      security: {
        blocker: 0,
        major: 0,
        minor: 1,
      },
    },
  },
  // ... 24 more prompts
];
```

### 1.2 Real-World Prompt Categories (4 Categories × 3 Clarity Levels)

#### **Bug Fix Prompts**

```javascript
{
  id: "bugfix-ambiguous",
  category: "bug_fix",
  prompt: "Fix the login bug",
  expected_severity_max: "blocker",
  issues: [
    "What is the bug? (symptom, stack trace, user report?)",
    "Which login flow? (OAuth? API key? Session-based?)",
    "What should the fix do? (throw? retry? log?)",
  ],
}
```

#### **Feature Addition Prompts**

```javascript
{
  id: "feature-ambiguous",
  category: "feature",
  prompt: "Add user authentication",
  expected_severity_max: "major",
  issues: [
    "Which auth method? (OAuth? SAML? username/password?)",
    "Success criteria? (what counts as 'secure'?)",
    "Scale? (10 users? 10M users?)",
  ],
}
```

#### **Refactoring Prompts**

```javascript
{
  id: "refactor-ambiguous",
  category: "refactor",
  prompt: "Refactor this code for better performance",
  expected_severity_max: "major",
  issues: [
    "Why performance? (latency? throughput? memory?)",
    "What's the baseline? (current speed?)",
    "Constraints? (can't change API? can't modify database?)",
  ],
}
```

#### **Integration Prompts**

```javascript
{
  id: "integration-ambiguous",
  category: "integration",
  prompt: "Integrate with the payment API",
  expected_severity_max: "major",
  issues: [
    "Which API? (Stripe? PayPal? Square?)",
    "Which version? (API v3 vs. v4?)",
    "Error handling? (retry? backoff? webhook?)",
  ],
}
```

---

## Phase 2: Tier 2 Mock Data — Stress Tests (Week 2)

### 2.1 Cascading Refinements (Measure Score Improvement)

Track how clarity score improves as prompts are refined:

```javascript
{
  id: "cascade-001",
  category: "refinement_chain",
  iterations: [
    {
      round: 0,
      prompt: "Write a function to validate emails",
      expected_score: 3.5,
      expected_findings_count: 4,
    },
    {
      round: 1,
      prompt: "Write a Python function to validate email addresses using regex pattern ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$. Return True if valid, False otherwise.",
      expected_score: 6.8,
      expected_findings_count: 2,
      improvements: ["Added language", "Added output format", "Added specific regex"],
    },
    {
      round: 2,
      prompt: "Write a Python function validate_email(email: str) -> bool that validates email addresses:\n1. Use regex: ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$\n2. Reject if email is None or len < 3\n3. Return True if valid, False if invalid or malformed\n4. Raise ValueError if type is not string",
      expected_score: 8.9,
      expected_findings_count: 0,
    },
  ],
}
```

### 2.2 Parallel Ambiguity (Same Task, Different Descriptions)

Same underlying task described with different clarity levels:

```javascript
{
  id: "parallel-calc",
  task: "Calculate discount price",
  versions: [
    {
      version: "vague",
      prompt: "Discount the price",
      expected_score: 1.5,
    },
    {
      version: "medium",
      prompt: "Apply a discount to the price if quantity >= 10",
      expected_score: 5.0,
    },
    {
      version: "clear",
      prompt: `Apply tiered discounts to price:
- Quantity 1-9: 0% discount
- Quantity 10-49: 10% discount
- Quantity 50+: 20% discount
Return: final_price: float
Constraint: minimum price never goes below $0.01`,
      expected_score: 9.2,
    },
  ],
}
```

### 2.3 Real SWE-Bench Style Scenarios

Adapt actual GitHub issues into mock prompts:

```javascript
{
  id: "swe-bench-style-001",
  source: "django/django#issue-12345",
  task_type: "bug_fix",
  prompt: `Fix Django QuerySet.filter() to handle empty lists correctly.
Current behavior: .filter(id__in=[]) returns all objects
Expected: .filter(id__in=[]) should return zero objects
Repo: django/django
File: django/db/models/query.py
Relevant test: tests/db/models/test_query.py::test_empty_filter_in`,
  expected_difficulty: "medium",
  expected_scope_ambiguity: 2,
  expected_context_richness: 9,
}
```

---

## Phase 3: Tier 3 Mock Data — Comprehensive Benchmarking (Week 3)

### 3.1 HumanEval-Style Mini Suite (10 Problems)

Adapt HumanEval problems with varying clarity:

```javascript
const humanEvalMini = [
  {
    id: "he-001-vague",
    source: "HumanEval #0 (fibonacci)",
    prompt: "Write a fibonacci function",
    expected_score: 2.5,
    issues: ["Missing: input type", "Missing: which definition (0,1 or 1,1)?", "Missing: output format"],
  },
  {
    id: "he-001-clear",
    prompt: `Implement function fibonacci(n: int) -> int:
- Input: n >= 0
- Returns: nth Fibonacci number (0-indexed: fib(0)=0, fib(1)=1)
- Formula: fib(n) = fib(n-1) + fib(n-2) for n >= 2
- Performance: O(n) time acceptable, O(n^2) not acceptable`,
    expected_score: 8.8,
  },
];
```

### 3.2 MBPP-Style Entry-Level Suite (20 Problems)

Python problems at multiple clarity levels:

```javascript
const mbppMini = [
  {
    id: "mbpp-style-001",
    task: "Check if list is palindrome",
    vague: "Check if the list is a palindrome",
    clear: `Write is_palindrome(lst: list) -> bool:
- Input: list of comparable elements
- Returns: True if lst == lst[::-1], False otherwise
- Edge cases: empty list returns True
- Performance: O(n) time, O(1) space (in-place check)`,
  },
];
```

### 3.3 SWE-Bench Adapted Scenarios (15 Real Issues)

```javascript
{
  id: "swe-bench-mini-001",
  repo: "matplotlib/matplotlib",
  issue_title: "Add support for log scale with zero values",
  prompt: `Fix matplotlib to handle log scale with zero values.
Issue: When plotting with yscale='log', values <= 0 cause errors
Expected: Filter or warn about zero/negative values, don't crash
File: matplotlib/scale.py
Tests: tests/test_scale.py::test_log_scale_with_zeros
Related: #issue-54321`,
  difficulty: "medium",
  expected_findings: {
    clarity: "good",
    testing: "needs_work",
    security: "ok",
  },
}
```

---

## Phase 4: Stress Tests — What Breaks/Shines

### 4.1 Edge Cases That Stress Scoring

```javascript
const stressTests = [
  {
    id: "stress-001-multilingual",
    prompt: "Écrivez une fonction pour calculer la somme d'une liste",
    expected_behavior: "Detect non-English, warn on clarity",
  },
  {
    id: "stress-002-code-embedded",
    prompt: `Fix this bug:
\`\`\`javascript
function sum(arr) {
  return arr.reduce((a,b) => a+b, 0)
}
\`\`\`
It breaks when arr is undefined.`,
    expected_behavior: "Clarity should improve because context present",
  },
  {
    id: "stress-003-extremely-vague",
    prompt: "X",
    expected_behavior: "System should handle gracefully",
  },
  {
    id: "stress-004-specification-overload",
    prompt: "[100 lines of detailed requirements + complex decision matrix]",
    expected_behavior: "System should still parse, may flag as low-priority",
  },
  {
    id: "stress-005-contradictions",
    prompt: "Write code that is both maximally performant and highly readable. Must be fewer than 5 lines but thoroughly documented.",
    expected_behavior: "Detect contradictory requirements",
  },
  {
    id: "stress-006-ambiguous-scope-and-vague-verbs",
    prompt: "Optimize the thing to improve stuff using whatever you think is best",
    expected_behavior: "Multiple major findings",
  },
];
```

### 4.2 Performance Stress Tests

```javascript
const performanceTests = [
  {
    id: "perf-001-concurrent-reviews",
    test: "Submit 100 prompts in parallel, verify scoring still valid",
    measurement: "Latency, accuracy consistency",
  },
  {
    id: "perf-002-very-long-prompt",
    prompt: "[10,000 word requirements document]",
    test: "Verify system handles gracefully, clarity score reasonable",
  },
  {
    id: "perf-003-weight-thrashing",
    test: "Apply/revert weight changes 50 times, verify history integrity",
    measurement: "Weight-history.jsonl correctness, hash validity",
  },
];
```

### 4.3 Learning System Stress (Phase 2-3 validation)

```javascript
const learningTests = [
  {
    id: "learn-001-precision-tracking",
    test: "Run 50 reviews, accept/reject randomly, verify precision calculated",
    expected: "precision metric converges to ~0.5 (random accepts)",
  },
  {
    id: "learn-002-weight-adaptation",
    test: "Mark security findings as always correct (100% precision), others 0%, run adapt",
    expected: "Security weight increases, others decrease",
  },
  {
    id: "learn-003-coverage-detection",
    test: "Mark one reviewer as contributing 0 accepted findings for 100 reviews",
    expected: "coverage_ratio → 0, flagged as low coverage",
  },
  {
    id: "learn-004-rejection-reason-tracking",
    test: "Mark findings with rejection_reason='deferred' vs 'invalid'",
    expected: "precision_strict > precision (deferred excluded from denominator)",
  },
];
```

---

## Phase 5: Human Local Testing Plan

### 5.1 Setup Script

```bash
#!/bin/bash
# scripts/setup-mock-testing.sh

echo "Setting up mock data testing environment..."

# 1. Create mock data directory
mkdir -p mock-data/{tier-1,tier-2,tier-3,stress}

# 2. Generate all test fixtures
node scripts/generate-mock-data.cjs

# 3. Create audit log baseline (empty, ready for injection)
mkdir -p logs
rm -f logs/*.jsonl

# 4. Run hello world demo
echo "Running hello world test..."
node tests/hello-world-demo.test.cjs

# 5. Ready for manual testing
echo "✓ Setup complete. Ready for testing."
echo ""
echo "Quick start commands:"
echo "  npm test -- hello-world         # Run demo"
echo "  node scripts/inject-mock-reviews.cjs tier-1"
echo "  node index.cjs --stats          # See results"
```

### 5.2 Interactive Testing Workflow

User runs:
```bash
# Step 1: Inject Phase 1 data
node scripts/inject-mock-reviews.cjs --tier 1 --count 50
# Creates 50 mock reviews in logs/ with variety of clarity levels

# Step 2: Check scoring
node index.cjs --stats
# Output: Shows distribution of scores, reviewers, patterns

# Step 3: Verify learning system
node adapt.cjs 30
# Shows: Precision per role, suggests weight changes

# Step 4: Apply weights and see impact
node adapt.cjs 30 --apply
# Updates config.json, writes weight-history.jsonl

# Step 5: Check impact
node adapt.cjs --history
# Shows: Before/after precision for each role

# Step 6: Run specific stress test
node scripts/run-stress-test.cjs --test multilingual
node scripts/run-stress-test.cjs --test code-embedded
```

### 5.3 Metrics Dashboard (Human Observation)

Create `scripts/test-dashboard.cjs`:

```bash
node scripts/test-dashboard.cjs
```

Output:
```
═══════════════════════════════════════════════════════════════
  MOCK DATA TEST DASHBOARD
═══════════════════════════════════════════════════════════════

Phase 1: Tier 1 Spectrum Coverage
  ✓ Vagueness dimension (5 prompts)     Score distribution: 0.5→9.5
  ✓ Scope ambiguity dimension (5)       Coverage: Narrow→Broad
  ✓ Output spec dimension (5)           Detection: 100%
  ✓ Context dimension (5)               Finding count: 1→8
  ✓ Implicit assumptions (5)            Accuracy: 94%
  ✓ Bug fixes (3 clarity levels)        Pass gate check: 3/3
  ✓ Features (3 clarity levels)         Expected findings: ✓
  ✓ Refactoring (3 clarity levels)      Coverage: 100%
  ✓ Integration (3 clarity levels)      Correlation: 0.92

Phase 2: Cascading Refinements
  Round 1: score 3.5 → findings 4       Gate action: warn
  Round 2: score 6.8 → findings 2       Gate action: proceed
  Round 3: score 8.9 → findings 0       Gate action: proceed
  ✓ Score improvement: 5.4 points       Monotonic: ✓

Phase 3: Parallel Ambiguity
  Same task, 3 descriptions             Score spread: 1.5→9.2
  Version 1 (vague): 1.5                Finding accuracy: 96%
  Version 2 (medium): 5.0               Severity distribution: ✓
  Version 3 (clear): 9.2                Correlation: Strong

Phase 4: SWE-Bench Scenarios
  15 adapted issues tested              All parsed successfully
  Difficulty detection: Medium          Finding count average: 3.2
  Issue context richness: 9/10          Gate recommendations: Accurate

Stress Tests
  ✓ Multilingual prompt               System: Handled gracefully
  ✓ Code-embedded context             Score improvement: +2.1
  ✓ Extremely vague (1 char)          Fallback behavior: OK
  ✓ Specification overload (100 lines) Parse time: 245ms
  ✓ Contradictory requirements        Contradiction detection: ✓
  ✓ Concurrent submissions (100)       Consistency: 99.2%
  ✓ Very long prompt (10K words)       No timeout, score: 6.3
  ✓ Weight thrashing (50 cycles)       Hash integrity: ✓

Learning System Validation
  ✓ Precision tracking                 Converged to 0.51 (expected 0.5)
  ✓ Weight adaptation                  Security weight: 1.0 → 2.8 ✓
  ✓ Coverage detection                 Low-coverage flagged correctly
  ✓ Rejection reason tracking          precision_strict > precision ✓

═══════════════════════════════════════════════════════════════
OVERALL: 54/54 tests passed | System ready for production
═══════════════════════════════════════════════════════════════
```

### 5.4 "Gotcha" Tests (Known Failure Modes to Catch)

```javascript
const gotchas = [
  {
    id: "gotcha-001-hash-tampering",
    description: "Manually edit audit log entry, verify hash fails",
    command: "node scripts/tamper-test.cjs --edit-entry 0 --change-score 10",
    expected: "verifyAuditEntry() returns false, entry skipped",
  },
  {
    id: "gotcha-002-float-precision",
    description: "Run weight adaptation, verify precision_strict handles division by zero",
    command: "node scripts/inject-mock-reviews.cjs --invalid-rejected 0 --proposed 5",
    expected: "precision_strict = 1.0 (no invalid rejections), no NaN",
  },
  {
    id: "gotcha-003-dominant-role-detection",
    description: "Manually set one reviewer weight to 10.0, others 0.1",
    command: "echo '{\"security\":10,\"clarity\":0.1}' | node scripts/set-weights.cjs",
    expected: "renderReviewBlock() shows fairness warning",
  },
];
```

---

## Phase 6: Continuous Validation (Long-term)

### 6.1 Monthly Benchmarking

```bash
#!/bin/bash
# scripts/monthly-benchmark.sh

MONTH=$(date +%Y-%m)
echo "Running monthly benchmark for $MONTH..."

# 1. Generate fresh mock data with seasonal variation
node scripts/generate-mock-data.cjs --month $MONTH --variation seasonal

# 2. Run full suite
npm test

# 3. Generate report
node scripts/benchmark-report.cjs --output reports/$MONTH-benchmark.json

# 4. Compare to previous month
node scripts/compare-benchmarks.cjs reports/$(date -d'1 month ago' +%Y-%m)-benchmark.json reports/$MONTH-benchmark.json

# 5. Alert if regression
```

### 6.2 Effectiveness Metrics

Track over time:
- Score distribution (should show clear separation between vague/clear)
- Gate accuracy (major findings caught before full review)
- Learning curve (weight adaptation improves accuracy)
- Precision convergence (theoretical vs. actual)

---

## Implementation Order

```
Week 1: Tier 1
├─ Hello world (Day 1)
├─ Vagueness spectrum (Day 1-2)
├─ Real-world categories (Day 2-3)
└─ Inject & validate (Day 3)

Week 2: Tier 2
├─ Cascading refinements (Day 1)
├─ Parallel ambiguity (Day 2)
├─ SWE-Bench scenarios (Day 2-3)
└─ Stress tests (Day 3)

Week 3: Tier 3
├─ HumanEval mini (Day 1)
├─ MBPP mini (Day 1-2)
├─ Comprehensive benchmarking (Day 2-3)
└─ Dashboard & reporting (Day 3)

Ongoing:
└─ Monthly validation, human testing, gotcha tracking
```

---

## File Structure

```
mock-data/
├─ tier-1/
│  ├─ vagueness-spectrum.cjs      (5 prompts)
│  ├─ scope-ambiguity.cjs         (5 prompts)
│  ├─ output-spec.cjs             (5 prompts)
│  ├─ context-richness.cjs        (5 prompts)
│  ├─ implicit-assumptions.cjs    (5 prompts)
│  └─ real-world-categories.cjs   (12 prompts × 3 clarity levels)
├─ tier-2/
│  ├─ cascading-refinements.cjs   (10 scenarios)
│  ├─ parallel-ambiguity.cjs      (8 scenarios)
│  ├─ swe-bench-adapted.cjs       (15 scenarios)
│  └─ hello-world-demo.cjs
├─ tier-3/
│  ├─ humaneval-mini.cjs          (10 problems)
│  ├─ mbpp-mini.cjs               (20 problems)
│  └─ comprehensive-suite.cjs
├─ stress/
│  ├─ edge-cases.cjs
│  ├─ performance.cjs
│  ├─ learning-system.cjs
│  └─ gotchas.cjs
scripts/
├─ generate-mock-data.cjs
├─ inject-mock-reviews.cjs
├─ run-stress-test.cjs
├─ test-dashboard.cjs
├─ benchmark-report.cjs
├─ tamper-test.cjs
└─ monthly-benchmark.sh
tests/
├─ hello-world-demo.test.cjs
├─ tier-1-validation.test.cjs
├─ tier-2-validation.test.cjs
└─ tier-3-validation.test.cjs
```

---

## Success Criteria

✅ **Hello World**: Single test demonstrates full pipeline in <1s
✅ **Tier 1 Spectrum**: All 5 dimensions clearly separated (r² > 0.85)
✅ **Cascading Refinements**: Score improves monotonically, findings decrease
✅ **Stress Tests**: All edge cases handled without crashing
✅ **Learning System**: Weight adaptation correlates with precision improvement
✅ **Dashboard**: User can see all metrics in single view
✅ **Gotchas**: All known failure modes detectable and recoverable

---

## User Experience

```bash
$ npm run mock-data:demo
✓ Hello world demo passed (1.2s)

$ npm run mock-data:tier1
  ✓ Vagueness spectrum (50 reviews injected)
  ✓ Scope ambiguity (50 reviews injected)
  ✓ Output spec (50 reviews injected)
  ✓ Context richness (50 reviews injected)
  ✓ Implicit assumptions (50 reviews injected)
  ✓ Real-world categories (150 reviews injected)
  Total: 350 mock reviews, 200 findings tracked

$ node index.cjs --stats
[See comprehensive dashboard]

$ node adapt.cjs 30
[Suggest weight changes based on mock data]

$ npm run stress-tests
✓ All 6 stress tests passed
✓ System handled 100 concurrent submissions
✓ Performance within limits

$ npm run test-dashboard
[Visual overview of all validation]
```

This is comprehensive, gradual, and proves the tool works at every level.
