const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { buildContext } = require('./context.cjs');
const { determineActiveReviewers, buildReviewerPrompts, runReviewersApi } = require('./orchestrator.cjs');
const { mergeCritiques, buildEditorPrompt, parseEditorResponse, computeCompositeScore } = require('./editor.cjs');
const { validateCritique } = require('./schemas.cjs');
const { renderReviewBlock } = require('./renderer.cjs');
const { estimateCost, writeAuditLog } = require('./cost.cjs');
const { generateStats, renderDashboard, renderDashboardJson } = require('./stats.cjs');
const { selectDebatePairs, buildDebatePrompt, runDebatePhase } = require('./debate.cjs');
const { runJudge } = require('./judge.cjs');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const FLAG_FILE = '/tmp/prompt-review-active';

function loadConfig(cwd) {
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (e) {
    // Use defaults
    config = { mode: 'subscription', reviewers: {} };
  }

  // Merge per-project overrides
  if (cwd) {
    const overridePath = path.join(cwd, '.claude', 'prompt-review.json');
    try {
      if (fs.existsSync(overridePath)) {
        const overrides = JSON.parse(fs.readFileSync(overridePath, 'utf-8'));
        config = deepMerge(config, overrides);
      }
    } catch (e) {
      // Ignore bad override file
    }
  }

  // Environment variable overrides
  if (process.env.PROMPT_REVIEW_MODE) config.mode = process.env.PROMPT_REVIEW_MODE;
  if (process.env.PROMPT_REVIEW_REVIEWER_MODEL) {
    config.models = config.models || {};
    config.models.reviewer = process.env.PROMPT_REVIEW_REVIEWER_MODEL;
  }
  if (process.env.PROMPT_REVIEW_EDITOR_MODEL) {
    config.models = config.models || {};
    config.models.editor = process.env.PROMPT_REVIEW_EDITOR_MODEL;
  }
  if (process.env.PROMPT_REVIEW_TIMEOUT) {
    config.budget = config.budget || {};
    config.budget.timeout_ms = parseInt(process.env.PROMPT_REVIEW_TIMEOUT);
  }

  return config;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function setFlag(reviewerCount) {
  try {
    fs.writeFileSync(FLAG_FILE, JSON.stringify({ reviewers: reviewerCount, timestamp: Date.now() }));
  } catch (e) {
    // Non-fatal
  }
}

function clearFlag() {
  try {
    if (fs.existsSync(FLAG_FILE)) fs.unlinkSync(FLAG_FILE);
  } catch (e) {
    // Non-fatal
  }
}

function hashPrompt(prompt) {
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 12);
}

/**
 * Handle hook invocation — called from hook-handler.cjs when !!! is detected.
 * Returns an object with additionalContext, or null if review shouldn't run.
 */
function handleHook(strippedPrompt) {
  // Kill switch
  if (process.env.PROMPT_REVIEW_ENABLED === 'false') return null;

  // Validate: prompt must be non-empty after stripping !!!
  if (!strippedPrompt || strippedPrompt.trim().length === 0) {
    return null; // Empty prompt, don't trigger review
  }

  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const context = buildContext({ cwd, config: config.context });
  const activeReviewers = determineActiveReviewers(config, strippedPrompt, context);

  if (activeReviewers.length === 0) return null;

  // Determine if we're using subscription mode as fallback
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  const isApiModeRequested = config.mode === 'api';
  const usingSubscriptionFallback = isApiModeRequested && !hasApiKey;

  if (config.mode === 'subscription' || !hasApiKey) {
    // Subscription mode: return additionalContext that tells Claude to use /prompt-review
    return {
      additionalContext: buildSubscriptionContext(strippedPrompt, activeReviewers, context, config),
      warning: usingSubscriptionFallback ? 'API mode requested but no ANTHROPIC_API_KEY found; using subscription mode' : null,
    };
  }

  // API mode would run inline, but for hook we still prefer subscription
  // since the hook needs to return quickly
  return {
    additionalContext: buildSubscriptionContext(strippedPrompt, activeReviewers, context, config),
  };
}

function buildSubscriptionContext(prompt, activeReviewers, context, config) {
  const reviewerPrompts = buildReviewerPrompts(activeReviewers, prompt, context);
  const priorityOrder = config.editor?.priority_order || [
    'security', 'testing', 'domain_sme', 'documentation', 'frontend_ux', 'clarity'
  ];

  // Determine execution mode for warning
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  const isApiModeRequested = config.mode === 'api';
  const usingSubscriptionFallback = isApiModeRequested && !hasApiKey;

  let instructions = `[PROMPT REVIEW TRIGGERED]

The user's prompt has been flagged for review. Run the prompt review pipeline:
`;

  // Add warning if applicable
  if (usingSubscriptionFallback) {
    instructions += `⚠️  API mode was requested (config.mode='api') but ANTHROPIC_API_KEY is not set.
Falling back to subscription mode (Claude-guided async review via /prompt-review:review skill).
To use full async API mode, set ANTHROPIC_API_KEY environment variable or change config.mode to 'subscription'.

`;
  }

  instructions += `
## Original Prompt (stripped of !!! trigger)

${prompt}

## Active Reviewers (${activeReviewers.length})

${activeReviewers.map(r => `- ${r}`).join('\n')}

## Instructions

For each reviewer below, spawn a Task subagent (model: haiku) with the given system prompt and user message. Collect all JSON critique responses.

`;

  for (const rp of reviewerPrompts) {
    instructions += `### Reviewer: ${rp.role}

**System prompt:**
${rp.system}

**User message:**
${rp.user}

---

`;
  }

  if (config.scoring && config.scoring.enabled) {
    instructions += `## Scoring\n\nEach reviewer will also return a "score" field (0-10). After collecting all scores, compute a weighted composite:\n`;
    instructions += `Weights: ${JSON.stringify(config.scoring.weights)}\n`;
    instructions += `Composite = sum(score * weight) / sum(weight) for active reviewers that returned scores.\n`;
    if (config.scoring.display) {
      instructions += `Display the composite score and subscores in the review block.\n`;
    } else {
      instructions += `Log scores but do not display them in the review block.\n`;
    }
    instructions += '\n';
  }

  instructions += `## After All Reviewers Complete

1. Parse each reviewer's JSON response (validate against critique schema)
2. Merge critiques: deduplicate ops, resolve conflicts by priority order: ${priorityOrder.join(' > ')}
3. Apply edit operations to produce a refined prompt
4. Present the review block showing: reviewers active, changes made, risks, and the refined prompt
5. Ask: "Proceed with the refined prompt? (yes / no / edit)"
6. If yes: execute the refined prompt. If no: execute the original. If edit: ask what to change.

## Critique Schema

Each reviewer returns JSON:
\`\`\`json
{
  "reviewer_role": "string",
  "severity_max": "blocker|major|minor|nit",
  "confidence": 0.0-1.0,
  "findings": [{ "id": "string", "severity": "string", "confidence": 0.0-1.0, "issue": "string", "evidence": "string", "suggested_ops": [{ "op": "string", "target": "string", "value": "string" }] }],
  "no_issues": false,
  "score": 0.0-10.0
}
\`\`\`
`;

  return instructions;
}

/**
 * Handle skill invocation — called when /prompt-review is used directly.
 * Returns structured data for the skill to present.
 */
function handleSkill(prompt) {
  if (process.env.PROMPT_REVIEW_ENABLED === 'false') {
    return { skipped: true, reason: 'PROMPT_REVIEW_ENABLED=false' };
  }

  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const context = buildContext({ cwd, config: config.context });
  const activeReviewers = determineActiveReviewers(config, prompt, context);

  return {
    prompt,
    config,
    context: {
      projectName: context.projectName,
      stack: context.stack,
      testFramework: context.testFramework,
      buildTool: context.buildTool,
      conventions: context.conventions,
    },
    activeReviewers,
    reviewerPrompts: buildReviewerPrompts(activeReviewers, prompt, context),
    priorityOrder: config.editor?.priority_order || [
      'security', 'testing', 'domain_sme', 'documentation', 'frontend_ux', 'clarity'
    ],
  };
}

/**
 * Run the full pipeline in API mode — used when calling from CLI or CI.
 */
async function runFullPipeline(prompt, options) {
  if (process.env.PROMPT_REVIEW_ENABLED === 'false') {
    return { skipped: true, reason: 'PROMPT_REVIEW_ENABLED=false' };
  }

  const cwd = options?.cwd || process.cwd();
  const config = loadConfig(cwd);
  const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return { error: 'No API key. Set ANTHROPIC_API_KEY or use subscription mode.' };
  }

  const context = buildContext({ cwd, config: config.context });
  const activeReviewers = determineActiveReviewers(config, prompt, context);

  if (activeReviewers.length === 0) {
    return { noChanges: true, reason: 'No reviewers activated' };
  }

  const startTime = Date.now();
  setFlag(activeReviewers.length);

  try {
    // Fan-out: run all reviewers in parallel
    const reviewerModel = config.models?.reviewer || 'claude-haiku-4-5';
    const results = await runReviewersApi(activeReviewers, prompt, context, apiKey, reviewerModel);

    // Collect valid critiques
    const validCritiques = results
      .filter(r => r.valid && r.critique)
      .map(r => r.critique);

    const failedReviewers = results.filter(r => !r.valid);

    // Compute scores if enabled
    let scoringResult = null;
    if (config.scoring && config.scoring.enabled) {
      scoringResult = computeCompositeScore(validCritiques, config.scoring.weights);
    }

    // Debate phase: run if enabled and conflicts exist
    let debateResult = null;
    let debateJudgeTokens = 0;
    if (config.debate?.enabled && apiKey) {
      const preCheck = mergeCritiques(validCritiques, config.editor?.priority_order || [
        'security', 'testing', 'domain_sme', 'documentation', 'frontend_ux', 'clarity'
      ]);
      if (preCheck.conflicts.length > 0) {
        const pairs = selectDebatePairs(preCheck.conflicts, preCheck.allOps, { max_pairs: config.debate.max_pairs || 2 });
        if (pairs.length > 0) {
          try {
            const debateModel = config.debate?.model || 'claude-haiku-4-5';
            debateResult = await runDebatePhase(pairs, validCritiques, prompt, context, new (require('@anthropic-ai/sdk'))({ apiKey }), debateModel);

            // Run judge if we have debate results
            if (debateResult && debateResult.results.length > 0) {
              const judgeModel = config.debate?.judge_model || 'claude-sonnet-4-6';
              const judgeResult = await runJudge(debateResult, new (require('@anthropic-ai/sdk'))({ apiKey }), judgeModel);
              debateResult.judgeResult = judgeResult;
              if (judgeResult.usage) {
                debateJudgeTokens = (judgeResult.usage.input_tokens || 0) + (judgeResult.usage.output_tokens || 0);
              }
            }
          } catch (error) {
            // Log error but continue with normal merge — debate is optional
            console.error('Debate phase error:', error.message);
            debateResult = null;
          }
        }
      }
    }

    // Merge critiques
    const priorityOrder = config.editor?.priority_order || [
      'security', 'testing', 'domain_sme', 'documentation', 'frontend_ux', 'clarity'
    ];
    const merged = mergeCritiques(validCritiques, priorityOrder);

    if (merged.noChanges) {
      const durationMs = Date.now() - startTime;
      const totalInput = results.reduce((sum, r) => sum + (r.usage?.input_tokens || 0), 0);
      const totalOutput = results.reduce((sum, r) => sum + (r.usage?.output_tokens || 0), 0);

      logAudit(prompt, cwd, activeReviewers, [], 'nit', 0, config.mode, totalInput, totalOutput, durationMs,
        scoringResult ? scoringResult.scores : {}, scoringResult ? scoringResult.composite : null, debateResult);

      return {
        noChanges: true,
        block: renderReviewBlock({
          reviewersActive: activeReviewers,
          findings: [],
          risks: [],
          refinedPrompt: prompt,
          mode: config.mode,
          cost: { inputTokens: totalInput, outputTokens: totalOutput, usd: estimateCost(reviewerModel, totalInput, totalOutput) },
          durationMs,
          noChanges: true,
          scoring: scoringResult && config.scoring ? {
            display: config.scoring.display !== false,
            composite: scoringResult.composite,
            scores: scoringResult.scores,
          } : undefined,
        }),
      };
    }

    // Build editor prompt and call Sonnet to produce refined prompt
    const editorPromptData = buildEditorPrompt(prompt, merged.allOps, context);
    let Anthropic;
    try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) {
      throw new Error('API mode requires @anthropic-ai/sdk');
    }
    const client = new Anthropic({ apiKey });
    const editorModel = config.models?.editor || 'claude-sonnet-4-6';
    const editorResponse = await client.messages.create({
      model: editorModel,
      max_tokens: 4096,
      temperature: config.editor?.temperature || 0,
      system: editorPromptData.system,
      messages: [{ role: 'user', content: editorPromptData.user }],
    });

    const editorText = editorResponse.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const parsed = parseEditorResponse(editorText);
    const durationMs = Date.now() - startTime;

    // Calculate total costs (including debate if ran)
    let debateInputTokens = 0;
    let debateOutputTokens = 0;
    if (debateResult) {
      debateInputTokens = debateResult.results.reduce((sum, r) => sum + (r.usage?.input_tokens || 0), 0) || 0;
      debateOutputTokens = debateResult.results.reduce((sum, r) => sum + (r.usage?.output_tokens || 0), 0) || 0;
    }

    const totalInput = results.reduce((sum, r) => sum + (r.usage?.input_tokens || 0), 0)
      + (editorResponse.usage?.input_tokens || 0)
      + debateInputTokens
      + (debateResult?.judgeResult?.usage?.input_tokens || 0);
    const totalOutput = results.reduce((sum, r) => sum + (r.usage?.output_tokens || 0), 0)
      + (editorResponse.usage?.output_tokens || 0)
      + debateOutputTokens
      + (debateResult?.judgeResult?.usage?.output_tokens || 0);
    const totalCostUsd = estimateCost(reviewerModel,
      results.reduce((sum, r) => sum + (r.usage?.input_tokens || 0), 0),
      results.reduce((sum, r) => sum + (r.usage?.output_tokens || 0), 0))
      + estimateCost(editorModel, editorResponse.usage?.input_tokens || 0, editorResponse.usage?.output_tokens || 0);

    // Render the review block
    const block = renderReviewBlock({
      reviewersActive: activeReviewers,
      findings: merged.allOps,
      risks: parsed.risks,
      refinedPrompt: parsed.refinedPrompt,
      mode: config.mode,
      cost: { inputTokens: totalInput, outputTokens: totalOutput, usd: totalCostUsd },
      durationMs,
      scoring: scoringResult && config.scoring ? {
        display: config.scoring.display !== false,
        composite: scoringResult.composite,
        scores: scoringResult.scores,
      } : undefined,
    });

    logAudit(prompt, cwd, activeReviewers, buildFindingsDetail(merged.allOps), merged.severityMax, merged.conflicts.length, config.mode, totalInput, totalOutput, durationMs,
      scoringResult ? scoringResult.scores : {}, scoringResult ? scoringResult.composite : null, debateResult);

    return {
      block,
      refinedPrompt: parsed.refinedPrompt,
      findings: merged.allOps,
      risks: parsed.risks,
      failedReviewers,
    };
  } finally {
    clearFlag();
  }
}

function buildFindingsDetail(allOps) {
  // Maps ops to findings_detail array
  // Each op becomes: { reviewer_role, finding_id, severity, issue, op, target }
  const findingsDetail = [];
  for (const op of (allOps || [])) {
    const finding = {
      reviewer_role: op.reviewer_role || 'unknown',
      finding_id: op.finding_id || `${op.reviewer_role || 'unk'}-${Math.random().toString(36).slice(2, 8)}`,
      severity: op.severity || 'info',
      issue: op.issue || op.description || '',
      op: op.op,
      target: op.target,
    };
    findingsDetail.push(finding);
  }
  return findingsDetail;
}

function logAudit(prompt, cwd, reviewersActive, findingsDetail, severityMax, conflicts, mode, inputTokens, outputTokens, durationMs, scores, compositeScore, debateResult) {
  // Build debate_log entry
  let debate_log = null;
  if (debateResult) {
    const pairs = debateResult.results.map(r => ({
      role_a: r.pair.role_a,
      role_b: r.pair.role_b,
      conflict: r.pair.conflict_description,
      winner: r.pair.judge_feedback ? (r.pair.judge_feedback.winner || 'unknown') : 'unknown',
      judge_scores: {},
    }));

    const debate_cost = {
      input_tokens: debateResult.results.reduce((sum, r) => sum + (r.usage?.input_tokens || 0), 0) || 0,
      output_tokens: debateResult.results.reduce((sum, r) => sum + (r.usage?.output_tokens || 0), 0) || 0,
    };
    if (debateResult.judgeResult?.usage) {
      debate_cost.input_tokens += debateResult.judgeResult.usage.input_tokens || 0;
      debate_cost.output_tokens += debateResult.judgeResult.usage.output_tokens || 0;
    }

    debate_log = {
      ran: true,
      pairs,
      judge_feedback: debateResult.judgeResult?.feedback || [],
      cost: debate_cost,
    };
  }

  writeAuditLog({
    timestamp: new Date().toISOString(),
    project: path.basename(cwd),
    trigger: '!!!',
    mode,
    original_prompt_hash: hashPrompt(prompt),
    reviewers_active: reviewersActive,
    findings_count: findingsDetail.length,
    findings_detail: findingsDetail,
    suggestions_accepted: [],
    suggestions_rejected: [],
    reviewer_stats: {},
    severity_max: severityMax,
    conflicts,
    outcome: 'pending',
    scores: scores || {},
    composite_score: compositeScore || null,
    debate_log,
    cost: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      usd: mode === 'subscription' ? 0 : estimateCost('claude-haiku-4-5', inputTokens, outputTokens),
    },
    duration_ms: durationMs,
  });
}

// CLI entry point — reads from stdin when invoked directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const isHook = args.includes('--hook');
  const isSkill = args.includes('--skill');
  const isStats = args.includes('--stats');

  if (isStats) {
    const daysArg = args.find(a => a.startsWith('--days'));
    const days = daysArg ? daysArg.split('=')[1] || args[args.indexOf(daysArg) + 1] : '30';
    const isJson = args.includes('--json');
    const stats = generateStats(days);
    if (isJson) {
      console.log(renderDashboardJson(stats));
    } else {
      console.log(renderDashboard(stats, days));
    }
    process.exit(0);
  }

  try {
    // Read stdin synchronously
    let inputData = '';
    try {
      inputData = fs.readFileSync('/dev/stdin', 'utf-8');
    } catch (e) {
      // No stdin available
      process.stderr.write('Usage: echo \'{"prompt":"your prompt!!!"}\' | node index.cjs --hook\n');
      process.exit(0);
    }

    let prompt = '';

    // Try to parse as JSON (hook sends { prompt: "..." })
    try {
      const parsed = JSON.parse(inputData.trim());
      prompt = parsed.prompt || '';
    } catch (e) {
      prompt = inputData.trim();
    }

    if (isHook) {
      // Hook mode: check for !!! trigger
      if (!prompt.endsWith('!!!')) {
        process.exit(0); // Not triggered, exit silently
      }
      const stripped = prompt.slice(0, -3).trim();
      const result = handleHook(stripped);
      if (result) {
        console.log(JSON.stringify(result));
      }
    } else if (isSkill) {
      const result = handleSkill(prompt);
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Default: try API mode
      runFullPipeline(prompt).then(result => {
        console.log(JSON.stringify(result, null, 2));
      }).catch(err => {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
      });
    }
  } catch (err) {
    // Fail open — never block
    process.stderr.write(`[prompt-review] Error: ${err.message}\n`);
    process.exit(0);
  }
}

function updateOutcome(promptHash, outcome, acceptedIds, rejectedIds) {
  const { updateAuditOutcome } = require('./cost.cjs');
  const today = new Date().toISOString().slice(0, 10);
  return updateAuditOutcome(today, promptHash, outcome, acceptedIds, rejectedIds);
}

module.exports = {
  handleHook,
  handleSkill,
  runFullPipeline,
  loadConfig,
  deepMerge,
  updateOutcome,
};
