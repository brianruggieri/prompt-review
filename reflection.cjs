const fs = require('fs');
const path = require('path');
const { verifyAuditEntry } = require('./cost.cjs');

const LOGS_DIR = path.join(__dirname, 'logs');

function loadLogsFromDisk(days) {
	const entries = [];
	let skipped = 0;
	if (!fs.existsSync(LOGS_DIR)) return { entries, skipped };

	const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
	const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl')).sort();

	for (const file of files) {
		if (cutoff) {
			const fileDate = file.replace('.jsonl', '');
			if (new Date(fileDate) < cutoff) continue;
		}

		const content = fs.readFileSync(path.join(LOGS_DIR, file), 'utf-8');
		const lines = content.split('\n');

		for (const line of lines) {
			if (!line || !line.trim()) continue;
			try {
				const entry = JSON.parse(line.trim());
				if (cutoff && new Date(entry.timestamp) < cutoff) continue;

				// Verify hash if present
				if (entry.__hash) {
					const verification = verifyAuditEntry(entry);
					if (!verification.valid) {
						skipped++;
						continue;
					}
				}

				entries.push(entry);
			} catch (e) {
				// skip malformed lines
			}
		}
	}

	return { entries, skipped };
}

function generateReflectionReport(days, options = {}) {
	options = options || {};
	let entries = options.entries;
	let skipped = 0;
	if (entries === undefined) {
		const loaded = loadLogsFromDisk(days);
		entries = loaded.entries;
		skipped = loaded.skipped;
	}
	const minReviews = options.min_reviews || 5;
	const precisionThreshold = options.precision_threshold || 0.70;

	if (entries.length === 0) {
		return {
			generated_at: new Date().toISOString(),
			period: `${days}d`,
			total_reviews: 0,
			reviews_with_outcome: 0,
			reviewers: {},
			low_precision_roles: [],
			high_precision_roles: [],
			weight_suggestions: {},
			sufficient_data: false,
			skipped_entries: skipped,
			hash_verification_failed: skipped > 0,
		};
	}

	// Count reviews with outcomes
	const reviewsWithOutcome = entries.filter(e => e.outcome && e.outcome !== 'pending').length;

	// Aggregate reviewer metrics
	const reviewerMap = {};

	for (const entry of entries) {
		if (!entry.findings_detail || !Array.isArray(entry.findings_detail)) continue;

		// Track this entry's outcome for correlation
		const hasOutcomeEffect = entry.outcome && (entry.outcome === 'approved' || entry.outcome === 'edited');

		// For each role in this entry, track if they had >= 1 accepted finding
		const roleHasAcceptedInThisReview = {};

		for (const finding of entry.findings_detail) {
			const role = finding.reviewer_role;
			if (!role) continue;

			if (!reviewerMap[role]) {
				reviewerMap[role] = {
					proposed: 0,
					accepted: 0,
					rejected: 0,
					invalid_rejected: 0,      // rejected because finding was wrong
					deferred_rejected: 0,     // rejected but valid (deferred/out of scope)
					conflict_rejected: 0,     // rejected due to conflict
					unknown_rejected: 0,      // rejection reason not specified
					review_count: 0,
					reviews_with_effect: new Set(), // track unique reviews where role had accepted + good outcome
					participations: new Set(), // track unique reviews for review_count
				};
			}

			const findingId = finding.finding_id;
			reviewerMap[role].proposed++;
			reviewerMap[role].participations.add(entry.timestamp); // mark participation

			// Check if this finding was accepted or rejected
			let isAccepted = false;
			let isRejected = false;

			if (entry.suggestions_accepted && entry.suggestions_accepted.includes(findingId)) {
				reviewerMap[role].accepted++;
				isAccepted = true;
				roleHasAcceptedInThisReview[role] = true; // mark that this role had an accepted finding
			} else if (entry.suggestions_rejected && entry.suggestions_rejected.includes(findingId)) {
				reviewerMap[role].rejected++;
				isRejected = true;

				// Track rejection reason if available
				if (entry.rejection_details && entry.rejection_details[findingId]) {
					const reason = entry.rejection_details[findingId];
					if (reason === 'invalid') reviewerMap[role].invalid_rejected++;
					else if (reason === 'deferred') reviewerMap[role].deferred_rejected++;
					else if (reason === 'conflict') reviewerMap[role].conflict_rejected++;
					else reviewerMap[role].unknown_rejected++;
				} else {
					// Legacy entries without rejection_details
					reviewerMap[role].unknown_rejected++;
				}
			}
		}

		// Track outcome correlation: if role had >= 1 accepted finding AND outcome is approved/edited
		for (const role of Object.keys(roleHasAcceptedInThisReview)) {
			if (hasOutcomeEffect) {
				reviewerMap[role].reviews_with_effect.add(entry.timestamp);
			}
		}
	}

	// Convert to final metrics
	const reviewers = {};
	let totalProposed = 0;
	let totalAccepted = 0;

	for (const [role, data] of Object.entries(reviewerMap)) {
		const reviewCount = data.participations.size;
		const precision = data.proposed > 0 ? data.accepted / data.proposed : 0;
		const precisionStrict = data.proposed > 0 ? data.accepted / (data.accepted + data.invalid_rejected) : 0;
		const coverageRatio = entries.length > 0 ? data.participations.size / entries.length : 0;
		const reviewsWithEffectCount = data.reviews_with_effect.size;
		const outcomeCorrelation = reviewCount > 0 ? reviewsWithEffectCount / reviewCount : 0;

		reviewers[role] = {
			precision: Math.round(precision * 10000) / 10000, // 4 decimals
			precision_strict: Math.round(precisionStrict * 10000) / 10000, // using only invalid rejections
			coverage_ratio: Math.round(coverageRatio * 10000) / 10000, // in what % of reviews did this role contribute
			proposed: data.proposed,
			accepted: data.accepted,
			rejected: data.rejected,
			invalid_rejected: data.invalid_rejected,
			review_count: reviewCount,
			outcome_correlation: Math.round(outcomeCorrelation * 10000) / 10000,
		};

		totalProposed += data.proposed;
		totalAccepted += data.accepted;
	}

	// Compute low/high precision roles
	const lowPrecisionRoles = [];
	const highPrecisionRoles = [];
	const lowCoverageRoles = [];
	const playsItSafeRoles = [];

	const COVERAGE_THRESHOLD = 0.3;

	for (const [role, metrics] of Object.entries(reviewers)) {
		if (metrics.precision < precisionThreshold) {
			lowPrecisionRoles.push(role);
		} else if (metrics.precision >= precisionThreshold) {
			highPrecisionRoles.push(role);
		}

		if (metrics.coverage_ratio < COVERAGE_THRESHOLD) {
			lowCoverageRoles.push(role);
			// Flag "plays it safe" - high precision but low coverage (risky pattern)
			if (metrics.precision >= precisionThreshold) {
				playsItSafeRoles.push(role);
			}
		}
	}

	// Check if we have sufficient data
	const hasSufficientData = reviewsWithOutcome >= minReviews;

	return {
		generated_at: new Date().toISOString(),
		period: `${days}d`,
		total_reviews: entries.length,
		reviews_with_outcome: reviewsWithOutcome,
		reviewers,
		low_precision_roles: lowPrecisionRoles.sort(),
		high_precision_roles: highPrecisionRoles.sort(),
		low_coverage_roles: lowCoverageRoles.sort(),
		plays_it_safe_roles: playsItSafeRoles.sort(),
		weight_suggestions: hasSufficientData ? computeWeightSuggestions(reviewers, {}, minReviews) : {},
		sufficient_data: hasSufficientData,
		skipped_entries: skipped,
		hash_verification_failed: skipped > 0,
	};
}

function computeWeightSuggestions(reviewerMetrics, currentWeights, minReviews) {
	currentWeights = currentWeights || {};
	minReviews = minReviews || 5;

	// Filter reviewers by min_reviews
	const validReviewers = {};
	for (const [role, metrics] of Object.entries(reviewerMetrics)) {
		if (metrics.review_count >= minReviews) {
			validReviewers[role] = metrics;
		}
	}

	if (Object.keys(validReviewers).length === 0) {
		return {};
	}

	// Calculate average precision across valid reviewers
	const precisions = Object.values(validReviewers).map(m => m.precision);
	const avgPrecision = precisions.reduce((a, b) => a + b, 0) / precisions.length;

	// Calculate suggestions for each valid reviewer
	const suggestions = {};

	for (const [role, metrics] of Object.entries(validReviewers)) {
		const currentWeight = currentWeights[role] || 1.0;
		const scaleFactor = metrics.precision / avgPrecision;
		let suggestedWeight = currentWeight * scaleFactor;

		// Clamp to [0.5, 3.0]
		suggestedWeight = Math.max(0.5, Math.min(3.0, suggestedWeight));

		// Cap per-run delta to ±0.5 to prevent aggressive swings
		const MAX_DELTA = 0.5;
		const rawDelta = suggestedWeight - currentWeight;
		if (Math.abs(rawDelta) > MAX_DELTA) {
			suggestedWeight = currentWeight + (rawDelta > 0 ? MAX_DELTA : -MAX_DELTA);
			suggestedWeight = Math.max(0.5, Math.min(3.0, suggestedWeight));
		}

		// Round to 2 decimal places
		suggestedWeight = Math.round(suggestedWeight * 100) / 100;

		const delta = Math.round((suggestedWeight - currentWeight) * 100) / 100;
		let reason = 'Based on reviewer precision and portfolio average';
		if (delta > 0.05) {
			reason = `High precision (${(metrics.precision * 100).toFixed(0)}%) - increase weight`;
		} else if (delta < -0.05) {
			reason = `Low precision (${(metrics.precision * 100).toFixed(0)}%) - decrease weight`;
		} else {
			reason = 'Near portfolio average precision';
		}

		suggestions[role] = {
			current: currentWeight,
			suggested: suggestedWeight,
			delta,
			reason,
		};
	}

	return suggestions;
}

function computeAdaptationImpact(days) {
	const logsDir = path.join(__dirname, 'logs');
	const weightHistoryFile = path.join(logsDir, 'weight-history.jsonl');

	if (!fs.existsSync(weightHistoryFile)) {
		return { impacts: [], message: 'No weight changes recorded yet' };
	}

	const content = fs.readFileSync(weightHistoryFile, 'utf-8');
	const lines = content.split('\n').filter(l => l.trim());
	const impacts = [];

	for (const line of lines) {
		try {
			const entry = JSON.parse(line.trim());

			// Compute impact for each role
			const changeTime = new Date(entry.timestamp);
			const impactData = {
				timestamp: entry.timestamp,
				change_date: entry.timestamp.slice(0, 10),
				period_days: entry.measurement_period_days,
				impact_by_role: {},
			};

			for (const [role, before] of Object.entries(entry.weights_before)) {
				const after = entry.weights_after[role] || before;
				const precisionAtChange = entry.precision_at_change[role];
				const delta = after - before;

				impactData.impact_by_role[role] = {
					weight_before: before,
					weight_after: after,
					weight_delta: Math.round(delta * 100) / 100,
					precision_at_change: precisionAtChange ? precisionAtChange.precision : null,
					precision_strict: precisionAtChange ? precisionAtChange.precision_strict : null,
					coverage_ratio: precisionAtChange ? precisionAtChange.coverage_ratio : null,
				};
			}

			impacts.push(impactData);
		} catch (e) {
			// Skip malformed lines
		}
	}

	return { impacts, count: impacts.length };
}

function renderAdaptationHistoryTable(impactData) {
	if (!impactData.impacts || impactData.impacts.length === 0) {
		return 'No adaptation history available';
	}

	const lines = [];
	lines.push('Weight Adaptation History');
	lines.push('========================\n');

	for (const impact of impactData.impacts) {
		lines.push(`Change Date: ${impact.change_date} (measurement period: ${impact.period_days}d)`);
		lines.push('');

		// Table header
		lines.push('Role            Before  After   Delta  Precision  Coverage');
		lines.push('---           ------  -----   -----  ---------  --------');

		// Table rows
		for (const [role, data] of Object.entries(impact.impact_by_role)) {
			const roleLabel = role.padEnd(15);
			const before = String(data.weight_before).padStart(6);
			const after = String(data.weight_after).padStart(5);
			const delta = String(data.weight_delta >= 0 ? '+' + data.weight_delta : data.weight_delta).padStart(5);
			const precision = data.precision_at_change !== null ? (data.precision_at_change * 100).toFixed(0) + '%' : 'N/A';
			const coverage = data.coverage_ratio !== null ? (data.coverage_ratio * 100).toFixed(0) + '%' : 'N/A';

			lines.push(`${roleLabel}${before}  ${after}   ${delta}  ${String(precision).padStart(8)}  ${String(coverage).padStart(7)}`);
		}

		lines.push('');
	}

	return lines.join('\n');
}

module.exports = {
	generateReflectionReport,
	computeWeightSuggestions,
	loadLogsFromDisk,
	computeAdaptationImpact,
	renderAdaptationHistoryTable,
};
