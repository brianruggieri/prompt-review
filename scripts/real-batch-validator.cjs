#!/usr/bin/env node
/**
 * real-batch-validator.cjs
 *
 * Batch validator using REAL Claude Code task dispatch (subscription mode, no API).
 * Dispatches each prompt to 6 specialist reviewers in parallel via Claude Code Task tool.
 *
 * Usage from Claude Code session:
 *   node scripts/real-batch-validator.cjs batch 1
 *   node scripts/real-batch-validator.cjs batch 2
 *   etc.
 *
 * This generates REAL findings (blockers/majors) unlike mocks.
 */

const fs = require('fs');
const path = require('path');
const { extractRealPrompts } = require('./extract-real-prompts.cjs');

const TEST_LOGS_DIR = path.join(__dirname, '..', 'test-logs');
const VALIDATION_BATCHES_DIR = path.join(TEST_LOGS_DIR, 'validation-batches');

[TEST_LOGS_DIR, VALIDATION_BATCHES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * Load all reviewers with their system prompts
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
      console.warn(`⚠️  Failed to load reviewer ${roleFile}: ${e.message}`);
    }
  }

  return reviewers;
}

/**
 * Build reviewer prompts for a single user prompt
 */
function buildReviewerPrompts(prompt, reviewers) {
  return reviewers.map(({ role, system }) => ({
    role,
    system,
    user: `Review this real user prompt and identify issues:

---PROMPT START---
${prompt}
---PROMPT END---

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "reviewer_role": "${role}",
  "severity_max": "blocker|major|minor|nit",
  "confidence": 0.0-1.0,
  "findings": [
    {
      "id": "${role.toUpperCase()}-001",
      "severity": "blocker|major|minor|nit",
      "confidence": 0.6-1.0,
      "issue": "Clear description",
      "evidence": "Quote from prompt",
      "suggested_ops": [{"op": "AddGuardrail|AddConstraint", "detail": "..."}]
    }
  ],
  "no_issues": false,
  "score": 0.0-10.0
}`
  }));
}

/**
 * Parse reviewer responses and extract findings
 */
function parseReviewerResponse(role, response) {
  try {
    const critique = JSON.parse(response);
    return {
      role,
      findings: (critique.findings || []).map(f => ({
        ...f,
        reviewer_role: role
      })),
      score: critique.score || 5.0,
      severity_max: critique.severity_max || 'nit',
      success: true
    };
  } catch (e) {
    return {
      role,
      findings: [],
      score: 5.0,
      severity_max: 'nit',
      success: false,
      error: e.message
    };
  }
}

/**
 * Main batch validator
 * Call this from Claude Code session with taskDispatcher callback
 */
async function validateBatchRealTasks(batchNum, taskDispatcher) {
  if (!taskDispatcher) {
    console.error('❌ Error: taskDispatcher callback required (uses Claude Code Task tool)');
    console.error('');
    console.error('This must be called from a Claude Code session with access to the Task tool.');
    console.error('Example usage:');
    console.error('');
    console.error('  const validator = require("./scripts/real-batch-validator.cjs");');
    console.error('  await validator.validateBatchRealTasks(1, async (reviewPrompt) => {');
    console.error('    return await Task({ ... });  // Use Claude Code Task tool');
    console.error('  });');
    process.exit(1);
  }

  const prompts = extractRealPrompts();
  const reviewers = loadReviewers();

  const offset = (batchNum - 1) * 100;
  const batchPrompts = prompts.slice(offset, offset + 100);

  if (batchPrompts.length === 0) {
    console.error(`❌ No prompts found for batch ${batchNum}`);
    process.exit(1);
  }

  console.log(`\n📋 Batch ${batchNum}: Dispatching REAL Claude Code tasks`);
  console.log(`📊 Prompts: ${batchPrompts.length} | Reviewers per prompt: ${reviewers.length}`);
  console.log(`🔄 Total tasks: ${batchPrompts.length * reviewers.length}`);
  console.log(`💰 Cost: $0 (Claude Code subscription)\n`);

  const results = [];
  let promptNum = 0;

  for (const prompt of batchPrompts) {
    promptNum++;

    // Build reviewer prompts for this user prompt
    const reviewerPrompts = buildReviewerPrompts(prompt.text, reviewers);

    // Dispatch all 6 reviewers in parallel via taskDispatcher
    const reviewResults = await Promise.all(
      reviewerPrompts.map(async ({ role, system, user }) => {
        try {
          // Call taskDispatcher with reviewer task definition
          const response = await taskDispatcher({
            type: 'reviewer_task',
            role,
            system,
            user
          });

          return parseReviewerResponse(role, response);
        } catch (e) {
          console.warn(`  ⚠️  ${role} error: ${e.message}`);
          return {
            role,
            findings: [],
            score: 5.0,
            success: false,
            error: e.message
          };
        }
      })
    );

    // Aggregate findings
    const allFindings = reviewResults.flatMap(r => r.findings || []);
    const scores = reviewResults.reduce((acc, r) => {
      acc[r.role] = r.score;
      return acc;
    }, {});

    // Compute composite score
    const avgScore = reviewResults.length > 0
      ? (reviewResults.reduce((sum, r) => sum + (r.score || 0), 0) / reviewResults.length).toFixed(2)
      : '0.00';

    // Count severity
    const severityCount = {
      blocker: allFindings.filter(f => f.severity === 'blocker').length,
      major: allFindings.filter(f => f.severity === 'major').length,
      minor: allFindings.filter(f => f.severity === 'minor').length,
      nit: allFindings.filter(f => f.severity === 'nit').length
    };

    results.push({
      hash: prompt.hash,
      timestamp: new Date().toISOString(),
      findings: allFindings,
      severities: severityCount,
      compositeScore: parseFloat(avgScore),
      reviewerScores: scores,
      successCount: reviewResults.filter(r => r.success).length
    });

    if (promptNum % 10 === 0 || promptNum === batchPrompts.length) {
      const blocker = results.reduce((sum, r) => sum + r.severities.blocker, 0);
      const major = results.reduce((sum, r) => sum + r.severities.major, 0);
      const minor = results.reduce((sum, r) => sum + r.severities.minor, 0);
      const nit = results.reduce((sum, r) => sum + r.severities.nit, 0);

      console.log(`[Batch ${batchNum}] Prompt ${promptNum}/${batchPrompts.length}`);
      console.log(`  Findings: ${allFindings.length} (🔴 ${blocker} 🟠 ${major} 🟡 ${minor} ⚪ ${nit})`);
      console.log(`  Avg score: ${avgScore}\n`);
    }
  }

  // Save results to JSONL
  const outputFile = path.join(VALIDATION_BATCHES_DIR, `batch-${String(batchNum).padStart(3, '0')}-real-tasks.jsonl`);
  const output = results.map(r => JSON.stringify(r)).join('\n');
  fs.writeFileSync(outputFile, output, 'utf-8');

  // Summary statistics
  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0);
  const totalBlockers = results.reduce((sum, r) => sum + r.severities.blocker, 0);
  const totalMajors = results.reduce((sum, r) => sum + r.severities.major, 0);
  const totalMinors = results.reduce((sum, r) => sum + r.severities.minor, 0);
  const totalNits = results.reduce((sum, r) => sum + r.severities.nit, 0);
  const avgScore = (results.reduce((sum, r) => sum + r.compositeScore, 0) / results.length).toFixed(2);

  console.log(`\n✅ Batch ${batchNum} complete!\n`);
  console.log(`📊 Results saved: ${outputFile}`);
  console.log(`\n📈 Summary:`);
  console.log(`  ✓ Prompts: ${results.length}`);
  console.log(`  ✓ Total findings: ${totalFindings}`);
  console.log(`  ✓ Avg score: ${avgScore}/10`);
  console.log(`  ✓ Severity breakdown:`);
  console.log(`    🔴 Blockers: ${totalBlockers}`);
  console.log(`    🟠 Majors: ${totalMajors}`);
  console.log(`    🟡 Minors: ${totalMinors}`);
  console.log(`    ⚪ Nits: ${totalNits}\n`);

  return {
    batch: batchNum,
    prompts: results.length,
    findings: totalFindings,
    blockers: totalBlockers,
    majors: totalMajors,
    minors: totalMinors,
    nits: totalNits,
    avgScore: parseFloat(avgScore),
    outputFile
  };
}

/**
 * CLI entry (shows what WOULD be dispatched)
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const batchNum = parseInt(args[1] || '1');

  if (isNaN(batchNum) || batchNum < 1 || batchNum > 13) {
    console.error('Usage: node real-batch-validator.cjs batch N');
    console.error('  N = 1-13 (batch number)');
    process.exit(1);
  }

  console.log(`\n📋 Batch ${batchNum} - REAL Claude Code Task Dispatch\n`);
  console.log('This validator requires Claude Code Task tool access.');
  console.log('To run from Claude Code session:\n');
  console.log('```javascript');
  console.log('const validator = require("./scripts/real-batch-validator.cjs");');
  console.log(`await validator.validateBatchRealTasks(${batchNum}, async (reviewPrompt) => {`);
  console.log('  // Dispatch via Claude Code Task tool');
  console.log('  return await dispatchReviewerTask(reviewPrompt);');
  console.log('});');
  console.log('```\n');

  const reviewers = loadReviewers();
  const prompts = extractRealPrompts();
  const batchPrompts = prompts.slice((batchNum - 1) * 100, batchNum * 100);

  console.log(`📊 Will validate ${batchPrompts.length} prompts with ${reviewers.length} reviewers each`);
  console.log(`💾 Output: test-logs/validation-batches/batch-${String(batchNum).padStart(3, '0')}-real-tasks.jsonl`);
  console.log(`💰 Cost: $0 (Claude Code subscription mode)\n`);
}

module.exports = {
  loadReviewers,
  buildReviewerPrompts,
  parseReviewerResponse,
  validateBatchRealTasks
};
