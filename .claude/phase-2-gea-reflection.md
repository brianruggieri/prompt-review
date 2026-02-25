# Phase 2: GEA Reflection Module

**Status:** Ready for implementation (after Phase 1 merged and tests green)
**Depends on:** Phase 1 complete with all tests passing

## Goal

Implement Group-Evolving Agent (GEA) reflection: reads audit history, computes per-reviewer effectiveness, and optionally auto-adjusts `config.json` scoring weights. Exposed via `/prompt-review:adapt` skill.

No LLM calls needed — all reflection logic is deterministic math over audit logs.

## Architecture

**Module files:**
- `reflection.cjs` — Pure analytics, no side effects
- `adapt.cjs` — CLI tool to preview/apply weight adjustments

**Integration points:**
- Skill: `/prompt-review:adapt` calls `adapt.cjs`
- Stats dashboard: shows reviewer effectiveness table

## New Modules

### `reflection.cjs` — Pure Analytics

```js
// ReviewerMetrics: { role, proposed, accepted, rejected, precision, review_count, avg_score, outcome_correlation }
// ReflectionReport: { generated_at, period, total_reviews, reviews_with_outcome, reviewers, low_precision_roles, high_precision_roles, weight_suggestions }

function generateReflectionReport(days, options) { ... }
// Reads audit logs from last N days
// options: { min_reviews = 5, precision_threshold = 0.70 }
// Returns ReflectionReport with per-role metrics
// Metrics:
//   - precision = accepted / proposed (0.0-1.0)
//   - outcome_correlation = reviews where reviewer had >=1 accepted finding AND outcome in (approved|edited) / reviews participated
//   - review_count = number of reviews this role participated in

function computeWeightSuggestions(reviewerMetrics, currentWeights, minReviews) { ... }
// Strategy: new_weight = current * (reviewer_precision / avg_precision)
// Clamp to [0.5, 3.0], round to 2 decimal places
// Exclude roles with < minReviews data
// Returns: { [role]: { current, suggested, delta, reason } }
```

### `adapt.cjs` — CLI Tool

```js
// WeightDiff: { role, current, suggested, delta, reason }

function previewAdaptation(days, configPath?) { ... }
// Returns: { report, diff: WeightDiff[], sufficient_data }
// If insufficient_data, all other fields are empty/zero

function applyAdaptation(days, configPath?) { ... }
// Mutates config.json weights
// Saves previous weights to config.scoring.weights_history (max 10 entries, FIFO)
// Returns: { success, diff, report }

// CLI: node adapt.cjs [days] [--apply]
```

`configPath` is optional (defaults to real path) — tests pass a temp file path.

**CLI usage:**
```bash
node adapt.cjs                # Preview using last 30 days (default)
node adapt.cjs 60             # Preview using last 60 days
node adapt.cjs 30 --apply     # Apply suggested changes
```

## Integration with Config

Add to `config.json`:
```json
"scoring": {
  ...existing...,
  "weights_history": []
},
"reflection": {
  "min_reviews_for_adaptation": 5,
  "precision_threshold": 0.70,
  "weight_clamp_min": 0.5,
  "weight_clamp_max": 3.0,
  "auto_adapt": false,
  "auto_adapt_interval_days": 30
}
```

## Stats Dashboard Update

In `stats.cjs`:

1. Add `computeReviewerEffectiveness(entries)` function:
   ```js
   function computeReviewerEffectiveness(entries) {
     // Returns: { [role]: { precision, proposed, accepted, review_count }, ... }
   }
   ```

2. Update `generateStats` to include effectiveness data.

3. Update `renderDashboard` to show:
   ```
   Reviewer Effectiveness
     security:     precision 0.91  (10/11 accepted)
     testing:      precision 0.78  (7/9 accepted)
     domain_sme:   precision 0.65  (6/9 accepted)  <- below threshold
     clarity:      precision 0.44  (4/9 accepted)  <- below threshold
   ```

## Skill Integration

Create `skills/adapt/SKILL.md` with instructions to invoke:
```
/prompt-review:adapt          # Preview weight changes (dry run)
/prompt-review:adapt 30       # Preview using last 30 days
/prompt-review:adapt --apply  # Apply suggested weight changes
```

## New Test Files

### `tests/reflection.test.cjs` (6 tests)

1. No logs → empty metrics, `sufficient_data: false`
2. With 5+ reviews → `precision` computed correctly
3. `computeWeightSuggestions` scales proportionally, clamps at 0.5/3.0
4. High-precision gets weight increase, low-precision gets decrease
5. Reviewer with < `min_reviews` excluded from weight suggestions
6. `outcome_correlation` counts approved/edited, not rejected

### `tests/adapt.test.cjs` (5 tests)

1. Insufficient data → `{ sufficient_data: false }`, no panic
2. `previewAdaptation` returns diff with correct delta values
3. `applyAdaptation` writes updated weights to temp config
4. All non-weight config fields preserved after apply
5. `weights_history` caps at 10 entries

## Verification Checklist

- [ ] `npm test` — all 9 test files pass (6 old + 1 new audit + 2 new reflection)
- [ ] `node adapt.cjs` with no logs — `{ sufficient_data: false }`, no crash
- [ ] `node adapt.cjs 30` with real log data — effectiveness table shown
- [ ] `node adapt.cjs 30 --apply` — updates `config.json`, writes history entry
- [ ] Second `--apply` — adds second history entry (max 10)
- [ ] `node index.cjs --stats` — shows "Reviewer Effectiveness" section
- [ ] `/prompt-review:adapt` skill resolves and runs adapt.cjs
- [ ] `config.json` valid JSON after `--apply`
- [ ] All existing exports still work

## Implementation Notes

- **Read files fresh:** Before modifying `stats.cjs`, read it in full.
- **Test-driven:** Write tests first, then implement to pass.
- **No breaking changes:** Keep all existing stats functionality working.
- **Deterministic math:** All reflection is math over audit logs, no randomness.
- **Opt-in adaptation:** Changes only happen with `--apply` flag; dry-run is default.
