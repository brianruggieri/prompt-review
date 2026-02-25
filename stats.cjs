const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, 'logs');

function readAuditLogs(lines) {
  const entries = [];
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    try {
      entries.push(JSON.parse(line.trim()));
    } catch (e) {
      // skip malformed lines
    }
  }
  return entries;
}

function loadLogsFromDisk(days) {
  const entries = [];
  if (!fs.existsSync(LOGS_DIR)) return entries;

  const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
  const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl')).sort();

  for (const file of files) {
    // File name is YYYY-MM-DD.jsonl — quick date check
    if (cutoff) {
      const fileDate = file.replace('.jsonl', '');
      if (new Date(fileDate) < cutoff) continue;
    }

    const content = fs.readFileSync(path.join(LOGS_DIR, file), 'utf-8');
    const lines = content.split('\n');
    const parsed = readAuditLogs(lines);

    for (const entry of parsed) {
      if (cutoff && new Date(entry.timestamp) < cutoff) continue;
      entries.push(entry);
    }
  }

  return entries;
}

function computeScoreTrend(entries) {
  if (entries.length === 0) return [];

  // Group by ISO week
  const weeks = new Map();
  for (const entry of entries) {
    if (entry.composite_score === null || entry.composite_score === undefined) continue;
    const date = new Date(entry.timestamp);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().slice(0, 10);

    if (!weeks.has(weekKey)) weeks.set(weekKey, []);
    weeks.get(weekKey).push(entry.composite_score);
  }

  const trend = [];
  for (const [weekKey, scores] of [...weeks].sort((a, b) => a[0].localeCompare(b[0]))) {
    const avg = Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100;
    trend.push({ week: weekKey, avg, count: scores.length });
  }

  return trend;
}

function computeSubscoreTrend(entries) {
  const roleScores = {};

  for (const entry of entries) {
    if (!entry.scores) continue;
    for (const [role, score] of Object.entries(entry.scores)) {
      if (!roleScores[role]) roleScores[role] = [];
      roleScores[role].push(score);
    }
  }

  const result = {};
  for (const [role, scores] of Object.entries(roleScores)) {
    result[role] = Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100;
  }

  return result;
}

function computeOutcomes(entries) {
  const counts = { approved: 0, edited: 0, rejected: 0, pending: 0 };
  for (const entry of entries) {
    const outcome = entry.outcome || 'pending';
    if (counts[outcome] !== undefined) {
      counts[outcome]++;
    }
  }
  counts.total = entries.length;
  return counts;
}

function computeSeverityTrend(entries) {
  const counts = { blocker: 0, major: 0, minor: 0, nit: 0 };
  for (const entry of entries) {
    const sev = entry.severity_max || 'nit';
    if (counts[sev] !== undefined) counts[sev]++;
  }
  const total = entries.length || 1;
  return {
    blocker: Math.round((counts.blocker / total) * 100),
    major: Math.round((counts.major / total) * 100),
    minor: Math.round((counts.minor / total) * 100),
    nit: Math.round((counts.nit / total) * 100),
  };
}

function computeTopPatterns(entries) {
  const issueCounts = new Map();

  for (const entry of entries) {
    if (!entry.findings_detail || !Array.isArray(entry.findings_detail)) continue;
    for (const finding of entry.findings_detail) {
      if (!finding.issue) continue;
      issueCounts.set(finding.issue, (issueCounts.get(finding.issue) || 0) + 1);
    }
  }

  return [...issueCounts.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function computeReviewerEffectiveness(entries) {
  const reviewerMap = {};

  for (const entry of entries) {
    if (!entry.findings_detail || !Array.isArray(entry.findings_detail)) continue;

    for (const finding of entry.findings_detail) {
      const role = finding.reviewer_role;
      if (!role) continue;

      if (!reviewerMap[role]) {
        reviewerMap[role] = {
          proposed: 0,
          accepted: 0,
          rejected: 0,
          review_count: 0,
          participations: new Set(),
        };
      }

      const findingId = finding.finding_id;
      reviewerMap[role].proposed++;
      reviewerMap[role].participations.add(entry.timestamp);

      if (entry.suggestions_accepted && entry.suggestions_accepted.includes(findingId)) {
        reviewerMap[role].accepted++;
      } else if (entry.suggestions_rejected && entry.suggestions_rejected.includes(findingId)) {
        reviewerMap[role].rejected++;
      }
    }
  }

  // Convert to final metrics
  const result = {};
  for (const [role, data] of Object.entries(reviewerMap)) {
    const reviewCount = data.participations.size;
    const precision = data.proposed > 0 ? data.accepted / data.proposed : 0;

    result[role] = {
      precision: Math.round(precision * 10000) / 10000,
      proposed: data.proposed,
      accepted: data.accepted,
      rejected: data.rejected,
      review_count: reviewCount,
    };
  }

  return result;
}

function renderBar(value, max) {
  const width = 10;
  const filled = Math.round((value / max) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

function scoreLabel(score) {
  if (score >= 8) return 'strong';
  if (score >= 6) return 'good';
  if (score >= 4) return 'needs work';
  return 'poor';
}

function renderDashboard(stats, days) {
  const lines = [];
  const label = days === 'all' ? 'all time' : `last ${days} days`;
  lines.push(`Prompt Review Stats (${label})`);
  lines.push('\u2550'.repeat(35));
  lines.push('');

  // Reviews
  lines.push(`Reviews:       ${stats.outcomes.total} total`);

  // Outcomes
  const { approved, edited, rejected, total } = stats.outcomes;
  if (total > 0) {
    const pctApproved = Math.round((approved / total) * 100);
    const pctEdited = Math.round((edited / total) * 100);
    const pctRejected = Math.round((rejected / total) * 100);
    lines.push(`Outcomes:      ${approved} approved (${pctApproved}%)  ${edited} edited (${pctEdited}%)  ${rejected} rejected (${pctRejected}%)`);
  }
  lines.push('');

  // Score Trend
  if (stats.scoreTrend && stats.scoreTrend.length > 0) {
    lines.push('Score Trend');
    for (let i = 0; i < stats.scoreTrend.length; i++) {
      const { week, avg } = stats.scoreTrend[i];
      lines.push(`  Week ${i + 1}:     ${avg.toFixed(1)} avg  ${renderBar(avg, 10)}`);
    }
    lines.push('');
  }

  // Subscores
  if (stats.subscores && Object.keys(stats.subscores).length > 0) {
    lines.push('Subscores (current period avg)');

    const ROLE_LABELS = {
      domain_sme: 'Convention',
      security: 'Security',
      clarity: 'Specificity',
      testing: 'Testability',
      frontend_ux: 'UX',
      documentation: 'Docs',
    };

    // Find weakest for annotation
    let weakest = null;
    let weakestScore = Infinity;

    const entries = Object.entries(stats.subscores)
      .sort((a, b) => b[1] - a[1]); // Sort descending

    for (const [role, score] of entries) {
      if (score < weakestScore) {
        weakestScore = score;
        weakest = role;
      }
    }

    for (const [role, score] of entries) {
      const label = ROLE_LABELS[role] || role;
      const padded = (label + ':').padEnd(14);
      const bar = renderBar(score, 10);
      const tag = scoreLabel(score);
      const suffix = role === weakest ? '  \u2190 weakest' : '';
      lines.push(`  ${padded}${score.toFixed(1)}  ${bar}  ${tag}${suffix}`);
    }
    lines.push('');
  }

  // Severity Trend
  if (stats.severityTrend) {
    lines.push('Severity Distribution');
    const { blocker, major, minor, nit } = stats.severityTrend;
    lines.push(`  Blockers:    ${blocker}%`);
    lines.push(`  Major:       ${major}%`);
    lines.push(`  Minor:       ${minor}%`);
    lines.push(`  Nit:         ${nit}%`);
    lines.push('');
  }

  // Top Patterns
  if (stats.topPatterns && stats.topPatterns.length > 0) {
    lines.push('Top Patterns');
    for (let i = 0; i < Math.min(5, stats.topPatterns.length); i++) {
      const { issue, count } = stats.topPatterns[i];
      lines.push(`  ${i + 1}. ${issue.padEnd(35)} (${count} occurrences)`);
    }
    lines.push('');
  }

  // Reviewer Effectiveness
  if (stats.effectiveness && Object.keys(stats.effectiveness).length > 0) {
    lines.push('Reviewer Effectiveness');

    const PRECISION_THRESHOLD = 0.70;
    const entries = Object.entries(stats.effectiveness)
      .sort((a, b) => b[1].precision - a[1].precision); // Sort by precision descending

    for (const [role, metrics] of entries) {
      const precisionPct = Math.round(metrics.precision * 100);
      const accepted = metrics.accepted;
      const proposed = metrics.proposed;
      const tag = metrics.precision >= PRECISION_THRESHOLD ? '' : '  ← below threshold';
      lines.push(`  ${role.padEnd(18)} precision ${precisionPct}%  (${accepted}/${proposed} accepted)${tag}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderDashboardJson(stats) {
  return JSON.stringify(stats, null, 2);
}

function generateStats(days) {
  const numDays = days === 'all' ? null : (parseInt(days) || 30);
  const entries = loadLogsFromDisk(numDays);

  const stats = {
    period: days === 'all' ? 'all' : `${numDays}d`,
    outcomes: computeOutcomes(entries),
    scoreTrend: computeScoreTrend(entries),
    subscores: computeSubscoreTrend(entries),
    severityTrend: computeSeverityTrend(entries),
    topPatterns: computeTopPatterns(entries),
    effectiveness: computeReviewerEffectiveness(entries),
  };

  return stats;
}

module.exports = {
  readAuditLogs,
  loadLogsFromDisk,
  computeScoreTrend,
  computeSubscoreTrend,
  computeOutcomes,
  computeSeverityTrend,
  computeTopPatterns,
  computeReviewerEffectiveness,
  renderDashboard,
  renderDashboardJson,
  generateStats,
};
