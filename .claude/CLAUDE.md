# prompt-review — Development Rules

## Architecture

**prompt-review** is a Claude Code plugin (hook + skill). No dependencies: CommonJS `.cjs`, Node.js built-ins only. The plugin runs synchronously where possible; async only in API mode (LLM scoring).

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
| `cost.cjs` | Audit logging: `writeAuditLog`, `updateAuditOutcome`, `estimateCost` |
| `stats.cjs` | Analytics: `generateStats`, `renderDashboard`, `computeTopPatterns` |
| `editor.cjs` | Merge: `mergeCritiques`, `computeCompositeScore`, `extractOps` |
| `orchestrator.cjs` | Fan-out: `determineActiveReviewers`, `runReviewersApi` |
| `config.json` | Configuration — must stay valid JSON |
| `tests/run.cjs` | Test runner — must pass before each phase completion |

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
