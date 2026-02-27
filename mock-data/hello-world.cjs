// Hello World Mock Data: Single canonical example demonstrating entire system
// Usage: node tests/hello-world-demo.test.cjs

module.exports = {
  meta: {
    id: "hello-world",
    category: "demo",
    description: "Email validation prompt with common vagueness patterns",
    created: new Date().toISOString(),
  },

  // Initial vague prompt
  scenario_1_vague: {
    prompt: "Write a function that validates email addresses",
    expected_gate_action: "warn",
    expected_severity_max: "major",
    expected_clarity_score_range: [2, 5],
    expected_findings: {
      clarity: {
        major: [
          {
            issue: "Vague validation requirement",
            evidence: "What constitutes valid? RFC 5322? Simple regex? What about edge cases?",
          },
          {
            issue: "Missing output format specification",
            evidence: "Should return bool? String? Exception on invalid?",
          },
        ],
        minor: [
          {
            issue: "No mention of input constraints",
            evidence: "Max length? Encoding? What if null/undefined?",
          },
        ],
      },
      security: {
        minor: [
          {
            issue: "No sanitization mentioned",
            evidence: "Should output be escaped? HTML-safe?",
          },
        ],
      },
      testing: {
        minor: [
          {
            issue: "No test cases or edge cases defined",
            evidence: "What about +signs, multiple @, unicode?",
          },
        ],
      },
    },
    refinement_suggestions: [
      "Specify RFC or regex pattern",
      "Define output format (boolean return)",
      "List edge cases to handle",
      "Specify language/framework",
    ],
  },

  // Refined prompt after iteration 1
  scenario_2_medium: {
    prompt: `Write a Python function that validates email addresses.
Use regex pattern: ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$
Return True if valid, False if invalid.
Handle edge cases: empty string, None, spaces.
Do NOT sanitize input (just validate format).`,
    expected_gate_action: "proceed",
    expected_severity_max: "minor",
    expected_clarity_score_range: [6, 8],
    improvements_from_v1: [
      "Added language specification (Python)",
      "Added specific regex pattern",
      "Added output format (boolean)",
      "Added edge case list",
      "Added constraint (no sanitization)",
    ],
    expected_findings: {
      clarity: {
        minor: [
          {
            issue: "Still missing: performance constraints",
            evidence: "Is O(n²) acceptable? Memory limits?",
          },
        ],
      },
      testing: {
        minor: [
          {
            issue: "Specific test cases would help",
            evidence: "e.g., 'test@example.com' (valid), 'test@.com' (invalid)",
          },
        ],
      },
    },
  },

  // Fully specified prompt (optimized clarity)
  scenario_3_clear: {
    prompt: `Write a Python function validate_email(email: str) -> bool that validates email format.

REQUIREMENTS:
1. Pattern: Accept emails matching ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$
2. Input constraints:
   - Type must be str (raise TypeError if not)
   - Accept empty string (return False)
   - Accept None (raise TypeError)
3. Output: True if valid per pattern, False otherwise
4. Edge cases handled:
   - Leading/trailing spaces → invalid (no trim)
   - Multiple @ signs → invalid
   - Missing TLD → invalid (e.g., 'user@host' invalid)
   - Valid: 'test@example.co.uk', 'user+tag@domain.io'
   - Invalid: 'test@', '@example.com', 'test @example.com'

CONSTRAINTS:
- No sanitization (just regex validation)
- Performance: O(n) time, O(1) space
- No external libraries (only re module)

TEST CASES (minimum):
- validate_email('user@example.com') → True
- validate_email('user+tag@sub.domain.org') → True
- validate_email('user@domain') → False (no TLD)
- validate_email('') → False
- validate_email(None) → TypeError
- validate_email(123) → TypeError`,
    expected_gate_action: "proceed",
    expected_severity_max: "nit",
    expected_clarity_score_range: [8.5, 10],
    improvements_from_v2: [
      "Added type constraints (TypeError on None/non-str)",
      "Added specific valid/invalid examples",
      "Added performance constraints",
      "Added explicit test cases",
      "Added library constraint",
    ],
    expected_findings: {
      clarity: {
        nit: [],
      },
      testing: {
        nit: [
          {
            issue: "Optional: could add performance tests",
            evidence: "e.g., benchmark vs. email-validator library",
          },
        ],
      },
    },
  },

  // Audit log entries for demonstration
  audit_log_entries: [
    {
      timestamp: new Date().toISOString(),
      original_prompt_hash: "abc123def456",
      reviewers_active: ["clarity", "security", "testing", "domain_sme"],
      findings_detail: [
        // Vague version findings
        {
          reviewer_role: "clarity",
          finding_id: "CLR-001",
          severity: "major",
          confidence: 0.95,
          issue: "Vague validation requirement",
          evidence: "What constitutes valid? RFC 5322? Simple regex?",
        },
        {
          reviewer_role: "clarity",
          finding_id: "CLR-002",
          severity: "major",
          confidence: 0.92,
          issue: "Missing output format",
          evidence: "Return bool? String? Exception?",
        },
        {
          reviewer_role: "clarity",
          finding_id: "CLR-003",
          severity: "minor",
          confidence: 0.88,
          issue: "No input constraints defined",
          evidence: "Max length? Null handling?",
        },
        {
          reviewer_role: "security",
          finding_id: "SEC-001",
          severity: "minor",
          confidence: 0.75,
          issue: "No sanitization mentioned",
          evidence: "Should output be escaped?",
        },
        {
          reviewer_role: "testing",
          finding_id: "TST-001",
          severity: "minor",
          confidence: 0.80,
          issue: "No test cases defined",
          evidence: "What edge cases matter?",
        },
      ],
      composite_score: 3.5,
      suggestions_accepted: [],
      suggestions_rejected: [],
      rejection_details: {},
      outcome: "pending",
      reviewer_stats: {
        clarity: { proposed: 3, accepted: 0, rejected: 0 },
        security: { proposed: 1, accepted: 0, rejected: 0 },
        testing: { proposed: 1, accepted: 0, rejected: 0 },
        domain_sme: { proposed: 0, accepted: 0, rejected: 0 },
      },
    },
  ],

  // Expected test flow
  test_flow: {
    step_1: "Load hello-world.cjs",
    step_2: "Extract scenario_1_vague prompt",
    step_3: "Run through clarity reviewer → expect major findings",
    step_4: "Verify gate action is 'warn'",
    step_5: "Verify composite score in range [2, 5]",
    step_6: "User accepts suggestions (simulated)",
    step_7: "Load scenario_2_medium → score should improve to [6, 8]",
    step_8: "Load scenario_3_clear → score should improve to [8.5, 10]",
    step_9: "Verify findings count decreases monotonically",
    step_10: "Verify audit trail captures all iterations",
  },

  // Metrics to verify
  success_metrics: {
    clarity_score_improvement: {
      v1_to_v2: { expected_min: 2.5, expected_max: 3.0 },
      v2_to_v3: { expected_min: 2.0, expected_max: 2.5 },
    },
    finding_count_reduction: {
      v1: 5,
      v2: 2,
      v3: 0,
    },
    gate_action_progression: {
      v1: "warn",
      v2: "proceed",
      v3: "proceed",
    },
    severity_progression: {
      v1: "major",
      v2: "minor",
      v3: "nit",
    },
  },
};
