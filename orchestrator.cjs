const path = require('path');
const fs = require('fs');
const { validateCritique } = require('./schemas.cjs');

function withTimeout(promise, ms, label) {
	if (!ms || ms <= 0) return promise;
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const REVIEWER_FILES = {
  domain_sme: 'domain-sme.cjs',
  security: 'security.cjs',
  clarity: 'clarity.cjs',
  testing: 'testing.cjs',
  frontend_ux: 'frontend-ux.cjs',
  documentation: 'documentation.cjs',
};

function loadReviewer(role) {
  const fileName = REVIEWER_FILES[role];
  if (!fileName) return null;
  const filePath = path.join(__dirname, 'reviewers', fileName);
  try {
    return require(filePath);
  } catch (e) {
    return null;
  }
}

function shouldFireFrontendUX(triggers, prompt, context) {
  // Frontend/UX has stricter multi-factor requirements to avoid false positives
  const promptLower = prompt.toLowerCase();

  // Check skip keywords first — if any match, don't fire
  if (triggers.skip_keywords && triggers.skip_keywords.length > 0) {
    for (const keyword of triggers.skip_keywords) {
      if (promptLower.includes(keyword.toLowerCase())) {
        return false;
      }
    }
  }

  // Multi-factor check: Need at least one of:
  // 1. Two or more UI keywords
  // 2. One UI keyword AND UI file patterns found
  // 3. UI files present AND no backend-specific keywords

  const uiKeywords = triggers.prompt_keywords || [];
  const uiKeywordCount = uiKeywords.filter(kw => promptLower.includes(kw.toLowerCase())).length;

  // Check for UI file patterns
  const uiFilePatterns = triggers.file_patterns || ['*.css', '*.scss', '*.tsx', '*.vue', '*.svelte'];
  const hasUIFiles = context.files && context.files.some(f => {
    return uiFilePatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(f);
    });
  });

  // Check for backend/non-UI keywords (rules out false positives like "component algorithm")
  const backendKeywords = ['algorithm', 'architecture', 'performance', 'database', 'query', 'index', 'schema'];
  const hasBackendContext = backendKeywords.some(kw => promptLower.includes(kw));

  // Decision logic
  if (uiKeywordCount >= 2) return true;               // 2+ UI keywords → fire
  if (uiKeywordCount >= 1 && hasUIFiles) return true; // 1+ UI keywords + UI files → fire
  if (hasUIFiles && !hasBackendContext) return true;  // UI files present and no backend keywords → fire

  return false;
}

function shouldFireConditional(triggers, prompt, context, role) {
  if (!triggers) return false;
  const promptLower = prompt.toLowerCase();

  // Check skip keywords first — if any match, don't fire
  if (triggers.skip_keywords && triggers.skip_keywords.length > 0) {
    for (const keyword of triggers.skip_keywords) {
      if (promptLower.includes(keyword.toLowerCase())) {
        return false;
      }
    }
  }

  // Check prompt keywords
  if (triggers.prompt_keywords && triggers.prompt_keywords.length > 0) {
    for (const keyword of triggers.prompt_keywords) {
      if (promptLower.includes(keyword.toLowerCase())) {
        return true;
      }
    }
  }

  // Check stack markers
  if (triggers.stack_markers && context.stack && triggers.stack_markers.length > 0) {
    for (const marker of triggers.stack_markers) {
      if (context.stack.includes(marker)) {
        return true;
      }
    }
  }

  // Check project markers (check if files/dirs exist)
  if (triggers.project_markers && context.structure) {
    for (const marker of triggers.project_markers) {
      if (context.structure.includes(marker)) {
        return true;
      }
    }
  }

  return false;
}

function determineActiveReviewers(config, prompt, context) {
  const active = [];

  for (const [role, settings] of Object.entries(config.reviewers)) {
    if (!settings.enabled) continue;

    if (!settings.conditional) {
      // Always-on reviewer
      active.push(role);
    } else {
      // Conditional reviewer — check triggers
      let shouldFire = false;
      if (role === 'frontend_ux') {
        // Frontend/UX uses multi-factor trigger logic
        shouldFire = shouldFireFrontendUX(settings.triggers, prompt, context);
      } else {
        shouldFire = shouldFireConditional(settings.triggers, prompt, context, role);
      }

      if (shouldFire) {
        active.push(role);
      }
    }
  }

  return active;
}

function buildReviewerPrompts(activeRoles, prompt, context) {
  const prompts = [];

  for (const role of activeRoles) {
    const reviewer = loadReviewer(role);
    if (!reviewer) continue;

    const { system, user } = reviewer.buildPrompt(prompt, context);
    prompts.push({ role, system, user });
  }

  return prompts;
}

function runReviewersSubscription(activeRoles, prompt, context) {
  // In subscription mode, we return prompt objects for the skill/Claude
  // to dispatch as Task subagents
  return buildReviewerPrompts(activeRoles, prompt, context);
}

async function runReviewersApi(activeRoles, prompt, context, apiKey, model, timeoutMs) {
  // In API mode, call Anthropic API directly in parallel
  let Anthropic;
  try {
    Anthropic = require('@anthropic-ai/sdk');
  } catch (e) {
    throw new Error('API mode requires @anthropic-ai/sdk. Install with: npm install @anthropic-ai/sdk');
  }

  const client = new Anthropic({ apiKey });
  const reviewerPrompts = buildReviewerPrompts(activeRoles, prompt, context);

  const results = await Promise.allSettled(
    reviewerPrompts.map(async ({ role, system, user }) => {
      const response = await withTimeout(
        client.messages.create({
          model: model || 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system,
          messages: [{ role: 'user', content: user }],
        }),
        timeoutMs,
        `Reviewer ${role}`
      );

      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

      // Parse JSON from response (handle markdown code blocks)
      let jsonStr = text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];

      let critique;
      try {
        critique = JSON.parse(jsonStr.trim());
      } catch (parseErr) {
        throw new Error(`Failed to parse ${role} response as JSON: ${parseErr.message}. Response: "${text.slice(0, 80)}..."`);
      }
      const validation = validateCritique(critique);

      return {
        role,
        critique,
        valid: validation.valid,
        errors: validation.errors,
        usage: response.usage,
      };
    })
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      role: reviewerPrompts[i].role,
      critique: null,
      valid: false,
      errors: [`Reviewer failed: ${result.reason?.message || 'Unknown error'}`],
      usage: null,
    };
  });
}

module.exports = {
  withTimeout,
  shouldFireConditional,
  shouldFireFrontendUX,
  determineActiveReviewers,
  buildReviewerPrompts,
  runReviewersSubscription,
  runReviewersApi,
  loadReviewer,
};
