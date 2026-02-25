/**
 * debate.cjs — Builds and runs structured debates between conflicting reviewers
 */

/**
 * selectDebatePairs - Select debate pairs from conflicts (max 2 pairs per review)
 * Selects pairs with direct AddConstraint vs RemoveConstraint conflicts
 *
 * @param {Array} conflicts - Output from detectConflicts (array of conflict objects)
 * @param {Array} allOps - All extracted ops
 * @param {Object} options - { max_pairs: 2 }
 * @returns {Array} pairs where pair = { role_a, role_b, conflict_description, op_a, op_b }
 */
function selectDebatePairs(conflicts, allOps, options = {}) {
  const { max_pairs = 2 } = options;
  const pairs = [];

  if (!conflicts || conflicts.length === 0) {
    return [];
  }

  for (const conflict of conflicts) {
    if (pairs.length >= max_pairs) break;

    // Conflict should have ops array with at least 2 ops
    if (!conflict.ops || conflict.ops.length < 2) continue;

    const op_a = conflict.ops[0];
    const op_b = conflict.ops[1];

    // Extract reviewer roles
    const role_a = op_a.reviewer_role;
    const role_b = op_b.reviewer_role;

    if (!role_a || !role_b) continue;

    // Build conflict description
    const conflictDesc = `${role_a} proposes "${op_a.op}" on ${conflict.target}; ${role_b} proposes "${op_b.op}" on ${conflict.target}`;

    pairs.push({
      role_a,
      role_b,
      conflict_description: conflictDesc,
      op_a,
      op_b,
    });
  }

  return pairs;
}

/**
 * buildDebatePrompt - Builds debate prompts for both roles
 *
 * @param {string} roleA - Role A name (e.g., 'security')
 * @param {string} roleB - Role B name (e.g., 'testing')
 * @param {string} conflictDescription - Description of the conflict
 * @param {string} critiqueA - Role A's original critique
 * @param {string} critiqueB - Role B's original critique
 * @param {string} originalPrompt - The user's original prompt
 * @param {Object} context - Context object (projectName, stack, etc.)
 * @returns {Object} { roleA: { system, user }, roleB: { system, user } }
 */
function buildDebatePrompt(roleA, roleB, conflictDescription, critiqueA, critiqueB, originalPrompt, context = {}) {
  const debateSystem = `You are a prompt reviewer debating another reviewer's position. Your job is to:
1. Listen to your opponent's position
2. Present your own well-reasoned perspective (2-3 sentences)
3. Respond to their rebuttal with calibrated reasoning

Be specific, cite evidence from the original prompt, and acknowledge valid points your opponent makes.`;

  const debateUserTemplate = (thisRole, thisRoleCritique, otherRole, otherRoleCritique, originalPrompt, context) => {
    let user = `## Original Prompt
${originalPrompt}

## Conflict
${conflictDescription}

## Your position (${thisRole})
${thisRoleCritique}

## Opponent position (${otherRole})
${otherRoleCritique}`;

    if (context && context.projectName) {
      user += `\n\n## Project Context
Project: ${context.projectName}`;
      if (context.stack) {
        user += `\nStack: ${context.stack.join(', ')}`;
      }
    }

    user += `\n\nMake your case in 2-3 sentences. Be specific and evidence-based.`;
    return user;
  };

  return {
    roleA: {
      system: debateSystem,
      user: debateUserTemplate(roleA, critiqueA, roleB, critiqueB, originalPrompt, context),
    },
    roleB: {
      system: debateSystem,
      user: debateUserTemplate(roleB, critiqueB, roleA, critiqueA, originalPrompt, context),
    },
  };
}

/**
 * runDebateRound - Runs a single debate pair through the API
 * Sequence: A-argument → B-argument → A-rebuttal → B-rebuttal
 *
 * @async
 * @param {Object} params
 *   - roleA: role name
 *   - roleB: role name
 *   - conflict: conflict description
 *   - critiqueA: role A's original critique
 *   - critiqueB: role B's original critique
 *   - originalPrompt: user's prompt
 *   - context: context object
 *   - client: Anthropic client
 *   - model: haiku model
 * @returns {Promise<Object>} { role_a_argument, role_b_argument, role_a_rebuttal, role_b_rebuttal, usage }
 */
async function runDebateRound(params) {
  const {
    roleA,
    roleB,
    conflict,
    critiqueA,
    critiqueB,
    originalPrompt,
    context,
    client,
    model,
  } = params;

  const debatePrompts = buildDebatePrompt(roleA, roleB, conflict, critiqueA, critiqueB, originalPrompt, context);
  let usage = { input_tokens: 0, output_tokens: 0 };

  // Round 1: Role A makes argument
  const argAResp = await client.messages.create({
    model,
    max_tokens: 500,
    messages: [{ role: 'user', content: debatePrompts.roleA.user }],
    system: debatePrompts.roleA.system,
  });
  const role_a_argument = argAResp.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
  usage.input_tokens += argAResp.usage?.input_tokens || 0;
  usage.output_tokens += argAResp.usage?.output_tokens || 0;

  // Round 2: Role B makes argument
  const argBResp = await client.messages.create({
    model,
    max_tokens: 500,
    messages: [{ role: 'user', content: debatePrompts.roleB.user }],
    system: debatePrompts.roleB.system,
  });
  const role_b_argument = argBResp.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
  usage.input_tokens += argBResp.usage?.input_tokens || 0;
  usage.output_tokens += argBResp.usage?.output_tokens || 0;

  // Round 3: Role A rebuts
  const rebAResp = await client.messages.create({
    model,
    max_tokens: 500,
    messages: [
      { role: 'user', content: debatePrompts.roleA.user },
      { role: 'assistant', content: role_a_argument },
      { role: 'user', content: `${roleB} responds: ${role_b_argument}\n\nNow rebut in 2-3 sentences.` },
    ],
    system: debatePrompts.roleA.system,
  });
  const role_a_rebuttal = rebAResp.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
  usage.input_tokens += rebAResp.usage?.input_tokens || 0;
  usage.output_tokens += rebAResp.usage?.output_tokens || 0;

  // Round 4: Role B rebuts
  const rebBResp = await client.messages.create({
    model,
    max_tokens: 500,
    messages: [
      { role: 'user', content: debatePrompts.roleB.user },
      { role: 'assistant', content: role_b_argument },
      { role: 'user', content: `${roleA} responds: ${role_a_rebuttal}\n\nNow rebut in 2-3 sentences.` },
    ],
    system: debatePrompts.roleB.system,
  });
  const role_b_rebuttal = rebBResp.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
  usage.input_tokens += rebBResp.usage?.input_tokens || 0;
  usage.output_tokens += rebBResp.usage?.output_tokens || 0;

  return {
    role_a_argument,
    role_b_argument,
    role_a_rebuttal,
    role_b_rebuttal,
    usage,
  };
}

/**
 * runDebatePhase - Runs all debate pairs in parallel
 *
 * @async
 * @param {Array} pairs - Array of pairs from selectDebatePairs
 * @param {Array} critiques - All valid critiques
 * @param {string} originalPrompt - User's original prompt
 * @param {Object} context - Context object
 * @param {Object} client - Anthropic client
 * @param {string} model - Model name
 * @returns {Promise<Object>} { results, failed_pairs, total_tokens }
 */
async function runDebatePhase(pairs, critiques, originalPrompt, context, client, model) {
  if (!pairs || pairs.length === 0) {
    return { results: [], failed_pairs: [], total_tokens: 0 };
  }

  // Map critiques by role for lookup
  const critiqueByRole = {};
  for (const critique of critiques) {
    critiqueByRole[critique.reviewer_role] = critique;
  }

  // Run all pairs in parallel
  const promises = pairs.map(pair => {
    const critiqueA = critiqueByRole[pair.role_a];
    const critiqueB = critiqueByRole[pair.role_b];

    return runDebateRound({
      roleA: pair.role_a,
      roleB: pair.role_b,
      conflict: pair.conflict_description,
      critiqueA: critiqueA ? JSON.stringify(critiqueA) : 'No critique',
      critiqueB: critiqueB ? JSON.stringify(critiqueB) : 'No critique',
      originalPrompt,
      context,
      client,
      model,
    }).then(result => ({
      success: true,
      pair,
      ...result,
    })).catch(error => ({
      success: false,
      pair,
      error: error.message,
    }));
  });

  const settledResults = await Promise.allSettled(promises);

  let totalTokens = 0;
  const successResults = [];
  const failedPairs = [];

  for (const settled of settledResults) {
    if (settled.status === 'fulfilled') {
      const result = settled.value;
      if (result.success) {
        successResults.push(result);
        totalTokens += (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0);
      } else {
        failedPairs.push({ pair: result.pair, error: result.error });
      }
    } else {
      failedPairs.push({ error: settled.reason?.message || 'Unknown error' });
    }
  }

  return {
    results: successResults,
    failed_pairs: failedPairs,
    total_tokens: totalTokens,
  };
}

module.exports = {
  selectDebatePairs,
  buildDebatePrompt,
  runDebateRound,
  runDebatePhase,
};
