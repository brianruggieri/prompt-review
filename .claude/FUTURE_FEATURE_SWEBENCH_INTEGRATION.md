# Future Feature: SWE-bench Integration for Prompt Quality Validation

**Status:** Research & Design Phase
**Viability:** HIGH ✅
**Effort Estimate:** 2-3 weeks (MVP)
**Value Proposition:** Real-world validation of prompt quality using industry-standard benchmarks

---

## Executive Summary

**What:** Integrate SWE-bench (Software Engineering Benchmark) to measure whether prompt-review improvements help developers write code that passes real GitHub issues.

**Why:** Current validation uses synthetic test prompts (37 scenarios). SWE-bench provides 2,294 real GitHub issue-PR pairs from production Python repos—the gold standard for evaluating prompt quality in real-world contexts.

**How:** Run developers' prompts through SWE-bench problem sets, measure:
1. Whether the code they write passes the "failing tests"
2. Whether better prompts correlate with better solution quality
3. Which improvements most directly impact solvability

**ROI:** Direct correlation between prompt quality and ability to solve real problems—not just reviewer opinions.

---

## What is SWE-bench?

### Core Facts

| Aspect | Details |
|--------|---------|
| **Type** | Industry-standard benchmark for evaluating AI on real software engineering tasks |
| **Size** | 2,294 task instances from GitHub issues (12 popular Python repos) |
| **Format** | Issue description + failing tests → AI generates code fix → tests pass/fail |
| **Releases** | Original (2023): 2,294 problems; Verified (Aug 2024): 500 curated, hand-verified problems |
| **Success Rate** | OpenAI o1: 49.3% pass rate (as of 2024); Claude variants: ~25-35% pass rate |
| **Latest** | SWE-bench Multimodal (Jan 2025) adds code search + navigation capabilities |

### How It Works

```
1. Receive GitHub issue description (e.g., "Fix login button height bug")
2. Access failing test suite (tests that currently fail)
3. Modify codebase to resolve the issue
4. Run tests: FAIL_TO_PASS tests now pass? → SUCCESS
5. Verify: PASS_TO_PASS tests still pass (no regressions)
```

**Key insight:** It's not about code quality opinions—it's about whether the AI can actually *solve* the problem as verified by the original test suite.

---

## How It Fits with prompt-review

### Current System
```
User's prompt → 6 specialist reviewers → findings + composite score
                                        ↓
                                    Report (opinions)
```

### With SWE-bench Integration
```
User's prompt → 6 specialist reviewers → findings + composite score
                    ↓
        Suggested prompt improvements applied
                    ↓
         SWE-bench: Can the user solve real issues?
                    ↓
     Validation data: "This improvement +15% success rate"
```

### Three Use Cases

**1. Validation Dashboard** (Real-world feedback loop)
```
"Your prompt-review improvements have helped developers solve 23% more
real GitHub issues (measured on SWE-bench Verified)."
```

**2. Improvement Prioritization** (Which improvements matter most?)
```
Multi-factor trigger: +8% SWE-bench pass rate
Template safety: +12% SWE-bench pass rate
Clarity domain context: +3% SWE-bench pass rate
```

**3. Prompt A/B Testing** (Scientific validation)
```
Prompt A (baseline): 28% solve rate on SWE-bench Verified (100 problems)
Prompt B (improved): 35% solve rate on SWE-bench Verified (same 100)
                    → 25% relative improvement (statistically significant)
```

---

## Research Findings

### Who's Using SWE-bench?

| Organization | Approach | Notes |
|--------------|----------|-------|
| **OpenAI** | Evaluate Claude/GPT models on full SWE-bench | Published baseline data |
| **Anthropic** | Evaluate Claude variants | Tracking improvement across releases |
| **Cognition (Devin)** | SWE-agent system integrates SWE-bench | Real agent evaluation |
| **Modal Labs** | Cloud evaluation infrastructure for SWE-bench | Enables large-scale testing |
| **Researchers** | ICLR 2024 paper benchmarks | Academic validation |

**Nobody has directly integrated SWE-bench with prompt evaluation yet.** This is a novel opportunity.

### Known Integrations & Tools

**Evaluation Framework (from OpenAI/Epoch AI):**
- Bash execution tool
- Text editor tool (view/modify files)
- Patch application tool
- Test runner (pass/fail verification)
- Environment isolation (Docker)

**Data Format:**
- Parquet files on HuggingFace
- Fields: `problem_statement`, `repo`, `base_commit`, `patch`, `test_patch`, `FAIL_TO_PASS`, `PASS_TO_PASS`

---

## Proposed Integration Architecture

### Phase 1: MVP (Weeks 1-2)

**Scope:** Test if prompt improvements correlate with SWE-bench problem-solving ability.

```javascript
// scripts/swebench-validator.cjs (new module)

function loadSWEbenchProblems(limit = 50) {
  // Load from HuggingFace datasets library
  // Returns: [{ problem_statement, repo, base_commit, FAIL_TO_PASS, ... }, ...]
}

async function evaluatePromptOnSWEbench(prompt, problem, options) {
  // 1. Synthesize code based on prompt + problem
  // 2. Apply code changes to test environment
  // 3. Run FAIL_TO_PASS tests
  // 4. Return: { solved: true/false, pass_rate, findings }
}

async function runPromptAgainstSWEbench(prompt, options) {
  // Run a single prompt against 50 SWE-bench problems
  // Return: { success_rate, average_score, problem_correlation }
}

function correlateWithPromptQuality(swebench_results, prompt_review_data) {
  // Compare prompt-review scores with SWE-bench success rate
  // Return: correlation coefficient, insights
}
```

**Output:** Dashboard showing
- Prompt quality score (from prompt-review)
- Real-world solve rate (from SWE-bench)
- Correlation visualization

### Phase 2: Integration (Weeks 2-3)

**Add to batch validation:**
```bash
node scripts/validate-real-prompts.cjs batch 1 --with-swebench
# Runs batch 1 (100 prompts) AND evaluates against SWE-bench sample
```

**Update analysis:**
- Add SWE-bench pass rate to reports
- Show improvement effectiveness in real-world terms
- Track correlation over time

### Phase 3: Production (Week 3+)

**Full integration:**
- Continuous SWE-bench evaluation (background)
- Real-time feedback on prompt quality
- Predictor: "This prompt likely solves X% of GitHub issues"

---

## Technical Requirements

### Dependencies
- `huggingface-hub` (fetch SWE-bench dataset)
- Docker (run isolated test environments) *optional for MVP*
- Optional: `anthropic-sdk` (for actual code generation)

### Data Access
- HuggingFace token (free, public dataset)
- 50 problems from SWE-bench Verified = ~100MB dataset
- Store locally in `.claude/swebench-data/`

### Complexity
- **Medium:** Dataset handling + test execution
- **High if:** Using Docker for environment isolation
- **Low if:** Using pre-computed results or mock data

---

## Feasibility Assessment

### ✅ Viable Reasons

1. **SWE-bench is public & open** — Dataset freely available on HuggingFace
2. **No licensing issues** — Python repos in SWE-bench allow academic use
3. **Clear evaluation path** — Tests are self-contained (FAIL_TO_PASS)
4. **Precedent exists** — OpenAI, Cognition, and others already using it
5. **Scales well** — MVP can start with 50 problems, extend to 500
6. **Novel application** — Nobody using SWE-bench for *prompt evaluation* yet
7. **Integrates cleanly** — Fits into batch validation architecture

### ⚠️ Challenges

1. **Environment setup** — Requires Python + package isolation (Docker helpful but not required)
2. **API costs** — Full evaluation would require many Claude API calls (~$50-100 for 500 problems)
3. **Execution time** — 50 problems × 2-3 min per problem = ~2-3 hours per run
4. **Determinism** — LLM code generation isn't 100% reproducible; may need multiple runs
5. **Repository access** — Need to checkout specific commits from 12 Python repos

### 🎯 Mitigation Strategies

| Challenge | Solution |
|-----------|----------|
| Environment setup | Start with mock PASS/FAIL data; add Docker later |
| API costs | Use HuggingFace inference (free tier) or cached results |
| Execution time | Run async in background; cache results; use 50-problem subset |
| Reproducibility | Accept variance; report success rate as range (30-35%) |
| Repo access | Download repos once; version-control them locally |

---

## Design Questions to Answer Before Building

1. **Scope:** Start with 50 problems or all 500 (SWE-bench Verified)?
2. **Code execution:** Use actual code generation (Claude API) or mock test data?
3. **Environment:** Local Python + test runner, or Docker containers?
4. **Frequency:** Run SWE-bench eval on every batch, or separate scheduled job?
5. **Cost model:** Accept API costs, or rely on free HuggingFace inference?

---

## Example Future Report

```markdown
# Validation Report — Batch 1 + SWE-bench Analysis

## Prompt Review Score
Average: 7.8/10
Improvements fired: 5/7

## Real-World Problem-Solving (SWE-bench)
Evaluated on: 50 GitHub issues from popular Python repos
Success rate: 32% (16/50 issues solved)

## Correlation
Prompts scoring 8-10 in review: 38% SWE-bench success
Prompts scoring 6-7 in review: 28% SWE-bench success
Prompts scoring <6 in review: 15% SWE-bench success

**Insight:** Higher prompt-review scores strongly correlate with
real-world problem-solving ability (ρ = 0.67, p < 0.05)

## Improvement Impact (SWE-bench)
- Multi-factor trigger: +8% success rate
- Template safety: +5% success rate
- Clarity: +3% success rate

## Recommendation
Your prompts are in the top 35% for solving real GitHub issues.
Focus on clarity improvements next (+3% per issue solved = ~1.5 more solved).
```

---

## Next Steps

### If This Looks Good

1. **Week 1:** Spike on SWE-bench data access & format
2. **Week 2:** Build MVP with mock data (no actual code execution)
3. **Week 3:** Integrate with batch validation system
4. **Then:** Run on real data, measure correlation, publish findings

### Code Location

```
.claude/
├── FUTURE_FEATURE_SWEBENCH_INTEGRATION.md (this file)
├── swebench-spike.md                       (to be created)

scripts/ (future)
├── swebench-validator.cjs                  (to be implemented)
├── swebench-data-loader.cjs                (to be implemented)
└── tests/swebench-integration.test.cjs     (to be implemented)
```

---

## References

- [SWE-bench Official](https://www.swebench.com/original.html)
- [SWE-bench GitHub](https://github.com/SWE-bench/SWE-bench)
- [SWE-bench Dataset (HuggingFace)](https://huggingface.co/datasets/SWE-bench/SWE-bench)
- [SWE-bench Verified (OpenAI Blog)](https://openai.org/index/introducing-swe-bench-verified/)
- [Cognition SWE-agent Blog](https://cognition.ai/blog/swe-bench-technical-report)
- [ICLR 2024 Paper](https://arxiv.org/pdf/2310.06770)

---

## Decision

**Recommendation:** PROCEED with Phase 1 spike
**Rationale:** Novel application of SWE-bench, high validation value, feasible with MVP approach, no licensing blockers
**Timeline:** 2-3 weeks for MVP; can be done in parallel with other work

