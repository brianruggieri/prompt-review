const fs = require('fs');
const path = require('path');

const PRICING = {
  'claude-haiku-4-5':   { input: 1.0,  output: 5.0 },  // per MTok
  'claude-sonnet-4-6':  { input: 3.0,  output: 15.0 },
  'claude-opus-4-6':    { input: 5.0,  output: 25.0 },
};

function estimateCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model] || PRICING['claude-haiku-4-5'];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

function writeAuditLog(entry) {
  const logsDir = path.join(__dirname, 'logs');
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(logsDir, `${date}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch (e) {
    // fail silently -- never block the pipeline for logging
  }
}

function updateAuditOutcome(logDate, promptHash, outcome) {
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
        entry.outcome = outcome;
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

module.exports = { estimateCost, writeAuditLog, updateAuditOutcome, PRICING };
