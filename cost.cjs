const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PRICING = {
  'claude-haiku-4-5':   { input: 1.0,  output: 5.0 },  // per MTok
  'claude-sonnet-4-6':  { input: 3.0,  output: 15.0 },
  'claude-opus-4-6':    { input: 5.0,  output: 25.0 },
};

function estimateCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model] || PRICING['claude-haiku-4-5'];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

function computeEntryHash(entry) {
  // Exclude __hash from hash computation
  const contentCopy = { ...entry };
  delete contentCopy.__hash;
  const jsonStr = JSON.stringify(contentCopy);
  return crypto.createHash('sha256').update(jsonStr).digest('hex').slice(0, 16);
}

function verifyAuditEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { valid: false, reason: 'Entry is not an object' };
  }
  if (!entry.__hash) {
    return { valid: false, reason: 'Entry has no __hash field' };
  }
  const computed = computeEntryHash(entry);
  if (computed !== entry.__hash) {
    return { valid: false, reason: `Hash mismatch: expected ${entry.__hash}, computed ${computed}` };
  }
  return { valid: true, reason: 'OK' };
}

function writeAuditLog(entry) {
  const logsDir = path.join(__dirname, 'logs');
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

    // Compute and attach hash before writing
    entry.__hash = computeEntryHash(entry);

    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(logsDir, `${date}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch (e) {
    // fail silently -- never block the pipeline for logging
  }
}

function computeReviewerStats(findingsDetail, acceptedIds, rejectedIds) {
  const stats = {};

  for (const finding of findingsDetail) {
    const role = finding.reviewer_role;
    const findingId = finding.finding_id;

    if (!stats[role]) {
      stats[role] = { proposed: 0, accepted: 0, rejected: 0 };
    }

    stats[role].proposed++;

    if (acceptedIds && acceptedIds.includes(findingId)) {
      stats[role].accepted++;
    } else if (rejectedIds && rejectedIds.includes(findingId)) {
      stats[role].rejected++;
    }
  }

  return stats;
}

function updateAuditOutcome(logDate, promptHash, outcome, acceptedIds, rejectedIds, rejectionReasons = {}) {
  const logFile = path.join(__dirname, 'logs', `${logDate}.jsonl`);
  if (!fs.existsSync(logFile)) return false;

  const content = fs.readFileSync(logFile, 'utf-8');
  const lines = content.split('\n');
  let updated = false;

  const newLines = lines.map(line => {
    if (!line.trim()) return line;
    try {
      const entry = JSON.parse(line);
      if (entry.original_prompt_hash === promptHash && entry.outcome === 'pending') {
        // Verify hash before proceeding
        const verification = verifyAuditEntry(entry);
        if (!verification.valid) {
          // Hash verification failed, skip this entry
          return line;
        }

        entry.outcome = outcome;
        entry.suggestions_accepted = acceptedIds || [];
        entry.suggestions_rejected = rejectedIds || [];
        entry.rejection_details = {};

        // Store rejection reasons if provided
        if (rejectionReasons && Object.keys(rejectionReasons).length > 0) {
          entry.rejection_details = rejectionReasons;
        } else {
          // Default: mark all rejections as 'unknown' reason
          for (const rejectedId of (rejectedIds || [])) {
            entry.rejection_details[rejectedId] = 'unknown';
          }
        }

        entry.reviewer_stats = computeReviewerStats(entry.findings_detail || [], acceptedIds, rejectedIds);
        // Compute new hash for mutated entry
        entry.__hash = computeEntryHash(entry);
        updated = true;
        return JSON.stringify(entry);
      }
    } catch (e) {
      // keep line as-is
    }
    return line;
  });

  if (updated) {
    fs.writeFileSync(logFile, newLines.join('\n'));
  }
  return updated;
}

module.exports = { estimateCost, writeAuditLog, updateAuditOutcome, computeReviewerStats, computeEntryHash, verifyAuditEntry, PRICING };
