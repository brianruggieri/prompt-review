# prompt-review — Development Rules & Context

## Project Overview

**prompt-review** is a self-improving Claude Code plugin that reviews prompts with a team of specialist LLM reviewers. It implements a three-phase learning system:

1. **Phase 1: Audit Logging** — Captures detailed findings, reviewer stats, and user decisions
2. **Phase 2: GEA Reflection** — Analyzes acceptance patterns and adapts reviewer weights automatically
3. **Phase 3: CoMAS Debate** — Resolves conflicts through debate and extracts policy signals to improve reviewer prompts

**Status:** ✅ All 3 phases complete, 17/17 tests passing, scoring validation complete, publicly released

## Architecture

**prompt-review** is a Claude Code plugin (hook + skill). No dependencies: CommonJS `.cjs`, Node.js built-ins only. The plugin runs synchronously where possible; async only in API mode (LLM scoring).

```
User Input (!!!)
    ↓
[Fan-out 6 reviewers in parallel]
    ↓
[Optional: Debate phase if conflicts]
    ↓
[Merge critiques → composite score]
    ↓
[Render diff + present to user]
    ↓
[Audit log + learning system]
```

## Key Exports

All must remain stable:
- `handleHook(prompt, cwd, context, config)` — Hook entry point
- `handleSkill(skillName, args, context, config)` — Skill entry point
- `runFullPipeline(prompt, cwd, mode, client, config)` — Main review pipeline
- `logAudit(...)` — Writes review to audit log
- `updateOutcome(promptHash, outcome, ...)` — Records user decision

## Testing

```bash
source ~/.nvm/nvm.sh && nvm use
npm test  # runs node tests/run.cjs
```

All test files must be in `tests/` directory. Test runner is `tests/run.cjs`. **Tests must pass at end of every phase.**

## Conventions

- **Tabs** for indentation (2-width display)
- **CommonJS** only (no import/export)
- **No framework dependencies** (only Node.js built-ins)
- **No breaking exports** — if an export exists, it must continue to work
- **Tests use assert only** — no testing framework, no external deps
- **Prompt hashes** stored in `logs/` are gitignored (runtime data, not source)
- **Reviewer prompts** at `reviewers/prompts/` are gitignored (Phase 3 output, not source)

## Phase Plans

Individual implementation plans for each phase are in this directory:
- `phase-1-audit-logging.md` (after Phase 0 complete)
- `phase-2-gea-reflection.md` (after Phase 1 merged)
- `phase-3-comas-debate.md` (after Phase 1 merged)

Each phase agent should re-read referenced source files fresh before modifying — do not rely on exploration phase assumptions.

## Critical Files

| File | Role |
|------|------|
| `index.cjs` | Entry point: hook/skill handlers, `runFullPipeline`, `logAudit`, `updateOutcome` |
| `cost.cjs` | Audit logging: `writeAuditLog`, `updateAuditOutcome`, `estimateCost`, `verifyAuditEntry` |
| `stats.cjs` | Analytics: `generateStats`, `renderDashboard`, `computeTopPatterns`, `computeReviewerEffectiveness` |
| `editor.cjs` | Merge: `mergeCritiques`, `computeCompositeScore`, `extractOps` |
| `orchestrator.cjs` | Fan-out: `determineActiveReviewers`, `runReviewersApi` |
| `config.json` | Configuration — must stay valid JSON |
| `tests/run.cjs` | Test runner — must pass before each phase completion |

## Scoring System Reference

### Composite Score Formula

The composite score represents the weighted average of individual reviewer scores:

```
composite = Σ(score_i × weight_i) / Σ(weight_i)
```

Where:
- `score_i` is the 0–10 score from reviewer role `i`
- `weight_i` is the effectiveness weight for role `i` (see below)
- Result is rounded to 2 decimal places

**Example:** If security scores 8.0 (weight 1.2) and clarity scores 6.5 (weight 1.0):
```
composite = (8.0 × 1.2 + 6.5 × 1.0) / (1.2 + 1.0) = 16.1 / 2.2 = 7.32
```

### Weight Range & Default Values

- **Minimum weight:** 0.5 (low-precision reviewer, rarely accepted findings)
- **Default weight:** 1.0 (baseline, unchanged reviewer)
- **Maximum weight:** 3.0 (high-precision reviewer, frequently accepted findings)

Weights are automatically suggested by Phase 2 (GEA Reflection) based on reviewer precision:
```bash
node adapt.cjs 30              # Preview weight suggestions for last 30 days
node adapt.cjs 30 --apply      # Apply suggestions and update config.json
```

### Precision Metric

Precision = `accepted findings / proposed findings` for each reviewer.

**Limitations:**
- Does NOT measure recall — a reviewer with 1 proposal always accepted has precision 1.0 but may miss many real issues
- Does NOT account for finding importance — all proposals weighted equally in precision calculation
- Does NOT use finding confidence score (available in data but unused in current merge logic)

To detect "plays it safe" reviewers (high precision, low coverage), use:
```bash
node adapt.cjs 30 --history    # Shows post-adaptation impact (Tier 2 feature)
```

### Audit Log Integrity

Each entry in `logs/YYYY-MM-DD.jsonl` has a `__hash` field:

```json
{
  "timestamp": "2026-02-25T14:30:45.123Z",
  "original_prompt_hash": "a1b2c3d4",
  "composite_score": 7.5,
  "__hash": "sha256_first_16_chars",
  ...
}
```

The `__hash` is computed as SHA256(entry without __hash field).

**Verification:** When loading logs, entries with invalid hashes are skipped. Use:
```bash
node -e "const {generateReflectionReport} = require('./reflection.cjs');
  const report = generateReflectionReport(30);
  console.log('Skipped:', report.skipped_entries,
              'Valid:', report.total_reviews);"
```

### Score Validation

To verify composite scores correlate with user acceptance patterns:

```bash
# See test in tests/scoring-accuracy.test.cjs
npm test -- scoring-accuracy    # Runs correlation tests
```

Expected: High composite (≥7) should correlate with "approved" outcomes; low composite (<4) with "rejected".

## Git Workflow

- **Branches:** Feature branches + PRs, never push main directly
- **Worktrees:** `.worktrees/feat-<name>` per user CLAUDE.md conventions
- **Commit style:** Brief imperative sentences ("Fix findings_detail bug", "Add GEA reflection")
- **No Co-Authored-By trailers** in commit messages

## Cleanup After Merge

Always run all three steps:
```bash
git worktree remove .worktrees/<name>
git worktree prune
git branch -d <branch>
```

---

## Quick Start for New Sessions

```bash
# 1. Navigate to repo
cd ~/git/prompt-review

# 2. Activate Node.js
source ~/.nvm/nvm.sh && nvm use

# 3. Verify everything works
npm test
# Expected: 17 passed, 0 failed, 17 total

# 4. See what's new
git log --oneline -5

# 5. Check status
git status
```

---

## Current Project State

| Aspect | Status |
|--------|--------|
| **Implementation** | ✅ Complete (3 phases) |
| **Tests** | ✅ 17/17 passing |
| **Documentation** | ✅ README + ARCHITECTURE + Phase Specs |
| **Public Release** | ✅ Live on GitHub |
| **Code Quality** | ✅ Zero dependencies (core), all CommonJS |
| **Security** | ✅ No API keys, secrets, or privacy issues |

### What Each Phase Does

**Phase 1: Audit Logging**
- Records detailed findings from each review
- Tracks which suggestions user accepts/rejects
- Foundation for all learning
- Files: `cost.cjs` (audit log writing), `tests/audit-schema.test.cjs`

**Phase 2: GEA Reflection**
- Analyzes audit logs to compute reviewer precision
- Suggests weight adjustments (high-precision reviewers get more weight)
- Exposed via `node adapt.cjs [days] [--apply]` or `/prompt-review:adapt` skill
- Files: `reflection.cjs`, `adapt.cjs`, `tests/reflection.test.cjs`, `tests/adapt.test.cjs`

**Phase 3: CoMAS Debate**
- When reviewers disagree, runs a structured debate
- LLM judge evaluates argument quality and extracts insights
- Proposals for improving reviewer prompts written to `reviewers/prompts/<role>.txt`
- Gated behind `config.json` setting: `debate.enabled` (default: false)
- Files: `debate.cjs`, `judge.cjs`, `policy.cjs`, `tests/debate.test.cjs`, `tests/judge.test.cjs`, `tests/policy.test.cjs`

---

## Common Tasks & How To Do Them

### Add a New Specialist Reviewer

1. Create `reviewers/newrole.cjs` with `SYSTEM_PROMPT` export
2. Add to config.json: `"weights": { ..., "newrole": 1.0 }`
3. Update `orchestrator.cjs` to include new role in `determineActiveReviewers`
4. Run tests: `npm test` (should still pass)
5. Commit: `git add reviewers/newrole.cjs config.json orchestrator.cjs && git commit -m "Add newrole specialist reviewer"`

### Run a Quick Review Test

```bash
# Create a test prompt with !!!
echo "Write a function that validates emails !!!" | node index.cjs --debug

# Or use the skill in Claude Code:
/prompt-review:review
```

### Check Reviewer Effectiveness

```bash
# Show dashboard with effectiveness metrics
node index.cjs --stats

# Preview weight adaptation (no changes)
node adapt.cjs 30

# See what changed
node adapt.cjs 30 --apply
```

### Enable Debate Mode

```bash
# Edit config.json
{
  "debate": {
    "enabled": true,  # Change from false to true
    ...
  }
}

# Next review with conflicts will trigger debate
```

### Review Recent Changes

```bash
# See what changed in last 5 commits
git log --oneline -5

# See what's staged
git status

# See code changes
git diff HEAD~3..HEAD -- index.cjs
```

---

## Key Design Decisions

### Why No Dependencies?

**Decision:** Core plugin uses only Node.js built-ins, Anthropic SDK is optional
**Reasoning:**
- Faster load time for Claude Code
- Simpler maintenance, fewer security vulnerabilities
- Can work without SDK if needed
- SDK only used for LLM calls (async, conditional)

### Why CommonJS Not ES Modules?

**Decision:** All code is `.cjs` with `require()`/`module.exports`
**Reasoning:**
- Claude Code plugins expect CommonJS
- Clearer dependency resolution
- Works reliably in Node.js 22+

### Why Tabs for Indentation?

**Decision:** 2-width tabs throughout
**Reasoning:**
- Accessible (screen readers handle better)
- Consistent with editor defaults
- Matches Claude Code conventions

### Why Audit Logs Are Local?

**Decision:** All audit data stored in `~/.claude/plugins/prompt-review/logs/` (gitignored)
**Reasoning:**
- Privacy first — user data never leaves machine
- No external API calls for logging
- User has full control over their data
- Can be archived/deleted anytime

### Why Debate Doesn't Change Output?

**Decision:** Debate phase runs but doesn't alter merge output or final suggestions
**Reasoning:**
- User can always see the review without debate complexity
- Debate data feeds learning system (Phase 3) offline
- Safety: no surprises in what reviewers propose
- Debate influences future reviews via improved prompts, not this review

---

## How to Extend the System

### Add a New Reviewer Role

See "Add a New Specialist Reviewer" under Common Tasks above.

### Modify Reviewer Behavior

Edit the relevant file in `reviewers/`:
```bash
vim reviewers/security.cjs
# Edit SYSTEM_PROMPT and save
# Changes take effect immediately on next review
```

### Change Weight Adaptation Logic

Edit `reflection.cjs`:
- `computeWeightSuggestions()` — controls how weights are calculated
- `generateReflectionReport()` — controls what metrics are computed

### Add a New Learning Signal

1. Extend audit log schema in `cost.cjs` (in `writeAuditLog`)
2. Update tests to verify new field is written
3. Use the new field in `reflection.cjs` or `policy.cjs`

---

## Important Patterns & Conventions

### Audit Log Entry Schema

Every review creates an entry in `logs/YYYYMMDD.jsonl` with:
```json
{
  "timestamp": "ISO 8601",
  "original_prompt_hash": "sha256[0:12]",
  "reviewers_active": ["role1", "role2"],
  "findings_detail": [
    {"reviewer_role": "security", "finding_id": "SEC-001", "severity": "blocker", ...}
  ],
  "suggestions_accepted": ["SEC-001"],
  "suggestions_rejected": ["CLR-001"],
  "reviewer_stats": {"security": {"proposed": 1, "accepted": 1, "rejected": 0}},
  "composite_score": 7.5,
  "outcome": "approved",
  "debate_log": { ... } or null
}
```

This is the data foundation for all learning. Ensure new learning features read from this schema.

### Weight Range

- Minimum: 0.5 (very low precision reviewer)
- Default: 1.0 (baseline weight)
- Maximum: 3.0 (very high precision reviewer)
- Weights never go outside [0.5, 3.0] range (clamped in `reflection.cjs`)

### Cost Tracking

Every API call is tracked:
```json
"cost": {
  "input_tokens": 1200,
  "output_tokens": 450,
  "usd": 0.0345
}
```

Update in `cost.cjs`: `estimateCost()` function (pricing model)

### Audit Log Query Recipes

Working with `logs/*.jsonl` files for analysis. All examples use Node.js built-ins only (no jq dependency).

**Query 1: Extract acceptance rate per reviewer for last 30 days**

```bash
node -e "
const fs = require('fs');
const path = require('path');
const LOGS_DIR = path.join(__dirname, 'logs');
const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl') && new Date(f.replace('.jsonl', '')) >= cutoff);

const stats = {};
for (const file of files) {
  const lines = fs.readFileSync(path.join(LOGS_DIR, file), 'utf-8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    if (!e.findings_detail) continue;
    for (const f of e.findings_detail) {
      const role = f.reviewer_role;
      if (!stats[role]) stats[role] = { proposed: 0, accepted: 0 };
      stats[role].proposed++;
      if (e.suggestions_accepted && e.suggestions_accepted.includes(f.finding_id)) {
        stats[role].accepted++;
      }
    }
  }
}
for (const [role, {proposed, accepted}] of Object.entries(stats)) {
  const pct = (accepted/proposed*100).toFixed(0);
  console.log(\`\${role.padEnd(18)} \${proposed} proposed, \${accepted} accepted (\${pct}%)\`);
}
"
```

**Query 2: List all blocker findings and their outcomes**

```bash
node -e "
const fs = require('fs');
const path = require('path');
const LOGS_DIR = path.join(__dirname, 'logs');
const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl'));

for (const file of files) {
  const lines = fs.readFileSync(path.join(LOGS_DIR, file), 'utf-8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    if (!e.findings_detail) continue;
    for (const f of e.findings_detail) {
      if (f.severity !== 'blocker') continue;
      const accepted = e.suggestions_accepted && e.suggestions_accepted.includes(f.finding_id) ? 'ACCEPTED' : 'REJECTED';
      console.log(\`\${f.reviewer_role} [\${accepted}] \${f.issue}\`);
    }
  }
}
"
```

**Query 3: Composite score distribution (0–10 buckets)**

```bash
node -e "
const fs = require('fs');
const path = require('path');
const LOGS_DIR = path.join(__dirname, 'logs');
const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl'));

const buckets = {};
for (let i = 0; i <= 10; i++) buckets[i] = 0;

for (const file of files) {
  const lines = fs.readFileSync(path.join(LOGS_DIR, file), 'utf-8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    if (e.composite_score !== null && e.composite_score !== undefined) {
      const bucket = Math.floor(e.composite_score);
      buckets[bucket]++;
    }
  }
}
for (let i = 0; i <= 10; i++) {
  const count = buckets[i] || 0;
  const bar = '█'.repeat(count);
  console.log(\`\${i}-\${i + 0.9}: \${bar} (\${count})\`);
}
"
```

**Query 4: Weight history deltas (what changed and when)**

```bash
node -e "
const fs = require('fs');
const path = require('path');
const whFile = path.join(__dirname, 'logs', 'weight-history.jsonl');
if (!fs.existsSync(whFile)) {
  console.log('No weight changes recorded yet.');
  process.exit(0);
}
const lines = fs.readFileSync(whFile, 'utf-8').split('\n').filter(l => l.trim());
for (const line of lines) {
  const e = JSON.parse(line);
  console.log(\`\n\${e.timestamp}:\`);
  for (const [role, after] of Object.entries(e.weights_after)) {
    const before = e.weights_before[role] || 1.0;
    const delta = (after - before).toFixed(2);
    const dir = after > before ? '↑' : after < before ? '↓' : '=';
    console.log(\`  \${role.padEnd(18)} \${before.toFixed(2)} → \${after.toFixed(2)} \${dir} \${delta}\`);
  }
}
"
```

### Test Pattern

All tests use `assert` only, no test framework:
```javascript
const assert = require('assert');

const result = functionUnderTest();
assert.strictEqual(result.score, 7.5, 'Score should be 7.5');
assert.deepStrictEqual(result.findings.length, 3, 'Should have 3 findings');
```

---

## Troubleshooting

### Tests Fail After Code Change

```bash
# Check what changed
git diff

# Revert to last working state
git checkout -- .

# Or re-read spec and understand why test failed
cat .claude/phase-X-*.md
```

### API Key Issues

```bash
# Verify API key is set
echo $ANTHROPIC_API_KEY

# Should not be empty. If empty:
export ANTHROPIC_API_KEY="sk-..."

# Test the SDK
node -e "const {Anthropic} = require('@anthropic-ai/sdk'); console.log(new Anthropic().apiKey ? 'OK' : 'FAIL')"
```

### Config.json Is Invalid

```bash
# Validate JSON
node -e "console.log(JSON.parse(require('fs').readFileSync('config.json', 'utf8')))"

# If error, find the syntax issue (usually missing comma or quote)
# Or restore from git:
git checkout config.json
```

### Audit Logs Are Too Large

```bash
# Check size
du -sh logs/

# Archive old logs
mkdir -p logs/archive
mv logs/202401*.jsonl logs/archive/

# logs/ is gitignored so safe to delete old files
```

---

## Documentation Guide

- **README.md** — User-facing, how to use the tool
- **ARCHITECTURE.md** — System design, how it works internally
- **CLAUDE.md** (this file) — Development context for future sessions
- **phase-1-audit-logging.md** — Phase 1 implementation spec
- **phase-2-gea-reflection.md** — Phase 2 implementation spec
- **phase-3-comas-debate.md** — Phase 3 implementation spec
- **NEXT_STEPS.md** — Project status and what to do next

For new features, update relevant docs immediately after coding.

---

## File Organization Quick Reference

```
index.cjs           — Main entry (hook/skill handlers, pipeline)
orchestrator.cjs    — Fan-out to parallel reviewers
editor.cjs          — Merge critiques, compute scores
renderer.cjs        — Format output for user
cost.cjs            — Audit logging (Phase 1)
stats.cjs           — Analytics dashboard (Phase 1, 2)
reflection.cjs      — Weight analysis (Phase 2)
adapt.cjs           — CLI tool (Phase 2)
debate.cjs          — Debate orchestration (Phase 3)
judge.cjs           — Judge evaluation (Phase 3)
policy.cjs          — Prompt improvement proposals (Phase 3)
config.json         — Configuration (weights, settings, debate)
reviewers/*.cjs     — 6 specialist LLM prompts
skills/*.md         — Claude Code skill definitions
tests/*.cjs         — 12 test files (all passing)
logs/               — Audit trail (gitignored)
.claude/            — Project documentation
```

---

## Last Session Summary

**Date:** 2026-02-25
**Completed:** All 3 phases implementation + comprehensive documentation + public release
**Status:** Production-ready, publicly available
**Next Steps:** Optionally add features or extend specialist roles
**Current Metrics:** 12/12 tests, 2,400+ lines of code, zero dependencies (core)
