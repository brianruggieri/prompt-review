/**
 * claude-code-dispatch.cjs
 *
 * Dispatches reviewer tasks directly through Claude Code's task system
 * (NOT as background Node.js processes)
 *
 * Usage from Claude Code session:
 *   const dispatch = require('./scripts/claude-code-dispatch.cjs');
 *   const results = await dispatch.reviewPrompt(prompt, reviewerRoles, context);
 */

const crypto = require('crypto');

/**
 * Build a reviewer prompt for a specific role
 */
function buildReviewerPrompt(role, systemPrompt, prompt, context) {
  return {
    system: systemPrompt,
    user: `## Your Review Task

You are a specialist **${role}** reviewer. Review this prompt and identify issues.

### The Prompt to Review
\`\`\`
${prompt}
\`\`\`

### Project Context
- Project: ${context.projectName || 'unknown'}
- Stack: ${(context.stack || []).join(', ') || 'unknown'}
- Test Framework: ${context.testFramework || 'none specified'}
- Build Tool: ${context.buildTool || 'none specified'}

### Your Response Format
Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "reviewer_role": "${role}",
  "severity_max": "blocker|major|minor|nit",
  "confidence": 0.0-1.0,
  "findings": [
    {
      "id": "ROLE-001",
      "severity": "blocker|major|minor|nit",
      "confidence": 0.0-1.0,
      "issue": "Clear description of the problem",
      "evidence": "Specific quote or detail from prompt",
      "suggested_ops": [
        { "op": "AddGuardrail|AddConstraint", "detail": "..." }
      ]
    }
  ],
  "no_issues": false,
  "score": 0.0-10.0
}

IMPORTANT: Return ONLY JSON. No explanation, no markdown, no code blocks. Just pure JSON.`
  };
}

/**
 * Dispatch a single reviewer as a Claude Code task (real Claude instance)
 * Called FROM within Claude Code session using the Task tool
 */
async function dispatchReviewerTask(role, systemPrompt, prompt, context) {
  // This function signature is designed to be called by Task tool from Claude Code
  // It returns instructions for how to dispatch the task

  return {
    task_type: 'reviewer',
    role,
    prompt: buildReviewerPrompt(role, systemPrompt, prompt, context),
    timeout_ms: 60000,
    fallback_if_error: { findings: [], score: 5.0 }
  };
}

/**
 * Parse reviewer response and extract findings
 */
function parseReviewerResponse(roleResponses) {
  const findings = [];
  const scores = {};

  for (const { role, response, error } of roleResponses) {
    if (error) {
      console.warn(`Reviewer ${role} error: ${error}`);
      scores[role] = 5.0;
      continue;
    }

    try {
      const critique = JSON.parse(response);

      if (critique.findings && Array.isArray(critique.findings)) {
        critique.findings.forEach(f => {
          findings.push({
            ...f,
            reviewer_role: role,
            id: f.id || `${role.toUpperCase()}-${findings.length}`
          });
        });
      }

      if (typeof critique.score === 'number') {
        scores[role] = critique.score;
      }
    } catch (e) {
      console.warn(`Failed to parse ${role} response:`, e.message);
      scores[role] = 5.0;
    }
  }

  return { findings, scores };
}

/**
 * Compute composite score from individual reviewer scores
 */
function computeCompositeScore(scores, weights = {}) {
  if (Object.keys(scores).length === 0) return 0;

  const defaultWeight = 1.0;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [role, score] of Object.entries(scores)) {
    const weight = weights[role] || defaultWeight;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? (weightedSum / totalWeight).toFixed(2) : 0;
}

/**
 * Public API for reviewing a prompt with real Claude Code tasks
 *
 * Must be called from within Claude Code session (uses Task tool)
 */
async function reviewPromptWithClaudeCodeTasks(prompt, reviewerRoles, context, taskDispatcher) {
  // taskDispatcher is a callback that uses Claude Code's Task tool
  // It receives the task definition and returns the result

  if (!taskDispatcher) {
    throw new Error('reviewPromptWithClaudeCodeTasks requires taskDispatcher callback (uses Task tool from Claude Code)');
  }

  const results = [];

  // Dispatch all reviewers in parallel using taskDispatcher
  const taskPromises = reviewerRoles.map(async (roleData) => {
    const { role, system: systemPrompt } = roleData;

    try {
      const taskDef = dispatchReviewerTask(role, systemPrompt, prompt, context);
      const result = await taskDispatcher(taskDef);

      return {
        role,
        response: result,
        error: null
      };
    } catch (e) {
      return {
        role,
        response: null,
        error: e.message
      };
    }
  });

  const roleResponses = await Promise.all(taskPromises);
  const { findings, scores } = parseReviewerResponse(roleResponses);

  return {
    findings,
    scores,
    compositeScore: computeCompositeScore(scores),
    reviewerCount: reviewerRoles.length,
    successCount: roleResponses.filter(r => !r.error).length,
    durationMs: Date.now()
  };
}

module.exports = {
  buildReviewerPrompt,
  dispatchReviewerTask,
  parseReviewerResponse,
  computeCompositeScore,
  reviewPromptWithClaudeCodeTasks
};
