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

// Helper: Generate unique finding IDs
function generateFindingId(reviewerRole, index) {
	const rolePrefix = {
		'clarity': 'CLR',
		'domain_sme': 'DOM',
		'security': 'SEC',
		'testing': 'TST',
		'frontend_ux': 'FE',
	}[reviewerRole] || 'GEN';
	return `${rolePrefix}-${String(index).padStart(3, '0')}`;
}

// Helper: Generate an audit log entry from a scenario
function generateAuditEntry(scenario, timestamp = null, outcomeData = null) {
	const ts = timestamp || new Date().toISOString();
	const crypto = require('crypto');

	// Generate a unique prompt hash for this scenario
	const promptHashInput = scenario.id + JSON.stringify(scenario.findings);
	const promptHash = crypto.createHash('sha256').update(promptHashInput).digest('hex').slice(0, 12);

	// Add finding_id to each finding if not present
	const findingsWithIds = scenario.findings.map((f, idx) => ({
		...f,
		finding_id: f.finding_id || generateFindingId(f.reviewer_role, idx + 1),
	}));

	// Determine accepted/rejected based on outcome strategy
	let acceptedIds = [];
	let rejectedIds = [];
	let rejectionDetails = {};

	if (outcomeData) {
		if (outcomeData.strategy === 'approve_high_clarity') {
			// High clarity → approve all findings
			if (scenario.clarity_score >= 8) {
				acceptedIds = findingsWithIds.map(f => f.finding_id);
			} else if (scenario.clarity_score >= 6) {
				// Medium clarity → approve ~70% of findings
				acceptedIds = findingsWithIds
					.filter((_, i) => i % 3 !== 0) // 2/3 accepted
					.map(f => f.finding_id);
				rejectedIds = findingsWithIds
					.filter((_, i) => i % 3 === 0)
					.map(f => f.finding_id);
				rejectedIds.forEach(id => {
					rejectionDetails[id] = 'deferred';
				});
			} else {
				// Low clarity → only approve major findings
				acceptedIds = findingsWithIds
					.filter(f => f.severity === 'blocker' || f.severity === 'major')
					.map(f => f.finding_id);
				rejectedIds = findingsWithIds
					.filter(f => f.severity === 'minor' || f.severity === 'nit')
					.map(f => f.finding_id);
				rejectedIds.forEach(id => {
					rejectionDetails[id] = 'deferred';
				});
			}
		}
	}

	const entry = {
		timestamp: ts,
		original_prompt_hash: promptHash,
		reviewers_active: ['clarity', 'domain_sme', 'testing', 'security', 'frontend_ux'],
		findings_detail: findingsWithIds,
		composite_score: scenario.clarity_score,
		suggestions_accepted: acceptedIds,
		suggestions_rejected: rejectedIds,
		reviewer_stats: {
			clarity: {
				proposed: findingsWithIds.filter(f => f.reviewer_role === 'clarity').length,
				accepted: acceptedIds.filter(id => findingsWithIds.find(f => f.finding_id === id && f.reviewer_role === 'clarity')).length,
				rejected: rejectedIds.filter(id => findingsWithIds.find(f => f.finding_id === id && f.reviewer_role === 'clarity')).length,
			},
			domain_sme: {
				proposed: findingsWithIds.filter(f => f.reviewer_role === 'domain_sme').length,
				accepted: acceptedIds.filter(id => findingsWithIds.find(f => f.finding_id === id && f.reviewer_role === 'domain_sme')).length,
				rejected: rejectedIds.filter(id => findingsWithIds.find(f => f.finding_id === id && f.reviewer_role === 'domain_sme')).length,
			},
			testing: {
				proposed: findingsWithIds.filter(f => f.reviewer_role === 'testing').length,
				accepted: acceptedIds.filter(id => findingsWithIds.find(f => f.finding_id === id && f.reviewer_role === 'testing')).length,
				rejected: rejectedIds.filter(id => findingsWithIds.find(f => f.finding_id === id && f.reviewer_role === 'testing')).length,
			},
			security: {
				proposed: findingsWithIds.filter(f => f.reviewer_role === 'security').length,
				accepted: acceptedIds.filter(id => findingsWithIds.find(f => f.finding_id === id && f.reviewer_role === 'security')).length,
				rejected: rejectedIds.filter(id => findingsWithIds.find(f => f.finding_id === id && f.reviewer_role === 'security')).length,
			},
			frontend_ux: {
				proposed: findingsWithIds.filter(f => f.reviewer_role === 'frontend_ux').length,
				accepted: acceptedIds.filter(id => findingsWithIds.find(f => f.finding_id === id && f.reviewer_role === 'frontend_ux')).length,
				rejected: rejectedIds.filter(id => findingsWithIds.find(f => f.finding_id === id && f.reviewer_role === 'frontend_ux')).length,
			},
		},
		outcome: outcomeData ? outcomeData.outcome : 'pending',
		rejection_details: rejectionDetails,
	};

	// Compute and attach hash (must be last step, same as cost.cjs)
	entry.__hash = computeEntryHash(entry);

	return entry;
}

// Tier 2: Cascading Refinements (same prompt, iteratively improved)
const TIER_2_CASCADING = [
	{
		id: 'cascade-auth-v1',
		task: 'authentication',
		version: 1,
		prompt: 'Add authentication',
		clarity_score: 2.5,
		findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.96, issue: 'Scope undefined', evidence: 'Login? OAuth? 2FA?' },
			{ reviewer_role: 'security', severity: 'major', confidence: 0.93, issue: 'No security strategy', evidence: 'JWT? Sessions? API keys?' },
		],
	},
	{
		id: 'cascade-auth-v2',
		task: 'authentication',
		version: 2,
		prompt: 'Add JWT-based login: username/password → JWT token in header Authorization',
		clarity_score: 6.2,
		findings: [
			{ reviewer_role: 'security', severity: 'major', confidence: 0.92, issue: 'No password hashing mentioned', evidence: 'bcrypt? argon2?' },
			{ reviewer_role: 'testing', severity: 'minor', confidence: 0.80, issue: 'Test strategy unclear', evidence: 'Unit test JWT validation?' },
		],
	},
	{
		id: 'cascade-auth-v3',
		task: 'authentication',
		version: 3,
		prompt: 'Add JWT login: (1) Accept POST /login {email, password}, (2) Hash password with bcrypt, (3) Return {token: JWT signed with SECRET}, (4) Validate JWT in middleware for protected routes. Test: valid credentials → token, invalid → 401.',
		clarity_score: 8.7,
		findings: [
			{ reviewer_role: 'testing', severity: 'nit', confidence: 0.70, issue: 'Token expiry not mentioned', evidence: 'How long should JWT be valid?' },
		],
	},
	// API integration cascade
	{
		id: 'cascade-stripe-v1',
		task: 'payment',
		version: 1,
		prompt: 'Integrate payment',
		clarity_score: 2.0,
		findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.97, issue: 'No provider specified', evidence: 'Stripe? PayPal? Square?' },
			{ reviewer_role: 'security', severity: 'blocker', confidence: 0.95, issue: 'PCI compliance not mentioned', evidence: 'Card data handling?' },
		],
	},
	{
		id: 'cascade-stripe-v2',
		task: 'payment',
		version: 2,
		prompt: 'Integrate Stripe: Add webhook for payment_intent.succeeded, update order status in database',
		clarity_score: 5.8,
		findings: [
			{ reviewer_role: 'security', severity: 'major', confidence: 0.94, issue: 'Webhook signature not verified', evidence: 'Use stripe.webhooks.constructEvent()' },
		],
	},
	{
		id: 'cascade-stripe-v3',
		task: 'payment',
		version: 3,
		prompt: 'Integrate Stripe: (1) POST /webhooks/stripe with Stripe signature verification, (2) Listen for payment_intent.succeeded, (3) Update order.status="paid" in DB, (4) Send customer confirmation email. Use stripe npm package for verification.',
		clarity_score: 8.4,
		findings: [
			{ reviewer_role: 'testing', severity: 'nit', confidence: 0.65, issue: 'Could test webhook with stripe CLI', evidence: 'stripe listen --forward-to localhost:3000' },
		],
	},
];

// Tier 2: Parallel Ambiguity (same task, different descriptions at different clarity levels)
const TIER_2_PARALLEL = [
	{
		id: 'parallel-cache-v1',
		task: 'performance-caching',
		variant: 'vague',
		prompt: 'Add caching',
		clarity_score: 2.8,
		findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.95, issue: 'What to cache?', evidence: 'Database? API? User sessions?' },
			{ reviewer_role: 'domain_sme', severity: 'major', confidence: 0.92, issue: 'No cache invalidation strategy', evidence: 'TTL? Events? Manual?' },
		],
	},
	{
		id: 'parallel-cache-v2',
		task: 'performance-caching',
		variant: 'structured',
		prompt: 'Add Redis caching for user profile API: Cache GET /api/users/:id for 5 minutes or on user update',
		clarity_score: 7.0,
		findings: [
			{ reviewer_role: 'testing', severity: 'minor', confidence: 0.78, issue: 'Cache hit ratio test missing', evidence: 'Verify 90% requests served from cache' },
		],
	},
	{
		id: 'parallel-cache-v3',
		task: 'performance-caching',
		variant: 'explicit',
		prompt: 'Add Redis caching: (1) Cache GET /api/users/:id response for 5min TTL, (2) Invalidate on PUT /users/:id, (3) Use redis.set() with EX 300, (4) Check redis.get() before DB query. Expected: 95%+ cache hits for read-heavy workloads.',
		clarity_score: 9.1,
		findings: [],
	},
	// Database performance parallel
	{
		id: 'parallel-index-v1',
		task: 'database-performance',
		variant: 'generic',
		prompt: 'Optimize database queries',
		clarity_score: 3.2,
		findings: [
			{ reviewer_role: 'domain_sme', severity: 'blocker', confidence: 0.96, issue: 'Which queries? Optimization method?', evidence: 'Indexes? Joins? Schema change?' },
		],
	},
	{
		id: 'parallel-index-v2',
		task: 'database-performance',
		variant: 'scoped',
		prompt: 'Add database index on users.email for faster login lookups',
		clarity_score: 6.8,
		findings: [
			{ reviewer_role: 'testing', severity: 'minor', confidence: 0.75, issue: 'Benchmark not specified', evidence: 'Before/after query time?' },
		],
	},
	{
		id: 'parallel-index-v3',
		task: 'database-performance',
		variant: 'complete',
		prompt: 'Add unique index on users.email: CREATE UNIQUE INDEX idx_users_email ON users(email). Reduces login query from 50ms to <5ms. Test: query with 1M rows, verify index is used (EXPLAIN PLAN).',
		clarity_score: 8.9,
		findings: [],
	},
];

// Tier 2: SWE-bench Adapted (real GitHub-style issues)
const TIER_2_SWEBENCH = [
	{
		id: 'swebench-django-1',
		task: 'framework-bug',
		source: 'Django',
		prompt: 'Fix: ViewDoesNotExist error when URLconf resolving fails with catch_all pattern. Expected: Return 404, not ViewDoesNotExist. See django/urls/resolvers.py line 456',
		clarity_score: 7.8,
		findings: [
			{ reviewer_role: 'domain_sme', severity: 'minor', confidence: 0.85, issue: 'Framework context could be clearer', evidence: 'Explain URLconf resolution flow' },
		],
	},
	{
		id: 'swebench-react-1',
		task: 'library-feature',
		source: 'React',
		prompt: 'Add useCallback hook optimization: Memoize callback functions to prevent unnecessary re-renders of child components. Update src/react/useCallback.js, add tests in __tests__/useCallback.test.js',
		clarity_score: 7.2,
		findings: [
			{ reviewer_role: 'testing', severity: 'minor', confidence: 0.80, issue: 'Edge cases not listed', evidence: 'Dependency array changes? Garbage collection?' },
		],
	},
	{
		id: 'swebench-postgres-1',
		task: 'database-optimization',
		source: 'PostgreSQL',
		prompt: 'Optimize: Reduce VACUUM lock time on large tables (>10GB). Implement VACUUM (PARALLEL ON) for concurrent cleanup. Estimated 50% reduction in blocking.',
		clarity_score: 7.5,
		findings: [
			{ reviewer_role: 'security', severity: 'minor', confidence: 0.80, issue: 'Data consistency not mentioned', evidence: 'Verify no data loss during PARALLEL VACUUM' },
		],
	},
	{
		id: 'swebench-kubernetes-1',
		task: 'infrastructure',
		source: 'Kubernetes',
		prompt: 'Add: Resource quotas for namespace prod-api. Limits: 10 CPU, 20Gi memory per pod. Requests: 2 CPU, 4Gi. Use kubectl apply -f quota.yaml',
		clarity_score: 7.4,
		findings: [
			{ reviewer_role: 'domain_sme', severity: 'minor', confidence: 0.82, issue: 'Monitoring strategy missing', evidence: 'How to detect quota exceeded?' },
		],
	},
	{
		id: 'swebench-vscode-1',
		task: 'ux-feature',
		source: 'VS Code',
		prompt: 'Add: Command palette search ranking by recency. Recently used commands should appear first. Update src/vs/workbench/contrib/commandPalette/',
		clarity_score: 7.6,
		findings: [
			{ reviewer_role: 'testing', severity: 'minor', confidence: 0.78, issue: 'Performance metrics unclear', evidence: 'Command palette latency target?' },
		],
	},
];

// Generate all Tier 1 data
function generateTier1() {
	const scenarios = [];
	const entries = [];

	// Add all dimension scenarios
	for (const dimension of Object.values(TIER_1_SCENARIOS)) {
		if (Array.isArray(dimension)) {
			for (const scenario of dimension) {
				scenarios.push(scenario);
				entries.push(generateAuditEntry(scenario, null, { strategy: 'approve_high_clarity', outcome: 'approved' }));
			}
		}
	}

	return { scenarios, entries };
}

// Generate all Tier 2 data
function generateTier2() {
	const scenarios = [];
	const entries = [];
	const now = new Date();

	// Cascading refinements: each task creates 3 entries (v1, v2, v3) with timestamps 1-2 days apart
	for (const scenario of TIER_2_CASCADING) {
		scenarios.push(scenario);
		const daysAgo = 2 - (scenario.version - 1) * 0.5;
		const ts = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
		entries.push(generateAuditEntry(scenario, ts, { strategy: 'approve_high_clarity', outcome: 'approved' }));
	}

	// Parallel ambiguity: each task creates 3 entries (different clarity levels, same day)
	for (const scenario of TIER_2_PARALLEL) {
		scenarios.push(scenario);
		const ts = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
		entries.push(generateAuditEntry(scenario, ts, { strategy: 'approve_high_clarity', outcome: 'approved' }));
	}

	// SWE-bench scenarios: real-world issues, all with outcome data
	for (const scenario of TIER_2_SWEBENCH) {
		scenarios.push(scenario);
		const ts = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString();
		entries.push(generateAuditEntry(scenario, ts, { strategy: 'approve_high_clarity', outcome: 'approved' }));
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
	} else if (tier === '2') {
		const { scenarios, entries } = generateTier2();
		output = {
			tier: 2,
			timestamp: new Date().toISOString(),
			scenario_count: scenarios.length,
			entry_count: entries.length,
			scenarios,
			entries,
			summary: {
				cascading_refinements: 9,
				parallel_ambiguity: 6,
				swebench_scenarios: 5,
				total_outcomes: entries.length,
				approved_count: entries.filter(e => e.outcome === 'approved').length,
				clarity_score_range: [2.0, 9.1],
				expected_outcome: 'Score improves monotonically in cascading, reviewer precision computable from outcome data',
			},
		};
	} else if (tier === '3') {
		console.log(`Tier 3 generation not yet implemented. See MOCK_DATA_STRATEGY.md for details.`);
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

module.exports = { generateTier1, generateTier2, generateAuditEntry, TIER_1_SCENARIOS, TIER_2_CASCADING, TIER_2_PARALLEL, TIER_2_SWEBENCH };
