# Phase 3A Deployment Guide — Configuration Finalization

**Status:** Complete
**Version:** 2.0
**Date:** 2026-02-25

---

## Overview

Phase 3A introduces:
1. **Version tracking** (config.json version: 2.0)
2. **Feature flags** for gradual rollout of Phase 1 & 2 improvements
3. **Precision thresholds** per reviewer role
4. **Severity matrix** for finding prioritization
5. **Deployment guardrails** for safe rollout

This guide covers deployment strategies, monitoring, and rollback procedures.

---

## Configuration Changes (3A-1)

### Version 2.0 Schema

```json
{
  "version": "2.0",
  "phase1_improvements": {
    "frontend_ux_multi_factor": true,
    "security_severity_matrix": true,
    "testing_bugfix_detection": true,
    "clarity_domain_context": true
  },
  "phase2_improvements": {
    "security_template_safety": true,
    "documentation_maturity_aware": true,
    "domain_sme_file_validation": true
  },
  "precision_thresholds": {
    "security": 0.70,
    "testing": 0.70,
    "clarity": 0.65,
    "domain_sme": 0.70,
    "frontend_ux": 0.75,
    "documentation": 0.60
  },
  "severity_matrix": {
    "blocker": { "override_weight": 3.0, "requires_user_review": true },
    "major": { "override_weight": 1.8 },
    "minor": { "override_weight": 1.0 },
    "nit": { "override_weight": 0.5 }
  }
}
```

### What Changed

| Setting | Previous | New | Purpose |
|---------|----------|-----|---------|
| `version` | (none) | 2.0 | Track config schema version |
| `phase1_improvements` | (none) | {...} | Enable/disable Phase 1 quick wins |
| `phase2_improvements` | (none) | {...} | Enable/disable Phase 2 improvements |
| `precision_thresholds` | (none) | {...} | Per-role acceptance standards |
| `severity_matrix` | (none) | {...} | Weight overrides by finding severity |

---

## Feature Flags (3A-2)

### Gradual Rollout Configuration

```json
{
  "features": {
    "reviewer_improvements": {
      "enabled": true,
      "rollout_percentage": 100,
      "phase1_enabled": true,
      "phase2_enabled": true
    },
    "maturity_aware_docs": {
      "enabled": true,
      "apply_to_projects": ["growing", "stable"],
      "skip_projects": ["MVP"]
    },
    "strict_file_validation": {
      "enabled": true,
      "block_on_invalid": false,
      "warn_only": true
    }
  }
}
```

### Feature Flag Reference

| Flag | Default | Description |
|------|---------|-------------|
| `reviewer_improvements.enabled` | `true` | Master switch for all improvements |
| `reviewer_improvements.rollout_percentage` | `100` | % of reviews that see improvements (0-100) |
| `reviewer_improvements.phase1_enabled` | `true` | Enable Phase 1 quick wins |
| `reviewer_improvements.phase2_enabled` | `true` | Enable Phase 2 medium improvements |
| `maturity_aware_docs.enabled` | `true` | Enable project maturity awareness |
| `maturity_aware_docs.apply_to_projects` | `[...]` | Maturity tiers that require docs |
| `strict_file_validation.enabled` | `true` | Enable file path validation |
| `strict_file_validation.block_on_invalid` | `false` | Block review if invalid files found |
| `strict_file_validation.warn_only` | `true` | Show warnings without blocking |

---

## Deployment Strategy

### Gradual Rollout Plan

Deploy improvements progressively to monitor impact:

**Week 1: Limited Rollout (25%)**
```json
{
  "features": {
    "reviewer_improvements": {
      "enabled": true,
      "rollout_percentage": 25
    }
  }
}
```
- Phase 1 & 2 improvements seen by ~25% of reviews
- Monitor for accuracy regressions
- Baseline: current user satisfaction metrics

**Week 2: Expanded Rollout (50%)**
```json
{
  "features": {
    "reviewer_improvements": {
      "enabled": true,
      "rollout_percentage": 50
    }
  }
}
```
- 50% of reviews see improvements
- Verify no degradation in metrics
- Gather user feedback on accuracy

**Week 3: Near-Full Rollout (75%)**
```json
{
  "features": {
    "reviewer_improvements": {
      "enabled": true,
      "rollout_percentage": 75
    }
  }
}
```
- 75% of reviews see improvements
- Check false positive rate trend
- Confirm r² remains > 0.60

**Week 4: Full Rollout (100%)**
```json
{
  "features": {
    "reviewer_improvements": {
      "enabled": true,
      "rollout_percentage": 100
    }
  }
}
```
- All reviews use improvements
- Lock in final metrics
- Monitor production stability

### Monitoring During Rollout

After each change, run:

```bash
# View current config
node -e "const c = require('./config.json'); console.log(JSON.stringify(c.features, null, 2))"

# Check acceptance rates per reviewer
node -e "
const fs = require('fs');
const path = require('path');
const LOGS_DIR = path.join(process.env.HOME, '.claude/plugins/prompt-review/logs');
if (!fs.existsSync(LOGS_DIR)) {
  console.log('No audit logs yet');
  process.exit(0);
}
const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl')).slice(-7);
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
      if (e.suggestions_accepted && e.suggestions_accepted.includes(f.finding_id)) stats[role].accepted++;
    }
  }
}
for (const [role, {proposed, accepted}] of Object.entries(stats)) {
  const pct = ((accepted/proposed)*100).toFixed(0);
  console.log(\`\${role.padEnd(18)} \${proposed} proposed, \${accepted} accepted (\${pct}%)\`);
}
"

# Check composite score distribution
node index.cjs --stats
```

---

## Rollback Procedures

### Quick Rollback (Disable Feature)

If accuracy drops or issues detected:

```bash
# Edit config.json
{
  "features": {
    "reviewer_improvements": {
      "enabled": false,        # ← Disable immediately
      "rollout_percentage": 0
    }
  }
}

# Verify changes applied
node -e "const c = require('./config.json'); console.log('Improvements enabled:', c.features.reviewer_improvements.enabled)"
```

### Partial Rollback (Phase 2 Only)

If Phase 2 specific issues:

```bash
{
  "features": {
    "reviewer_improvements": {
      "enabled": true,
      "rollout_percentage": 100,
      "phase1_enabled": true,    # Keep Phase 1
      "phase2_enabled": false    # Disable Phase 2
    }
  }
}
```

### Full Rollback (Version 1.x)

If critical issues:

```bash
git revert HEAD                    # Revert config.json changes
npm test                          # Verify tests pass
node index.cjs --stats            # Check metrics restored
```

---

## Precision Thresholds

### What Are Precision Thresholds?

Precision thresholds define the minimum acceptance rate (precision) required for a reviewer to maintain their weight. If a reviewer's precision drops below threshold, their weight is reduced.

### Threshold Values

```
security:       0.70  (70% of findings accepted)
testing:        0.70
clarity:        0.65
domain_sme:     0.70
frontend_ux:    0.75
documentation:  0.60
```

**Interpretation:**
- Security must get 70% of findings right (strict, high cost of false positives)
- Frontend/UX must get 75% right (strictest, affects user experience)
- Documentation most lenient at 60% (lower cost of false positives)

### Monitoring Threshold Compliance

```bash
node adapt.cjs 30        # Preview weight suggestions
node adapt.cjs 30 --apply # Apply adjustments if precision issues detected
```

---

## Severity Matrix

### Purpose

The severity matrix controls how findings are weighted based on their impact level:

```json
{
  "blocker": { "override_weight": 3.0, "requires_user_review": true },
  "major": { "override_weight": 1.8 },
  "minor": { "override_weight": 1.0 },
  "nit": { "override_weight": 0.5 }
}
```

### Usage

1. **Blocker** (weight 3.0)
   - Data loss risks (DROP TABLE, rm -rf)
   - Security vulnerabilities (XSS, SQL injection)
   - Requires manual user review before proceeding

2. **Major** (weight 1.8)
   - Breaking changes (deprecated APIs)
   - Significant refactors
   - Performance regressions

3. **Minor** (weight 1.0)
   - Style issues
   - Minor logic problems
   - Can proceed with review

4. **Nit** (weight 0.5)
   - Comments and formatting
   - Suggestions, not requirements
   - Often can be ignored

### How Weights Work

If security reviewer proposes:
- 1 blocker finding (weight 3.0)
- 2 major findings (weight 1.8 each)

Effective weight = (1×3.0 + 2×1.8) / 3 = 2.2x

This means blocker findings dominate the composite score.

---

## Deployment Checklist

### Pre-Deployment

- [ ] All 21 tests passing (`npm test`)
- [ ] config.json valid JSON (`node -e "require('./config.json')"`)
- [ ] Feature flags checked (`node -e "console.log(require('./config.json').features)"`)
- [ ] Locked metrics reviewed (r² = 0.8648, 68% FP reduction)
- [ ] Deployment guide distributed to team
- [ ] Monitoring queries prepared

### Deployment

- [ ] Update config.json with new version
- [ ] Set `rollout_percentage` to 25
- [ ] Commit changes: `git commit -m "Deploy Phase 3A config (25% rollout)"`
- [ ] Push to main: `git push origin main`
- [ ] Monitor metrics for 24 hours

### Week 1 Check

- [ ] False positive rate stable or improved
- [ ] Composite scores within expected range
- [ ] User feedback positive
- [ ] No production errors in logs

### Week 2-4 Expansion

- [ ] Increase `rollout_percentage` to 50, 75, 100
- [ ] Same checks each week
- [ ] Lock in metrics after 100% rollout

### Post-Deployment

- [ ] Generate final metrics report
- [ ] Update README with new version
- [ ] Archive Phase 3A deployment guide
- [ ] Begin Phase 3B (performance optimization)

---

## Verification Commands

### Verify Configuration

```bash
# Show current config version and features
node -e "const c = require('./config.json');
console.log('Version:', c.version);
console.log('Phase 1 improvements:', c.phase1_improvements);
console.log('Phase 2 improvements:', c.phase2_improvements);
console.log('Rollout %:', c.features.reviewer_improvements.rollout_percentage)"

# Validate config schema
npm test    # All tests should pass with new config
```

### Monitor Deployment

```bash
# Show metrics dashboard
node index.cjs --stats

# Check recent audit logs
node -e "
const fs = require('fs');
const path = require('path');
const LOGS_DIR = path.join(process.env.HOME, '.claude/plugins/prompt-review/logs');
const today = new Date().toISOString().slice(0,10) + '.jsonl';
const file = path.join(LOGS_DIR, today);
if (fs.existsSync(file)) {
  const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
  const latest = JSON.parse(lines[lines.length-1]);
  console.log('Latest review:', {
    score: latest.composite_score,
    reviewers: latest.reviewers_active,
    outcome: latest.outcome
  });
}
"
```

### Quick Rollback

```bash
git revert HEAD
npm test
```

---

## FAQ

**Q: Can I enable only Phase 1 improvements?**
A: Yes, set `phase1_enabled: true, phase2_enabled: false` in config.json

**Q: What happens at 50% rollout?**
A: Half of reviews will see improvements, half will see original behavior. This allows A/B testing.

**Q: How long should each rollout stage last?**
A: Minimum 1 week per stage to gather sufficient data (50+ reviews per week expected).

**Q: What if r² drops during rollout?**
A: Immediately disable improvements and investigate. Check for false positives or precision issues.

**Q: Can reviewers be disabled individually?**
A: Not via config. Disable at orchestrator level by removing from `determineActiveReviewers()`.

**Q: How do I monitor from production?**
A: Check audit logs in `~/.claude/plugins/prompt-review/logs/`. Use Node.js scripts to analyze (see Monitoring section above).

---

## Success Criteria

After full rollout (100%):

- ✅ False positive rate maintained at 68% reduction (or better)
- ✅ Composite score r² remains > 0.60 (should be ~0.86)
- ✅ User acceptance rates unchanged or improved
- ✅ No production errors or crashes
- ✅ Metrics locked in `.claude/LOCKED_METRICS.md` updated

---

## Next Steps

After Phase 3A completion:

1. ✅ Config finalized (this document)
2. 🚀 Phase 3B: Performance Optimization
   - File caching
   - Parallel initialization
   - Lazy loading context

3. 🚀 Phase 3C: Monitoring & Observability
   - Metrics dashboard
   - Alerting
   - Feedback loop

4. 🚀 Phase 3D: Marketplace Readiness
   - Documentation polish
   - Installation validation
   - Quick-start templates

---

**Deployed:** 2026-02-25
**Config Version:** 2.0
**Estimated Phase 3 Completion:** 2026-03-05
