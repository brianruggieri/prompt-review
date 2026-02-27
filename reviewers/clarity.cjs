const DOMAIN_AWARE_VAGUE_TERMS = {
	database: {
		acceptable: [
			'optimize queries (means: improve query performance/structure)',
			'improve schema (means: normalize or denormalize appropriately)',
			'clean up data (means: remove orphaned records, consolidate tables)',
		],
		vague: [
			'optimize',
			'improve',
			'clean up',
		],
	},
	backend: {
		acceptable: [
			'optimize performance (means: reduce latency/memory)',
			'improve error handling (means: add specific error types)',
			'refactor internals (means: change structure, not behavior)',
		],
		vague: [
			'optimize',
			'improve',
			'refactor',
		],
	},
	frontend: {
		acceptable: [],
		vague: [
			'optimize (need: cache invalidation? minification? render?)',
			'improve (need: visual polish? responsiveness? accessibility?)',
			'clean up (need: remove dead code? reorganize files?)',
		],
	},
	general: {
		acceptable: [],
		vague: [
			'optimize',
			'improve',
			'fix',
			'clean up',
			'refactor',
		],
	},
};

function inferDomain(stack) {
	if (!stack) return 'general';
	const stackLower = stack.map(s => s.toLowerCase()).join(' ');
	if (stackLower.includes('postgres') || stackLower.includes('mysql') || stackLower.includes('mongo')) return 'database';
	if (stackLower.includes('rust') || stackLower.includes('go') || stackLower.includes('python') || stackLower.includes('backend')) return 'backend';
	if (stackLower.includes('react') || stackLower.includes('vue') || stackLower.includes('tailwind') || stackLower.includes('frontend')) return 'frontend';
	return 'general';
}

const SYSTEM_PROMPT = `You are a Clarity and Structure reviewer for Claude Code prompts. Your job is to identify vague language, ambiguous scope, missing output specifications, and structural issues that would cause Claude to guess rather than execute precisely.

You will receive the user's original prompt along with project context.

## What You Check

1. **Vague verbs** — Does the prompt use imprecise verbs like "optimize", "improve", "clean up", "fix" without measurable criteria? These force Claude to guess what "good" looks like.
   - EXCEPTION: In backend/database contexts, domain-standard terms like "optimize queries" or "improve schema" are acceptable because they have conventional meanings in those domains.
2. **Missing output format** — Does the prompt specify what the output should look like? (e.g., "return a function" vs. "modify the existing file" vs. "create a new module")
3. **Ambiguous scope** — Is it clear exactly which files, functions, or components should be changed? Or could Claude interpret the scope too broadly or too narrowly?
4. **Multiple unrelated requests** — Does the prompt bundle several unrelated tasks that should be separate prompts?
5. **Missing success criteria** — How will you know the task is done? Is there a definition of "done"?
6. **Implicit assumptions** — Does the prompt assume Claude knows something it wasn't told?

## Your Operations

You may suggest these operations:
- **ReplaceVague** — Replace a vague instruction with a specific, measurable one (e.g., "optimize" → "reduce render time by extracting the config section into a separate component")
- **RefactorStructure** — Reorganize the prompt into clear sections (goal, constraints, output format, success criteria)
- **AddConstraint** — Add a missing specification (e.g., "Output should be a single TypeScript file")

## Severity Guide

- **major** — Prompt is so vague that Claude will likely produce something other than what the user wants
- **minor** — Prompt could be clearer but Claude will probably get it right
- **nit** — Stylistic improvement to prompt structure

## Output Format

Respond with ONLY a JSON object matching this schema:
\`\`\`json
{
  "reviewer_role": "clarity",
  "severity_max": "major|minor|nit",
  "confidence": 0.0-1.0,
  "findings": [
    {
      "id": "CLR-001",
      "severity": "major|minor|nit",
      "confidence": 0.0-1.0,
      "issue": "Short description",
      "evidence": "The vague/ambiguous part of the prompt",
      "suggested_ops": [
        { "op": "ReplaceVague|RefactorStructure|AddConstraint", "target": "constraints|context|output|structure|examples", "value": "The replacement text" }
      ]
    }
  ],
  "no_issues": false,
  "score": 0.0-10.0
}
\`\`\`

If the prompt is already clear and specific:
\`\`\`json
{ "reviewer_role": "clarity", "severity_max": "nit", "confidence": 0.8, "findings": [], "no_issues": true, "score": 0.0-10.0 }
\`\`\`

Additionally, include a "score" field (0-10) rating the prompt's specificity and structure:
- 10: Excellent — precise verbs, clear scope, output format specified
- 7-9: Good — minor improvements possible
- 4-6: Needs work — significant ambiguity that would affect output quality
- 0-3: Poor — entirely vague, ambiguous scope, no success criteria

The score reflects the ORIGINAL prompt's quality, not the quality after your suggested fixes.`;

function buildPrompt(originalPrompt, context) {
  let userContent = `## Original Prompt\n\n${originalPrompt}\n\n## Project Context\n\n`;

  if (context.projectName) {
    userContent += `**Project:** ${context.projectName}\n`;
  }

  const domain = inferDomain(context.stack);
  if (domain !== 'general') {
    userContent += `**Project Domain:** ${domain}\n`;
    const allowedTerms = DOMAIN_AWARE_VAGUE_TERMS[domain]?.acceptable || [];
    if (allowedTerms.length > 0) {
      userContent += `**Domain-Acceptable Vague Terms:** ${allowedTerms.join(', ')}\n`;
    }
  }

  if (context.stack && context.stack.length > 0) {
    userContent += `**Stack:** ${context.stack.join(', ')}\n`;
  }
  if (context.structure) {
    userContent += `\n**Directory Structure (for scope reference):**\n\`\`\`\n${context.structure}\n\`\`\`\n`;
  }

  return { system: SYSTEM_PROMPT, user: userContent };
}

module.exports = {
  role: 'clarity',
  buildPrompt,
  conditional: false,
  triggers: {},
  DOMAIN_AWARE_VAGUE_TERMS,
  inferDomain,
  SYSTEM_PROMPT,
};
