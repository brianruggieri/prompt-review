/**
 * policy.cjs — Reads judge feedback, proposes prompt updates
 * SAFETY CRITICAL: Never writes to reviewers/*.cjs files. Only writes to reviewers/prompts/<role>.txt
 */

const fs = require('fs');
const path = require('path');

/**
 * readCurrentSystemPrompt - Extracts SYSTEM_PROMPT from a reviewer file
 *
 * @param {string} role - Reviewer role (e.g., 'security')
 * @returns {string|null} The SYSTEM_PROMPT string, or null if not found
 */
function readCurrentSystemPrompt(role) {
  const reviewerFile = path.join(__dirname, 'reviewers', `${role}.cjs`);

  try {
    if (!fs.existsSync(reviewerFile)) {
      return null;
    }

    const content = fs.readFileSync(reviewerFile, 'utf-8');

    // Extract SYSTEM_PROMPT using regex
    // Matches: const SYSTEM_PROMPT = `...` or const SYSTEM_PROMPT = "..."
    const match = content.match(/const\s+SYSTEM_PROMPT\s*=\s*[`"']([\s\S]*?)[`"']/);
    if (match) {
      return match[1];
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * computePolicyInsights - Aggregates debate feedback to generate policy insights
 *
 * @param {number} days - Number of days to look back (for future: would read from audit logs)
 * @param {Array} debateLogs - Array of debate logs from audit entries (for testing)
 * @returns {Object} { [role]: PolicyInsights } where PolicyInsights = { avg_argument_quality, common_labels, policy_signal, needs_update }
 */
function computePolicyInsights(days, debateLogs = null) {
  const insights = {};

  // If no debate logs provided, try to read from audit files
  let logs = debateLogs;
  if (!logs) {
    logs = [];
    // In production, would read from logs/*.jsonl files
    // For now, return empty if no logs passed
  }

  if (!logs || logs.length === 0) {
    return {};
  }

  // Aggregate by role
  const roleData = {};

  for (const log of logs) {
    if (!log.debate_log || !log.debate_log.judge_feedback) {
      continue;
    }

    for (const feedback of log.debate_log.judge_feedback) {
      const role = feedback.role;
      if (!roleData[role]) {
        roleData[role] = {
          scores: [],
          labels: [],
          signals: [],
          debate_count: 0,
        };
      }

      roleData[role].scores.push(feedback.argument_quality_score || 0);
      if (feedback.argument_labels) {
        roleData[role].labels.push(...feedback.argument_labels);
      }
      if (feedback.policy_signal) {
        roleData[role].signals.push(feedback.policy_signal);
      }
      roleData[role].debate_count++;
    }
  }

  // Compute insights for each role
  for (const [role, data] of Object.entries(roleData)) {
    const avgScore = data.scores.length > 0
      ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
      : 0;

    // Count label frequencies
    const labelCounts = {};
    for (const label of data.labels) {
      labelCounts[label] = (labelCounts[label] || 0) + 1;
    }

    // Sort by frequency
    const commonLabels = Object.entries(labelCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([label]) => label);

    insights[role] = {
      avg_argument_quality: Math.round(avgScore * 100) / 100,
      common_labels: commonLabels,
      policy_signal: data.signals.length > 0 ? data.signals[0] : null,
      needs_update: avgScore < 6.0,  // Threshold for update
      debate_count: data.debate_count,
    };
  }

  return insights;
}

/**
 * generatePromptProposal - Generates an improved prompt based on judge feedback
 * SAFETY CRITICAL: Writes ONLY to reviewers/prompts/<role>.txt, NEVER to reviewers/*.cjs
 *
 * @async
 * @param {string} role - Reviewer role
 * @param {string} currentSystemPrompt - Current SYSTEM_PROMPT value
 * @param {Object} insights - PolicyInsights for this role
 * @param {Object} client - Anthropic client
 * @param {string} model - Model to use for generation
 * @returns {Promise<Object>} { proposedPrompt, diff }
 */
async function generatePromptProposal(role, currentSystemPrompt, insights, client, model) {
  const proposalSystem = `You are a prompt optimization expert. Based on judge feedback from debates, improve a reviewer's system prompt.

Rules:
- Keep the same role and purpose
- Address the policy signals from judge feedback
- Make it more specific and evidence-driven
- Do not remove core constraints
- Output ONLY the new prompt text, no explanations`;

  const proposalUser = `## Current Prompt for ${role}
${currentSystemPrompt}

## Judge Feedback (from debates)
- Average argument quality: ${insights.avg_argument_quality}/10
- Common labels: ${insights.common_labels.join(', ')}
- Policy signal: ${insights.policy_signal}

Improve this prompt to address the feedback. Output ONLY the new prompt text.`;

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    messages: [{ role: 'user', content: proposalUser }],
    system: proposalSystem,
  });

  const proposedPrompt = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  // Create a simple diff
  const diff = {
    original: currentSystemPrompt.slice(0, 100) + '...',
    proposed: proposedPrompt.slice(0, 100) + '...',
  };

  // Write proposal to reviewers/prompts/<role>.txt for human review
  // SAFETY: This is the ONLY file we write to; never write to .cjs files
  const promptsDir = path.join(__dirname, 'reviewers', 'prompts');
  try {
    if (!fs.existsSync(promptsDir)) {
      fs.mkdirSync(promptsDir, { recursive: true });
    }

    const proposalFile = path.join(promptsDir, `${role}.txt`);
    const proposalContent = `# Proposed Prompt Update for ${role}

Generated: ${new Date().toISOString()}

## Judge Feedback Summary
- Average argument quality: ${insights.avg_argument_quality}/10
- Common labels: ${insights.common_labels.join(', ')}
- Policy signal: ${insights.policy_signal}

## Current Prompt
${currentSystemPrompt}

## Proposed Prompt
${proposedPrompt}

## Instructions
Review this proposal. If approved, manually update reviewers/${role}.cjs with the new prompt.
`;
    fs.writeFileSync(proposalFile, proposalContent, 'utf-8');
  } catch (e) {
    // Log error but don't fail the operation
    console.error(`Failed to write proposal to reviewers/prompts/${role}.txt:`, e.message);
  }

  return {
    proposedPrompt,
    diff,
  };
}

module.exports = {
  readCurrentSystemPrompt,
  computePolicyInsights,
  generatePromptProposal,
};
