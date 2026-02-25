---
name: adapt
description: Preview and apply GEA weight adaptation based on reviewer effectiveness
---

# Weight Adaptation

Preview or apply automatic reviewer weight adjustments based on reviewer effectiveness metrics from audit logs.

## Usage

```
/prompt-review:adapt              # Preview weight changes (last 30 days)
/prompt-review:adapt 60           # Preview using last 60 days
/prompt-review:adapt 30 --apply   # Apply suggested weight changes
```

## Instructions

1. Determine the time window from the user's argument (default: 30 days)
2. Check if the user wants to apply changes (`--apply` flag)
3. Run the adapt CLI:

For preview (default):
```bash
node ~/.claude/plugins/prompt-review/adapt.cjs <days>
```

For applying changes:
```bash
node ~/.claude/plugins/prompt-review/adapt.cjs <days> --apply
```

4. Display the results:
   - If `sufficient_data: false`, inform the user that not enough reviews with outcomes exist
   - If sufficient data exists, show:
     - The reflection report summary (period, total reviews, low/high precision roles)
     - The weight diff table showing current → suggested weights and reasons
   - If `--apply` was used, confirm that weights were saved and explain the changes

5. For suggestions, offer insights on:
   - Why high-precision reviewers are getting weight increases
   - Why low-precision reviewers might get weight decreases
   - What the precision threshold is (70% by default)
   - When to run adaptation again (typically every 30 days)
