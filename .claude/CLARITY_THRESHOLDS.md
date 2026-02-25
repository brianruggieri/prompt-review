# Clarity Thresholds & Ambiguity Tolerance — Current State Analysis

## Executive Summary

**Current clarity system is mostly qualitative, not quantitative.** The system gates on *severity levels* (blocker → major → minor → nit) rather than numeric ambiguity scores. This is **measurable but indirect**.

---

## Current Thresholds (Measurable)

### Severity-Based Gate (Primary Control)

| Severity | Config Default | Non-Strict Behavior | Strict Mode | Example |
|----------|----------------|---------------------|-------------|---------|
| **blocker** | reject_on | `block` | `block` | Entirely vague scope, no success criteria |
| **major** | warn_on | `warn` | `block` | Significant ambiguity that would affect output |
| **minor** | (pass through) | `proceed` | `proceed` | Could be clearer but Claude will likely get it right |
| **nit** | (pass through) | `proceed` | `proceed` | Stylistic improvement to prompt structure |

**File:** `config.json` lines 145–156

```json
"clarity_gate": {
  "enabled": true,
  "strict_mode": false,
  "reject_on": ["blocker"],      // Block on blocker only
  "warn_on": ["major"],          // Warn on major (unless strict_mode)
  "auto_refine": true,           // Re-run clarity after user acknowledges warning
  "show_reasoning": true
}
```

---

## Score-Based Guidance (Qualitative)

The clarity reviewer *assigns numeric scores* (0–10) but these are **NOT actively gated** — they're informational only:

| Score Range | Rating | Meaning |
|-------------|--------|---------|
| **10** | Excellent | Precise verbs, clear scope, output format specified |
| **7–9** | Good | Minor improvements possible |
| **4–6** | Needs Work | Significant ambiguity; affects output quality |
| **0–3** | Poor | Entirely vague, ambiguous scope, no success criteria |

**File:** `reviewers/clarity.cjs` lines 57–61

**Key finding:** Score < 4 should probably trigger a gate action, but currently doesn't.

---

## Issue Classification (Measurable)

Clarity findings are tagged with **severity**, **confidence**, and **operations**:

### Severity Levels
- `blocker` — Claude will definitely produce wrong output
- `major` — Claude will likely produce something other than what user wants
- `minor` — Could be clearer but Claude will probably get it right
- `nit` — Stylistic improvement only

### Confidence Score
Each finding has a 0.0–1.0 confidence. Example thresholds (implicit, not configurable):
- 0.9+ = High confidence (this is definitely a problem)
- 0.7–0.89 = Medium confidence
- < 0.7 = Low confidence (might be nitpicky)

### Operations (Specific Fixes)
- `ReplaceVague` — Replace vague verb with measurable criteria
- `RefactorStructure` — Reorganize into clear sections
- `AddConstraint` — Add missing specification

---

## What IS Measurable Today

1. **Severity max** — The worst finding in a prompt (blocker > major > minor > nit)
2. **Finding count** — How many issues clarity found
3. **Gate action** — Whether to block, warn, or proceed
4. **Confidence distribution** — What % of findings are high-confidence

---

## What IS NOT Measurable Today

1. **Numeric ambiguity score** — The 0–10 score exists but isn't gated
2. **Ambiguity ratio** — No metric like "% of prompt is vague"
3. **Implicit assumptions detected** — Noted but not quantified
4. **Success criteria clarity** — Not separately scored
5. **Output format specificity** — Not separately scored

---

## Recommendations for Measurement

### Option A: Add Numeric Gate (Low Effort)
**If score < 4, auto-trigger gate:**
```json
"clarity_gate": {
  "enabled": true,
  "reject_on": ["blocker"],
  "warn_on": ["major"],
  "score_threshold_warn": 5,     // NEW: Warn if score < 5
  "score_threshold_block": 3,    // NEW: Block if score < 3
}
```

**Pros:** Direct ambiguity measurement, easy to implement
**Cons:** Duplicates severity gate, could be overly strict

---

### Option B: Add Ambiguity Components (Medium Effort)
**Decompose clarity findings into measurable components:**

```
{
  "findings": [
    {
      "type": "vague_verb|missing_output|ambiguous_scope|missing_criteria|implicit_assumption",
      "severity": "blocker|major|minor|nit",
      "confidence": 0.0-1.0,
      "issue": "...",
      "metrics": {
        "affected_scope": "portion of prompt affected" (e.g., "50% of scope statement"),
        "impact_level": "would_change_output|would_affect_quality|stylistic",
      }
    }
  ]
}
```

**Pros:** Granular, allows per-component policies
**Cons:** Changes audit schema, requires LLM output restructuring

---

### Option C: Implicit Ambiguity Index (Higher Effort)
**Compute from audit data post-hoc:**
- Track what "ambiguous prompts" (score < 5) tend to produce (which reviewers frequently suggest major changes?)
- Build a correlation: `ambiguity_index = f(actual_user_edits, reviewer_disagreement, composite_score_variance)`
- Recalibrate gate thresholds based on historical correlation with bad outcomes

**Pros:** Evidence-based, learns over time
**Cons:** Requires Phase 2/3 data, complex implementation

---

## Current Behavior

**Example: How a vague prompt flows through the system today:**

```
User prompt: "Clean up this function"
        ↓
Clarity reviewer runs: finds 3 findings
  - Major: "Clean up" is vague (confidence 0.95)
  - Minor: No output format specified (confidence 0.8)
  - Nit: Could use structured checklist (confidence 0.6)
        ↓
severity_max = "major"
score = 5.5
        ↓
Gate action: warn (severity_max = "major", strict_mode = false)
        ↓
User sees warning:
  "Clarity issues detected. Review suggested improvements?"
        ↓
User clicks "yes" → runs full 6-reviewer pipeline anyway
     OR
  "no" → proceeds without clarity refinement
```

**Problem:** User can easily ignore the gate by clicking "no".

---

## Recommendations for Tier 2–3 Tasks

To make ambiguity measurement better, consider:

1. **During T2-C (Weight Adaptation):** Track how often clarity suggestions are accepted vs rejected — builds precision metric for clarity
2. **During T3-C (Benchmark):** Show "clarity score distribution" in baseline vs adapted
3. **Post-Tier 3:** Add `ambiguity_score` to audit log = composite of:
   - Clarity numeric score (0–10)
   - Finding count (0–10 scale)
   - Severity max (blocker=10, major=7, minor=3, nit=1)

---

## Summary

**Current state:** ✅ Measurable gates, ❌ Not granular, ❌ Easily bypassed

**Recommendation for now:** Keep current system (severity-based gate is clear and effective). Flag for future improvement: add numeric score gate (Option A) when we have audit data to validate thresholds.
