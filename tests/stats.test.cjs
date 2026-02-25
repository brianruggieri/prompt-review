const assert = require('assert');
const { readAuditLogs, computeScoreTrend, computeOutcomes, computeSeverityTrend, computeTopPatterns } = require('../stats.cjs');

// Test: readAuditLogs parses JSONL entries
{
  const lines = [
    '{"timestamp":"2026-02-20T10:00:00Z","project":"test","composite_score":7.0,"severity_max":"minor","findings_count":2,"outcome":"approved","scores":{"security":8.0,"clarity":6.0}}',
    '{"timestamp":"2026-02-21T10:00:00Z","project":"test","composite_score":8.0,"severity_max":"nit","findings_count":0,"outcome":"approved","scores":{"security":9.0,"clarity":7.0}}',
  ];
  // readAuditLogs takes an array of JSONL strings (one per line)
  const entries = readAuditLogs(lines);
  assert.strictEqual(entries.length, 2, 'Should parse 2 entries');
  assert.strictEqual(entries[0].composite_score, 7.0);
  assert.strictEqual(entries[1].composite_score, 8.0);
}

// Test: readAuditLogs skips malformed lines
{
  const lines = [
    '{"timestamp":"2026-02-20T10:00:00Z","composite_score":7.0}',
    'not json',
    '',
    '{"timestamp":"2026-02-21T10:00:00Z","composite_score":8.0}',
  ];
  const entries = readAuditLogs(lines);
  assert.strictEqual(entries.length, 2, 'Should skip malformed lines');
}

// Test: computeScoreTrend groups by week
{
  const entries = [
    { timestamp: '2026-02-03T10:00:00Z', composite_score: 5.0 },
    { timestamp: '2026-02-04T10:00:00Z', composite_score: 6.0 },
    { timestamp: '2026-02-10T10:00:00Z', composite_score: 7.0 },
    { timestamp: '2026-02-17T10:00:00Z', composite_score: 8.0 },
  ];
  const trend = computeScoreTrend(entries);
  assert.ok(trend.length >= 2, 'Should have multiple weeks');
  // First week avg should be 5.5
  assert.ok(Math.abs(trend[0].avg - 5.5) < 0.01, `Week 1 avg should be ~5.5, got ${trend[0].avg}`);
}

// Test: computeOutcomes counts correctly
{
  const entries = [
    { outcome: 'approved' },
    { outcome: 'approved' },
    { outcome: 'edited' },
    { outcome: 'rejected' },
    { outcome: 'pending' },
  ];
  const outcomes = computeOutcomes(entries);
  assert.strictEqual(outcomes.approved, 2);
  assert.strictEqual(outcomes.edited, 1);
  assert.strictEqual(outcomes.rejected, 1);
  assert.strictEqual(outcomes.pending, 1);
  assert.strictEqual(outcomes.total, 5);
}

// Test: computeTopPatterns counts finding issues
{
  const entries = [
    { findings_detail: [{ issue: 'Missing test command' }, { issue: 'Vague verb' }] },
    { findings_detail: [{ issue: 'Missing test command' }, { issue: 'No .env guardrail' }] },
    { findings_detail: [{ issue: 'Missing test command' }] },
  ];
  const patterns = computeTopPatterns(entries);
  assert.strictEqual(patterns[0].issue, 'Missing test command');
  assert.strictEqual(patterns[0].count, 3);
}

// Test: empty entries returns empty results
{
  const entries = [];
  const trend = computeScoreTrend(entries);
  const outcomes = computeOutcomes(entries);
  assert.strictEqual(trend.length, 0);
  assert.strictEqual(outcomes.total, 0);
}

console.log('stats.test: all tests passed');
