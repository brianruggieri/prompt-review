# Optimization: Parallel Subscription Dispatch

**Problem:** Currently, subscription mode dispatches reviewer tasks sequentially, creating a bottleneck.
- Sequential: prompt → reviewer 1 → reviewer 2 → ... → reviewer 6 (slow)
- 100 prompts × 6 reviewers = 600 sequential operations (~30-50 min)

**Solution:** Dispatch all 6 reviewers for each prompt **in parallel** using `Promise.all()`
- Parallel: prompt → [reviewer 1, 2, 3, 4, 5, 6 in parallel] (10-15x faster)
- 100 prompts × 6 reviewers in parallel = ~100 concurrent operations (~3-5 min)

---

## Implementation

### Current Flow (Sequential)
```javascript
// orchestrator.cjs: runReviewersSubscription(roles, prompt)
function runReviewersSubscription(activeRoles, prompt, context) {
  return buildReviewerPrompts(activeRoles, prompt, context);
  // Returns: [{role: 'security', system, user}, {role: 'clarity', ...}, ...]
}

// index.cjs: runFullPipeline calls this and dispatches sequentially
// (dispatch reviewer 1, wait for result, dispatch reviewer 2, wait, etc.)
```

### Optimized Flow (Parallel)
```javascript
// index.cjs: runFullPipeline with parallel dispatch
async function runFullPipelineOptimized(prompt, cwd, mode, client, config) {
  const reviewerPrompts = buildReviewerPrompts(activeRoles, prompt, context);

  // Dispatch all reviewers IN PARALLEL
  const results = await Promise.all(
    reviewerPrompts.map(({role, system, user}) =>
      dispatchReviewerTask(role, system, user)
    )
  );

  // All 6 reviewers execute concurrently
  // Total time: ~30-60 seconds per prompt (not 3+ minutes)
}
```

---

## Code Changes Needed

### File: `index.cjs`

**Location:** `runFullPipeline()` function, where it handles subscription mode

**Current (line ~350-400):**
```javascript
if (mode === 'subscription') {
  // Dispatch one reviewer at a time
  for (const reviewer of activeReviewers) {
    // dispatch and wait
  }
}
```

**Change to:**
```javascript
if (mode === 'subscription') {
  // Dispatch all reviewers in parallel
  const reviewerPrompts = buildReviewerPrompts(activeReviewers, prompt, context);

  const results = await Promise.all(
    reviewerPrompts.map(async ({role, system, user}) => {
      // Each reviewer dispatches independently, no waiting
      return dispatchSubscriptionTask(role, system, user);
    })
  );

  // Collect and merge results from all 6 reviewers
  return mergeSubscriptionResults(results);
}
```

---

## Expected Performance Improvement

| Metric | Sequential | Parallel |
|--------|-----------|----------|
| Per-prompt time | 2-3 min | 30-60 sec |
| 100 prompts | 200-300 min (3-5 hrs) | 50-100 min (1-2 hrs) |
| All 1,309 prompts | 40-65 hours | 6-10 hours |
| Batch 1 (100) | ~30-50 min | ~5-15 min |

**Impact:** ~5-10x speedup for subscription mode, making it practical for validation

---

## Implementation Checklist

- [ ] Find where reviewers are dispatched in `runFullPipeline()` (subscription mode path)
- [ ] Extract reviewer dispatch logic into reusable `dispatchReviewerTask(role, system, user)` function
- [ ] Use `Promise.all()` to dispatch all 6 reviewers concurrently
- [ ] Collect and merge results from all parallel tasks
- [ ] Test with mock data first
- [ ] Run Batch 1 with optimized parallel dispatch
- [ ] Measure actual time improvement

---

## Status

**Current:** Sequential dispatch bottlenecks Batch 1 (~30-50 min estimated)
**Target:** Parallel dispatch for Batch 1 (~5-15 min with optimization)
**Effort:** 30-60 minutes to implement and test

This is a high-value optimization that makes subscription mode practical.
