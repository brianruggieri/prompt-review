// Generate Tier 1 Mock Data: All 5 ambiguity dimensions + real-world categories
// Usage: node scripts/generate-mock-data.cjs [--tier 1|2|3] [--output file.json]

const TIER_1_SCENARIOS = {
	// Dimension 1: Vagueness (imprecise verbs, undefined terms)
	vagueness_spectrum: [
		{
			id: 'vague-1',
			dimension: 'vagueness',
			category: 'generic_vague',
			prompt: 'Fix the bug',
			clarity_score: 1.5,
			severity_max: 'blocker',
			findings: [
				{
					reviewer_role: 'clarity',
					issue: 'No bug description or context',
					evidence: 'Which bug? What symptoms? When does it occur?',
					severity: 'blocker',
					confidence: 0.98,
				},
				{
					reviewer_role: 'domain_sme',
					issue: 'No reproduction steps',
					evidence: 'How do I verify this is fixed?',
					severity: 'major',
					confidence: 0.95,
				},
			],
		},
		{
			id: 'vague-2',
			dimension: 'vagueness',
			category: 'partially_specified',
			prompt: 'Fix the login bug: It fails sometimes',
			clarity_score: 3.5,
			severity_max: 'major',
			findings: [
				{
					reviewer_role: 'clarity',
					issue: 'Incomplete bug description',
					evidence: 'What HTTP status? What error message? On which browser?',
					severity: 'major',
					confidence: 0.92,
				},
				{
					reviewer_role: 'testing',
					issue: 'No test case expectations',
					evidence: 'What should passing test verify?',
					severity: 'minor',
					confidence: 0.88,
				},
			],
		},
		{
			id: 'vague-3',
			dimension: 'vagueness',
			category: 'mostly_clear',
			prompt: 'Fix login: password reset returns 401 instead of 302 redirect to success page',
			clarity_score: 7.2,
			severity_max: 'minor',
			findings: [
				{
					reviewer_role: 'testing',
					issue: 'Could specify test case',
					evidence: 'e.g., test that reset email link redirects to login',
					severity: 'minor',
					confidence: 0.75,
				},
			],
		},
		{
			id: 'vague-4',
			dimension: 'vagueness',
			category: 'explicit',
			prompt: 'Fix login: password reset endpoint returns HTTP 401 instead of 302 redirect. Expected: POST /reset with valid token → 302 to /login?success=true with Set-Cookie session',
			clarity_score: 9.0,
			severity_max: 'nit',
			findings: [],
		},
		{
			id: 'vague-5',
			dimension: 'vagueness',
			category: 'overly_specific',
			prompt: 'Improve the authentication system',
			clarity_score: 2.8,
			severity_max: 'major',
			findings: [
				{
					reviewer_role: 'clarity',
					issue: 'Vague goal with no measurable criteria',
					evidence: 'What does "improve" mean? Add 2FA? Fix bugs? Performance?',
					severity: 'blocker',
					confidence: 0.96,
				},
			],
		},
	],

	// Dimension 2: Scope Ambiguity
	scope_ambiguity: [
		{
			id: 'scope-1',
			dimension: 'scope',
			category: 'unbounded',
			prompt: 'Add authentication',
			clarity_score: 2.0,
			severity_max: 'blocker',
			findings: [
				{
					reviewer_role: 'domain_sme',
					issue: 'Undefined scope',
					evidence: 'Login only? 2FA? OAuth? Database? Which systems?',
					severity: 'blocker',
					confidence: 0.99,
				},
			],
		},
		{
			id: 'scope-2',
			dimension: 'scope',
			category: 'partially_bounded',
			prompt: 'Add 2FA to login',
			clarity_score: 5.5,
			severity_max: 'major',
			findings: [
				{
					reviewer_role: 'security',
					issue: 'Missing implementation details',
					evidence: 'SMS? Authenticator app? Email? Rate limiting?',
					severity: 'major',
					confidence: 0.90,
				},
			],
		},
		{
			id: 'scope-3',
			dimension: 'scope',
			category: 'well_bounded',
			prompt: 'Add SMS 2FA to login: SMS to user phone, max 3 attempts, 5-min expiry, code = 6 digits',
			clarity_score: 8.5,
			severity_max: 'minor',
			findings: [
				{
					reviewer_role: 'testing',
					issue: 'Could specify error handling',
					evidence: 'What if SMS delivery fails?',
					severity: 'minor',
					confidence: 0.70,
				},
			],
		},
		{
			id: 'scope-4',
			dimension: 'scope',
			category: 'too_narrow',
			prompt: 'Add the "login" button',
			clarity_score: 4.0,
			severity_max: 'major',
			findings: [
				{
					reviewer_role: 'clarity',
					issue: 'Scope may be too narrow',
					evidence: 'Existing button? Styling? Where? Icon?',
					severity: 'major',
					confidence: 0.85,
				},
			],
		},
		{
			id: 'scope-5',
			dimension: 'scope',
			category: 'conditional',
			prompt: 'Refactor authentication system',
			clarity_score: 3.2,
			severity_max: 'blocker',
			findings: [
				{
					reviewer_role: 'domain_sme',
					issue: 'Unclear refactoring goal',
					evidence: 'For performance? Security? Maintainability? New framework?',
					severity: 'blocker',
					confidence: 0.97,
				},
			],
		},
	],

	// Dimension 3: Output Specification
	output_specification: [
		{
			id: 'output-1',
			dimension: 'output',
			category: 'no_spec',
			prompt: 'Validate email',
			clarity_score: 3.0,
			severity_max: 'major',
			findings: [
				{
					reviewer_role: 'clarity',
					issue: 'No output format defined',
					evidence: 'Return bool? String? Exception? Object?',
					severity: 'major',
					confidence: 0.94,
				},
			],
		},
		{
			id: 'output-2',
			dimension: 'output',
			category: 'partial_spec',
			prompt: 'Validate email, return true/false',
			clarity_score: 6.0,
			severity_max: 'minor',
			findings: [
				{
					reviewer_role: 'testing',
					issue: 'Missing error cases',
					evidence: 'What if input is null/undefined?',
					severity: 'minor',
					confidence: 0.80,
				},
			],
		},
		{
			id: 'output-3',
			dimension: 'output',
			category: 'complete_spec',
			prompt: 'Validate email: return { isValid: bool, errors: string[] }. isValid=true if RFC 5322. errors[]=empty if isValid.',
			clarity_score: 8.8,
			severity_max: 'nit',
			findings: [],
		},
		{
			id: 'output-4',
			dimension: 'output',
			category: 'implicit_format',
			prompt: 'Parse the config file',
			clarity_score: 2.5,
			severity_max: 'blocker',
			findings: [
				{
					reviewer_role: 'clarity',
					issue: 'Implicit output format',
					evidence: 'JSON object? In-memory config? Modified file? Memory map?',
					severity: 'blocker',
					confidence: 0.96,
				},
			],
		},
		{
			id: 'output-5',
			dimension: 'output',
			category: 'side_effects',
			prompt: 'Update the database',
			clarity_score: 3.5,
			severity_max: 'major',
			findings: [
				{
					reviewer_role: 'domain_sme',
					issue: 'Unclear what gets updated',
					evidence: 'Which table? Which columns? What values?',
					severity: 'blocker',
					confidence: 0.95,
				},
			],
		},
	],

	// Dimension 4: Context Richness
	context_richness: [
		{
			id: 'context-1',
			dimension: 'context',
			category: 'no_context',
			prompt: 'Fix the performance issue',
			clarity_score: 2.2,
			severity_max: 'blocker',
			findings: [
				{
					reviewer_role: 'domain_sme',
					issue: 'No context about system or architecture',
					evidence: 'Which component? What is slow? Database? Frontend?',
					severity: 'blocker',
					confidence: 0.97,
				},
			],
		},
		{
			id: 'context-2',
			dimension: 'context',
			category: 'minimal_context',
			prompt: 'Optimize the API endpoint',
			clarity_score: 4.0,
			severity_max: 'major',
			findings: [
				{
					reviewer_role: 'domain_sme',
					issue: 'Missing API details',
					evidence: 'Which endpoint? Current response time? Target?',
					severity: 'major',
					confidence: 0.90,
				},
			],
		},
		{
			id: 'context-3',
			dimension: 'context',
			category: 'moderate_context',
			prompt: 'Optimize /api/users endpoint: Currently 2s response time for 100k users. Target: <500ms. See db-schema.md',
			clarity_score: 7.5,
			severity_max: 'minor',
			findings: [
				{
					reviewer_role: 'testing',
					issue: 'Could mention caching strategy',
					evidence: 'Redis? CDN? Query optimization?',
					severity: 'minor',
					confidence: 0.75,
				},
			],
		},
		{
			id: 'context-4',
			dimension: 'context',
			category: 'rich_context',
			prompt: 'Optimize /api/users: response time 2s → <500ms (p99). Current: N+1 query on users→roles→permissions. Use: eager-load + Redis caching (TTL 5min). See ARCHITECTURE.md#api-design',
			clarity_score: 9.2,
			severity_max: 'nit',
			findings: [],
		},
		{
			id: 'context-5',
			dimension: 'context',
			category: 'irrelevant_context',
			prompt: 'Add a feature to the app. Our team uses React and Node.js. We have 5 developers. The office is in SF.',
			clarity_score: 2.5,
			severity_max: 'major',
			findings: [
				{
					reviewer_role: 'clarity',
					issue: 'Irrelevant context mixed with vague request',
					evidence: 'What feature? Tech stack is helpful but feature is undefined',
					severity: 'blocker',
					confidence: 0.93,
				},
			],
		},
	],

	// Dimension 5: Implicit Assumptions
	implicit_assumptions: [
		{
			id: 'assumptions-1',
			dimension: 'assumptions',
			category: 'unstated_requirements',
			prompt: 'Make the system faster',
			clarity_score: 1.5,
			severity_max: 'blocker',
			findings: [
				{
					reviewer_role: 'clarity',
					issue: 'Completely implicit assumptions',
					evidence: 'What is "faster"? 10% faster? 10x faster? Which metric?',
					severity: 'blocker',
					confidence: 0.98,
				},
			],
		},
		{
			id: 'assumptions-2',
			dimension: 'assumptions',
			category: 'partially_implicit',
			prompt: 'Reduce API latency',
			clarity_score: 4.5,
			severity_max: 'major',
			findings: [
				{
					reviewer_role: 'domain_sme',
					issue: 'Implicit target and constraints',
					evidence: 'From 2s to 500ms? Using Redis? Query optimization? No server upgrades?',
					severity: 'major',
					confidence: 0.88,
				},
			],
		},
		{
			id: 'assumptions-3',
			dimension: 'assumptions',
			category: 'explicit',
			prompt: 'Reduce /api/users latency from 2s to <500ms (p99). Constraint: no database schema changes (backward compat). Use: eager-load + Redis.',
			clarity_score: 8.0,
			severity_max: 'minor',
			findings: [
				{
					reviewer_role: 'testing',
					issue: 'Could specify cache invalidation strategy',
					evidence: 'When to clear Redis? TTL? Events?',
					severity: 'minor',
					confidence: 0.70,
				},
			],
		},
		{
			id: 'assumptions-4',
			dimension: 'assumptions',
			category: 'hidden_tradeoffs',
			prompt: 'Improve user experience',
			clarity_score: 2.0,
			severity_max: 'blocker',
			findings: [
				{
					reviewer_role: 'clarity',
					issue: 'Implicit tradeoffs not stated',
					evidence: 'Accessibility? Performance? Cost? Which metric matters most?',
					severity: 'blocker',
					confidence: 0.96,
				},
			],
		},
		{
			id: 'assumptions-5',
			dimension: 'assumptions',
			category: 'resource_constraints',
			prompt: 'Add real-time notifications',
			clarity_score: 3.5,
			severity_max: 'major',
			findings: [
				{
					reviewer_role: 'domain_sme',
					issue: 'Implicit cost/resource constraints',
					evidence: 'WebSockets? Server cost? Scalability? 1M users or 1K?',
					severity: 'major',
					confidence: 0.91,
				},
			],
		},
	],

	// Real-world categories: Bug Fix (3 clarity levels)
	bug_fix_category: [
		{
			id: 'bugfix-vague',
			category: 'bug_fix',
			level: 'vague',
			prompt: 'Fix the crash',
			clarity_score: 2.5,
			severity_max: 'blocker',
			findings: [
				{
					reviewer_role: 'clarity',
					issue: 'No crash details',
					evidence: 'Stack trace? Reproduction? Platform?',
					severity: 'blocker',
					confidence: 0.97,
				},
				{
					reviewer_role: 'testing',
					issue: 'No test case to verify fix',
					evidence: 'How do we know it is fixed?',
					severity: 'major',
					confidence: 0.92,
				},
			],
		},
		{
			id: 'bugfix-medium',
			category: 'bug_fix',
			level: 'medium',
			prompt: 'Fix crash in PaymentForm: NullPointerException on submit if user_id is null. Add null check in processPayment()',
			clarity_score: 7.0,
			severity_max: 'minor',
			findings: [
				{
					reviewer_role: 'testing',
					issue: 'Could specify test case',
					evidence: 'Test with null user_id and verify no crash',
					severity: 'minor',
					confidence: 0.78,
				},
			],
		},
		{
			id: 'bugfix-clear',
			category: 'bug_fix',
			level: 'clear',
			prompt: 'Fix crash in PaymentForm (src/components/PaymentForm.tsx, line 145): NullPointerException when user_id is null/undefined during processPayment() call. Add null check at line 145: if (!userId) throw new TypeError("user_id required"). Test: render form with no user context → submit → should show error, not crash.',
			clarity_score: 9.1,
			severity_max: 'nit',
			findings: [],
		},
	],

	// Real-world categories: Feature (3 clarity levels)
	feature_category: [
		{
			id: 'feature-vague',
			category: 'feature',
			level: 'vague',
			prompt: 'Add dark mode',
			clarity_score: 3.0,
			severity_max: 'major',
			findings: [
				{
					reviewer_role: 'frontend_ux',
					issue: 'Scope undefined',
					evidence: 'All pages? Persistent? System preference? Toggle location?',
					severity: 'major',
					confidence: 0.93,
				},
			],
		},
		{
			id: 'feature-medium',
			category: 'feature',
			level: 'medium',
			prompt: 'Add dark mode: CSS variables for colors, detect system preference, store toggle in localStorage',
			clarity_score: 6.5,
			severity_max: 'minor',
			findings: [
				{
					reviewer_role: 'frontend_ux',
					issue: 'Could specify color palette',
					evidence: 'Which dark colors? Brand colors?',
					severity: 'minor',
					confidence: 0.75,
				},
			],
		},
		{
			id: 'feature-clear',
			category: 'feature',
			level: 'clear',
			prompt: 'Add dark mode: Use CSS vars (--bg-primary, --text-primary). Detect window.matchMedia("prefers-color-scheme:dark"). Add toggle in header with icon. Persist to localStorage["theme"]. Colors: dark bg=#121212, text=#E0E0E0. Test: toggle works, persists on reload, matches system preference on first load.',
			clarity_score: 8.8,
			severity_max: 'nit',
			findings: [],
		},
	],

	// Real-world categories: Refactor (3 clarity levels)
	refactor_category: [
		{
			id: 'refactor-vague',
			category: 'refactor',
			level: 'vague',
			prompt: 'Clean up the code',
			clarity_score: 2.0,
			severity_max: 'major',
			findings: [
				{
					reviewer_role: 'domain_sme',
					issue: 'No refactoring goal',
					evidence: 'Style? Architecture? Performance? Reduce duplication?',
					severity: 'blocker',
					confidence: 0.96,
				},
			],
		},
		{
			id: 'refactor-medium',
			category: 'refactor',
			level: 'medium',
			prompt: 'Extract UserService from UserController: Move auth logic from controller to service, keep API unchanged',
			clarity_score: 7.0,
			severity_max: 'minor',
			findings: [
				{
					reviewer_role: 'testing',
					issue: 'Test strategy unclear',
					evidence: 'Unit test service in isolation?',
					severity: 'minor',
					confidence: 0.72,
				},
			],
		},
		{
			id: 'refactor-clear',
			category: 'refactor',
			level: 'clear',
			prompt: 'Extract UserService from UserController: Create src/services/UserService.ts with authenticate(email, pwd) → User. Move auth logic from line 23-45 in controller. Keep API endpoint unchanged. Unit test UserService.authenticate with valid/invalid credentials. No breaking changes to public API.',
			clarity_score: 9.0,
			severity_max: 'nit',
			findings: [],
		},
	],

	// Real-world categories: Integration (3 clarity levels)
	integration_category: [
		{
			id: 'integration-vague',
			category: 'integration',
			level: 'vague',
			prompt: 'Integrate payment provider',
			clarity_score: 2.5,
			severity_max: 'blocker',
			findings: [
				{
					reviewer_role: 'security',
					issue: 'Unclear API integration scope',
					evidence: 'Which provider? Stripe? PayPal? What endpoints?',
					severity: 'blocker',
					confidence: 0.97,
				},
			],
		},
		{
			id: 'integration-medium',
			category: 'integration',
			level: 'medium',
			prompt: 'Integrate Stripe: Add webhook endpoint for payment.success, update order status in DB',
			clarity_score: 6.5,
			severity_max: 'major',
			findings: [
				{
					reviewer_role: 'security',
					issue: 'Webhook signature verification not mentioned',
					evidence: 'How to validate webhook authenticity?',
					severity: 'major',
					confidence: 0.95,
				},
			],
		},
		{
			id: 'integration-clear',
			category: 'integration',
			level: 'clear',
			prompt: 'Integrate Stripe: (1) Add POST /webhooks/stripe endpoint. (2) Verify webhook signature using Stripe secret key. (3) Listen for payment_intent.succeeded event. (4) Update order.status="paid" in DB. (5) Send confirmation email. Use Stripe Node SDK. Test with stripe listen --forward-to localhost:3000/webhooks/stripe',
			clarity_score: 8.9,
			severity_max: 'nit',
			findings: [],
		},
	],
};

// Helper: Compute entry hash (must match cost.cjs computeEntryHash)
function computeEntryHash(entry) {
	const crypto = require('crypto');
	const contentCopy = { ...entry };
	delete contentCopy.__hash;
	const jsonStr = JSON.stringify(contentCopy);
	return crypto.createHash('sha256').update(jsonStr).digest('hex').slice(0, 16);
}

// Helper: Generate an audit log entry from a scenario
function generateAuditEntry(scenario, timestamp = null) {
	const ts = timestamp || new Date().toISOString();
	const crypto = require('crypto');

	// Generate a unique prompt hash for this scenario
	const promptHashInput = scenario.id + JSON.stringify(scenario.findings);
	const promptHash = crypto.createHash('sha256').update(promptHashInput).digest('hex').slice(0, 12);

	const entry = {
		timestamp: ts,
		original_prompt_hash: promptHash,
		reviewers_active: ['clarity', 'domain_sme', 'testing', 'security', 'frontend_ux'],
		findings_detail: scenario.findings,
		composite_score: scenario.clarity_score,
		suggestions_accepted: [],
		suggestions_rejected: [],
		reviewer_stats: {
			clarity: { proposed: scenario.findings.filter(f => f.reviewer_role === 'clarity').length, accepted: 0, rejected: 0 },
			domain_sme: { proposed: scenario.findings.filter(f => f.reviewer_role === 'domain_sme').length, accepted: 0, rejected: 0 },
			testing: { proposed: scenario.findings.filter(f => f.reviewer_role === 'testing').length, accepted: 0, rejected: 0 },
			security: { proposed: scenario.findings.filter(f => f.reviewer_role === 'security').length, accepted: 0, rejected: 0 },
			frontend_ux: { proposed: scenario.findings.filter(f => f.reviewer_role === 'frontend_ux').length, accepted: 0, rejected: 0 },
		},
		outcome: 'pending',
		rejection_details: {},
	};

	// Compute and attach hash (must be last step, same as cost.cjs)
	entry.__hash = computeEntryHash(entry);

	return entry;
}

// Generate all Tier 1 data
function generateTier1() {
	const scenarios = [];
	const entries = [];

	// Add all dimension scenarios
	for (const dimension of Object.values(TIER_1_SCENARIOS)) {
		if (Array.isArray(dimension)) {
			for (const scenario of dimension) {
				scenarios.push(scenario);
				entries.push(generateAuditEntry(scenario));
			}
		}
	}

	return { scenarios, entries };
}

// Main
if (require.main === module) {
	const args = process.argv.slice(2);
	const tier = args.includes('--tier') ? args[args.indexOf('--tier') + 1] : '1';
	const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;

	let output;

	if (tier === '1') {
		const { scenarios, entries } = generateTier1();
		output = {
			tier: 1,
			timestamp: new Date().toISOString(),
			scenario_count: scenarios.length,
			entry_count: entries.length,
			scenarios,
			entries,
			summary: {
				dimensions_covered: 5,
				categories_covered: 9,
				clarity_score_range: [1.5, 9.2],
				expected_outcome: 'All 5 dimensions clearly separated, r² > 0.85',
			},
		};
	} else if (tier === '2' || tier === '3') {
		console.log(`Tier ${tier} generation not yet implemented. See MOCK_DATA_STRATEGY.md for details.`);
		process.exit(1);
	} else {
		console.error(`Unknown tier: ${tier}. Use --tier 1|2|3`);
		process.exit(1);
	}

	if (outputFile) {
		const fs = require('fs');
		fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
		console.log(`Generated: ${output.entry_count} entries, ${output.scenario_count} scenarios`);
		console.log(`Saved to: ${outputFile}`);
	} else {
		console.log(JSON.stringify(output, null, 2));
	}
}

module.exports = { generateTier1, generateAuditEntry, TIER_1_SCENARIOS };
