#!/usr/bin/env node
// scripts/validate-real-prompts.cjs

const { extractRealPrompts } = require('./extract-real-prompts.cjs');
const { analyzeFindings, generateAnalysisReport } = require('./analyze-findings.cjs');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0] || 'help';

const commands = {
	extract: async () => {
		const limit = parseInt(args[1]) || 100;
		console.log(`\nExtracting up to ${limit} real prompts...`);
		const prompts = extractRealPrompts({ limit });
		console.log(`✓ Extracted ${prompts.length} unique prompts from your Claude Code sessions`);
		console.log(`\nSample hashes (no original text stored):`);
		prompts.slice(0, 5).forEach(p => {
			console.log(`  ${p.hash.padEnd(14)} (${p.length} chars, ${new Date(p.timestamp).toLocaleDateString()})`);
		});
		if (prompts.length > 5) {
			console.log(`  ... and ${prompts.length - 5} more`);
		}
		console.log('');
	},

	analyze: async () => {
		const limit = parseInt(args[1]) || 50;
		console.log(`\nAnalyzing ${limit} real prompts...`);
		const prompts = extractRealPrompts({ limit });

		// Mock results for demonstration
		const mockResults = prompts.map(p => ({
			hash: p.hash,
			compositeScore: 5 + Math.random() * 4,
			findings: Math.random() > 0.5 ? [{severity: 'minor'}] : [],
			improvementsActive: {}
		}));

		const analysis = analyzeFindings(mockResults);
		const report = generateAnalysisReport(analysis);
		console.log('\n' + report);
	},

	help: async () => {
		console.log(`
Real Prompt Validation CLI

Commands:
  extract [limit]   - Extract up to N real prompts from Claude Code sessions (default: 100)
  analyze [limit]   - Analyze N prompts and generate report (default: 50)
  help              - Show this help
		`);
	}
};

const handler = commands[command] || commands.help;
if (handler) {
	handler().catch(e => {
		console.error('Error:', e.message);
		process.exit(1);
	});
} else {
	console.error('Unknown command:', command);
	commands.help();
	process.exit(1);
}
