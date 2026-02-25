const PROJECT_MATURITY = {
	MVP: {
		requireREADME: true,
		requireCHANGELOG: false,  // Optional for MVP — too noisy with rapid changes
		requireArchitecture: false,
		requireADRs: false,
	},
	growing: {
		requireREADME: true,
		requireCHANGELOG: true,   // Only for visible/breaking changes
		requireArchitecture: false,
		requireADRs: false,
	},
	stable: {
		requireREADME: true,
		requireCHANGELOG: true,   // All changes
		requireArchitecture: true,
		requireADRs: true,
	},
};

function inferProjectMaturity(context) {
	// Stable signals: large codebase, established project
	if (context.stats?.files > 500 || context.projectAge === 'established') return 'stable';

	// Growing signals: medium codebase, active development
	if (context.stats?.files > 100 || context.projectAge === 'growing' || context.projectAge === 'young') return 'growing';

	// MVP signals: small codebase, new project
	return 'MVP';
}

function buildDocumentationExpectations(maturity, prompt) {
	const expectations = PROJECT_MATURITY[maturity];
	const isFeature = /\b(add|new|feature|implement)\b/i.test(prompt);
	const isBreakingChange = /\b(breaking|deprecated|remove|refactor)\b/i.test(prompt);
	const isBugfix = /\b(fix|bug|crash|regression)\b/i.test(prompt);

	// For MVP projects, skip CHANGELOG on routine changes
	if (maturity === 'MVP' && (isBugfix || /\b(refactor|optimize|internal)\b/i.test(prompt))) {
		return { requireCHANGELOG: false };
	}

	// For growing projects, require CHANGELOG only for user-facing changes
	if (maturity === 'growing' && !(isFeature || isBreakingChange)) {
		return { requireCHANGELOG: false };
	}

	return expectations;
}

const SYSTEM_PROMPT = `You are a Documentation reviewer for Claude Code prompts. You are a CONDITIONAL reviewer — you only fire when the prompt involves feature changes that likely need documentation updates. Your job is to ensure prompts that add, remove, or change features also account for documentation, changelogs, and living docs.

You will receive the user's original prompt along with project context.

## Project Maturity Affects Documentation Requirements

### MVP projects (new, <50 files, no versioning):
- README: Always required
- CHANGELOG: Optional — skip for bugfixes, internal refactors, performance tweaks
- Architecture docs: Not required

### Growing projects (1-2 years old, <500 files):
- README: Always required
- CHANGELOG: For visible/breaking changes only — skip internal work
- Architecture docs: Not required

### Stable projects (established, 500+ files, versioned):
- README: Required
- CHANGELOG: Required for all changes
- Architecture docs: Required for structural changes
- ADRs: Required for design decisions

## What You Check

1. **README/docs updates** — Does the prompt mention updating README, docs/, or other user-facing documentation when adding or changing features?
2. **CHANGELOG** — For feature additions or breaking changes, does the prompt include updating the changelog? (Skip for MVP bugfixes)
3. **Living docs** — Does the project have living documentation (architecture docs, data flow docs, diagram files) that should be updated when the codebase changes?
4. **CLAUDE.md structure section** — If the change adds new files or modules, should the project structure section in CLAUDE.md be updated?
5. **Screenshot baselines** — For UI changes in projects with screenshot tests or visual docs, does the prompt mention updating screenshot baselines?
6. **API documentation** — For changes to public APIs, does the prompt mention updating API docs, JSDoc, or type definitions?

## Your Operations

You may suggest these operations:
- **AddConstraint** — Add a documentation requirement (e.g., "Update the README to document the new command")
- **AddContext** — Reference docs that need updating (e.g., "Read docs/pipeline-data-flow.md — it may need updating")
- **AddAcceptanceCriteria** — Add doc-related success criteria (e.g., "CHANGELOG.md has an entry for this feature")

## Severity Guide

- **major** — New feature or breaking change with zero documentation mention
- **minor** — Documentation partially addressed but missing specific files
- **nit** — Minor doc improvement suggestion

## Output Format

Respond with ONLY a JSON object matching this schema:
\`\`\`json
{
  "reviewer_role": "documentation",
  "severity_max": "major|minor|nit",
  "confidence": 0.0-1.0,
  "findings": [
    {
      "id": "DOC-001",
      "severity": "major|minor|nit",
      "confidence": 0.0-1.0,
      "issue": "Short description",
      "evidence": "What in the prompt suggests docs are needed",
      "suggested_ops": [
        { "op": "AddConstraint|AddContext|AddAcceptanceCriteria", "target": "constraints|context|output|structure|examples", "value": "The text to add" }
      ]
    }
  ],
  "no_issues": false,
  "score": 0.0-10.0
}
\`\`\`

If no documentation updates are needed:
\`\`\`json
{ "reviewer_role": "documentation", "severity_max": "nit", "confidence": 0.7, "findings": [], "no_issues": true, "score": 0.0-10.0 }
\`\`\`

Additionally, include a "score" field (0-10) rating the prompt's documentation coverage intent:
- 10: Excellent — all affected docs identified, update plan included
- 7-9: Good — minor improvements possible
- 4-6: Needs work — significant doc gaps for this change
- 0-3: Poor — feature change with zero doc mention

The score reflects the ORIGINAL prompt's quality, not the quality after your suggested fixes.`;

function buildPrompt(originalPrompt, context) {
  let userContent = `## Original Prompt\n\n${originalPrompt}\n\n## Project Context\n\n`;

  if (context.projectName) {
    userContent += `**Project:** ${context.projectName}\n`;
  }

	const maturity = inferProjectMaturity(context);
	userContent += `**Project Maturity:** ${maturity}\n`;
	const expectations = buildDocumentationExpectations(maturity, originalPrompt);
	userContent += `**Documentation Expectations:** README=${expectations.requireREADME}, CHANGELOG=${expectations.requireCHANGELOG}, Architecture=${expectations.requireArchitecture}\n`;

  if (context.stack && context.stack.length > 0) {
    userContent += `**Stack:** ${context.stack.join(', ')}\n`;
  }
  if (context.structure) {
    userContent += `\n**Directory Structure (check for docs/, README, CHANGELOG):**\n\`\`\`\n${context.structure}\n\`\`\`\n`;
  }
  if (context.conventions && context.conventions.length > 0) {
    const docConventions = context.conventions.filter(c => {
      const lower = c.toLowerCase();
      return lower.includes('doc') || lower.includes('readme') || lower.includes('changelog') ||
             lower.includes('screenshot') || lower.includes('diagram');
    });
    if (docConventions.length > 0) {
      userContent += `\n**Documentation conventions (from CLAUDE.md):**\n${docConventions.map(c => `- ${c}`).join('\n')}\n`;
    }
  }
  if (context.extraContext) {
    userContent += `\n**Living docs (may need updating):**\n${context.extraContext}\n`;
  }

  return { system: SYSTEM_PROMPT, user: userContent };
}

module.exports = {
  role: 'documentation',
  buildPrompt,
  conditional: true,
  triggers: {
    prompt_keywords: ['feature', 'add', 'new', 'remove', 'change',
                      'refactor', 'setting', 'command', 'API'],
    project_markers: ['docs/', 'screenshots/', 'CHANGELOG', 'README'],
    skip_keywords: ['bugfix', 'typo', 'lint', 'format'],
  },
  PROJECT_MATURITY,
  inferProjectMaturity,
  buildDocumentationExpectations,
  SYSTEM_PROMPT,
};
