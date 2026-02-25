// Advanced Tier 2: Clarity Factors, Anti-patterns, Reviewer Specialization
// Strategically tests what makes prompts CLEAR, REVIEWABLE, and what reviewers EXCEL at
// Usage: node scripts/generate-tier2-advanced.cjs [--count 200] [--output file.json]

const { generateAuditEntry } = require('./generate-mock-data.cjs');

// ============================================================================
// PART 1: CLARITY FACTORS - Test each attribute that affects clarity
// ============================================================================

const CLARITY_FACTORS = {
	// Factor 1: Acceptance Criteria Presence
	acceptance_criteria_present: {
		domain: 'Testing Patterns',
		factor: 'Acceptance Criteria',
		vague: {
			prompt: 'Build a search feature',
			score: 3.2,
			findings: [
				{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.96, issue: 'No acceptance criteria', evidence: 'How do we know it\'s done?' },
			],
		},
		clear: {
			prompt: 'Build search: (1) Returns <100ms, (2) Matches 90% of test queries, (3) Pagination works, (4) Passes all 50 unit tests',
			score: 8.5,
			findings: [],
		},
	},

	// Factor 2: Success Metrics/KPIs
	success_metrics_present: {
		domain: 'Testing Patterns',
		factor: 'Success Metrics',
		vague: {
			prompt: 'Improve performance',
			score: 2.8,
			findings: [
				{ reviewer_role: 'domain_sme', severity: 'blocker', confidence: 0.97, issue: 'No metrics', evidence: 'Latency? Throughput? Memory?' },
			],
		},
		clear: {
			prompt: 'Improve performance: (1) Latency: 100ms → 50ms (p99), (2) Throughput: 1k/s → 5k/s, (3) Memory: stable <500MB, (4) Benchmark before/after',
			score: 9.0,
			findings: [],
		},
	},

	// Factor 3: Code Examples/Before-After
	code_examples: {
		domain: 'Implementation Details',
		factor: 'Code Examples',
		vague: {
			prompt: 'Refactor the validation logic',
			score: 3.5,
			findings: [
				{ reviewer_role: 'clarity', severity: 'major', confidence: 0.94, issue: 'No examples', evidence: 'Current code? Expected code?' },
			],
		},
		clear: {
			prompt: 'Refactor validation: BEFORE: if (x && y && z && a) { ... } AFTER: const isValid = [x,y,z,a].every(v=>v); Reduce cyclomatic complexity from 12 to 3',
			score: 8.8,
			findings: [],
		},
	},

	// Factor 4: Constraint Clarity
	constraints_explicit: {
		domain: 'Implementation Details',
		factor: 'Constraints',
		vague: {
			prompt: 'Add authentication without breaking things',
			score: 2.9,
			findings: [
				{ reviewer_role: 'domain_sme', severity: 'major', confidence: 0.93, issue: 'Constraints unclear', evidence: 'What can\'t change? Backward compat?' },
			],
		},
		clear: {
			prompt: 'Add auth: CONSTRAINTS: (1) No DB schema changes, (2) Maintain API compatibility, (3) No external dependencies, (4) Deploy without downtime',
			score: 8.7,
			findings: [],
		},
	},

	// Factor 5: Context/References
	context_included: {
		domain: 'Context Patterns',
		factor: 'External References',
		vague: {
			prompt: 'Follow the pattern',
			score: 2.2,
			findings: [
				{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.96, issue: 'No context', evidence: 'Which pattern? Where?' },
			],
		},
		clear: {
			prompt: 'Follow pattern: See ARCHITECTURE.md section 3.2 for UserService example. Apply same structure to PaymentService: (1) interface, (2) factory, (3) tests in __tests__',
			score: 8.9,
			findings: [],
		},
	},

	// Factor 6: Edge Cases Explicit
	edge_cases_listed: {
		domain: 'Implementation Details',
		factor: 'Edge Cases',
		vague: {
			prompt: 'Handle all edge cases',
			score: 3.0,
			findings: [
				{ reviewer_role: 'testing', severity: 'major', confidence: 0.95, issue: 'Edge cases undefined', evidence: 'Which cases? Null? Empty?' },
			],
		},
		clear: {
			prompt: 'Handle cases: (1) NULL input → TypeError, (2) Empty array → return [], (3) Mixed types → coerce to string, (4) 10k items → test performance',
			score: 8.9,
			findings: [],
		},
	},

	// Factor 7: Output Format Specification
	output_format_spec: {
		domain: 'Specification Patterns',
		factor: 'Output Format',
		vague: {
			prompt: 'Return the result',
			score: 2.5,
			findings: [
				{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.95, issue: 'Output undefined', evidence: 'Type? Structure? Status codes?' },
			],
		},
		clear: {
			prompt: 'Return: { status: "success"|"error", data: User|null, error: string|null, timestamp: ISO8601 }. Example: {"status":"success","data":{...},"error":null}',
			score: 9.1,
			findings: [],
		},
	},

	// Factor 8: Performance Targets
	performance_targets: {
		domain: 'Specification Patterns',
		factor: 'Performance Targets',
		vague: {
			prompt: 'Make it fast',
			score: 2.6,
			findings: [
				{ reviewer_role: 'domain_sme', severity: 'blocker', confidence: 0.96, issue: 'Performance undefined', evidence: 'How fast? Latency? Throughput?' },
			],
		},
		clear: {
			prompt: 'Performance targets: (1) Response time <100ms (p99), (2) Throughput >1000 req/sec, (3) Memory <256MB baseline, (4) Benchmark: wrk -t4 -c100',
			score: 8.8,
			findings: [],
		},
	},

	// Factor 9: Dependencies/Prerequisites
	dependencies_clear: {
		domain: 'Specification Patterns',
		factor: 'Dependencies',
		vague: {
			prompt: 'Integrate with the system',
			score: 2.7,
			findings: [
				{ reviewer_role: 'clarity', severity: 'major', confidence: 0.93, issue: 'Dependencies unclear', evidence: 'Which services? APIs? Databases?' },
			],
		},
		clear: {
			prompt: 'Dependencies: Requires UserService (endpoint /api/users), PostgreSQL 12+, Redis >=5.0, SSL certs in /etc/ssl/. Test with mocks first.',
			score: 8.7,
			findings: [],
		},
	},

	// Factor 10: Security Requirements
	security_requirements: {
		domain: 'Specification Patterns',
		factor: 'Security Requirements',
		vague: {
			prompt: 'Make it secure',
			score: 2.8,
			findings: [
				{ reviewer_role: 'security', severity: 'blocker', confidence: 0.97, issue: 'Security undefined', evidence: 'Encryption? Auth? Authorization?' },
			],
		},
		clear: {
			prompt: 'Security: (1) Hash pwd with bcrypt (rounds=10), (2) Encrypt PII at rest (AES-256), (3) Validate all inputs (whitelist), (4) HTTPS only, (5) Rate limit 100/min',
			score: 8.9,
			findings: [],
		},
	},
};

// ============================================================================
// PART 2: ANTI-PATTERNS - Unreviable prompts (test edge cases)
// ============================================================================

const ANTI_PATTERNS = {
	contradictory_requirements: {
		domain: 'Anti-patterns',
		factor: 'Contradictions',
		prompt: 'Build fast and secure: (1) No caching, (2) Minimal latency <100ms, (3) No external services, (4) Enterprise-grade security with 2FA',
		score: 1.8,
		findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.98, issue: 'Contradictory requirements', evidence: 'Fast but no caching? Secure but no external auth?' },
			{ reviewer_role: 'domain_sme', severity: 'blocker', confidence: 0.96, issue: 'Impossible constraints', evidence: 'Cannot satisfy both simultaneously' },
		],
	},

	circular_reference: {
		domain: 'Anti-patterns',
		factor: 'Circular Reference',
		prompt: 'Implement A as specified in B. Implement B as specified in A.',
		score: 0.5,
		findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.99, issue: 'Circular definition', evidence: 'Cannot determine start point' },
		],
	},

	missing_core_spec: {
		domain: 'Anti-patterns',
		factor: 'No Core Spec',
		prompt: 'Make it better. Use best practices. Do the right thing.',
		score: 1.2,
		findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.97, issue: 'Entirely vague', evidence: 'No specific requirements given' },
			{ reviewer_role: 'testing', severity: 'blocker', confidence: 0.97, issue: 'Untestable', evidence: 'Cannot verify completion' },
		],
	},

	impossible_timeline: {
		domain: 'Anti-patterns',
		factor: 'Impossible Scope',
		prompt: 'In 2 hours: Rebuild authentication system, add 2FA, migrate 1M users, zero downtime, with new UI',
		score: 1.5,
		findings: [
			{ reviewer_role: 'domain_sme', severity: 'blocker', confidence: 0.95, issue: 'Scope exceeds timeline', evidence: 'Unrealistic' },
		],
	},
};

// ============================================================================
// PART 3: REVIEWER SPECIALIZATION - Test accuracy variance by role
// ============================================================================

const REVIEWER_SPECIALIZATION = {
	security_domain: {
		domain: 'Security Focus',
		task: 'Security: JWT Token Validation',
		scenarios: [
			{
				id: 'sec-jwt-vague',
				prompt: 'Validate JWT tokens',
				score: 2.8,
				// Security should detect this easily; others struggle
				findings: [
					{ reviewer_role: 'security', severity: 'blocker', confidence: 0.98, issue: 'JWT validation strategy undefined', evidence: 'Exp check? Signature? Claims?' },
				],
			},
			{
				id: 'sec-jwt-clear',
				prompt: 'JWT validation: (1) Verify signature with SECRET key, (2) Check exp claim < now, (3) Validate iss: "myapp", (4) Extract sub for user_id, (5) Return error if any fail',
				score: 8.9,
				findings: [],
			},
		],
	},

	testing_domain: {
		domain: 'Testing Focus',
		task: 'Testing: Unit Test Coverage',
		scenarios: [
			{
				id: 'test-coverage-vague',
				prompt: 'Add tests',
				score: 2.2,
				// Testing reviewer excels here
				findings: [
					{ reviewer_role: 'testing', severity: 'blocker', confidence: 0.97, issue: 'Test scope undefined', evidence: 'Unit? Integration? Coverage target?' },
				],
			},
			{
				id: 'test-coverage-clear',
				prompt: 'Unit tests: (1) 100% line coverage, (2) Happy path + 5 error cases, (3) Jest with snapshot tests, (4) >95% branch coverage, (5) CI blocks merge if <95%',
				score: 8.8,
				findings: [],
			},
		],
	},

	frontend_domain: {
		domain: 'Frontend Focus',
		task: 'Frontend: Accessible Form',
		scenarios: [
			{
				id: 'fe-form-vague',
				prompt: 'Build a login form',
				score: 2.5,
				// Frontend/UX reviewer excels; others miss accessibility
				findings: [
					{ reviewer_role: 'frontend_ux', severity: 'major', confidence: 0.94, issue: 'Accessibility not mentioned', evidence: 'Screen reader? Keyboard nav? ARIA?' },
				],
			},
			{
				id: 'fe-form-clear',
				prompt: 'Form: (1) ARIA labels on inputs, (2) Tab order logical, (3) Error messages linked with aria-describedby, (4) Mobile responsive (touch targets 48px), (5) Test with axe',
				score: 8.9,
				findings: [],
			},
		],
	},

	database_domain: {
		domain: 'Database Focus',
		task: 'Database: Schema Design',
		scenarios: [
			{
				id: 'db-schema-vague',
				prompt: 'Design user table',
				score: 3.1,
				findings: [
					{ reviewer_role: 'domain_sme', severity: 'blocker', confidence: 0.95, issue: 'Schema undefined', evidence: 'Columns? Types? Indices? Constraints?' },
				],
			},
			{
				id: 'db-schema-clear',
				prompt: 'Users table: id (uuid PK), email (varchar UNIQUE NOT NULL), created_at (timestamp DEFAULT NOW()), idx on email. Backward compatible, zero downtime migration.',
				score: 8.8,
				findings: [],
			},
		],
	},

	performance_domain: {
		domain: 'Performance Focus',
		task: 'Performance: Optimization',
		scenarios: [
			{
				id: 'perf-opt-vague',
				prompt: 'Make it faster',
				score: 2.4,
				findings: [
					{ reviewer_role: 'domain_sme', severity: 'blocker', confidence: 0.96, issue: 'Optimization target undefined', evidence: 'Frontend? Backend? Database?' },
				],
			},
			{
				id: 'perf-opt-clear',
				prompt: 'Optimize API: Add caching (Redis TTL 5m), add DB index on email, defer non-critical queries. Target: 100ms → 20ms. Measure: wrk benchmark.',
				score: 8.7,
				findings: [],
			},
		],
	},
};

// ============================================================================
// PART 4: VELOCITY PATTERNS - What makes prompts fast vs slow to review?
// ============================================================================

const VELOCITY_PATTERNS = {
	fast_review: {
		domain: 'Reviewer Velocity',
		pattern: 'Fast to Review',
		prompt: 'Add GET /users endpoint: Return {id, name, email}. Status: 200. Error: 404 if not found.',
		score: 7.8,
		findings: [
			{ reviewer_role: 'clarity', severity: 'minor', confidence: 0.85, issue: 'Could specify pagination', evidence: 'Limit? Offset?' },
		],
	},

	slow_review: {
		domain: 'Reviewer Velocity',
		pattern: 'Slow to Review (Complex)',
		prompt: `Build user management system with: authentication, authorization, RBAC, audit logging, multi-tenancy, encryption,
		backup, recovery, API versioning, GraphQL, caching, rate limiting, monitoring, alerting, docs. Scalable to 1M users.`,
		score: 1.2,
		findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.98, issue: 'Scope too broad', evidence: 'Multiple systems, no priorities' },
			{ reviewer_role: 'domain_sme', severity: 'blocker', confidence: 0.96, issue: 'Unclear architecture', evidence: 'Which parts first?' },
			{ reviewer_role: 'testing', severity: 'major', confidence: 0.92, issue: 'Untestable', evidence: 'Need breakdown' },
		],
	},

	medium_review: {
		domain: 'Reviewer Velocity',
		pattern: 'Medium Speed (Moderate Complexity)',
		prompt: 'Add caching layer: Use Redis, cache GET endpoints for 5min, invalidate on POST/PUT/DELETE. Max key size 1MB. Document cache keys.',
		score: 6.5,
		findings: [
			{ reviewer_role: 'domain_sme', severity: 'minor', confidence: 0.80, issue: 'Eviction strategy not specified', evidence: 'What if Redis memory fills?' },
		],
	},

	very_fast_review: {
		domain: 'Reviewer Velocity',
		pattern: 'Very Fast to Review',
		prompt: 'Add index: CREATE INDEX idx_email ON users(email). Expect 50ms → <5ms for lookups.',
		score: 8.2,
		findings: [],
	},
};

// ============================================================================
// PART 5: CLARITY TEMPLATE LIBRARY - Reference models for each domain
// ============================================================================

const CLARITY_TEMPLATES = {
	backend_endpoint_template: {
		domain: 'Backend Templates',
		template: 'REST Endpoint Template',
		structure: `
METHOD /path: 
  Request: {fields, types}
  Response: {fields, types}
  Errors: [status_code: reason]
  Constraints: [list]
  Example: curl ...
		`,
		example_clear: `POST /users:
  Request: {email: string, password: string}
  Response: {id: uuid, email, token: jwt}
  Errors: [400: invalid email, 409: email exists]
  Constraints: [no plaintext passwords, validate email RFC 5322]
  Example: curl -X POST http://localhost:3000/users -d '{"email":"a@b.com","password":"..."}' -H "Content-Type: application/json"`,
		score: 8.9,
	},

	database_schema_template: {
		domain: 'Database Templates',
		template: 'Schema Change Template',
		structure: `
TABLE: table_name
  COLUMNS: [name: type, constraints]
  INDICES: [name: on(columns), unique?]
  FOREIGN KEYS: [references]
  MIGRATION: [backward compat? rollback plan?]
		`,
		example_clear: `TABLE: users
  COLUMNS: [id: uuid PK, email: string UNIQUE NOT NULL, created_at: timestamp DEFAULT NOW()]
  INDICES: [idx_email: on(email) UNIQUE, idx_created: on(created_at)]
  MIGRATION: Add email column (default NULL), backfill, add constraint
  Rollback: Drop email column (will lose data)`,
		score: 8.8,
	},

	feature_template: {
		domain: 'Feature Templates',
		template: 'Feature Spec Template',
		structure: `
FEATURE: name
  PURPOSE: one sentence
  SPEC: [numbered requirements]
  ACCEPTANCE: [testable criteria]
  CONSTRAINTS: [what can't change]
  EXAMPLES: [user stories or mock code]
		`,
		example_clear: `FEATURE: Dark Mode
  PURPOSE: Reduce eye strain in low-light environments
  SPEC: [1. Add theme toggle in header, 2. Use CSS variables, 3. Persist preference in localStorage, 4. Respect system preference on first visit]
  ACCEPTANCE: [User can toggle and see immediate effect, preference persists on reload, system dark mode detected on first visit]
  CONSTRAINTS: [No external libraries, all CSS, no breaking changes to existing components]
  EXAMPLES: Click toggle → bg changes from white to #121212, persists on page reload`,
		score: 9.0,
	},
};

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

// Outcome strategies for variance (like expand-tier2)
const OUTCOME_STRATEGIES = {
	approve_high_clarity: (score) => ({
		outcome: score >= 7 ? 'approved' : score >= 5 ? 'edited' : 'rejected',
	}),
	reject_low_clarity: (score) => ({
		outcome: score <= 3 ? 'rejected' : score <= 6 ? 'edited' : 'approved',
	}),
	variance: (score) => ({
		outcome: Math.random() > 0.5 ? (score >= 6 ? 'approved' : 'rejected') : 'edited',
	}),
};

function generateAdvancedTier2(targetCount = 200) {
	const scenarios = [];
	const entries = [];
	const now = new Date();
	let count = 0;

	// Strategy 1: Clarity Factors (test each attribute × outcome strategies)
	const strategies = ['approve_high_clarity', 'reject_low_clarity', 'variance'];

	for (const [key, factor] of Object.entries(CLARITY_FACTORS)) {
		for (const strategyName of strategies) {
			if (count >= targetCount) break;

			// Vague version
			const vagueScenario = {
				id: `factor-${key}-vague-${strategyName}-${Math.floor(Math.random()*1000)}`,
				domain: factor.domain,
				factor_tested: factor.factor,
				type: 'clarity_factor',
				version: 'vague',
				...factor.vague,
				clarity_score: factor.vague.score,
			};
			scenarios.push(vagueScenario);
			const vagueOutcome = OUTCOME_STRATEGIES[strategyName](factor.vague.score);
			const ts = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
			entries.push(generateAuditEntry(vagueScenario, ts, { strategy: 'approve_high_clarity', outcome: vagueOutcome.outcome }));
			count++;

			if (count >= targetCount) break;

			// Clear version
			const clearScenario = {
				id: `factor-${key}-clear-${strategyName}-${Math.floor(Math.random()*1000)}`,
				domain: factor.domain,
				factor_tested: factor.factor,
				type: 'clarity_factor',
				version: 'clear',
				...factor.clear,
				clarity_score: factor.clear.score,
			};
			scenarios.push(clearScenario);
			const clearOutcome = OUTCOME_STRATEGIES[strategyName](factor.clear.score);
			const ts2 = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
			entries.push(generateAuditEntry(clearScenario, ts2, { strategy: 'approve_high_clarity', outcome: clearOutcome.outcome }));
			count++;
		}
	}

	// Strategy 2: Anti-patterns (edge cases × outcome strategies)
	for (const [key, pattern] of Object.entries(ANTI_PATTERNS)) {
		for (const strategyName of strategies) {
			if (count >= targetCount) break;

			const scenario = {
				id: `antipattern-${key}-${strategyName}-${Math.floor(Math.random()*1000)}`,
				domain: pattern.domain,
				pattern_type: pattern.factor,
				type: 'anti_pattern',
				...pattern,
				clarity_score: pattern.score,
			};
			scenarios.push(scenario);
			const outcome = OUTCOME_STRATEGIES[strategyName](pattern.score);
			const ts = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
			entries.push(generateAuditEntry(scenario, ts, { strategy: 'approve_high_clarity', outcome: outcome.outcome }));
			count++;
		}
	}

	// Strategy 3: Reviewer Specialization × outcome strategies
	for (const [key, spec] of Object.entries(REVIEWER_SPECIALIZATION)) {
		for (const scenario of spec.scenarios) {
			for (const strategyName of strategies) {
				if (count >= targetCount) break;

				const fullScenario = {
					...scenario,
					domain: spec.domain,
					specialization_test: spec.task,
					type: 'reviewer_specialization',
					id: `${scenario.id}-${strategyName}-${Math.floor(Math.random()*1000)}`,
					clarity_score: scenario.score,
				};
				scenarios.push(fullScenario);

				const outcome = OUTCOME_STRATEGIES[strategyName](scenario.score);
				const ts = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
				entries.push(generateAuditEntry(fullScenario, ts, { strategy: 'approve_high_clarity', outcome: outcome.outcome }));
				count++;
			}
		}
	}

	// Strategy 4: Velocity Patterns × outcome strategies
	for (const [key, velocity] of Object.entries(VELOCITY_PATTERNS)) {
		for (const strategyName of strategies) {
			if (count >= targetCount) break;

			const scenario = {
				id: `velocity-${key}-${strategyName}-${Math.floor(Math.random()*1000)}`,
				domain: velocity.domain,
				velocity_pattern: velocity.pattern,
				type: 'velocity_pattern',
				...velocity,
				clarity_score: velocity.score,
			};
			scenarios.push(scenario);

			// Slow reviews should show rejection, fast reviews approval based on score
			const outcome = OUTCOME_STRATEGIES[strategyName](velocity.score);
			const ts = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
			entries.push(generateAuditEntry(scenario, ts, { strategy: 'approve_high_clarity', outcome: outcome.outcome }));
			count++;
		}
	}

	// Strategy 5: Template Library × outcome strategies
	for (const [key, template] of Object.entries(CLARITY_TEMPLATES)) {
		for (const strategyName of strategies) {
			if (count >= targetCount) break;

			const scenario = {
				id: `template-${key}-${strategyName}-${Math.floor(Math.random()*1000)}`,
				domain: template.domain,
				template_type: template.template,
				type: 'clarity_template',
				prompt: template.example_clear,
				score: template.score,
				findings: [],
				clarity_score: template.score,
			};
			scenarios.push(scenario);
			const outcome = OUTCOME_STRATEGIES[strategyName](template.score);
			const ts = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
			entries.push(generateAuditEntry(scenario, ts, { strategy: 'approve_high_clarity', outcome: outcome.outcome }));
			count++;
		}
	}

	return { scenarios: scenarios.slice(0, targetCount), entries: entries.slice(0, targetCount) };
}

// Main
if (require.main === module) {
	const args = process.argv.slice(2);
	const count = args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1]) : 200;
	const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;

	const { scenarios, entries } = generateAdvancedTier2(count);

	const output = {
		tier: '2_advanced',
		timestamp: new Date().toISOString(),
		scenario_count: scenarios.length,
		entry_count: entries.length,
		strategies_covered: [
			'Clarity Factors',
			'Anti-patterns',
			'Reviewer Specialization',
			'Velocity Patterns',
			'Clarity Templates',
		],
		scenarios,
		entries,
		summary: {
			clarity_factors_tested: Object.keys(CLARITY_FACTORS).length,
			anti_patterns_tested: Object.keys(ANTI_PATTERNS).length,
			reviewer_specializations: Object.keys(REVIEWER_SPECIALIZATION).length,
			velocity_patterns: Object.keys(VELOCITY_PATTERNS).length,
			templates_included: Object.keys(CLARITY_TEMPLATES).length,
			expected_outcome: 'Teaches system and users what makes prompts clear, how reviewers specialize, and which patterns are problematic',
		},
	};

	if (outputFile) {
		const fs = require('fs');
		fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
		console.log(`Generated: ${output.entry_count} entries`);
		console.log(`Strategies: ${output.strategies_covered.join(', ')}`);
		console.log(`Saved to: ${outputFile}`);
	} else {
		console.log(JSON.stringify(output, null, 2));
	}
}

module.exports = { generateAdvancedTier2, CLARITY_FACTORS, ANTI_PATTERNS, REVIEWER_SPECIALIZATION, VELOCITY_PATTERNS, CLARITY_TEMPLATES };
