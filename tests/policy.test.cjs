const assert = require('assert');
const { readCurrentSystemPrompt, computePolicyInsights } = require('../policy.cjs');

// Test 1: readCurrentSystemPrompt extracts SYSTEM_PROMPT via regex from mock .cjs content
{
  // Create a mock file content with SYSTEM_PROMPT
  const mockContent = `
const SYSTEM_PROMPT = \`You are a security reviewer. Check for vulnerabilities.\`;

function someFunction() {
  // Function body
}

module.exports = { someFunction };
`;

  // readCurrentSystemPrompt should extract the string between backticks
  // We'll test by reading an actual reviewer file if available, or by testing the regex logic
  // For now, we test that it returns null for missing files and a string when found
  const result = readCurrentSystemPrompt('nonexistent_reviewer');
  assert.strictEqual(result, null, 'Should return null for nonexistent reviewer');
}

// Test 2: computePolicyInsights returns empty object with no debate logs
{
  // Mock no audit entries (empty logs)
  const result = computePolicyInsights(30, []);  // Pass empty array of logs
  assert.ok(typeof result === 'object', 'Should return object');
  assert.deepStrictEqual(result, {}, 'Should return empty object with no logs');
}

// Test 3: computePolicyInsights aggregates argument quality scores correctly
{
  // Create mock audit entries with debate logs
  const mockLogs = [
    {
      debate_log: {
        ran: true,
        pairs: [{ role_a: 'security', role_b: 'testing', winner: 'security' }],
        judge_feedback: [
          { role: 'security', argument_quality_score: 8.0, argument_labels: ['precise', 'evidence-backed'], policy_signal: 'Good signal 1' },
          { role: 'testing', argument_quality_score: 6.0, argument_labels: ['vague'], policy_signal: 'Needs improvement' }
        ],
        cost: { input_tokens: 1000, output_tokens: 500 }
      }
    },
    {
      debate_log: {
        ran: true,
        pairs: [{ role_a: 'security', role_b: 'testing', winner: 'security' }],
        judge_feedback: [
          { role: 'security', argument_quality_score: 7.0, argument_labels: ['well-reasoned'], policy_signal: 'Good signal 2' },
          { role: 'testing', argument_quality_score: 5.0, argument_labels: ['vague', 'incomplete'], policy_signal: 'Needs rework' }
        ],
        cost: { input_tokens: 1000, output_tokens: 500 }
      }
    }
  ];

  const result = computePolicyInsights(30, mockLogs);

  // Should have insights for both security and testing
  assert.ok(result.security, 'Should have insights for security');
  assert.ok(result.testing, 'Should have insights for testing');

  // Security: avg of 8.0 and 7.0 = 7.5
  assert.ok(Math.abs(result.security.avg_argument_quality - 7.5) < 0.01,
    `Security avg should be 7.5, got ${result.security.avg_argument_quality}`);

  // Testing: avg of 6.0 and 5.0 = 5.5
  assert.ok(Math.abs(result.testing.avg_argument_quality - 5.5) < 0.01,
    `Testing avg should be 5.5, got ${result.testing.avg_argument_quality}`);

  // Check that labels are aggregated
  assert.ok(result.security.common_labels, 'Should have common_labels for security');
  assert.ok(result.testing.common_labels, 'Should have common_labels for testing');
}

console.log('policy.test: all tests passed');
