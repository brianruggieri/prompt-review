# prompt-review

**A self-improving multi-specialist prompt review system for Claude Code.**

Automatically review your prompts for clarity, security, testing completeness, and domain requirements using parallel AI specialists. The system learns from your decisions and continuously improves its feedback.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-12%2F12%20passing-brightgreen)](./tests/)
[![Claude SDK](https://img.shields.io/badge/Claude-SDK%20%3E%3D0.30.0-blueviolet)](https://github.com/anthropics/anthropic-sdk-python)

---

## What It Does

`prompt-review` is a Claude Code plugin that reviews your prompts with a team of specialist LLM reviewers. Instead of a single generic review, you get structured feedback from security, testing, clarity, and domain experts—all working in parallel.

The system doesn't just review once. It tracks which suggestions you accept or reject, learns your preferences, and **adapts its review weights over time** to better match your needs. Optionally, it can engage reviewers in structured debates when they disagree, using an LLM judge to extract quality signals that improve future reviews.

### Key Features

- **Clarity Gate** — Pre-screening runs only the Clarity reviewer first, rejecting/warning on ambiguous prompts before full review (saves time & resources)
- **Parallel Specialist Review** — Six specialist roles evaluate your prompt simultaneously (security, testing, clarity, domain expertise, UX, documentation)
- **Adaptive Learning** — System learns from your accept/reject decisions and reweights reviewer importance accordingly
- **Conflict Resolution** — Optional debate mode when reviewers disagree, with LLM judge extracting quality insights
- **Zero Dependencies** — CommonJS, Node.js built-ins only, no framework overhead
- **Comprehensive Testing** — 16 passing tests covering all features and edge cases
- **Local Audit Trail** — Full review history stored locally with findings, stats, and outcomes

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  YOUR PROMPT                                                │
│  (submitted via hook or skill)                              │
└────────────────┬────────────────────────────────────────────┘
                 │
        ┌────────▼────────┐
        │  FAN-OUT        │
        │  6 Specialists  │ (parallel)
        └────────┬────────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
  ┌──▼──┐   ┌───▼───┐   ┌──▼──┐
  │Security       │Testing     │Clarity
  └──┬──┘         └───┬───┘    └──┬──┘
     │               │            │
     │        ┌──────▼──────┐     │
     │        │   DEBATE    │ (optional, if conflicts)
     │        │  [Judge]    │     │
     │        └──────┬──────┘     │
     │               │            │
     └───────────────┼────────────┘
                     │
            ┌────────▼────────┐
            │  MERGE          │
            │  Composite      │
            │  Findings       │
            └────────┬────────┘
                     │
        ┌────────────▼────────────┐
        │  PRESENT DIFF           │
        │  (User accepts/edits)   │
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────┐
        │  AUDIT LOG              │
        │  (findings + stats +    │
        │   user decision)        │
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────────────┐
        │  LEARNING SYSTEM (runs monthly) │
        │  ├─ Phase 1: Analyze metrics   │
        │  ├─ Phase 2: Adapt weights     │
        │  └─ Phase 3: Improve prompts   │
        └────────────────────────────────┘
```

### Clarity Gate (Optional Pre-Screening)

By default, the system uses a **two-stage review process**:

1. **Stage 1: Clarity Gate** (fast, 5-10 seconds)
   - Runs only the Clarity reviewer
   - Checks for ambiguity, vagueness, undefined terms
   - Blocks prompts with **blocker** severity
   - Warns on **major** severity (user can choose to refine or proceed)
   - Proceeds to full review on **minor/nit** severity

2. **Stage 2: Full Review** (30-40 seconds if gate passes)
   - All 6 specialist reviewers run in parallel
   - Merge findings and present diff to user

**Why the gate?** Saves time and resources by catching vague prompts early. A prompt like "do stuff with stuff" gets rejected at the gate with a clear message: "Please specify what 'stuff' is and what you want to do." The user refines it, and the second attempt passes the gate and gets the full review.

**Configuration:**
```json
{
  "clarity_gate": {
    "enabled": true,
    "strict_mode": false,
    "reject_on": ["blocker"],
    "warn_on": ["major"],
    "auto_refine": true,
    "show_reasoning": true
  }
}
```

To disable the gate, set `enabled: false` in `config.json`.

### The Three-Phase Learning System

The tool continuously improves through three integrated learning phases:

#### Phase 1: Audit Logging
Records detailed findings from each review with acceptance/rejection tracking. This creates the data foundation for all learning.

```json
{
  "timestamp": "2026-02-25T09:15:30Z",
  "reviewers_active": ["security", "testing", "clarity"],
  "findings_detail": [
    {
      "reviewer_role": "security",
      "severity": "blocker",
      "issue": "Prompt allows reading .env file",
      "op": "AddGuardrail"
    }
  ],
  "suggestions_accepted": ["SEC-001"],
  "suggestions_rejected": ["CLR-003"],
  "outcome": "approved",
  "composite_score": 7.8
}
```

#### Phase 2: GEA Reflection (Adaptive Weights)
Analyzes your acceptance patterns and automatically reweights reviewers based on their precision:

```bash
$ node adapt.cjs 30

Reviewer Effectiveness (last 30 days)
  security      precision 0.91  (10/11 accepted)  ← trusted
  testing       precision 0.25  (2/8 accepted)   ← below threshold
  clarity       precision 0.44  (4/9 accepted)   ← below threshold
  domain_sme    precision 0.83  (5/6 accepted)   ← trusted

Weight Suggestions:
  security:      1.0 → 1.77 (↑ increase)
  testing:       1.0 → 0.53 (↓ decrease)
  clarity:       1.0 → 0.70 (↓ decrease)
  domain_sme:    1.0 → 1.58 (↑ increase)

Apply changes? [y/n]
```

Next reviews automatically use improved weights, resulting in better recommendations.

#### Phase 3: CoMAS Debate (Policy Learning)
When reviewers disagree, a structured debate extracts quality signals that improve reviewer prompts:

```
Debate: Security vs Testing on environment variable handling

Security's argument:  "Env vars are attack vectors. Every access should
                       be validated against a whitelist."

Testing's counter:    "Exact? But developers need flexible access
                       during testing phases."

Judge's feedback (to Security):
  Quality: 8.2/10
  Signals: "Your precision is excellent. Maintain current calibration."

Judge's feedback (to Testing):
  Quality: 4.1/10
  Signals: "Add specific test examples to arguments. Currently too vague."
```

Policy proposals are written to `reviewers/prompts/<role>.txt` for human review before adoption. No automatic changes to code.

---

## Scoring System & Validation

### Understanding Composite Scores

Each review produces a **composite score** (0–10) combining individual specialist scores:

```
composite = Σ(score_i × weight_i) / Σ(weight_i)
```

**Example:** Security scores 8.0 (weight 1.2), Clarity scores 6.5 (weight 1.0):
```
composite = (8.0 × 1.2 + 6.5 × 1.0) / (1.2 + 1.0) = 7.32 / 10
```

### Score Interpretation

| Range | Meaning | Action |
|-------|---------|--------|
| **0–3** | Poor | Prompt is entirely vague or ambiguous |
| **4–6** | Needs Work | Significant issues affecting output quality |
| **7–9** | Good | Minor improvements possible |
| **10** | Excellent | Precise verbs, clear scope, output specified |

### What Affects Scores?

Each specialist rates on different criteria:

- **Security** (weight 2.0): Is authentication, encryption, input validation addressed?
- **Testing** (weight 1.5): Are acceptance criteria and test cases defined?
- **Domain SME** (weight 1.5): Does the prompt match domain best practices?
- **Documentation** (weight 1.0): Are output formats and usage documented?
- **UX** (weight 1.0, conditional): If UI/component involved—accessibility, responsiveness?
- **Clarity** (weight 1.0): Is scope defined? Are outputs specified? Are terms unambiguous?

Higher-weight reviewers (security, testing) have more influence on the composite.

### Validating Score Accuracy

**Run a calibration check:**

```bash
node adapt.cjs 30 --benchmark
```

This compares your current adapted weights against equal weighting (all 1.0). Shows which specialist roles have highest real impact on acceptance rate.

**Check post-adaptation impact:**

```bash
node adapt.cjs --history
```

Shows before/after precision for each weight change. Helps verify whether adapted weights actually improved feedback quality.

### How Precision Is Measured

**Precision** = `accepted findings / proposed findings`

Example: If Security found 5 issues and user accepted 3:
```
precision = 3 / 5 = 0.60 (60%)
```

**Important limitations:**
- Does NOT measure recall (how many issues Security missed)
- Does NOT measure finding importance (all findings weighted equally)
- May be influenced by user accepting findings for reasons other than correctness

**For better precision signals, look at:**

1. **Acceptance rate by severity**
   - Major findings: What % of "blocker" findings did users actually fix?
   - Minor findings: What % of "nit" suggestions were helpful?

2. **Coverage ratio** (recall proxy)
   - In what % of reviews did this reviewer find at least one accepted issue?
   - Low coverage + high precision = "plays it safe" (risky pattern)

3. **Rejection reason** (when tracked)
   - "invalid" — Finding was wrong (true precision miss)
   - "deferred" — Valid but out of scope (not precision miss)
   - "conflict" — Conflicted with another finding (not precision miss)

### Fairness & Bias Detection

If one specialist dominates (>40% of composite score), you'll see a warning:

```
⚠ Fairness: Security dominates composite (>40%)
```

This means one reviewer's opinion outweighs the others. To rebalance:

```bash
# Check contribution share
node index.cjs --stats

# Then adjust weights in config.json:
"weights": {
  "security": 1.2,    # was 2.0, reduce
  "clarity": 1.2      # was 1.0, increase
}
```

### Running Evaluations

**Check system health over last 30 days:**

```bash
node adapt.cjs 30
```

Shows:
- Reviews analyzed
- Precision per role
- Weight suggestions based on performance

**See historical trends:**

```bash
node index.cjs --stats
```

Shows:
- Score trend by week
- Most common issues
- Reviewer effectiveness
- Acceptance rates by severity

---

## Quick Start

### 1. Installation (1 minute)

```bash
# Install the plugin
cp -r ~/.claude/plugins/prompt-review ~/git/prompt-review
cd ~/git/prompt-review

# Activate Node.js
source ~/.nvm/nvm.sh && nvm use

# Verify it works
npm test
# Output: 12 passed, 0 failed, 12 total
```

### 2. First Review (30 seconds)

Use the `/prompt-review:review` skill in Claude Code:

```
/prompt-review:review
```

Submit a prompt with `!!!` at the end:

```
Write a function that validates email addresses. It should:
- Check for proper format (RFC 5322)
- Verify domain exists via DNS
- Return detailed error messages
!!!
```

You'll see:

```
📋 Prompt Review Results

Security (8/10):
  🔴 BLOCKER: No rate limiting on DNS checks
    Add a cache or request throttle to prevent DoS

Testing (4/10):
  🟡 IMPORTANT: No mention of test cases
    Suggest testing: invalid formats, timeout handling, unicode domains

Clarity (6/10):
  🟡 IMPORTANT: "Verify domain exists" is vague
    Clarify: synchronous vs async? cached? timeout threshold?

Domain SME (9/10):
  ✓ Good requirements

Composite Score: 6.75/10

Accept changes? [Accept] [Edit] [Reject]
```

### 3. Learn From Your Decisions

Over the next month, accept 5+ reviews and the system will adapt:

```bash
# See effectiveness metrics
node index.cjs --stats

# Preview weight changes (dry run)
node adapt.cjs 30

# Apply improvements
node adapt.cjs 30 --apply
```

Your next reviews will use improved weights, better matching your preferences.

---

## Understanding Triggers: Hook vs Skill vs API

The `!!!` trigger has three different behaviors depending on how you invoke it. Understanding these modes is key to using the tool effectively.

### Hook Mode (Automatic)

When you type a prompt in Claude Code with `!!!` at the end:

```
Write a function that validates email addresses !!!
```

**What happens:**
1. The hook automatically triggers on any message (UserPromptSubmit)
2. Claude receives instructions to run `/prompt-review:review` skill
3. You see a notification to proceed with review
4. You must explicitly invoke the skill to start

**Key points:**
- ✓ Automatic trigger (you don't need to do anything)
- ✓ Works in all modes (no API key needed)
- ✓ Safe and predictable (never executes code without your approval)
- ✗ Requires manual skill invocation (not truly automatic execution)
- ✗ Cannot run full async pipeline (uses subscription mode)

### Skill Mode (Manual)

When you explicitly invoke the skill with a prompt:

```
/prompt-review:review "Write a function that validates email addresses"
```

**What happens:**
1. You explicitly request the review
2. If `ANTHROPIC_API_KEY` is set and `config.mode='api'`, reviewers run in parallel and complete inline
3. If no API key or `config.mode='subscription'`, you see instructions to use the skill
4. Full debate mode can run if conflicts are detected (Phase 3)

**Key points:**
- ✓ Explicit, clear intent
- ✓ Can use API mode if configured
- ✓ Full async pipeline available
- ✗ Manual invocation (you must remember to use it)

### API Mode (Full Async)

When you have `ANTHROPIC_API_KEY` set and `config.mode='api'`:

```bash
export ANTHROPIC_API_KEY="sk-..."
node index.cjs "Write a function that validates email addresses"
```

**What happens:**
1. All 6 reviewers run in parallel
2. Results are merged with conflict detection
3. Optional: Debate phase runs if conflicts exist
4. Full output (refined prompt + findings) is returned
5. Review is logged to audit trail

**Key points:**
- ✓ True async execution (all reviewers run in parallel)
- ✓ Full debate mode support
- ✓ Direct CLI/programmatic access
- ✗ Requires API key
- ✗ Not available via hook

### Mode Comparison Table

| Trigger | Mode | API Key | Execution | Debate | Best For |
|---------|------|---------|-----------|--------|----------|
| Hook | Subscription | Optional | Async (via Claude) | Yes* | Quick feedback while coding |
| Skill | Subscription | Optional | Async (via Claude) | Yes* | Explicit reviews without API key |
| Skill/CLI | API | Required | Sync (inline) | Yes | Full async pipeline in CI/automation |

*Debate mode available if conflicts detected; proposals logged for review

### Configuration

To control which mode is used, edit `~/.claude/plugins/prompt-review/config.json`:

```json
{
  "mode": "subscription",  // or "api" for full async
  "api_fallback": true,    // Fall back to subscription if no API key
  "reviewers": {
    "security": { "enabled": true, "conditional": false },
    ...
  }
}
```

**`mode` options:**
- `"subscription"` (default) — Use Claude Code's skill system for reviews
- `"api"` — Use direct async pipeline (requires ANTHROPIC_API_KEY)

---

## Installation

### Option 1: For Users (Recommended)

Install from Claude Code's plugin marketplace (when available).

### Option 2: For Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/prompt-review.git
cd prompt-review

# Install Node.js dependencies (optional, none required but SDK recommended)
npm install @anthropic-ai/sdk

# Activate the plugin in Claude Code
# In ~/.claude/plugins/prompt-review, create:
ln -s /path/to/prompt-review ~/.claude/plugins/prompt-review

# Verify installation
source ~/.nvm/nvm.sh && nvm use
npm test
```

### Option 3: Manual Integration

Copy the plugin directory to `~/.claude/plugins/prompt-review`:

```bash
cp -r prompt-review ~/.claude/plugins/prompt-review
```

The plugin auto-loads in Claude Code on next restart.

---

## Usage

### Basic Review (Hook)

Submit any prompt with `!!!` at the end:

```
I need a function that parses CSV files with:
- Comma and tab delimiters
- Header row detection
- Type inference for columns
- Memory efficiency for large files
!!!
```

The review runs automatically.

### Skills

```bash
# Review current prompt
/prompt-review:review

# Show statistics and effectiveness dashboard
/prompt-review:stats

# Preview weight changes (Phase 2)
/prompt-review:adapt [days=30]

# Apply weight changes
/prompt-review:adapt 30 --apply
```

### CLI Commands

```bash
# Run tests
npm test

# Show statistics dashboard
node index.cjs --stats

# Preview adaptation (dry run)
node adapt.cjs
node adapt.cjs 60        # Use last 60 days
node adapt.cjs 30        # Use last 30 days

# Apply weight adaptation
node adapt.cjs --apply
node adapt.cjs 30 --apply

# Check review history
ls logs/
cat logs/20260225.jsonl  # See reviews from Feb 25
```

---

## Configuration

Edit `config.json` to customize reviewer behavior:

```json
{
  "scoring": {
    "weights": {
      "security": 1.0,
      "testing": 1.0,
      "clarity": 1.0,
      "domain_sme": 1.0,
      "frontend_ux": 0.8,
      "documentation": 0.6
    },
    "weights_history": []
  },
  "reflection": {
    "min_reviews_for_adaptation": 5,
    "precision_threshold": 0.70,
    "weight_clamp_min": 0.5,
    "weight_clamp_max": 3.0,
    "auto_adapt": false,
    "auto_adapt_interval_days": 30
  },
  "debate": {
    "enabled": false,
    "max_pairs": 2,
    "model": "claude-haiku-4-5",
    "judge_model": "claude-sonnet-4-6",
    "min_conflicts_to_trigger": 1
  }
}
```

### Key Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| `weights.*` | 0.6-1.0 | Importance of each reviewer (1.0 = baseline) |
| `min_reviews_for_adaptation` | 5 | Minimum reviews before weights adapt |
| `precision_threshold` | 0.70 | Flag reviewers below this acceptance % |
| `debate.enabled` | false | Enable optional debate and policy learning |
| `auto_adapt` | false | Automatically apply weight changes monthly |

---

## Real-World Examples

### Example 1: Security Issue Detection

**Prompt:**
```
Function to authenticate users. Accepts username/password,
compares to stored hash, returns auth token.
```

**Security Reviewer (8/10):**
```
🔴 BLOCKER: No constant-time comparison
  Use crypto.timingSafeEqual to prevent timing attacks

🔴 BLOCKER: Token generation not shown
  Specify: random? signed? expiration?

🟡 IMPORTANT: No rate limiting mentioned
  Add: max attempts, backoff, IP blocking
```

**User Result:** Accepts all 3 findings → Security marked as high-precision (0.89) → Weight increases to 1.65 over time

### Example 2: Learning From Your Preferences

**Month 1:** 8 reviews, security precision 0.75, testing precision 0.40
- System learns: you trust security more than testing
- Weights: security 1.2, testing 0.6

**Month 2:** 12 reviews with updated weights
- Reviews now emphasize security findings more
- You approve 85% of security findings
- Testing findings marked less important (less friction)
- Result: Better aligned with your preferences

### Example 3: Debate Resolution

**Conflict:** Security wants strict environment variable validation. Testing wants flexibility for mocking.

**Judge Output:**
- Security argument quality: 8.2/10 (specific, evidence-backed)
- Testing argument quality: 4.1/10 (vague, missing examples)
- Policy signal: "Testing role should add concrete examples to arguments"

**Outcome:** Proposal generated to improve testing prompt. Once adopted, testing arguments become more specific.

---

## Architecture

See [`ARCHITECTURE.md`](./.claude/ARCHITECTURE.md) for detailed system design including:

- Single-run flow (complete pipeline)
- Multi-run learning loop (how learning accumulates)
- Knowledge flow (data → patterns → metrics → adaptation)
- Three-phase system explanation with diagrams
- Detailed file structure and responsibilities

### System Layers

```
USER INTERFACE (hook + skills)
    ↓
PIPELINE (orchestrator, editor, renderer)
    ↓
LEARNING SYSTEM (audit logging → reflection → debate)
    ↓
CONFIGURATION (weights, reflection settings, debate config)
    ↓
AUDIT LOGS (local, gitignored, never shared)
```

### Core Modules

| Module | Purpose | Key Functions |
|--------|---------|---|
| `index.cjs` | Main entry point | handleHook, handleSkill, runFullPipeline |
| `orchestrator.cjs` | Fan-out logic | runReviewersApi (parallel specialist calls) |
| `editor.cjs` | Merge & scoring | mergeCritiques, computeCompositeScore |
| `cost.cjs` | Audit logging | writeAuditLog, updateAuditOutcome |
| `stats.cjs` | Analytics | generateStats, renderDashboard |
| `reflection.cjs` | Phase 2 | generateReflectionReport, computeWeightSuggestions |
| `adapt.cjs` | Phase 2 CLI | previewAdaptation, applyAdaptation |
| `debate.cjs` | Phase 3 | selectDebatePairs, runDebatePhase |
| `judge.cjs` | Phase 3 | runJudge, buildJudgePrompt |
| `policy.cjs` | Phase 3 | generatePromptProposal, computePolicyInsights |

---

## Performance & Costs

### Token Usage Per Review

Typical review with 4 reviewers:

```
FAN-OUT:        ~1,200 input tokens  + ~450 output tokens
MERGE:          ~  300 input tokens  + ~150 output tokens
JUDGE (optional): ~1,000 input tokens  + ~400 output tokens
─────────────────────────────────────────────────────────
TOTAL:          ~2,500 input tokens  + ~1,000 output tokens ≈ $0.05 per review
```

Audit logs track exact costs per review.

### Scalability

- Designed for 1-2 reviews per day per developer
- Audit logs accumulate ~30 reviews/month
- Reflection analysis takes <1 second
- Debate rounds run in parallel (2-4 seconds per pair)
- No external dependencies, runs locally

---

## Troubleshooting

### "No reviewers ran, all failed"

**Cause:** API key not configured or invalid
**Solution:** Set `ANTHROPIC_API_KEY` environment variable:
```bash
export ANTHROPIC_API_KEY="sk-..."
```

### "Cannot read findings_detail"

**Cause:** Audit logs from Phase 1 implementation
**Solution:** Ensure you're running the latest version:
```bash
cd ~/.claude/plugins/prompt-review
git pull origin main
npm test
```

### "Insufficient data" for adaptation

**Cause:** Fewer than 5 reviews with outcomes
**Solution:** Complete 5+ reviews and record your accept/reject decisions:
```bash
node adapt.cjs 30
# Will show: sufficient_data: false
# After 5 reviews with outcomes → sufficient_data: true
```

### "Weight changes don't affect reviews"

**Cause:** Changes applied but not yet in use
**Solution:** Weights take effect on next review cycle. Run:
```bash
node adapt.cjs 30 --apply
# Now run your next review to see updated weights in use
```

### "Debate proposals aren't being used"

**Cause:** `debate.enabled: false` (default)
**Solution:** Enable debate mode in `config.json`:
```json
{
  "debate": {
    "enabled": true
  }
}
```

Then review proposals in `reviewers/prompts/<role>.txt` before adopting.

---

## FAQ

**Q: Will this slow down my prompting workflow?**
A: No. Reviews are optional (triggered by `!!!` or skill). Without explicitly requesting a review, the plugin doesn't run.

**Q: Can it access my prompts outside review time?**
A: No. The plugin only runs when you explicitly trigger it. Audit logs are stored locally in `~/.claude/plugins/prompt-review/logs/` (gitignored).

**Q: What if I don't like the feedback?**
A: Reject it. Your rejections are tracked and influence future reviewer weights. The system learns your preferences.

**Q: Can I customize reviewer prompts?**
A: Yes. Edit files in `reviewers/` (security.cjs, testing.cjs, etc.). Changes take effect immediately.

**Q: What if reviewers keep disagreeing?**
A: Enable debate mode. The judge extracts quality signals that improve reviewer prompts over time.

**Q: Does this work offline?**
A: The review phase requires Claude API (online). Adaptation (Phase 2) works fully offline using local audit logs. Debate requires API.

**Q: Can I reset my weights?**
A: Yes. Edit `config.json` and set all weights to 1.0, or delete the `weights_history` array.

**Q: How often should I run adaptation?**
A: Monthly is recommended. Run `node adapt.cjs 30` after 20-30 reviews for stable data.

---

## Contributing

Contributions are welcome! Areas for enhancement:

- [ ] Additional specialist reviewers (accessibility, performance, etc.)
- [ ] Web UI for reviewing and managing suggestions
- [ ] Integration with version control for automatic reviews on PR
- [ ] Feedback export (JSON, CSV) for analysis
- [ ] Custom reviewer prompt templates
- [ ] Comparative analysis (this prompt vs similar prompts)

### Development

```bash
# Clone and set up
git clone https://github.com/yourusername/prompt-review.git
cd prompt-review
source ~/.nvm/nvm.sh && nvm use
npm test

# Create a branch
git checkout -b feat/your-feature

# Make changes
# Test: npm test (must pass all 12 tests)

# Commit and push
git commit -m "Add: your feature description"
git push origin feat/your-feature

# Open a PR
```

### Code Standards

- **No external dependencies** — Node.js built-ins + optional Anthropic SDK only
- **CommonJS** — require/module.exports, no import/export
- **Testing** — New features require tests using assert only
- **Tabs** — 2-width indentation
- **Comments** — Only where logic isn't self-evident

---

## License

MIT License — See [LICENSE](./LICENSE) file for details.

---

## Resources

- **Architecture Deep-Dive:** [.claude/ARCHITECTURE.md](./.claude/ARCHITECTURE.md)
- **Phase 1 Spec:** [.claude/phase-1-audit-logging.md](./.claude/phase-1-audit-logging.md)
- **Phase 2 Spec:** [.claude/phase-2-gea-reflection.md](./.claude/phase-2-gea-reflection.md)
- **Phase 3 Spec:** [.claude/phase-3-comas-debate.md](./.claude/phase-3-comas-debate.md)
- **Test Suite:** [tests/run.cjs](./tests/run.cjs) (12 passing tests)

---

## Support

For issues, questions, or suggestions:

1. Check [Troubleshooting](#troubleshooting) section above
2. Review [ARCHITECTURE.md](./.claude/ARCHITECTURE.md) for detailed system explanation
3. Open an [Issue](https://github.com/yourusername/prompt-review/issues) with:
   - Error message or unexpected behavior
   - Steps to reproduce
   - Your `config.json` (with API key removed)
   - Output of `npm test`

---

**Built with ❤️ for prompt engineers and developers who want their prompts to be better.**
