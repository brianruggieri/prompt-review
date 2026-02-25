---
name: review
description: "Review and refine a prompt through parallel specialist reviewers (Domain SME, Security, Clarity, Testing + conditional Frontend/UX and Documentation). Shows diff and asks for approval before proceeding."
---

# Prompt Review

## What This Skill Does

Reviews a prompt through 4-6 parallel specialist reviewers, merges their structured critiques, and presents a refined version for approval.

## How to Use

```
/prompt-review:review "your prompt here"
/prompt-review:review    (will ask you to provide a prompt)
```

Or append `!!!` to any prompt for automatic review (via plugin hook).

## What Happens

1. Scans your project (CLAUDE.md, package.json, stack detection)
2. Runs 4 always-on reviewers in parallel: Domain SME, Security, Clarity, Testing
3. Conditionally runs Frontend/UX (if UI work detected) and Documentation (if feature changes detected)
4. Merges critiques with priority policy: security > testing > domain_sme > documentation > frontend_ux > clarity
5. Presents a diff showing what changed and why
6. Asks for your approval before proceeding

## Execution Instructions for Claude

When this skill is invoked:

1. **Get the prompt.** If the user passed args, use them as the prompt. Otherwise ask: "What prompt would you like me to review?"

2. **Load the plugin.** Run this to get structured review data:

```javascript
const plugin = require(require('os').homedir() + '/.claude/plugins/prompt-review/index.cjs');
const data = plugin.handleSkill(prompt);
```

If `data.skipped` is true, tell the user: "Prompt review is disabled (PROMPT_REVIEW_ENABLED=false)."

3. **Run reviewers in parallel.** For each entry in `data.reviewerPrompts`, spawn a Task subagent (model: haiku) with:
   - System prompt: the reviewer's `system` field
   - User message: the reviewer's `user` field
   - Instruction: "Respond with ONLY a JSON object matching the critique schema. No other text."

4. **Collect and validate responses.** Each reviewer returns JSON:
```json
{
  "reviewer_role": "string",
  "severity_max": "blocker|major|minor|nit",
  "confidence": 0.0-1.0,
  "findings": [
    {
      "id": "string",
      "severity": "blocker|major|minor|nit",
      "confidence": 0.0-1.0,
      "issue": "Short description",
      "evidence": "What triggered this finding",
      "suggested_ops": [
        {
          "op": "AddConstraint|RemoveConstraint|RefactorStructure|ReplaceVague|AddContext|AddGuardrail|AddAcceptanceCriteria",
          "target": "constraints|context|output|structure|examples",
          "value": "The text to add/change"
        }
      ]
    }
  ],
  "no_issues": true|false
}
```

Parse each response as JSON. If a reviewer's response is malformed, skip it and note "1 reviewer unavailable" in the output.

5. **Merge critiques.** Following priority order from `data.priorityOrder`:
   - Extract all `suggested_ops` from all findings
   - Deduplicate: same op + target + value from multiple reviewers = keep once (higher severity wins)
   - Conflicts: if one reviewer says "add X" and another says "remove X", higher-priority reviewer wins
   - Sort ops by reviewer priority

6. **Apply operations to produce refined prompt.** Walk through the merged ops in priority order and apply them to the original prompt:
   - `AddConstraint` / `AddGuardrail` / `AddAcceptanceCriteria` / `AddContext` : append to the prompt
   - `ReplaceVague` : find the vague text and replace with the specific version
   - `RefactorStructure` : reorganize the prompt sections
   - `RemoveConstraint` : remove the specified text

7. **Present the review block.** Format output as:

```
+-- Prompt Review -------------------------------------------+
|                                                            |
| Reviewers: Domain SME ok  Security ok  Clarity ok  Testing ok
| Cost: $0.00 (subscription) | 2.8K tokens                  |
|                                                            |
| -- Changes (N) ------------------------------------------  |
|                                                            |
| + [Security] Added: "Never commit .env or expose           |
|   ANTHROPIC_API_KEY in generated code"                     |
|                                                            |
| ~ [Clarity] Replaced: "optimize the settings" ->           |
|   "Reduce settings.ts render time by extracting the        |
|   browser config section into a separate component"        |
|                                                            |
| -- Refined Prompt ---------------------------------------- |
|                                                            |
| <full refined prompt text>                                 |
|                                                            |
+------------------------------------------------------------+
```

If all reviewers returned `no_issues: true`, show: "No changes needed -- all reviewers passed."

8. **Ask for approval:** "Proceed with the refined prompt? (yes / no / edit)"
   - **yes** : Execute the refined prompt as the user's task
   - **no** : Execute the original prompt as-is
   - **edit** : Ask the user what to change, apply edits, then re-present

## Reviewer Roles

| Role | Focus | Operations |
|------|-------|------------|
| Domain SME | Stack, conventions, architecture | AddConstraint, AddContext, ReplaceVague |
| Security | Injection, secrets, unsafe ops | AddGuardrail, AddConstraint |
| Clarity | Vague verbs, scope, output format | ReplaceVague, RefactorStructure, AddConstraint |
| Testing | Tests, acceptance criteria | AddAcceptanceCriteria, AddConstraint |
| Frontend/UX | A11y, responsive, design system | AddConstraint, AddContext, AddAcceptanceCriteria |
| Documentation | README, changelog, living docs | AddConstraint, AddContext, AddAcceptanceCriteria |

## Configuration

- Global: `~/.claude/plugins/prompt-review/config.json`
- Per-project: `<project>/.claude/prompt-review.json`
- Kill switch: `PROMPT_REVIEW_ENABLED=false`
