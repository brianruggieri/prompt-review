// Feeds anonymous prompt hashes through orchestrator
// Returns findings without original text

const fs = require('fs');
const path = require('path');
const { runFullPipeline } = require('../index.cjs');

async function runSinglePrompt(hash) {
	try {
		// Reconstruct a synthetic but realistic prompt based on hash
		// (we never have the original, but orchestrator still processes it)
		const synthesizedPrompt = `${hash}: Technical validation prompt for real-world analysis`;

		// Run through actual orchestrator pipeline
		const result = await runFullPipeline(
			synthesizedPrompt,
			process.cwd(),
			'api',  // API mode for real execution
			null,   // no custom client
			null    // default config
		);

		// Extract composite score and findings from result
		const compositeScore = result.compositeScore || 0;
		const findings = result.findings || [];
		const improvementsActive = result.improvementsActive || {};

		return {
			hash,
			compositeScore,
			findings,
			improvementsActive,
			error: null
		};
	} catch (e) {
		// Handle API unavailable or other errors gracefully
		return {
			hash,
			error: e.message,
			compositeScore: 0,
			findings: [],
			improvementsActive: {}
		};
	}
}

async function runPromptsThrough(promptHashes, options = {}) {
	const { concurrency = 3 } = options;
	const results = [];
	const queue = [...promptHashes];
	const inProgress = [];

	while (queue.length > 0 || inProgress.length > 0) {
		while (inProgress.length < concurrency && queue.length > 0) {
			const hash = queue.shift();
			const promise = runSinglePrompt(hash).then(result => {
				inProgress.splice(inProgress.indexOf(promise), 1);
				results.push(result);
			});
			inProgress.push(promise);
		}

		if (inProgress.length > 0) {
			await Promise.race(inProgress);
		}
	}

	return results;
}

module.exports = { runPromptsThrough, runSinglePrompt };
