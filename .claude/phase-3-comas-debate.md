# Phase 3: CoMAS Debate Phase

**Status:** Ready for implementation (after Phase 1 merged and tests green)
**Depends on:** Phase 1 complete with all tests passing
**Note:** Can run parallel with Phase 2; Phase 2 does not depend on Phase 3

## Goal

Add a structured debate round between conflicting reviewers. An LLM judge extracts quality signals from debate transcripts. Debate data feeds offline policy learning for reviewer prompts. Gated behind `debate.enabled: false` — fully opt-in, no behavior change by default.

## Architecture

```
[fan-out reviewers] → [debate round if conflicts] → [judge extracts signals] → [merge] → [editor]
```

Debate data is logged but does NOT change merge output. The debate feeds the offline learning loop only.

## New Modules

### `debate.cjs` — Builds and Runs Debates

```js
function selectDebatePairs(conflicts, allOps)
// Max 2 pairs per review. Selects pairs with direct AddConstraint vs RemoveConstraint conflicts.
// Returns: pair[] where pair = { role_a, role_b, conflict_description, op_a, op_b }

function buildDebatePrompt(roleA, roleB, conflictDescription, critiqueA, critiqueB, originalPrompt, context)
// Builds system + user prompt for each role
// Each role gets: system prompt, context, opponent's position, asked to argue their position in 2-3 sentences
// Returns: { roleA: { system, user }, roleB: { system, user } }

async function runDebateRound(params)
// Runs one debate pair through API: A-argument → B-argument → A-rebuttal → B-rebuttal
// params: { roleA, roleB, conflict, client, model, context }
// Returns: { role_a_argument, role_b_argument, role_a_rebuttal, role_b_rebuttal, usage }

async function runDebatePhase(pairs, critiques, originalPrompt, context, client, model)
// Runs all pairs in parallel via Promise.allSettled
// Returns: { results, failed_pairs, total_tokens }
```

### `judge.cjs` — LLM-as-Judge (Sonnet)

```js
const JUDGE_SYSTEM_PROMPT = `...evaluates argument quality: specificity, reasoning, calibration, responsiveness...`

async function runJudge(debateResult, client, model)
// Returns: { feedback: JudgeFeedback[], summary, usage }
// JudgeFeedback: { role, argument_quality_score, argument_labels, policy_signal, winner }
// argument_quality_score: 0-10
// argument_labels: ["precise", "evidence-backed", "well-reasoned", etc.]
// policy_signal: key insight for improving that role's prompt
// winner: "role_a", "role_b", or "tie"

function buildJudgePrompt(debateResult)
// Returns: { system, user }
// Includes all debate rounds in user prompt
```

### `policy.cjs` — Reads Judge Feedback, Proposes Prompt Updates

```js
function computePolicyInsights(days)
// Reads debate_log from audit entries from last N days
// Aggregates across debates
// Returns: { [role]: PolicyInsights }
// PolicyInsights: { avg_argument_quality, common_labels, policy_signal, needs_update }

function readCurrentSystemPrompt(role)
// Extracts SYSTEM_PROMPT from reviewers/<role>.cjs via regex
// Returns: string|null

async function generatePromptProposal(role, currentSystemPrompt, insights, client, model)
// Calls Sonnet to propose improved prompt based on insights
// Writes proposal to reviewers/prompts/<role>.txt (NOT to .cjs)
// Returns: { proposedPrompt, diff }
```

**Safety rule:** `policy.cjs` NEVER writes to `reviewers/*.cjs`. Only writes to `reviewers/prompts/<role>.txt` for human review.

## Audit Log Extension

Add `debate_log` field to audit entries:
```json
"debate_log": {
  "ran": true,
  "pairs": [
    {
      "role_a": "security",
      "role_b": "testing",
      "conflict": "Add vs Remove on 'env access'",
      "winner": "security",
      "judge_scores": { "security": 8.2, "testing": 5.5 }
    }
  ],
  "judge_feedback": [
    {
      "role": "security",
      "argument_quality_score": 8.2,
      "argument_labels": ["precise", "evidence-backed"],
      "policy_signal": "good calibration"
    }
  ],
  "cost": { "input_tokens": 3200, "output_tokens": 1100 }
}
```

When debate doesn't run (no conflicts or `debate.enabled: false`): `"debate_log": null`

## Integration in `runFullPipeline` (`index.cjs`)

Insert between `runReviewersApi` and `mergeCritiques`:
```js
let debateResult = null;
if (config.debate?.enabled && apiKey) {
  const preCheck = mergeCritiques(validCritiques, priorityOrder);
  if (preCheck.conflicts.length > 0) {
    const pairs = selectDebatePairs(preCheck.conflicts, preCheck.allOps);
    if (pairs.length > 0) {
      debateResult = await runDebatePhase(...);
      const judgeResult = await runJudge(debateResult, client, editorModel);
      debateResult.judgeResult = judgeResult;
    }
  }
}
// Then proceed with normal merge — debate does not alter merge output
```

## Config.json Addition

```json
"debate": {
  "enabled": false,
  "max_pairs": 2,
  "model": "claude-haiku-4-5",
  "judge_model": "claude-sonnet-4-6",
  "min_conflicts_to_trigger": 1
}
```

## New Test Files

### `tests/debate.test.cjs` (5 tests — no async/API tests)

1. `selectDebatePairs` returns `[]` when no conflicts
2. `selectDebatePairs` selects correct role pairs from conflicts
3. `selectDebatePairs` caps at `max_pairs` even with 5+ conflicts
4. `buildDebatePrompt` returns non-empty system + user for both roles
5. `buildDebatePrompt` includes conflict description in user content

### `tests/judge.test.cjs` (3 tests)

1. `buildJudgePrompt` returns valid system + user pair
2. `buildJudgePrompt` includes all debate rounds in user content
3. Mock judge JSON response is parseable as `JudgeResult`

### `tests/policy.test.cjs` (3 tests)

1. `readCurrentSystemPrompt` extracts SYSTEM_PROMPT via regex from mock .cjs content
2. `computePolicyInsights` returns empty object with no debate logs
3. `computePolicyInsights` averages argument quality scores correctly

## Verification Checklist

- [ ] `npm test` — all 12 test files pass
- [ ] With `debate.enabled: false` — `runFullPipeline` behavior identical to pre-Phase-3
- [ ] With `debate.enabled: true` + no conflicts — `debate_log: null` in audit
- [ ] With `debate.enabled: true` + conflicts — debate runs, logged correctly
- [ ] `debate_log.pairs` has correct role pairs
- [ ] Judge feedback is valid JSON matching `JudgeResult` shape
- [ ] `generatePromptProposal` writes to `reviewers/prompts/<role>.txt`, NOT `.cjs`
- [ ] No existing `.cjs` reviewer files mutated
- [ ] API cost tracking includes debate tokens
- [ ] `handleHook` and `handleSkill` unaffected (debate is API-mode only)

## Implementation Notes

- **Read files fresh:** Before modifying `index.cjs`, read it in full.
- **Test-driven:** Write tests first (no async tests), then implement to pass.
- **Safety critical:** Never mutate `.cjs` reviewer files. Only write `.txt` proposals.
- **Opt-in by default:** `debate.enabled: false` means no user sees debate unless explicitly enabled.
- **No breaking changes:** Keep all existing API behavior unchanged.
- **Debate optional:** If API calls fail during debate, log error but continue with normal merge.
