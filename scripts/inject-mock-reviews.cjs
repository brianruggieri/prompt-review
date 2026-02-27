// Inject mock review data into audit logs
// Usage: node scripts/inject-mock-reviews.cjs [--tier 1] [--count N] [--output logs/]

const fs = require('fs');
const path = require('path');
const { generateTier1 } = require('./generate-mock-data.cjs');

function getLogsDirectory(outputPath) {
	if (outputPath) return outputPath;
	// Use plugin logs directory convention
	const homeDir = process.env.HOME || process.env.USERPROFILE;
	return path.join(homeDir, '.claude', 'plugins', 'prompt-review', 'logs');
}

function getTodayFilePath(logsDir) {
	const today = new Date().toISOString().split('T')[0];
	return path.join(logsDir, `${today}.jsonl`);
}

function injectEntries(entries, logsDir) {
	// Ensure logs directory exists
	if (!fs.existsSync(logsDir)) {
		fs.mkdirSync(logsDir, { recursive: true });
		console.log(`Created logs directory: ${logsDir}`);
	}

	const filePath = getTodayFilePath(logsDir);

	// Read existing entries (if any)
	let existingLines = [];
	if (fs.existsSync(filePath)) {
		const content = fs.readFileSync(filePath, 'utf-8').trim();
		if (content) {
			existingLines = content.split('\n').filter(line => line.trim());
		}
	}

	console.log(`Existing entries: ${existingLines.length}`);

	// Append new entries
	const newLines = entries.map(e => JSON.stringify(e));
	const allLines = [...existingLines, ...newLines];

	fs.writeFileSync(filePath, allLines.join('\n') + '\n');
	console.log(`Injected: ${entries.length} new entries`);
	console.log(`Total entries: ${allLines.length}`);
	console.log(`Log file: ${filePath}`);

	return {
		file: filePath,
		new_count: entries.length,
		total_count: allLines.length,
	};
}

// Main
if (require.main === module) {
	const args = process.argv.slice(2);
	const tier = args.includes('--tier') ? args[args.indexOf('--tier') + 1] : '1';
	const count = args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1]) : null;
	const outputDir = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
	const expanded = args.includes('--expanded');

	let entries;

	if (tier === '1') {
		const { entries: tierEntries } = require('./generate-mock-data.cjs').generateTier1();
		entries = count ? tierEntries.slice(0, count) : tierEntries;
	} else if (tier === '2') {
		if (expanded) {
			const { expandTier2 } = require('./expand-tier2.cjs');
			const { entries: tierEntries } = expandTier2(count || 162);
			entries = tierEntries;
		} else {
			const { entries: tierEntries } = require('./generate-mock-data.cjs').generateTier2();
			entries = count ? tierEntries.slice(0, count) : tierEntries;
		}
	} else {
		console.error(`Unknown tier: ${tier}. Currently supporting --tier 1|2 [--expanded]`);
		process.exit(1);
	}

	const logsDir = getLogsDirectory(outputDir);
	const result = injectEntries(entries, logsDir);

	console.log(`\n=== Injection Complete ===`);
	console.log(`Tier: ${tier}`);
	console.log(`Entries added: ${result.new_count}`);
	console.log(`Total in log: ${result.total_count}`);
	console.log(`File: ${result.file}`);
}

module.exports = { injectEntries, getLogsDirectory, getTodayFilePath };
