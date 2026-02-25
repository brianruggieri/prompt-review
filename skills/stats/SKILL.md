---
name: stats
description: Show prompt review quality trends and metrics
---

# Prompt Review Stats

Show historical prompt review quality metrics.

## Usage

```
/prompt-review:stats              # last 30 days
/prompt-review:stats 7            # last 7 days
/prompt-review:stats all          # all time
```

## Instructions

1. Determine the time window from the user's argument (default: 30 days)
2. Run the stats CLI:

```bash
node ~/.claude/plugins/prompt-review/index.cjs --stats --days <N>
```

Or for all-time:
```bash
node ~/.claude/plugins/prompt-review/index.cjs --stats --days all
```

For machine-readable output add `--json`.

3. Present the dashboard output to the user
4. If requested, offer insights on:
   - Which review dimensions are improving vs. stagnating
   - Whether the weakest subscore is trending up
   - Most frequent finding patterns (prompt-writing habits to improve)
