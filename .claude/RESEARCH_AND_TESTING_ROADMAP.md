# AI Agent "Hello World", Benchmarking, and Local Testing Roadmap

## Executive Summary

This document ties together:
1. **AI Agent Hello World patterns** — What canonical tests look like
2. **Academic benchmarks** — How existing systems measure code generation quality
3. **Prompt ambiguity metrics** — How to detect and classify vagueness
4. **Mock data strategy** — How to stress test prompt-review systematically
5. **Human local testing plan** — How to run real validation locally

**Status:** ✅ Research complete, hello world demo working, ready to implement tiers

---

## Part 1: AI Agent "Hello World" Patterns

### What It Means

AI agent "hello world" = **simplest test that demonstrates the entire system end-to-end**.

For prompt-review, this is **the email validation prompt** that shows:
- System detects vagueness
- Gate blocks/warns on ambiguity
- Scoring correlates with clarity
- Learning system tracks iterations

### Our Implementation

**Hello World:** Email validation prompt across 3 clarity levels

```
V1 (Vague):   "Write a function that validates email addresses"
              → Score: 3.5, Severity: major, Gate: warn
              → 5 findings across clarity, security, testing

V2 (Medium):  "Write Python function using regex pattern [...], return bool [...]"
              → Score: 6.8, Severity: minor, Gate: proceed
              → 2 findings (improved by 3)

V3 (Clear):   "Write validate_email(email: str) -> bool with exact spec [...]"
              → Score: 8.9, Severity: nit, Gate: proceed
              → 1 finding (improved by 1)
```

**Demo Status:** ✅ PASSING
- All 8 validation tests pass
- Shows score progression 3.5 → 6.8 → 8.9
- Finding count decreases monotonically
- Gate actions predictable and correct

**Run it:**
```bash
node tests/hello-world-demo.test.cjs
# Output: PASSED ✓ (8/8 tests)
```

---

## Part 2: Benchmarking Foundations

### Academic Benchmarks Reviewed

| Benchmark | Relevance | Key Finding |
|-----------|-----------|---|
| **HumanEval** | Low complexity baseline | 164 simple problems; doesn't capture real ambiguity |
| **MBPP** | Entry-level patterns | 974 Python problems; shows ambiguity is detectable |
| **CodeXGLUE** | Multi-task diversity | 10 tasks across 14 datasets; emphasizes prompt diversity |
| **SWE-bench** | Real-world complexity | 500 real GitHub issues; difficulty tied to scope ambiguity |
| **SWE-bench Verified** | Gold standard | 500 human-validated; shows 15-60 min tasks clearest |
| **TAU-bench** | Tool use | Shows agentic systems need clear scope |

### Key Research Findings

1. **SpecFix Study (May 2025):** 43.58% of code generation prompts need repair
   - Improvement when repaired: 30.9% in Pass@1
   - Repairs transfer across models: 10.48% improvement on other LLMs
   - **Implication:** Ambiguity detection directly improves outcomes

2. **Ambiguous Questions Study (NeurIPS 2024):** 86.25% detection accuracy possible
   - Path kernel methods work well
   - Multiple valid interpretations = high ambiguity
   - **Implication:** Vagueness is detectable and measurable

3. **Real-World SWE-Bench Analysis:** Scope ambiguity = difficulty predictor
   - 15-60 min tasks: Clear performance separation between models
   - 4+ hour tasks: Only SOTA solves
   - **Implication:** Clear prompts correlate with solvability

### Our Relevance

prompt-review sits at the **input side** of this pipeline:
- **Before:** Vague prompt → ambiguous code generation → bugs
- **Our role:** Detect and help clarify before generation
- **After:** Clearer prompt → better code generation → fewer bugs

---

## Part 3: Prompt Ambiguity Detection

### The 5 Dimensions of Ambiguity

Based on research, we test across these dimensions:

#### **1. Vagueness** (Imprecise verbs, undefined terms)
```
Vague:   "Fix the bug"
Clear:   "Fix login failure: password reset endpoint returns 401 instead of 302 redirect"
```

#### **2. Scope Ambiguity** (Undefined boundaries)
```
Vague:   "Improve authentication"
Clear:   "Add 2FA to login: SMS verification, max 3 attempts, 5-min expiry"
```

#### **3. Output Specification** (What should be produced)
```
Vague:   "Return success or failure"
Clear:   "Return { success: bool, error: string | null, data: User | null }"
```

#### **4. Context Richness** (Background information)
```
Vague:   "Refactor the pricing"
Clear:   "Refactor calculatePrice() to use PricingService v2.1 API (see docs/...)"
```

#### **5. Implicit Assumptions** (Unstated requirements)
```
Vague:   "Make it faster"
Clear:   "Reduce latency to < 100ms (p99), using Redis caching, not SQL changes"
```

### Detection Heuristics

Clarity reviewer currently detects:
- ✅ Vague verbs (optimize, improve, fix, clean up without measurable criteria)
- ✅ Missing output format
- ✅ Ambiguous scope
- ✅ Missing success criteria
- ✅ Implicit assumptions

**Score interpretation:**
- 0–3: Poor (entirely vague)
- 4–6: Needs work (significant ambiguity)
- 7–9: Good (minor improvements)
- 10: Excellent (precise and specific)

---

## Part 4: Mock Data Strategy

### 3-Phase Implementation

**Phase 1: Tier 1 (Basic Coverage)**
- 5 ambiguity dimension scenarios (5 prompts each) = 25 base prompts
- 4 real-world categories × 3 clarity levels = 12 prompts
- Total: ~350 mock reviews when injected
- **Expected outcome:** All dimensions clearly separated (r² > 0.85)

**Phase 2: Tier 2 (Stress Tests)**
- Cascading refinements (show score improvement)
- Parallel ambiguity (same task, different descriptions)
- SWE-bench adapted scenarios (15 real GitHub issues)
- **Expected outcome:** Monotonic score improvement, findings decrease

**Phase 3: Tier 3 (Comprehensive Benchmarking)**
- HumanEval-style mini suite (10 problems)
- MBPP-style entry-level suite (20 problems)
- Comprehensive benchmarking dashboard
- **Expected outcome:** Complete validation across all metrics

### File Structure

```
mock-data/
├─ hello-world.cjs                 # ✅ READY
├─ tier-1/
│  ├─ vagueness-spectrum.cjs       # (TODO: implement)
│  ├─ scope-ambiguity.cjs          # (TODO: implement)
│  └─ ...
├─ tier-2/
│  ├─ cascading-refinements.cjs    # (TODO: implement)
│  └─ ...
└─ tier-3/
   ├─ humaneval-mini.cjs           # (TODO: implement)
   └─ ...

scripts/
├─ inject-mock-reviews.cjs         # (TODO: implement)
├─ run-stress-test.cjs             # (TODO: implement)
├─ test-dashboard.cjs              # (TODO: implement)
└─ ...
```

### What Gets Generated

When you run the mock data generation:
```bash
node scripts/generate-mock-data.cjs

# Output:
# - 350 audit log entries (Phase 1)
# - 50+ review findings
# - Varied clarity scores (0.5 → 10)
# - Multiple severity levels
# - Realistic rejection patterns
```

---

## Part 5: Local Testing Plan

### Quick Start (30 minutes)

```bash
# 1. Run hello world (already works!)
node tests/hello-world-demo.test.cjs
# Output: PASSED ✓ (demonstrates entire system)

# 2. (TODO) Generate Tier 1 mock data
node scripts/generate-mock-data.cjs --tier 1

# 3. (TODO) Inject into audit logs
node scripts/inject-mock-reviews.cjs --tier 1 --count 50

# 4. Check system sees data
node index.cjs --stats
# Output: [Dashboard showing 50 reviews, distributions, metrics]

# 5. Verify learning system
node adapt.cjs 30
# Output: [Precision per role, suggested weight changes]

# 6. See the full dashboard
node scripts/test-dashboard.cjs
# Output: [Visual summary: all tests passed, what works, what doesn't]
```

### Comprehensive Testing (2-3 hours)

**Day 1: Tier 1 Validation**
- Run all 5 dimension scenarios
- Verify clarity score separation (r² > 0.85)
- Check gate accuracy (major findings caught)
- Output: `results/tier-1-validation.json`

**Day 2: Tier 2 Stress Tests**
- Run cascading refinements (score improves monotonically)
- Run parallel ambiguity (same task, different clarity)
- Run SWE-bench adapted issues (realistic scenarios)
- Output: `results/tier-2-validation.json`

**Day 3: Tier 3 Benchmarking**
- Run HumanEval mini suite (10 problems)
- Run MBPP mini suite (20 problems)
- Run comprehensive benchmarking
- Output: `results/tier-3-validation.json` + `results/benchmark-report.html`

### Metrics Dashboard

**Target Output:**

```
═══════════════════════════════════════════════════════════════
  MOCK DATA TEST DASHBOARD
═══════════════════════════════════════════════════════════════

Phase 1: Tier 1 Spectrum Coverage
  ✓ Vagueness dimension (5 prompts)     Score: 0.5-9.5
  ✓ Scope ambiguity (5 prompts)         Coverage: 100%
  ✓ Output spec (5 prompts)             Finding accuracy: 96%
  ✓ Context richness (5 prompts)        Gate detection: Perfect
  ✓ Implicit assumptions (5 prompts)    Correlation: 0.94

Phase 2: Cascading Refinements
  ✓ V1→V2 improvement: +2.8 points
  ✓ V2→V3 improvement: +2.1 points
  ✓ Total improvement: ~5.5 points

Phase 3: Benchmarking
  ✓ HumanEval suite: 10/10 parsed
  ✓ MBPP suite: 20/20 parsed
  ✓ SWE-bench adapted: 15/15 accurate

Stress Tests
  ✓ Edge cases: 6/6 handled
  ✓ Concurrent: 100 submissions, 99.2% consistent
  ✓ Learning system: Weight changes valid

═══════════════════════════════════════════════════════════════
OVERALL: 54/54 tests passed | System ready
═══════════════════════════════════════════════════════════════
```

### "Gotcha" Tests (Known Failure Modes)

Catch potential issues:

```bash
# Test 1: Hash tampering detection
node scripts/tamper-test.cjs --edit-entry 0 --change-score 10
# Expected: verifyAuditEntry() catches it, entry skipped

# Test 2: Division by zero in precision_strict
node scripts/inject-mock-reviews.cjs --invalid-rejected 0 --proposed 5
# Expected: No NaN, precision_strict = 1.0 (correct handling)

# Test 3: Dominant role detection
node scripts/stress-test.cjs --dominant-role security --weight 10
# Expected: Fairness warning in review output

# Test 4: Concurrent submissions
node scripts/stress-test.cjs --concurrent 100 --randomness
# Expected: All consistent, no race conditions
```

---

## Part 6: Recommended Execution Order

### Week 1: Foundation & Hello World
- ✅ **Done:** Hello world demo (passes)
- ✅ **Done:** Research and strategy (research complete)
- 📋 **Next:** Implement Tier 1 mock data generation
- 📋 **Next:** Implement injection script
- 📋 **Next:** Run first full cycle (generate → inject → validate)

### Week 2: Comprehensive Validation
- Tier 2 cascading refinements
- Tier 2 parallel ambiguity
- Tier 2 SWE-bench scenarios
- Stress tests (edge cases, performance)

### Week 3: Benchmarking & Reporting
- Tier 3 HumanEval suite
- Tier 3 MBPP suite
- Comprehensive benchmarking dashboard
- Generate final report

### Ongoing: Monthly Validation
- Run full suite monthly
- Track trends (scores, gate accuracy, learning system)
- Identify regressions
- Update mock data as tool evolves

---

## Part 7: Expected Benefits

### What We'll Prove

✅ **Clarity scores predict gate actions**
- Major findings → block/warn
- Minor findings → proceed
- Correlation r² > 0.85

✅ **System detects real ambiguity**
- Vague prompts (0–3) clearly separated from clear (8–10)
- Findings decrease monotonically with refinement
- Gate actions predictable

✅ **Learning system works**
- Weight adaptation improves precision
- Coverage metrics detect "plays it safe" reviewers
- Post-adaptation precision improves

✅ **System handles stress**
- 100 concurrent submissions
- 10,000 word prompts
- Edge cases (multilingual, code-embedded, contradictions)
- 50 weight change cycles

✅ **Reproducible across benchmarks**
- HumanEval-style problems work
- MBPP-style problems work
- SWE-bench real issues work
- Results transfer to user's real prompts

---

## Part 8: Files to Implement

**High Priority (Week 1):**
1. `scripts/generate-mock-data.cjs` — Create all tier 1 scenarios
2. `scripts/inject-mock-reviews.cjs` — Write audit log entries
3. `tests/tier-1-validation.test.cjs` — Verify all 5 dimensions
4. `scripts/test-dashboard.cjs` — Visual summary

**Medium Priority (Week 2):**
5. `mock-data/tier-2/*.cjs` — Cascading, parallel, SWE-bench scenarios
6. `scripts/run-stress-test.cjs` — Edge case harness
7. `tests/tier-2-validation.test.cjs` — Verify improvements

**Lower Priority (Week 3):**
8. `mock-data/tier-3/*.cjs` — HumanEval/MBPP suites
9. `scripts/benchmark-report.cjs` — Generate HTML report
10. `scripts/monthly-benchmark.sh` — Automated validation

---

## Part 9: Success Criteria

| Criterion | Target | Status |
|-----------|--------|--------|
| Hello world passes | 8/8 tests | ✅ DONE |
| Tier 1 separates dimensions | r² > 0.85 | 📋 TODO |
| Score improves monotonically | 0.5→9.5 over iterations | 📋 TODO |
| Gate accuracy | 95%+ | 📋 TODO |
| Stress tests pass | 20/20 edge cases | 📋 TODO |
| Learning system validates | Weight changes correlate with precision | 📋 TODO |
| Dashboard renders | All metrics visible | 📋 TODO |
| Monthly benchmark | Automated, trending | 📋 TODO |

---

## Summary: What You Have Now

✅ **Research:** Complete (HumanEval, MBPP, SWE-bench, SpecFix, ambiguity detection)
✅ **Strategy:** 6-phase implementation plan documented
✅ **Hello World:** Working demo (email validation, 3 clarity levels, 8/8 tests)
✅ **Roadmap:** Clear execution path for you to follow

## What's Next for You

1. **Implement Tier 1 generation** (Week 1)
   - Run `node scripts/generate-mock-data.cjs --tier 1`
   - Inject into audit logs
   - Run full validation
   - See first complete test cycle

2. **Add Tier 2 stress tests** (Week 2)
   - Cascading refinements
   - Parallel ambiguity
   - Real SWE-bench scenarios

3. **Comprehensive benchmarking** (Week 3)
   - HumanEval/MBPP suites
   - Dashboard reporting
   - Monthly automation

4. **Human local testing** (Ongoing)
   - Run test suite manually
   - Verify system behavior
   - Catch edge cases
   - Validate learning

---

## Files Reference

**Just Created:**
- `.claude/MOCK_DATA_STRATEGY.md` — Complete 6-phase plan
- `.claude/RESEARCH_AND_TESTING_ROADMAP.md` — This file
- `mock-data/hello-world.cjs` — ✅ Ready
- `tests/hello-world-demo.test.cjs` — ✅ Ready (PASSING)

**To Implement:**
- `scripts/generate-mock-data.cjs` — Generate Tier 1-3 data
- `scripts/inject-mock-reviews.cjs` — Write to audit logs
- `tests/tier-*.test.cjs` — Validation suites
- `scripts/test-dashboard.cjs` — Visual metrics
- `mock-data/tier-*/` — All scenario files

---

**Status:** Ready to execute. Start with Week 1 implementation.
