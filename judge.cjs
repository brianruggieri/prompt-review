/**
 * judge.cjs — LLM-as-Judge evaluates debate quality
 */

const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator of prompt engineering debates. You assess argument quality based on:

1. **Specificity**: Is the argument precise and concrete vs. vague?
2. **Evidence**: Does the argument cite specific parts of the original prompt or provide concrete examples?
3. **Reasoning**: Is the logic sound? Does it acknowledge constraints and tradeoffs?
4. **Calibration**: Does the reviewer recognize uncertainty? Overconfident or appropriately confident?
5. **Responsiveness**: Does the rebuttal actually address the opponent's points?

For each role's arguments, assign:
- **argument_quality_score**: 0-10 (higher = better)
- **argument_labels**: Array of applicable labels (e.g., ["precise", "evidence-backed", "well-reasoned", "vague", "overconfident"])
- **policy_signal**: 1-2 sentence insight for improving this role's prompt
- **winner**: "role_a", "role_b", or "tie" based on quality of reasoning

Output valid JSON only.`;

/**
 * buildJudgePrompt - Builds a prompt for the judge to evaluate a debate
 *
 * @param {Object} debateResult - Result from runDebatePhase with results array
 * @returns {Object} { system, user }
 */
function buildJudgePrompt(debateResult) {
  let user = '## Debates to Evaluate\n\n';

  if (debateResult.results && debateResult.results.length > 0) {
    for (let i = 0; i < debateResult.results.length; i++) {
      const debate = debateResult.results[i];
      user += `### Debate ${i + 1}: ${debate.pair.role_a} vs ${debate.pair.role_b}\n\n`;
      user += `**Conflict**: ${debate.pair.conflict_description}\n\n`;

      user += `**${debate.pair.role_a.toUpperCase()} Argument**:\n${debate.role_a_argument}\n\n`;
      user += `**${debate.pair.role_b.toUpperCase()} Argument**:\n${debate.role_b_argument}\n\n`;
      user += `**${debate.pair.role_a.toUpperCase()} Rebuttal**:\n${debate.role_a_rebuttal}\n\n`;
      user += `**${debate.pair.role_b.toUpperCase()} Rebuttal**:\n${debate.role_b_rebuttal}\n\n`;
      user += '---\n\n';
    }
  }

  user += `## Output Format
Return a JSON array with one object per role per debate. Each object:
{
  "role": "role_name",
  "debate_index": 0,
  "argument_quality_score": 7.5,
  "argument_labels": ["precise", "evidence-backed"],
  "policy_signal": "Improve specificity on constraint impacts",
  "winner": "role_a"
}`;

  return {
    system: JUDGE_SYSTEM_PROMPT,
    user,
  };
}

/**
 * runJudge - Calls Sonnet to evaluate debate quality
 *
 * @async
 * @param {Object} debateResult - Result from runDebatePhase
 * @param {Object} client - Anthropic client
 * @param {string} model - Judge model (typically sonnet)
 * @returns {Promise<Object>} { feedback: JudgeFeedback[], summary, usage }
 */
async function runJudge(debateResult, client, model) {
  const judgePrompt = buildJudgePrompt(debateResult);

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    messages: [{ role: 'user', content: judgePrompt.user }],
    system: judgePrompt.system,
  });

  const judgeText = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Parse JSON from response
  let feedback = [];
  try {
    // Try to extract JSON array from response
    const jsonMatch = judgeText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      feedback = Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch (e) {
    // If parsing fails, log and continue with empty feedback
    feedback = [];
  }

  return {
    feedback,
    summary: judgeText,
    usage: response.usage,
  };
}

module.exports = {
  buildJudgePrompt,
  runJudge,
  JUDGE_SYSTEM_PROMPT,
};
