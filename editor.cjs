const { VALID_OPS } = require('./schemas.cjs');

function extractOps(critiques) {
  const ops = [];

  for (const critique of critiques) {
    if (critique.no_issues || !critique.findings) continue;

    for (const finding of critique.findings) {
      if (!finding.suggested_ops) continue;

      for (const op of finding.suggested_ops) {
        ops.push({
          reviewer_role: critique.reviewer_role,
          finding_id: finding.id,
          severity: finding.severity,
          confidence: finding.confidence,
          issue: finding.issue,
          evidence: finding.evidence,
          op: op.op,
          target: op.target,
          value: op.value,
          original: op.original || null,
        });
      }
    }
  }

  return ops;
}

function deduplicateOps(ops) {
  const seen = new Map();

  for (const op of ops) {
    const key = `${op.op}:${op.target}:${op.value}`;
    if (!seen.has(key)) {
      seen.set(key, op);
    } else {
      // Keep the higher-severity version
      const existing = seen.get(key);
      const severityRank = { blocker: 4, major: 3, minor: 2, nit: 1 };
      if ((severityRank[op.severity] || 0) > (severityRank[existing.severity] || 0)) {
        seen.set(key, op);
      }
    }
  }

  return Array.from(seen.values());
}

function detectConflicts(ops) {
  const conflicts = [];
  const byTarget = new Map();

  for (const op of ops) {
    const key = op.target;
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key).push(op);
  }

  for (const [target, targetOps] of byTarget) {
    // Check for AddConstraint vs RemoveConstraint on same target+value
    const adds = targetOps.filter(o => o.op === 'AddConstraint' || o.op === 'AddGuardrail');
    const removes = targetOps.filter(o => o.op === 'RemoveConstraint');

    for (const add of adds) {
      for (const remove of removes) {
        if (add.value && remove.value && add.value.toLowerCase() === remove.value.toLowerCase()) {
          conflicts.push({
            type: 'add_remove_conflict',
            target,
            ops: [add, remove],
            resolution: 'Higher-priority reviewer wins',
          });
        }
      }
    }
  }

  return conflicts;
}

function applyPriorityOrder(ops, priorityOrder) {
  return [...ops].sort((a, b) => {
    const aIdx = priorityOrder.indexOf(a.reviewer_role);
    const bIdx = priorityOrder.indexOf(b.reviewer_role);
    const aPri = aIdx === -1 ? priorityOrder.length : aIdx;
    const bPri = bIdx === -1 ? priorityOrder.length : bIdx;
    return aPri - bPri;
  });
}

function mergeCritiques(critiques, priorityOrder) {
  // Extract all ops from all critiques
  const rawOps = extractOps(critiques);

  // If no ops, check if all reviewers said no_issues
  if (rawOps.length === 0) {
    const allClear = critiques.every(c => c.no_issues);
    return {
      allOps: [],
      conflicts: [],
      noChanges: allClear,
      severityMax: 'nit',
    };
  }

  // Deduplicate
  const dedupedOps = deduplicateOps(rawOps);

  // Detect conflicts
  const conflicts = detectConflicts(dedupedOps);

  // Apply priority ordering
  const orderedOps = applyPriorityOrder(dedupedOps, priorityOrder);

  // Determine max severity
  const severityRank = { blocker: 4, major: 3, minor: 2, nit: 1 };
  let maxRank = 0;
  for (const op of orderedOps) {
    const rank = severityRank[op.severity] || 0;
    if (rank > maxRank) maxRank = rank;
  }
  const severityNames = ['nit', 'nit', 'minor', 'major', 'blocker'];
  const severityMax = severityNames[maxRank] || 'nit';

  return {
    allOps: orderedOps,
    conflicts,
    noChanges: false,
    severityMax,
  };
}

function buildEditorPrompt(originalPrompt, orderedOps, context) {
  const system = `You are a prompt editor. You receive an original prompt and a list of reviewer-suggested edit operations. Apply each operation to produce a refined prompt.

Rules:
- Apply ONLY what the reviewers proposed. No additional edits.
- Do not remove content unless a reviewer explicitly proposed RemoveConstraint.
- Preserve the user's intent and voice.
- Output the refined prompt text, then a brief diff summary.

Output format:
<refined_prompt>
The full refined prompt here
</refined_prompt>

<diff_summary>
- [Reviewer] Op: description of change
</diff_summary>

<risks>
- Any risks or caveats (or "None")
</risks>`;

  let userContent = `## Original Prompt\n\n${originalPrompt}\n\n## Edit Operations (in priority order)\n\n`;

  for (let i = 0; i < orderedOps.length; i++) {
    const op = orderedOps[i];
    userContent += `${i + 1}. [${op.reviewer_role}] ${op.op} on "${op.target}"`;
    if (op.original) userContent += `\n   Replace: "${op.original}"`;
    userContent += `\n   Value: "${op.value}"`;
    userContent += `\n   Reason: ${op.issue || 'N/A'} (${op.severity})`;
    userContent += '\n\n';
  }

  if (context && context.projectName) {
    userContent += `## Context\nProject: ${context.projectName}\n`;
    if (context.stack) userContent += `Stack: ${context.stack.join(', ')}\n`;
  }

  return { system, user: userContent };
}

function parseEditorResponse(response) {
  const refinedMatch = response.match(/<refined_prompt>([\s\S]*?)<\/refined_prompt>/);
  const diffMatch = response.match(/<diff_summary>([\s\S]*?)<\/diff_summary>/);
  const risksMatch = response.match(/<risks>([\s\S]*?)<\/risks>/);

  return {
    refinedPrompt: refinedMatch ? refinedMatch[1].trim() : response.trim(),
    diffSummary: diffMatch ? diffMatch[1].trim() : '',
    risks: risksMatch
      ? risksMatch[1].trim().split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean)
      : [],
  };
}

function computeCompositeScore(critiques, weights) {
  const scores = {};
  let numerator = 0;
  let denominator = 0;

  for (const critique of critiques) {
    if (critique.score === undefined || critique.score === null) continue;
    if (typeof critique.score !== 'number' || isNaN(critique.score)) continue;

    const role = critique.reviewer_role;
    const weight = (weights && weights[role]) || 1.0;
    scores[role] = critique.score;
    numerator += critique.score * weight;
    denominator += weight;
  }

  const composite = denominator > 0
    ? Math.round((numerator / denominator) * 100) / 100
    : null;

  return { composite, scores };
}

module.exports = {
  mergeCritiques,
  detectConflicts,
  applyPriorityOrder,
  extractOps,
  deduplicateOps,
  buildEditorPrompt,
  parseEditorResponse,
  computeCompositeScore,
};
