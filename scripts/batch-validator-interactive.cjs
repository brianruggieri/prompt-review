#!/usr/bin/env node
/**
 * batch-validator-interactive.cjs
 *
 * Interactive batch validator that dispatches REAL Claude Code reviewer tasks
 * (not mocked responses, not API calls - true Claude Code task dispatch)
 *
 * Usage from Claude Code session:
 *   node scripts/batch-validator-interactive.cjs batch N --real-tasks
 *   node scripts/batch-validator-interactive.cjs batch N --claude-code-dispatch
 *
 * This validates N real prompts by dispatching each reviewer as a separate
 * Claude Code subagent task, collecting real findings with actual blockers/majors.
 */

const fs = require('fs');
const path = require('path');
const { extractRealPrompts } = require('./extract-real-prompts.cjs');
const dispatch = require('./claude-code-dispatch.cjs');

const TEST_LOGS_DIR = path.join(__dirname, '..', 'test-logs');
const VALIDATION_BATCHES_DIR = path.join(TEST_LOGS_DIR, 'validation-batches');

// Ensure directories exist
[TEST_LOGS_DIR, VALIDATION_BATCHES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * Load reviewers with their system prompts
 */
function loadReviewers() {
  const reviewersDir = path.join(__dirname, '..', 'reviewers');
  const reviewerFiles = fs.readdirSync(reviewersDir)
    .filter(f => f.endsWith('.cjs'))
    .map(f => f.replace('.cjs', ''));

  const reviewers = [];
  for (const roleFile of reviewerFiles) {
    try {
      const module = require(path.join(reviewersDir, `${roleFile}.cjs`));
      const role = roleFile.replace('-', '_');

      if (module.SYSTEM_PROMPT) {
        reviewers.push({
          role,
          file: roleFile,
          system: module.SYSTEM_PROMPT
        });
      }
    } catch (e) {
      console.warn(`Failed to load reviewer ${roleFile}: ${e.message}`);
    }
  }

  return reviewers;
}

/**
 * Build context for reviewers
 */
function buildContext(cwd = process.cwd()) {
  const claudeMd = path.join(cwd, '.claude', 'CLAUDE.md');
  const packageJson = path.join(cwd, 'package.json');

  let projectName = path.basename(cwd);
  let stack = [];
  let testFramework = null;
  let buildTool = null;

  if (fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));
      if (pkg.name) projectName = pkg.name;

      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.jest) testFramework = 'jest';
      else if (deps.mocha) testFramework = 'mocha';
      else if (deps.vitest) testFramework = 'vitest';

      if (deps.webpack) buildTool = 'webpack';
      else if (deps.vite) buildTool = 'vite';
      else if (deps.rollup) buildTool = 'rollup';

      // Infer stack from deps
      if (deps.react) stack.push('react');
      if (deps['@angular/core']) stack.push('angular');
      if (deps.vue) stack.push('vue');
      if (deps.express) stack.push('express');
      if (deps.fastify) stack.push('fastify');
      if (deps.prisma) stack.push('prisma');
    } catch (e) {
      // Use defaults
    }
  }

  return {
    projectName,
    stack: stack.length > 0 ? stack : ['unknown'],
    testFramework: testFramework || 'unknown',
    buildTool: buildTool || 'unknown'
  };
}

/**
 * Validate a batch of prompts with real Claude Code tasks
 * This is the MAIN function called from Claude Code session
 */
async function validateBatchWithClaudeCodeTasks(batchNum, options = {}) {
  const prompts = extractRealPrompts();
  const reviewers = loadReviewers();
  const context = buildContext(process.cwd());

  const offset = (batchNum - 1) * 100;
  const batchPrompts = prompts.slice(offset, offset + 100);

  if (batchPrompts.length === 0) {
    console.error(`✗ No prompts found for batch ${batchNum}`);
    process.exit(1);
  }

  console.log(`\n📋 Batch ${batchNum} (prompts ${offset}-${offset + batchPrompts.length - 1})`);
  console.log(`📊 Reviewing ${batchPrompts.length} real prompts with real Claude Code tasks`);
  console.log(`👥 Reviewers: ${reviewers.map(r => r.role).join(', ')}`);
  console.log(`🔄 Dispatching tasks in parallel (no mocks, no API)...\n`);

  // This is where the Claude Code Task tool would be used
  // The function expects a taskDispatcher callback that invokes the Task tool

  if (!options.taskDispatcher) {
    console.error('⚠️  INTERACTIVE MODE REQUIRED\n');
    console.error('To review with real Claude Code tasks, this must run in the Claude Code session context');
    console.error('where the Task tool is available.\n');
    console.error(`For now, showing what WOULD be dispatched for batch ${batchNum}:`);

    // Show what would be dispatched
    console.log(`📤 Sample dispatch for first prompt (${batchPrompts[0].hash}):`);
    console.log(JSON.stringify({
      type: 'reviewer_batch_dispatch',
      prompts: batchPrompts.length,
      reviewers: reviewers.length,
      parallelFactor: reviewers.length,
      estimatedTokens: batchPrompts.length * reviewers.length * 500,
      mode: 'claude_code_tasks',
      cost: '$0 (Claude Code subscription)',
      sample_task: dispatch.dispatchReviewerTask(
        reviewers[0].role,
        reviewers[0].system,
        batchPrompts[0].text,
        context
      )
    }, null, 2));

    return {
      batch: batchNum,
      status: 'pending_implementation',
      prompt: 'Requires Claude Code session context with Task tool access'
    };
  }

  // If taskDispatcher is provided, run the validation
  console.log('🚀 Dispatching reviewer tasks...');

  const results = [];
  for (let i = 0; i < batchPrompts.length; i++) {
    const prompt = batchPrompts[i];
    const promptResults = await dispatch.reviewPromptWithClaudeCodeTasks(
      prompt.text,
      reviewers,
      context,
      options.taskDispatcher
    );

    results.push({
      hash: prompt.hash,
      timestamp: new Date().toISOString(),
      ...promptResults
    });

    if ((i + 1) % 10 === 0) {
      console.log(`[Batch ${batchNum}] Reviewed ${i + 1}/${batchPrompts.length} prompts...`);
    }
  }

  // Save results
  const outputFile = path.join(VALIDATION_BATCHES_DIR, `batch-${String(batchNum).padStart(3, '0')}-real.jsonl`);
  const output = results.map(r => JSON.stringify(r)).join('\n');
  fs.writeFileSync(outputFile, output, 'utf-8');

  console.log(`\n✓ Batch ${batchNum} complete: ${results.length} prompts reviewed`);
  console.log(`✓ Results saved: ${outputFile}`);

  return {
    batch: batchNum,
    prompts: results.length,
    findings: results.reduce((sum, r) => sum + r.findings.length, 0),
    avgScore: (results.reduce((sum, r) => sum + parseFloat(r.compositeScore || 0), 0) / results.length).toFixed(2)
  };
}

/**
 * CLI entry point (for testing from terminal)
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const batchNum = parseInt(args[1] || '1');

  if (isNaN(batchNum) || batchNum < 1 || batchNum > 13) {
    console.error('Usage: node batch-validator-interactive.cjs batch N');
    console.error('  N = 1-13 (batch number)');
    process.exit(1);
  }

  validateBatchWithClaudeCodeTasks(batchNum)
    .then(result => {
      console.log('\n' + JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = {
  loadReviewers,
  buildContext,
  validateBatchWithClaudeCodeTasks
};
