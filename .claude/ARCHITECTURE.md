# prompt-review Architecture & Learning Flow

Complete visualization of the prompt-review plugin: single-run flows, multi-run learning loops, and knowledge evolution.

---

## Single-Run Flow (One Prompt Review)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PROMPT REVIEW PIPELINE                             │
└─────────────────────────────────────────────────────────────────────────────┘

USER INPUT
   │
   ├─ HOOK: Prompt submitted (CLI, editor hook, real-time plugin)
   │  └─ Trigger: "!!!" in context OR subscription mode OR API call
   │
   ├─ EXTRACT: Parse prompt, project context, stack
   │
   ├─ COMPUTE: SHA256 hash (first 12 hex chars) for deduplication/tracking
   │
   ▼

┌──────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: FAN-OUT REVIEWERS (Parallel Specialist Review)                     │
└──────────────────────────────────────────────────────────────────────────────┘

DETERMINE ACTIVE REVIEWERS (based on config + project type)
   │
   ├─ domain_sme       (business logic, requirements clarity)
   ├─ security         (auth, secrets, permissions, data protection)
   ├─ testing          (edge cases, test coverage, validation)
   ├─ clarity          (ambiguity, jargon, structure)
   ├─ frontend_ux      (UI/UX concerns - optional)
   ├─ documentation    (doc completeness - optional)
   │
   ▼ (ALL PARALLEL VIA Promise.all)

   EACH REVIEWER:
   ├─ Receives: prompt, previous findings (if any), project context
   ├─ Runs: LLM call with role-specific system prompt
   ├─ Returns: { findings: [{ finding_id, severity, issue, ... }], score: 0-10 }
   │
   ▼

COLLECT CRITIQUES: Array of { reviewer_role, findings, score, ... }

┌──────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: OPTIONAL DEBATE (If Conflicts Detected)                            │
│          [Only if debate.enabled=true AND conflicts exist]                   │
└──────────────────────────────────────────────────────────────────────────────┘

CONFLICT DETECTION: Scan critiques for contradictory operations
   │
   ├─ security says: "AddConstraint(no-env-access)"
   ├─ domain_sme says: "RemoveConstraint(no-env-access)" ← CONFLICT!
   │
   ▼

SELECT DEBATE PAIRS (max 2 pairs, choosing strongest conflicts)
   │
   ▼

DEBATE ROUND (for each pair):
   ├─ A's initial argument (2-3 sentences on their position)
   ├─ B's counter-argument (2-3 sentences on their position)
   ├─ A's rebuttal (address B's points)
   ├─ B's rebuttal (address A's points)
   │
   ▼

JUDGE EVALUATION (Claude Sonnet):
   ├─ Score each role's argument quality (0-10)
   ├─ Label argument strengths (specific, evidence-backed, etc.)
   ├─ Extract policy signal (insight for improving that role's prompt)
   ├─ Declare winner (role_a, role_b, or tie)
   │
   ▼

DEBATE LOG RECORDED (but does NOT alter merge output)

┌──────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: MERGE CRITIQUES (Composite Decision Making)                        │
└──────────────────────────────────────────────────────────────────────────────┘

COMPUTE COMPOSITE SCORE:
   ├─ Weight each reviewer by configured weight (e.g., security: 1.5)
   ├─ Higher weight = more influence on final score
   ├─ Weighted average across all reviewers
   │
   ▼

MERGE OPERATIONS (extract editing suggestions):
   ├─ Aggregate all findings into list of operations:
   │  ├─ AddGuardrail(description)
   │  ├─ RemoveConstraint(name)
   │  ├─ RephraseSentence(section, old, new)
   │  ├─ AddSection(title, content)
   │  └─ etc.
   │
   ├─ Prioritize by severity (blocker > important > minor)
   ├─ Deduplicate similar changes
   ├─ Resolve conflicts via debate winner (if debate ran)
   │
   ▼

FINAL FINDINGS LIST (ready for user approval/editing)

┌──────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: RENDER & PRESENT (User-Facing Output)                              │
└──────────────────────────────────────────────────────────────────────────────┘

BUILD EDITOR BLOCK:
   ├─ Formatted diff showing: [BEFORE] vs [AFTER] edits
   ├─ Organized by category (security, clarity, testing, etc.)
   ├─ Severity indicators (🔴 blocker, 🟡 important, 🟢 minor)
   ├─ Individual finding summaries with reviewer + reasoning
   │
   ▼

PRESENT TO USER:
   ├─ "Accept" — apply all changes to prompt
   ├─ "Edit" — review and customize changes before applying
   ├─ "Reject" — discard suggestions
   │
   ▼ (User interaction)

RECORD USER DECISION (outcome: approved|edited|rejected)

┌──────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: AUDIT LOG & LEARNING (Permanent Record)                            │
└──────────────────────────────────────────────────────────────────────────────┘

WRITE AUDIT ENTRY:
   ├─ timestamp: ISO 8601
   ├─ project: project name
   ├─ original_prompt_hash: sha256(prompt)[0:12]
   ├─ reviewers_active: [domain_sme, security, ...]
   ├─ findings_detail: [{ reviewer_role, finding_id, severity, issue, op, target }]
   ├─ suggestions_accepted: [IDs of findings user approved]
   ├─ suggestions_rejected: [IDs of findings user rejected]
   ├─ reviewer_stats: { [role]: { proposed, accepted, rejected } }
   ├─ debate_log: { ran, pairs, judge_feedback, cost } (if debate ran)
   ├─ composite_score: 0-10 (overall quality)
   ├─ cost: { input_tokens, output_tokens, usd }
   ├─ duration_ms: execution time
   ├─ outcome: approved|edited|rejected
   └─ timestamp_finalized: when user made decision

FILE: ~/.claude/plugins/prompt-review/logs/YYYYMMDD.jsonl
(One JSON line per review)

┌──────────────────────────────────────────────────────────────────────────────┐
│                          END OF SINGLE RUN                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Multi-Run Learning Loop (Continuous Improvement)

```
WEEK 1-2: ACCUMULATION PHASE
┌────────────────────────────────┐
│  Run 1: Prompt for API v2      │
│  ├─ security: 8/10             │
│  ├─ testing: 5/10 ← needs work │
│  ├─ outcome: approved          │
│  └─ findings_accepted: [2]     │
└────────────────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Run 2: Prompt for webhook     │
│  ├─ security: 9/10             │
│  ├─ testing: 3/10 ← needs work │
│  ├─ outcome: edited            │
│  └─ findings_accepted: [1, 5]  │
└────────────────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Run 3: Prompt for scheduler   │
│  ├─ security: 7/10             │
│  ├─ testing: 4/10 ← needs work │
│  ├─ outcome: approved          │
│  └─ findings_accepted: [2, 3]  │
└────────────────────────────────┘
         │
         ▼
[... more runs accumulate ...]

AFTER 5+ REVIEWS WITH OUTCOMES:

┌──────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: ANALYSIS (via `node adapt.cjs` or `/prompt-review:adapt`)          │
└──────────────────────────────────────────────────────────────────────────────┘

READ AUDIT LOGS (last 30 days):
   │
   ├─ Find all entries with outcome (approved|edited|rejected)
   ├─ Extract findings_detail & reviewer_stats for each
   │
   ▼

COMPUTE REVIEWER EFFECTIVENESS:
   ├─ Per role, calculate:
   │  ├─ proposed: count of findings this role suggested
   │  ├─ accepted: count of findings user approved
   │  ├─ rejected: count of findings user rejected
   │  ├─ precision: accepted / proposed (0.0-1.0)
   │  └─ outcome_correlation: reviews with >=1 accepted AND outcome in (approved|edited)
   │
   ├─ Example results:
   │  ├─ security:    proposed=10, accepted=9, precision=0.90 ✓
   │  ├─ testing:     proposed=8,  accepted=2, precision=0.25 ✗ LOW
   │  ├─ clarity:     proposed=6,  accepted=1, precision=0.17 ✗ LOW
   │  └─ domain_sme:  proposed=12, accepted=10, precision=0.83 ✓
   │
   ▼

IDENTIFY OVER/UNDERPERFORMERS:
   ├─ HIGH precision roles (> 0.70): trusted, increase weight
   ├─ LOW precision roles (< 0.70): needs improvement, decrease weight
   │
   ▼

DISPLAY EFFECTIVENESS DASHBOARD:
   ├─ Shows: "Reviewer Effectiveness"
   ├─ Lists all roles with precision % and (accepted/proposed)
   ├─ Marks below-threshold with "← below threshold"
   │
   ▼ (Preview only, no changes yet)

┌──────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: WEIGHT ADAPTATION (via `node adapt.cjs --apply`)                   │
└──────────────────────────────────────────────────────────────────────────────┘

COMPUTE WEIGHT SUGGESTIONS:
   │
   ├─ For each reviewer with >= min_reviews (default: 5):
   │  ├─ new_weight = current_weight * (reviewer_precision / avg_precision)
   │  ├─ Clamp to [0.5, 3.0] range
   │  ├─ Round to 2 decimal places
   │  │
   │  ├─ Example:
   │  │  current: { security: 1.2, testing: 0.8, clarity: 0.9, domain_sme: 1.5 }
   │  │  avg_precision: (0.90 + 0.25 + 0.17 + 0.83) / 4 = 0.5375
   │  │  suggested: {
   │  │    security:    1.2 * (0.90 / 0.5375) = 2.01 → 2.0  (increase)
   │  │    testing:     0.8 * (0.25 / 0.5375) = 0.37 → 0.5  (clamped)
   │  │    clarity:     0.9 * (0.17 / 0.5375) = 0.28 → 0.5  (clamped)
   │  │    domain_sme:  1.5 * (0.83 / 0.5375) = 2.31 → 2.31 (increase)
   │  │  }
   │  │
   │
   ▼

APPLY CHANGES (if user confirms `--apply`):
   │
   ├─ Save previous weights to config.weights_history (FIFO, max 10)
   ├─ Write new weights to config.json
   ├─ NEXT RUN uses updated weights for composite scoring
   │
   ▼

EFFECT:
   ├─ Next 5+ reviews will show:
   │  ├─ security findings weighted MORE heavily (weight 2.0 vs 1.2)
   │  ├─ testing findings weighted LESS (weight 0.5 vs 0.8)
   │  ├─ clarity findings weighted LESS (weight 0.5 vs 0.9)
   │  └─ domain_sme findings weighted MORE (weight 2.31 vs 1.5)
   │
   ├─ Results:
   │  ├─ High-precision security reviews dominate → fewer false positives
   │  ├─ Low-precision testing/clarity reviews have less influence
   │  ├─ System gravitates toward reviewers that users actually approve
   │
   ▼

CONTINUOUS CYCLE:
   ├─ More reviews accumulate → more data for effectiveness analysis
   ├─ Can run `/prompt-review:adapt 60 --apply` every month
   ├─ Weights continuously improve based on user feedback
   ├─ System evolves toward YOUR preferences and patterns

┌──────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: POLICY LEARNING (Offline Prompt Improvement)                       │
│         [Phase 3 only, gated behind debate.enabled=true]                    │
└──────────────────────────────────────────────────────────────────────────────┘

WHEN DEBATE IS ENABLED:
   │
   ├─ Each debate round produces judge feedback:
   │  ├─ argument_quality_score (0-10)
   │  ├─ argument_labels (["specific", "evidence-backed", ...])
   │  └─ policy_signal ("This role should emphasize X" or "Consider Y")
   │
   ├─ Judge feedback accumulated in debate_log
   ├─ Stored in audit entries for historical analysis
   │
   ▼

RUN POLICY ANALYSIS (via Python script, offline):
   │
   ├─ Aggregate debate feedback from last 30 days
   ├─ For each role:
   │  ├─ avg_argument_quality: average quality score across debates
   │  ├─ common_labels: most frequent argument labels
   │  ├─ policy_signal: common insights from judges
   │  └─ needs_update: if quality is low or signals are clear
   │
   ├─ Example output:
   │  ├─ security:
   │  │  ├─ avg_quality: 8.2/10
   │  │  ├─ labels: ["specific", "evidence-backed"]
   │  │  ├─ signal: "Maintain current calibration, very good"
   │  │  └─ needs_update: false
   │  │
   │  ├─ testing:
   │  │  ├─ avg_quality: 4.1/10
   │  │  ├─ labels: ["vague", "speculative"]
   │  │  ├─ signal: "Add specific examples to test case requirements"
   │  │  └─ needs_update: true
   │  │
   │
   ▼

GENERATE PROMPT PROPOSALS:
   │
   ├─ For roles marked needs_update:
   │  ├─ Read current SYSTEM_PROMPT from reviewers/<role>.cjs
   │  ├─ Send to Claude Sonnet with policy_signal + past quality feedback
   │  ├─ Sonnet proposes improved prompt
   │  └─ Write to reviewers/prompts/<role>.txt (human review required!)
   │
   ├─ NO automatic updates to .cjs files (safety first)
   ├─ Human must review proposal and decide to adopt
   │
   ▼

HUMAN REVIEW & ADOPTION:
   │
   ├─ Read reviewers/prompts/<role>.txt for proposal
   ├─ Compare with current reviewers/<role>.cjs
   ├─ If good: copy new content to .cjs file
   ├─ Commit & deploy
   │
   ├─ Effect:
   │  ├─ Testing role now emphasizes examples in its prompts
   │  ├─ Next reviews from testing are more specific
   │  ├─ User acceptance of testing findings increases
   │  └─ Cycle continues...
   │
   ▼

THE VIRTUOUS CYCLE:
   ├─ More reviews → better effectiveness data
   ├─ Better data → smarter weight adaptation
   ├─ Debates (if enabled) → quality insights
   ├─ Quality insights → improved role prompts
   ├─ Better prompts → higher user acceptance
   ├─ Higher acceptance → higher effectiveness scores
   ├─ The system continuously improves without code changes!

┌──────────────────────────────────────────────────────────────────────────────┘
│                  END OF LEARNING LOOP (Repeats Every Month)
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Knowledge Flow: How Learning is Captured & Applied

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE CAPTURE & EVOLUTION                             │
└──────────────────────────────────────────────────────────────────────────────┘

LAYER 1: RAW FINDINGS (Per-Review Data)
┌────────────────────────────────────────────────────────────────────────────┐
│ Audit Log Entry (findings_detail):                                         │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ {                                                                    │  │
│ │   "reviewer_role": "security",                                       │  │
│ │   "finding_id": "SEC-001",                                           │  │
│ │   "severity": "blocker",                                             │  │
│ │   "issue": "Prompt allows reading .env without validation",          │  │
│ │   "op": "AddGuardrail",                                              │  │
│ │   "target": "constraints"                                            │  │
│ │ }                                                                    │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│ ↓ (user clicks "accept" or "reject")                                      │
│ "suggestions_accepted": ["SEC-001", "TST-003"]                            │
│ "suggestions_rejected": ["CLR-005"]                                       │
│ ↓ (recorded in same audit entry via updateAuditOutcome)                   │
│ "reviewer_stats": {                                                       │
│   "security": { "proposed": 3, "accepted": 2, "rejected": 1 },            │
│   "testing": { "proposed": 2, "accepted": 1, "rejected": 0 }             │
│ }                                                                         │
└────────────────────────────────────────────────────────────────────────────┘

LAYER 2: PATTERN EXTRACTION (Across Multiple Reviews)
┌────────────────────────────────────────────────────────────────────────────┐
│ computeTopPatterns(entries) — Phase 1, stats.cjs:                          │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ Scans all findings_detail across 30-day window:                      │  │
│ │                                                                      │  │
│ │ Issue: "Missing error handling for async"                           │  │
│ │   ├─ Run 1: testing found it (rejected)                             │  │
│ │   ├─ Run 2: testing found it (accepted)                             │  │
│ │   ├─ Run 3: testing found it (accepted)                             │  │
│ │   ├─ Run 4: domain_sme found it (accepted)                          │  │
│ │   ├─ Run 5: testing found it (rejected)                             │  │
│ │   └─ Aggregate: 5 total, 3 accepted, 2 rejected                     │  │
│ │                                                                      │  │
│ │ Result: "Missing error handling" is a TOP PATTERN (5 occurrences)   │  │
│ │         Especially from testing (appears 4/5 times)                 │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│ ↓ (displayed in `node index.cjs --stats`)                                 │
│ Top Patterns:                                                             │
│   1. "Missing error handling for async" — 5 occurrences (testing: 4)     │
│   2. "Unclear requirement language" — 4 occurrences (clarity: 4)         │
│   3. "Missing input validation" — 3 occurrences (security: 3)            │
└────────────────────────────────────────────────────────────────────────────┘

LAYER 3: EFFECTIVENESS METRICS (Reviewer Performance)
┌────────────────────────────────────────────────────────────────────────────┐
│ computeReviewerEffectiveness(entries) — Phase 2, stats.cjs:               │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ Per-reviewer aggregation of reviewer_stats:                          │  │
│ │                                                                      │  │
│ │ security:                                                            │  │
│ │   ├─ proposed: 12 findings across all reviews                        │  │
│ │   ├─ accepted: 10 findings user approved                             │  │
│ │   ├─ rejected: 2 findings user rejected                              │  │
│ │   └─ precision: 10/12 = 0.83 (83%)                                   │  │
│ │                                                                      │  │
│ │ testing:                                                             │  │
│ │   ├─ proposed: 8 findings                                            │  │
│ │   ├─ accepted: 2 findings                                            │  │
│ │   ├─ rejected: 6 findings                                            │  │
│ │   └─ precision: 2/8 = 0.25 (25%) ← LOW!                              │  │
│ │                                                                      │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│ ↓ (displayed in dashboard + used for weight adaptation)                   │
│ Dashboard:                                                                 │
│   Reviewer Effectiveness                                                  │
│     security:    precision 0.83  (10/12 accepted)                         │
│     testing:     precision 0.25  (2/8 accepted)  ← below threshold        │
│     clarity:     precision 0.33  (2/6 accepted)  ← below threshold        │
└────────────────────────────────────────────────────────────────────────────┘

LAYER 4: WEIGHT ADAPTATION (System Recalibration)
┌────────────────────────────────────────────────────────────────────────────┐
│ computeWeightSuggestions(reviewerMetrics, currentWeights) — Phase 2:       │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ Before:  { security: 1.0, testing: 1.0, clarity: 1.0, ... }         │  │
│ │                                                                      │  │
│ │ Effectiveness: security 0.83, testing 0.25, clarity 0.33             │  │
│ │ avg_precision: (0.83 + 0.25 + 0.33) / 3 = 0.47                      │  │
│ │                                                                      │  │
│ │ Suggested weights:                                                   │  │
│ │   security:  1.0 * (0.83 / 0.47) = 1.77 (increase — high precision) │  │
│ │   testing:   1.0 * (0.25 / 0.47) = 0.53 (decrease — low precision)  │  │
│ │   clarity:   1.0 * (0.33 / 0.47) = 0.70 (decrease — low precision)  │  │
│ │                                                                      │  │
│ │ After (if --apply): { security: 1.77, testing: 0.53, clarity: 0.70 }│  │
│ │                                                                      │  │
│ │ Saved to: config.json + config.weights_history                      │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│ ↓ (affects composite_score calculation in next runs)                      │
│ Next runs composite_score = weighted average using new weights:           │
│   BEFORE: (8 + 5 + 7 + 6) / 4 = 6.5                                      │
│   AFTER:  (8×1.77 + 5×0.53 + 7×0.70 + 6×1.0) / (1.77+0.53+0.70+1.0)     │
│        = (14.16 + 2.65 + 4.9 + 6.0) / 4.0 = 6.93                         │
│   ↑ Security pulls up score; testing/clarity have less influence          │
└────────────────────────────────────────────────────────────────────────────┘

LAYER 5: DEBATE INSIGHTS (Quality Signals for Prompt Evolution)
┌────────────────────────────────────────────────────────────────────────────┐
│ Judge Feedback — Phase 3, judge.cjs (if debate.enabled=true):             │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ Debate between security and testing over:                            │  │
│ │   Conflict: Should prompts allow env variable access?               │  │
│ │                                                                      │  │
│ │ Judge feedback:                                                      │  │
│ │ ├─ security:                                                        │  │
│ │ │  ├─ argument_quality_score: 8.2/10                                 │  │
│ │ │  ├─ argument_labels: ["specific", "evidence-backed"]              │  │
│ │ │  └─ policy_signal: "Excellent calibration. Maintain current       │  │
│ │ │                     emphasis on least-privilege principle."        │  │
│ │ │                                                                    │  │
│ │ └─ testing:                                                         │  │
│ │    ├─ argument_quality_score: 4.1/10                                 │  │
│ │    ├─ argument_labels: ["vague", "speculative", "missing examples"] │  │
│ │    └─ policy_signal: "Add concrete test case examples to your       │  │
│ │                       arguments. Currently too abstract."            │  │
│ │                                                                      │  │
│ │ Stored in: audit_log.debate_log.judge_feedback                      │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│ ↓ (aggregated offline via policy analysis)                                │
│ computePolicyInsights(days):                                              │
│   testing:                                                                │
│     ├─ avg_argument_quality: 4.1/10                                       │
│     ├─ common_labels: ["vague", "speculative"]                           │
│     ├─ policy_signal: "Add examples to test requirement descriptions"    │
│     └─ needs_update: true                                                │
└────────────────────────────────────────────────────────────────────────────┘

LAYER 6: PROMPT EVOLUTION (Policy Learning Output)
┌────────────────────────────────────────────────────────────────────────────┐
│ generatePromptProposal() — Phase 3, policy.cjs:                            │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ Input:                                                               │  │
│ │   current SYSTEM_PROMPT (from reviewers/testing.cjs):               │  │
│ │   "Identify gaps in test coverage, suggest test cases..."           │  │
│ │                                                                      │  │
│ │   policy_signal: "Add concrete test case examples to arguments"     │  │
│ │   avg_quality: 4.1/10 (needs improvement)                           │  │
│ │                                                                      │  │
│ │ → Send to Claude Sonnet with context                                │  │
│ │                                                                      │  │
│ │ Output (Proposed SYSTEM_PROMPT):                                    │  │
│ │   "Identify gaps in test coverage. Suggest SPECIFIC test cases     │  │
│ │    with examples: include setup, assertion, expected output.       │  │
│ │    Always reference specific lines or code patterns from the       │  │
│ │    prompt that your test would validate..."                         │  │
│ │                                                                      │  │
│ │ Written to: reviewers/prompts/testing.txt (human review required)   │  │
│ │ NOT automatically written to reviewers/testing.cjs (safety!)        │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│ ↓ (human decides to adopt proposal)                                       │
│ Developer approves proposal:                                              │
│   ├─ Read reviewers/prompts/testing.txt                                  │
│   ├─ Compare with reviewers/testing.cjs                                  │
│   ├─ Copy new content to testing.cjs                                     │
│   ├─ Commit & deploy                                                     │
│                                                                           │
│ Next run with improved testing prompt:                                    │
│   ├─ Testing role suggests: "Add test case: describe API response       │
│   │   when database returns 500 error. Assert client retries or         │
│   │   logs error appropriately."                                         │
│   ├─ Much more specific than before!                                     │
│   ├─ User more likely to accept (precision increases)                    │
│   ├─ Positive feedback loop begins                                       │
│   └─ Cycle repeats...                                                    │
└────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                     KNOWLEDGE LOOP SUMMARY                               │
└──────────────────────────────────────────────────────────────────────────┘

Raw Data (findings per review)
            ↓
Pattern Recognition (top issues across reviews)
            ↓
Effectiveness Metrics (reviewer performance)
            ↓
Weight Adaptation (recalibrate importance)
            ↓
Debate Insights (quality signal from judge)
            ↓
Prompt Evolution (improve reviewer instructions)
            ↓
Better Recommendations (next review cycle)
            ↓
Higher User Acceptance
            ↓
Better Effectiveness Metrics (feedback loop)
            ↓
MORE WEIGHT on effective reviewers
            ↓
[CYCLE REPEATS — System continuously improves without code changes]
```

---

## Three-Phase Learning System Overview

```
PHASE 1: AUDIT LOGGING (Foundation)
├─ What: Record detailed findings, reviewer stats, user decisions
├─ Why: Need data to learn from
├─ Output: Audit logs with findings_detail + acceptance tracking
├─ Impact: Enables all downstream learning features
└─ Status: ✅ SHIPPED (Phase 1)

PHASE 2: GEA REFLECTION (Continuous Adaptation)
├─ What: Analyze audit logs, compute reviewer effectiveness, adapt weights
├─ Why: System should trust high-precision reviewers more
├─ Output: Weight suggestions + stats dashboard
├─ Command: `node adapt.cjs [days] [--apply]`
├─ Skill: `/prompt-review:adapt`
├─ Impact: Next runs use better weights automatically
└─ Status: ✅ SHIPPED (Phase 2)

PHASE 3: COMAS DEBATE (Offline Policy Learning)
├─ What: Debate conflicts, judge quality, extract policy signals
├─ Why: Disagreements are learning opportunities
├─ Output: Debate logs + judge feedback + prompt proposals
├─ Config: debate.enabled (default: false, opt-in)
├─ Impact: Reviewer prompts improve, higher quality suggestions
└─ Status: ✅ SHIPPED (Phase 3)
```

---

## Directory Structure & File Locations

```
~/git/prompt-review/
├─ index.cjs                   # Main entry point (hook/skill handlers, runFullPipeline)
├─ orchestrator.cjs            # Fan-out logic (runReviewersApi)
├─ editor.cjs                  # Merge logic (mergeCritiques, computeCompositeScore)
├─ renderer.cjs                # Presentation (renderEditingBlock)
├─ cost.cjs                    # PHASE 1: Audit logging, outcome tracking
├─ stats.cjs                   # Analytics dashboard (generateStats, PHASE 2: effectiveness)
├─ reflection.cjs              # PHASE 2: generateReflectionReport, computeWeightSuggestions
├─ adapt.cjs                   # PHASE 2: CLI tool (previewAdaptation, applyAdaptation)
├─ debate.cjs                  # PHASE 3: selectDebatePairs, runDebatePhase
├─ judge.cjs                   # PHASE 3: runJudge, feedback extraction
├─ policy.cjs                  # PHASE 3: readCurrentSystemPrompt, generatePromptProposal
├─ config.json                 # Configuration (reviewer weights, debate settings, reflection settings)
├─ reviewers/                  # LLM prompts for each specialist role
│  ├─ security.cjs             # Security-focused SYSTEM_PROMPT
│  ├─ testing.cjs              # Testing-focused SYSTEM_PROMPT
│  ├─ clarity.cjs              # Clarity-focused SYSTEM_PROMPT
│  ├─ domain-sme.cjs           # Domain expertise SYSTEM_PROMPT
│  ├─ frontend-ux.cjs          # Frontend/UX SYSTEM_PROMPT (optional)
│  ├─ documentation.cjs        # Documentation SYSTEM_PROMPT (optional)
│  └─ prompts/                 # PHASE 3: Human-reviewable prompt proposals (gitignored)
│     ├─ testing.txt           # Proposed SYSTEM_PROMPT for testing role (auto-generated)
│     └─ [other roles].txt     # Other role proposals
├─ logs/                       # PHASE 1: Audit logs (gitignored)
│  ├─ 20240225.jsonl           # Feb 25 reviews (one JSON line per review)
│  ├─ 20240226.jsonl           # Feb 26 reviews
│  └─ [YYYYMMDD].jsonl         # One file per day
├─ skills/
│  ├─ review/SKILL.md          # /prompt-review:review skill (fan-out review)
│  ├─ stats/SKILL.md           # /prompt-review:stats skill (show dashboard)
│  └─ adapt/SKILL.md           # /prompt-review:adapt skill (preview/apply weights)
├─ .claude/                    # Agent-facing documentation
│  ├─ CLAUDE.md                # Development rules
│  ├─ ARCHITECTURE.md          # This file
│  ├─ phase-1-audit-logging.md # Phase 1 spec
│  ├─ phase-2-gea-reflection.md# Phase 2 spec
│  └─ phase-3-comas-debate.md  # Phase 3 spec
├─ tests/                      # All test files (12 tests, all passing)
│  ├─ run.cjs                  # Test runner
│  ├─ audit-schema.test.cjs    # Phase 1 tests (5)
│  ├─ reflection.test.cjs      # Phase 2 tests (6)
│  ├─ adapt.test.cjs           # Phase 2 tests (5)
│  ├─ debate.test.cjs          # Phase 3 tests (5)
│  ├─ judge.test.cjs           # Phase 3 tests (3)
│  └─ policy.test.cjs          # Phase 3 tests (3)
├─ package.json                # npm config
├─ .nvmrc                      # Node version (22)
├─ .gitignore                  # Ignore logs/, reviewers/prompts/, node_modules/
├─ config.json                 # Configuration (weights, reflection settings, debate settings)
└─ README.md                   # (To be created) User-facing documentation

~/.claude/plugins/prompt-review/   # Symlink to ~/git/prompt-review (for Claude Code)
```

---

## How the Learning System Scales

```
Week 1:  5 reviews → 2 days of data → insufficient for adaptation (need >=5)
Week 2:  10 reviews → 7 days of data → can analyze patterns, suggest weights
Week 3:  15 reviews → 14 days of data → strong data for weight adaptation
Week 4:  20+ reviews → 30 days of data → stable metrics, ready to apply

Monthly cadence:
  ├─ Day 1-30: Accumulate reviews
  ├─ Day 31: Run `node adapt.cjs 30` to preview weight suggestions
  ├─ Day 32: Review suggestions, decide on adoption
  ├─ Day 33: Run `node adapt.cjs 30 --apply` if desired
  ├─ Day 34+: Next month's reviews use improved weights
  └─ Repeat

With debate enabled (optional):
  ├─ Debates accumulate judge feedback
  ├─ Monthly: Run policy analysis to identify prompt improvements
  ├─ Offline: Sonnet generates prompt proposals
  ├─ Manual: Human reviews and adopts improvements
  ├─ Effect: Reviewer prompts evolve based on actual usage patterns
  └─ Virtuous cycle: better prompts → better suggestions → higher acceptance
```

---

## Key Insights

1. **Audit logs are everything** — Phase 1 creates the foundation. Without detailed findings_detail + acceptance tracking, nothing else works.

2. **Weights adapt to user behavior** — The system doesn't need to "know" which reviewer is best. It learns from watching which reviewers the user actually approves.

3. **Debate is optional but powerful** — With debate disabled, you still get weight adaptation. With debate enabled, you also get prompt evolution.

4. **No code changes needed for improvement** — All three phases improve the system without modifying the codebase. You just change config.json or deploy new reviewer prompts.

5. **The feedback loop closes** — User decision (accept/reject) → effectiveness metric → weight adjustment → better next time. It's a self-improving system.

6. **Safety through human review** — Policy proposals go to .txt files for human review before touching .cjs. Debate doesn't affect merge output.

7. **Deterministic learning** — All math is deterministic (no randomness), so weight adaptation is reproducible and debuggable.
