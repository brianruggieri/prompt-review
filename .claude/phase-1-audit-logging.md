# Phase 1: Expanded Audit Logging

**Status:** Ready for implementation
**Depends on:** Phase 0 (repo setup) — COMPLETE
**Tests required:** All 7 test files must pass (`npm test`)

## Goal

Fix the `findings_detail` bug and extend audit logs with data needed for Phases 2 & 3. Zero user-visible changes.

## Root Cause (Known Bug)

`computeTopPatterns` in `stats.cjs` reads `entry.findings_detail` but `logAudit` in `index.cjs` never writes it — only writes `findings_count` (integer). Top patterns always returns `[]`.

## New Audit Log Schema

```json
{
  "timestamp": "ISO 8601",
  "project": "string",
  "trigger": "!!!",
  "mode": "subscription|api",
  "original_prompt_hash": "sha256 first 12 hex",
  "reviewers_active": ["domain_sme", "security"],
  "findings_count": 3,
  "findings_detail": [
    {
      "reviewer_role": "security",
      "finding_id": "SEC-001",
      "severity": "blocker",
      "issue": "Prompt requests reading .env file",
      "op": "AddGuardrail",
      "target": "constraints"
    }
  ],
  "suggestions_accepted": ["SEC-001", "TST-001"],
  "suggestions_rejected": ["CLR-001"],
  "reviewer_stats": {
    "security": { "proposed": 1, "accepted": 1, "rejected": 0 },
    "clarity":  { "proposed": 1, "accepted": 0, "rejected": 1 }
  },
  "severity_max": "blocker",
  "conflicts": 0,
  "outcome": "pending",
  "scores": { "security": 9.0, "clarity": 6.0 },
  "composite_score": 7.5,
  "cost": { "input_tokens": 1200, "output_tokens": 450, "usd": 0 },
  "duration_ms": 2100
}
```

**Key change:** `findings_detail` is now an array of objects. `suggestions_accepted/rejected` and `reviewer_stats` start as `[]`/`{}` at log time. `updateAuditOutcome` populates them when the user decides yes/no/edit.

## Files to Modify

### `index.cjs`

1. Update `logAudit` — replace integer `findingsCount` param with `findingsDetail` array:
   ```js
   // Old signature:
   function logAudit(prompt, cwd, reviewersActive, findingsCount, ...)
   // New signature:
   function logAudit(prompt, cwd, reviewersActive, findingsDetail, ...)
   ```

2. Add helper `buildFindingsDetail(allOps)` — maps each op to `{ reviewer_role, finding_id, severity, issue, op, target }`:
   - Extract `reviewer_role` from op's reviewer context
   - Use `finding_id` from op if present, otherwise generate from role+issue hash
   - Extract `severity` from op if present (default: "info")
   - Use op's `issue` field
   - Use op's `op` and `target` fields

3. Write to audit log: `findings_count: detail.length`, `findings_detail: detail`, `suggestions_accepted: []`, `suggestions_rejected: []`, `reviewer_stats: {}`.

4. Update both `logAudit` call sites in `runFullPipeline`:
   - No-changes path: pass `[]` instead of `0`
   - Normal path: call `buildFindingsDetail(merged.allOps)` instead of `merged.allOps.length`

5. Update `updateOutcome` — add optional `acceptedIds`, `rejectedIds` params, forward to `updateAuditOutcome`.

### `cost.cjs`

1. Update `updateAuditOutcome` signature: add `acceptedIds`, `rejectedIds` params.

2. When rewriting the matched entry, set:
   - `suggestions_accepted: acceptedIds`
   - `suggestions_rejected: rejectedIds`
   - `reviewer_stats: computeReviewerStats(entry.findings_detail, acceptedIds, rejectedIds)`

3. Add new exported function:
   ```js
   function computeReviewerStats(findingsDetail, acceptedIds, rejectedIds) {
     // Returns: { [role]: { proposed, accepted, rejected }, ... }
     // proposed = count of findings by this role
     // accepted = count of findings by this role that are in acceptedIds
     // rejected = count of findings by this role that are in rejectedIds
   }
   ```

## New Test File: `tests/audit-schema.test.cjs`

Create new test file with the following tests (using `assert` only, no framework):

1. `computeTopPatterns` returns patterns when entries have `findings_detail`
2. Repeated issues across entries aggregate correctly (count = 3, 1, etc.)
3. `computeReviewerStats` returns correct proposed/accepted/rejected counts per role
4. Entries without `findings_detail` don't crash `computeTopPatterns` (returns `[]`)
5. `updateAuditOutcome` round-trip: write entry → update outcome → read back accepted/rejected

## Verification Checklist

- [ ] `npm test` — all 7 test files pass (6 old + 1 new)
- [ ] `logAudit` writes `findings_detail` as array (read a written log line to confirm)
- [ ] `computeTopPatterns` returns non-empty results after writing test logs
- [ ] `updateOutcome` accepts and persists `acceptedIds/rejectedIds`
- [ ] `computeReviewerStats` correct for mock data
- [ ] All existing exports (`handleHook`, `handleSkill`, `runFullPipeline`) unchanged
- [ ] `node index.cjs --stats` with no logs — no crash

## Implementation Notes

- **Read files fresh:** Before modifying `index.cjs` or `cost.cjs`, read them in full. Don't assume changes from earlier exploration.
- **Test-driven:** Write `tests/audit-schema.test.cjs` first (TDD), then implement to pass tests.
- **No breaking changes:** All existing exports and behaviors must remain unchanged.
- **Incremental:** Focus only on Phase 1 scope. Don't add Phase 2/3 features.
