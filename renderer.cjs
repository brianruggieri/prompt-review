const OP_SYMBOLS = {
  AddConstraint: '+',
  RemoveConstraint: '-',
  RefactorStructure: '~',
  ReplaceVague: '~',
  AddContext: '+',
  AddGuardrail: '+',
  AddAcceptanceCriteria: '+',
};

const ROLE_LABELS = {
  domain_sme: 'Domain SME',
  security: 'Security',
  clarity: 'Clarity',
  testing: 'Testing',
  frontend_ux: 'Frontend/UX',
  documentation: 'Documentation',
};

function formatTokens(count) {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

function formatDuration(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatCost(data) {
  const tokens = formatTokens((data.inputTokens || 0) + (data.outputTokens || 0));
  if (data.usd === 0 || data.usd === undefined) {
    return `$0.00 (subscription) | ${tokens} tokens`;
  }
  return `$${data.usd.toFixed(4)} | ${tokens} tokens`;
}

function renderReviewerStatus(reviewersActive) {
  return reviewersActive.map(role => {
    const label = ROLE_LABELS[role] || role;
    return `${label} ok`;
  }).join('  ');
}

function renderFinding(finding) {
  const symbol = OP_SYMBOLS[finding.op] || '+';
  const label = ROLE_LABELS[finding.reviewer_role] || finding.reviewer_role;
  let line = `${symbol} [${label}]`;

  if (finding.op === 'ReplaceVague' && finding.original) {
    line += ` Replaced: "${finding.original}" ->\n   "${finding.value}"`;
  } else if (finding.op === 'RemoveConstraint') {
    line += ` Removed: "${finding.value}"`;
  } else {
    const opLabel = finding.op.replace(/([A-Z])/g, ' $1').trim();
    line += ` ${opLabel}: "${finding.value}"`;
  }

  if (finding.issue) {
    line += `\n  \u21b3 Why: ${finding.issue}`;
  }

  return line;
}

function renderReviewBlock(data) {
  const lines = [];

  // Header
  lines.push('+-- Prompt Review -------------------------------------------+');
  lines.push('|                                                            |');

  // Reviewer status
  lines.push(`| Reviewers: ${renderReviewerStatus(data.reviewersActive)}`);

  // Score line (when scoring data present and display enabled)
  if (data.scoring && data.scoring.display && data.scoring.composite !== null) {
    const subscores = Object.entries(data.scoring.scores)
      .map(([role, score]) => `${ROLE_LABELS[role] || role} ${Number(score).toFixed(1)}`)
      .join('  ');
    lines.push(`| Score: ${data.scoring.composite} / 10  (${subscores})`);
  }

  // Fairness warning (if any role dominates > 40%)
  const dominantRoles = data.dominantRoles || data.dominant_roles;
  if (dominantRoles && dominantRoles.length > 0) {
    const dominantLabel = dominantRoles.map(r => ROLE_LABELS[r] || r).join(', ');
    lines.push(`| ⚠ Fairness: ${dominantLabel} dominates composite (>40%)   |`);
  }

  // Cost line
  lines.push(`| Cost: ${formatCost(data.cost)} | ${formatDuration(data.durationMs)}`);
  lines.push('|                                                            |');

  if (data.noChanges) {
    // No changes case
    lines.push('| No changes needed -- all reviewers passed.                 |');
    lines.push('|                                                            |');
    lines.push('+------------------------------------------------------------+');
    return lines.join('\n');
  }

  // Changes section
  const changeCount = data.findings.length;
  lines.push(`| -- Changes (${changeCount}) ------------------------------------------  |`);
  lines.push('|                                                            |');

  for (const finding of data.findings) {
    const rendered = renderFinding(finding);
    for (const subline of rendered.split('\n')) {
      lines.push(`| ${subline}`);
    }
    lines.push('|                                                            |');
  }

  // Risks
  if (data.risks && data.risks.length > 0) {
    lines.push('| -- Risks ------------------------------------------------ |');
    for (const risk of data.risks) {
      lines.push(`| ! ${risk}`);
    }
    lines.push('|                                                            |');
  }

  // Refined prompt
  lines.push('| -- Refined Prompt ---------------------------------------- |');
  lines.push('|                                                            |');
  // Wrap refined prompt lines
  const promptLines = data.refinedPrompt.split('\n');
  for (const pl of promptLines) {
    lines.push(`| ${pl}`);
  }
  lines.push('|                                                            |');
  lines.push('+------------------------------------------------------------+');
  lines.push('');
  lines.push('Proceed with the refined prompt? (yes / no / edit)');

  return lines.join('\n');
}

module.exports = {
  renderReviewBlock,
  renderFinding,
  renderReviewerStatus,
  formatTokens,
  formatDuration,
  formatCost,
  ROLE_LABELS,
  OP_SYMBOLS,
};
