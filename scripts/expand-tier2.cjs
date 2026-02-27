// Intelligent Tier 2 Expansion: Domain templates + outcome variance
// Generates 140+ entries by combining task types with clarity levels and reviewer outcomes
// Usage: node scripts/expand-tier2.cjs [--count 150] [--output file.json]

const { generateAuditEntry, generateFindingId } = require('./generate-mock-data.cjs');

// Domain templates: each has vague/medium/clear versions
const DOMAIN_TEMPLATES = {
	// Infrastructure & DevOps
	infrastructure_cicd: {
		domain: 'Infrastructure/DevOps',
		task: 'CI/CD Pipeline',
		vague: { prompt: 'Set up CI/CD', score: 2.2, findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.96, issue: 'Tool undefined', evidence: 'GitHub Actions? Jenkins? GitLab?' },
			{ reviewer_role: 'domain_sme', severity: 'major', confidence: 0.93, issue: 'Trigger events unclear', evidence: 'On push? PR? Manual?' },
		] },
		medium: { prompt: 'Set up GitHub Actions: Run tests on push, deploy on tag', score: 6.8, findings: [
			{ reviewer_role: 'security', severity: 'major', confidence: 0.92, issue: 'Secrets management not mentioned', evidence: 'How to pass API keys?' },
		] },
		clear: { prompt: 'GitHub Actions: (1) Trigger on push to main, (2) Run npm test (fail on error), (3) Deploy to prod if tests pass. Use DEPLOY_KEY secret from GitHub Secrets. Timeout: 10min.', score: 8.9, findings: [] },
	},

	infrastructure_kubernetes: {
		domain: 'Infrastructure/DevOps',
		task: 'Kubernetes Deployment',
		vague: { prompt: 'Deploy app to Kubernetes', score: 2.5, findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.95, issue: 'Deployment strategy undefined', evidence: 'Rolling update? Canary? Blue-green?' },
		] },
		medium: { prompt: 'Deploy to Kubernetes using rolling updates, 2 replicas, health checks every 30s', score: 6.5, findings: [
			{ reviewer_role: 'domain_sme', severity: 'minor', confidence: 0.88, issue: 'Resource limits not specified', evidence: 'CPU/memory limits?' },
		] },
		clear: { prompt: 'Deploy: (1) 2 replicas, (2) rolling update (maxUnavailable=1), (3) liveness probe GET /health every 30s, (4) CPU 100m/limit 500m, Memory 128Mi/256Mi', score: 9.1, findings: [] },
	},

	// Data & ML
	data_ml_pipeline: {
		domain: 'Data/ML',
		task: 'ML Pipeline',
		vague: { prompt: 'Build ML pipeline', score: 2.0, findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.97, issue: 'No model or data specs', evidence: 'Classification? Regression? Structured/unstructured?' },
			{ reviewer_role: 'domain_sme', severity: 'blocker', confidence: 0.94, issue: 'Objective undefined', evidence: 'Accuracy? F1? Precision? For what use case?' },
		] },
		medium: { prompt: 'Build classification pipeline: train on iris.csv, predict species, use scikit-learn', score: 6.2, findings: [
			{ reviewer_role: 'testing', severity: 'major', confidence: 0.91, issue: 'Cross-validation strategy missing', evidence: 'k-fold? Stratified?' },
		] },
		clear: { prompt: 'Build iris classifier: (1) Load iris.csv, (2) Split 80/20 train/test, (3) Stratified 5-fold CV, (4) Train RandomForest, (5) Report accuracy/precision/recall, (6) Save model to iris_model.pkl', score: 8.7, findings: [] },
	},

	data_etl: {
		domain: 'Data/ML',
		task: 'ETL Pipeline',
		vague: { prompt: 'Extract and transform data', score: 2.3, findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.96, issue: 'Source and target undefined', evidence: 'What data? From where to where?' },
		] },
		medium: { prompt: 'ETL: Extract from PostgreSQL, transform to CSV format, load to S3', score: 6.6, findings: [
			{ reviewer_role: 'domain_sme', severity: 'minor', confidence: 0.87, issue: 'Transformation rules unclear', evidence: 'Filtering? Aggregation? Schema mapping?' },
		] },
		clear: { prompt: 'ETL: (1) Extract users table from PostgreSQL, (2) Filter active=true, (3) Map columns: id→user_id, name→full_name, (4) Convert to CSV, (5) Upload to s3://data/users_YYYY-MM-DD.csv', score: 8.8, findings: [] },
	},

	// Frontend/UX
	frontend_component: {
		domain: 'Frontend/UX',
		task: 'React Component',
		vague: { prompt: 'Build a user card component', score: 2.8, findings: [
			{ reviewer_role: 'frontend_ux', severity: 'major', confidence: 0.94, issue: 'UI undefined', evidence: 'Fields? Layout? Style system?' },
		] },
		medium: { prompt: 'Build UserCard: Display avatar, name, email, bio. Use Material-UI. Responsive on mobile.', score: 6.9, findings: [
			{ reviewer_role: 'testing', severity: 'minor', confidence: 0.86, issue: 'Accessibility not mentioned', evidence: 'ARIA labels? Keyboard nav?' },
		] },
		clear: { prompt: 'UserCard component: (1) Props: {user: {avatar, name, email, bio}}, (2) Material-UI Card wrapper, (3) Avatar (50px), name (bold), email (italic), bio (gray), (4) Mobile: stack vertically, (5) ARIA labels for screen readers', score: 8.9, findings: [] },
	},

	frontend_form: {
		domain: 'Frontend/UX',
		task: 'Form Validation',
		vague: { prompt: 'Add form validation', score: 2.4, findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.95, issue: 'Fields and rules undefined', evidence: 'Email? Password? Custom validation?' },
		] },
		medium: { prompt: 'Validate signup form: email required and valid, password > 8 chars', score: 6.7, findings: [
			{ reviewer_role: 'frontend_ux', severity: 'minor', confidence: 0.85, issue: 'Error messages undefined', evidence: 'Show inline? Tooltip? Toast?' },
		] },
		clear: { prompt: 'Signup validation: (1) Email: required, RFC 5322 regex, show error inline (red text), (2) Password: min 8 chars, regex /[A-Z][0-9]/ required, show strength meter, (3) Submit disabled until both valid', score: 9.0, findings: [] },
	},

	// Backend/API
	backend_endpoint: {
		domain: 'Backend/API',
		task: 'REST Endpoint',
		vague: { prompt: 'Build a user API endpoint', score: 2.5, findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.96, issue: 'HTTP verb and behavior undefined', evidence: 'GET? POST? What does it return?' },
		] },
		medium: { prompt: 'POST /api/users: Create user with email and password, return 201 with user object', score: 6.8, findings: [
			{ reviewer_role: 'security', severity: 'major', confidence: 0.93, issue: 'Password hashing not mentioned', evidence: 'How to store securely?' },
		] },
		clear: { prompt: 'POST /api/users: (1) Body: {email, password}, (2) Validate email RFC 5322, (3) Hash pwd with bcrypt (rounds=10), (4) Store in DB, (5) Return 201 {id, email}, (6) Return 400 if email exists', score: 8.8, findings: [] },
	},

	backend_db_query: {
		domain: 'Backend/API',
		task: 'Database Query Optimization',
		vague: { prompt: 'Optimize slow query', score: 2.2, findings: [
			{ reviewer_role: 'domain_sme', severity: 'blocker', confidence: 0.96, issue: 'Query not provided', evidence: 'SQL? Query plan? N+1?' },
		] },
		medium: { prompt: 'Optimize: SELECT * FROM users JOIN orders ON users.id=orders.user_id is slow', score: 6.5, findings: [
			{ reviewer_role: 'testing', severity: 'minor', confidence: 0.84, issue: 'Benchmark strategy missing', evidence: 'Before/after metrics?' },
		] },
		clear: { prompt: 'Optimize users-orders query: (1) Add INDEX on orders.user_id, (2) SELECT users.id, name, COUNT(orders.id) FROM users LEFT JOIN orders, (3) GROUP BY users.id, (4) Expected: <50ms for 1M rows, verify with EXPLAIN', score: 8.9, findings: [] },
	},

	// Mobile
	mobile_app: {
		domain: 'Mobile',
		task: 'iOS/Android Feature',
		vague: { prompt: 'Add push notifications', score: 2.3, findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.95, issue: 'Trigger and payload undefined', evidence: 'When sent? What content?' },
		] },
		medium: { prompt: 'Push notifications: Send when new message arrives, include sender name', score: 6.7, findings: [
			{ reviewer_role: 'security', severity: 'major', confidence: 0.91, issue: 'Permissions not mentioned', evidence: 'iOS: request user approval?' },
		] },
		clear: { prompt: 'Push notifications: (1) iOS: use UserNotifications framework, request permission on app launch, (2) Payload: {title: "New message", body: "{senderName}: {preview}"}, (3) Handle tap → open chat, (4) Test with Firebase Cloud Messaging', score: 8.8, findings: [] },
	},

	// Database
	database_migration: {
		domain: 'Database',
		task: 'Schema Migration',
		vague: { prompt: 'Add new database column', score: 2.4, findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.96, issue: 'Column specs undefined', evidence: 'Type? Nullable? Default?' },
		] },
		medium: { prompt: 'Add users.phone_number column, nullable, string type', score: 6.6, findings: [
			{ reviewer_role: 'domain_sme', severity: 'minor', confidence: 0.88, issue: 'Rollback plan not mentioned', evidence: 'How to revert if needed?' },
		] },
		clear: { prompt: 'Migration: (1) CREATE users.phone_number VARCHAR(20) NULL, (2) Backward compatible: default NULL, (3) No data loss, (4) Rollback: DROP COLUMN, (5) Test on staging first, zero downtime deploy', score: 8.9, findings: [] },
	},

	// Security
	security_auth: {
		domain: 'Security',
		task: 'Authentication Hardening',
		vague: { prompt: 'Improve authentication security', score: 2.1, findings: [
			{ reviewer_role: 'security', severity: 'blocker', confidence: 0.97, issue: 'Security measures undefined', evidence: 'Rate limiting? 2FA? Session timeout?' },
		] },
		medium: { prompt: 'Add rate limiting: max 5 login attempts per hour, lock account after 3 failures', score: 6.4, findings: [
			{ reviewer_role: 'clarity', severity: 'minor', confidence: 0.87, issue: 'Unlock mechanism not specified', evidence: 'Manual admin unlock? Email link?' },
		] },
		clear: { prompt: 'Rate limiting: (1) Track login attempts by IP, (2) Max 5/hour, block after 3 failures in 15min, (3) Unlock via email link (valid 24h), (4) Log all failures, (5) Alert admin on suspicious patterns (>10 attempts/min)', score: 9.0, findings: [] },
	},

	// Testing
	testing_suite: {
		domain: 'Testing',
		task: 'Test Coverage',
		vague: { prompt: 'Write tests for the function', score: 2.5, findings: [
			{ reviewer_role: 'testing', severity: 'blocker', confidence: 0.96, issue: 'Test scope undefined', evidence: 'Unit? Integration? Happy path? Edge cases?' },
		] },
		medium: { prompt: 'Unit tests for validateEmail: test valid/invalid emails, return bool', score: 6.7, findings: [
			{ reviewer_role: 'clarity', severity: 'minor', confidence: 0.85, issue: 'Specific test cases not listed', evidence: 'How many test cases? Which edge cases?' },
		] },
		clear: { prompt: 'validateEmail tests (Jest): (1) Valid: user@example.com, test+tag@domain.co.uk, (2) Invalid: missing@, @example, spaces, (3) Edge: null (throw), empty string, (4) Coverage: 100%, (5) File: src/__tests__/validate.test.js', score: 8.8, findings: [] },
	},

	// Real-time systems
	realtime_websocket: {
		domain: 'Real-time Systems',
		task: 'WebSocket Server',
		vague: { prompt: 'Add real-time messaging', score: 2.3, findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.95, issue: 'Protocol and behavior undefined', evidence: 'WebSocket? Pub/sub? Broadcast vs direct?' },
		] },
		medium: { prompt: 'WebSocket: client sends message, broadcast to all connected clients', score: 6.5, findings: [
			{ reviewer_role: 'security', severity: 'major', confidence: 0.91, issue: 'No authentication check', evidence: 'Verify user before accepting messages?' },
		] },
		clear: { prompt: 'WebSocket server: (1) Use socket.io, (2) On connection, join room "{userId}", (3) On message, validate userId token, broadcast to room, (4) Heartbeat every 30s, (5) Test with 100 concurrent clients', score: 8.7, findings: [] },
	},

	// Documentation
	documentation_api: {
		domain: 'Documentation',
		task: 'API Documentation',
		vague: { prompt: 'Document the API', score: 2.4, findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.96, issue: 'Format and scope undefined', evidence: 'Swagger? Markdown? Which endpoints?' },
		] },
		medium: { prompt: 'Document POST /users endpoint: request body, response format, error codes', score: 6.6, findings: [
			{ reviewer_role: 'testing', severity: 'minor', confidence: 0.85, issue: 'Example requests/responses missing', evidence: 'Show curl examples?' },
		] },
		clear: { prompt: 'API docs (OpenAPI 3.0): (1) POST /users, (2) Request: {email, password}, (3) Response: {id, email, token}, (4) Errors: 400 invalid email, 409 email exists, (5) Example: curl -X POST... with JSON body', score: 8.9, findings: [] },
	},

	// API Gateway
	api_gateway: {
		domain: 'Backend/API',
		task: 'API Gateway Setup',
		vague: { prompt: 'Set up API gateway', score: 2.2, findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.96, issue: 'Gateway type and config undefined', evidence: 'Kong? NGINX? AWS API Gateway? Routes?' },
		] },
		medium: { prompt: 'API Gateway: route /users to user service, /orders to order service, add rate limiting', score: 6.4, findings: [
			{ reviewer_role: 'domain_sme', severity: 'minor', confidence: 0.87, issue: 'Rate limit specifics unclear', evidence: 'Per IP? Per user? Tokens/sec?' },
		] },
		clear: { prompt: 'Gateway (NGINX): (1) Reverse proxy to upstream services, (2) /users/* → user-service:3000, /orders/* → order-service:3001, (3) Rate limit: 100 req/min per IP, return 429, (4) Log all requests, (5) Config: /etc/nginx/nginx.conf', score: 8.8, findings: [] },
	},

	// Monitoring
	monitoring_observability: {
		domain: 'DevOps',
		task: 'Observability/Monitoring',
		vague: { prompt: 'Add monitoring', score: 2.5, findings: [
			{ reviewer_role: 'domain_sme', severity: 'blocker', confidence: 0.95, issue: 'Metrics and tools undefined', evidence: 'Prometheus? Datadog? CloudWatch? What to monitor?' },
		] },
		medium: { prompt: 'Monitor application: CPU, memory, request count, error rate, log important events', score: 6.7, findings: [
			{ reviewer_role: 'clarity', severity: 'minor', confidence: 0.84, issue: 'Thresholds and alerts not specified', evidence: 'Alert when CPU > 80%?' },
		] },
		clear: { prompt: 'Monitoring (Prometheus): (1) Metrics: http_requests_total, errors_total, latency_seconds, (2) Export on /metrics endpoint, (3) Alert: CPU>80% email, errors>10/min Slack, (4) Scrape interval: 15s, (5) Dashboard: Grafana', score: 8.9, findings: [] },
	},

	// Caching layer
	caching_redis: {
		domain: 'Backend/API',
		task: 'Redis Caching Layer',
		vague: { prompt: 'Add caching to improve performance', score: 2.3, findings: [
			{ reviewer_role: 'domain_sme', severity: 'blocker', confidence: 0.96, issue: 'What to cache and strategy undefined', evidence: 'All queries? Session data? How long to keep?' },
		] },
		medium: { prompt: 'Cache top 100 products in Redis, expire after 1 hour', score: 6.6, findings: [
			{ reviewer_role: 'testing', severity: 'minor', confidence: 0.83, issue: 'Cache invalidation on product update missing', evidence: 'How to keep cache fresh?' },
		] },
		clear: { prompt: 'Redis caching: (1) Cache key: product:{id}, value: JSON, TTL: 1h, (2) On product update, DEL product:{id}, (3) GET: check cache first, fallback to DB, (4) SET cache before returning, (5) Test: bench cache hits (target >95%)', score: 8.8, findings: [] },
	},

	// Search implementation
	search_elasticsearch: {
		domain: 'Backend/API',
		task: 'Full-text Search',
		vague: { prompt: 'Add search functionality', score: 2.4, findings: [
			{ reviewer_role: 'clarity', severity: 'blocker', confidence: 0.95, issue: 'Search scope and engine undefined', evidence: 'Elasticsearch? Database LIKE? What fields?' },
		] },
		medium: { prompt: 'Search users by name and email in Elasticsearch, return top 10 results', score: 6.5, findings: [
			{ reviewer_role: 'security', severity: 'major', confidence: 0.89, issue: 'No input validation or sanitization', evidence: 'SQL injection? Elasic query injection risk?' },
		] },
		clear: { prompt: 'Elasticsearch search: (1) Index: users (name, email fields), (2) Query: multi_match across name/email, (3) Sanitize input with escape(), (4) Return top 10 with score, (5) Latency target: <100ms, (6) Test: benchmark with 1M users', score: 8.8, findings: [] },
	},
};

// Outcome assignment strategies
const OUTCOME_STRATEGIES = {
	// High clarity → mostly approved
	high_clarity_bias: (score) => {
		if (score >= 8.5) return { strategy: 'approve_all', accept_ratio: 1.0, outcome: 'approved' };
		if (score >= 7.5) return { strategy: 'approve_most', accept_ratio: 0.85, outcome: 'approved' };
		return { strategy: 'mixed', accept_ratio: 0.5, outcome: 'approved' };
	},

	// Low clarity → mostly deferred/rejected
	low_clarity_bias: (score) => {
		if (score <= 3) return { strategy: 'reject_most', accept_ratio: 0.2, outcome: 'rejected' };
		if (score <= 5) return { strategy: 'defer_most', accept_ratio: 0.4, outcome: 'edited' };
		return { strategy: 'mixed', accept_ratio: 0.6, outcome: 'approved' };
	},

	// Random variance (tests reviewer independence)
	variance: (score) => {
		const rand = Math.random();
		if (rand > 0.7) return { strategy: 'disagree', accept_ratio: 0.3, outcome: 'rejected' };
		if (rand > 0.4) return { strategy: 'partial', accept_ratio: 0.6, outcome: 'edited' };
		return { strategy: 'approve', accept_ratio: 0.9, outcome: 'approved' };
	},
};

// Generate entries from domain templates
function expandTier2(targetCount = 150) {
	const scenarios = [];
	const entries = [];
	const now = new Date();
	let count = 0;

	// Strategy to maximize coverage: use only 2 outcome strategies per domain (high_clarity_bias, variance)
	// This gives us 2 × 3 versions = 6 entries per domain
	// 10 domains × 6 = 60 entries, then duplicate some for more variance = ~120 entries

	const strategies = ['high_clarity_bias', 'low_clarity_bias', 'variance'];

	// Generate from each domain template × outcome strategies
	for (const [domainKey, template] of Object.entries(DOMAIN_TEMPLATES)) {
		for (const outcomeStrategy of strategies) {
			if (count >= targetCount) break;

			// Vague version
			const vagueScenario = {
				id: `${domainKey}-vague-${outcomeStrategy}-${Math.floor(Math.random()*1000)}`,
				domain: template.domain,
				task: template.task,
				version: 'vague',
				...template.vague,
			};
			scenarios.push(vagueScenario);
			const vagueOutcome = OUTCOME_STRATEGIES[outcomeStrategy](template.vague.score);
			const ts = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
			entries.push(generateAuditEntry(vagueScenario, ts, { strategy: 'approve_high_clarity', outcome: vagueOutcome.outcome }));
			count++;

			// Medium version
			if (count >= targetCount) break;
			const mediumScenario = {
				id: `${domainKey}-medium-${outcomeStrategy}-${Math.floor(Math.random()*1000)}`,
				domain: template.domain,
				task: template.task,
				version: 'medium',
				...template.medium,
			};
			scenarios.push(mediumScenario);
			const mediumOutcome = OUTCOME_STRATEGIES[outcomeStrategy](template.medium.score);
			const ts2 = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
			entries.push(generateAuditEntry(mediumScenario, ts2, { strategy: 'approve_high_clarity', outcome: mediumOutcome.outcome }));
			count++;

			// Clear version
			if (count >= targetCount) break;
			const clearScenario = {
				id: `${domainKey}-clear-${outcomeStrategy}-${Math.floor(Math.random()*1000)}`,
				domain: template.domain,
				task: template.task,
				version: 'clear',
				...template.clear,
			};
			scenarios.push(clearScenario);
			const clearOutcome = OUTCOME_STRATEGIES[outcomeStrategy](template.clear.score);
			const ts3 = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
			entries.push(generateAuditEntry(clearScenario, ts3, { strategy: 'approve_high_clarity', outcome: clearOutcome.outcome }));
			count++;
		}
	}

	return { scenarios: scenarios.slice(0, targetCount), entries: entries.slice(0, targetCount) };
}

// Main
if (require.main === module) {
	const args = process.argv.slice(2);
	const count = args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1]) : 150;
	const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;

	const { scenarios, entries } = expandTier2(count);

	const output = {
		expansion: 'tier-2-extended',
		timestamp: new Date().toISOString(),
		scenario_count: scenarios.length,
		entry_count: entries.length,
		domains_covered: [...new Set(scenarios.map(s => s.domain))].length,
		domains: [...new Set(scenarios.map(s => s.domain))],
		scenarios,
		entries,
		summary: {
			total_after_expansion: 54 + entries.length,
			outcome_distribution: {
				approved: entries.filter(e => e.outcome === 'approved').length,
				edited: entries.filter(e => e.outcome === 'edited').length,
				rejected: entries.filter(e => e.outcome === 'rejected').length,
			},
			clarity_score_range: [
				Math.min(...scenarios.map(s => s.score)),
				Math.max(...scenarios.map(s => s.score)),
			],
			expected_outcome: 'Outcome variance enables precision validation, domain diversity tests reviewer specialization',
		},
	};

	if (outputFile) {
		const fs = require('fs');
		fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
		console.log(`Generated: ${output.entry_count} entries`);
		console.log(`Domains: ${output.domains.join(', ')}`);
		console.log(`Total with Tier 1 & original Tier 2: ${output.summary.total_after_expansion}`);
		console.log(`Saved to: ${outputFile}`);
	} else {
		console.log(JSON.stringify(output, null, 2));
	}
}

module.exports = { expandTier2, DOMAIN_TEMPLATES, OUTCOME_STRATEGIES };
