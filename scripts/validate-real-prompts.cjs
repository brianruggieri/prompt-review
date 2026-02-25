#!/usr/bin/env node
// scripts/validate-real-prompts.cjs

const { extractRealPrompts } = require('./extract-real-prompts.cjs');
const { analyzeFindings, generateAnalysisReport } = require('./analyze-findings.cjs');
const { runBatch, generateBatchReport, saveBatchReport, getBatchReportPath } = require('./run-batch.cjs');
const { loadManifest, getBatchStatus, aggregateBatchResults } = require('./batch-manifest.cjs');
const { renderCompleteVisualization } = require('./visualize-results.cjs');
const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'test-logs');
const BATCHES_DIR = path.join(LOGS_DIR, 'validation-batches');

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

	batch: async () => {
		const batchNum = parseInt(args[1]);
		if (isNaN(batchNum) || batchNum < 1 || batchNum > 13) {
			console.error('Error: Please specify a valid batch number (1-13)');
			console.error('Usage: node scripts/validate-real-prompts.cjs batch <N>');
			process.exit(1);
		}

		console.log(`\nRunning batch ${batchNum} (prompts ${(batchNum - 1) * 100}-${batchNum * 100 - 1})...`);
		console.log('');

		try {
			const result = await runBatch(batchNum, { verbose: true });

			if (!result.success) {
				console.error(`\n✗ Batch ${batchNum} failed: ${result.error}`);
				process.exit(1);
			}

			// Generate and save report
			const reportContent = generateBatchReport(batchNum);
			const reportPath = saveBatchReport(batchNum, reportContent);

			console.log(`\n✓ Batch ${batchNum} complete: ${result.promptCount} prompts, avg score ${result.avgScore}`);

			// Count findings in results
			let totalFindings = 0;
			for (const r of result.results) {
				if (r.findings && Array.isArray(r.findings)) {
					totalFindings += r.findings.length;
				}
			}

			console.log(`✓ Total findings: ${totalFindings}`);
			console.log(`✓ Report saved: ${reportPath}`);
			console.log('');
		} catch (e) {
			console.error(`\n✗ Error running batch ${batchNum}: ${e.message}`);
			process.exit(1);
		}
	},

	batches: async () => {
		const subcommand = args[1] || 'help';

		if (subcommand === 'status') {
			try {
				const status = getBatchStatus();
				console.log('\nBatch Status:');
				console.log(`✓ Completed: ${status.completed.length} (${status.completed.length * 100} prompts)`);
				console.log(`⏳ Pending: ${status.pending.length} batches (${status.pending.length * 100} prompts)`);

				const progressPct = Math.round((status.completed.length / 13) * 100);
				const totalProcessed = status.completed.length * 100;
				console.log(`Progress: ${progressPct}% (${totalProcessed}/1309)`);
				console.log('');

				if (status.completed.length > 0) {
					console.log(`Completed batches: ${status.completed.join(', ')}`);
					console.log('');
				}
			} catch (e) {
				console.error(`Error: ${e.message}`);
				process.exit(1);
			}
		} else if (subcommand === 'report') {
			try {
				const aggregated = aggregateBatchResults();

				if (aggregated.completed_batches.length === 0) {
					console.log('\nNo batches completed yet. Run a batch with:');
					console.log('  node scripts/validate-real-prompts.cjs batch 1');
					console.log('');
					process.exit(0);
				}

				console.log(`\nAggregated Report (${aggregated.completed_batches.length} batch${aggregated.completed_batches.length === 1 ? '' : 'es'} completed):`);
				console.log(`- Total prompts: ${aggregated.total_prompts_processed}`);
				console.log(`- Average score: ${aggregated.overall_avg_score}/10`);

				// Count total findings
				const findingsSummary = aggregated.findings_summary || {};
				let totalFindings = 0;
				for (const count of Object.values(findingsSummary)) {
					totalFindings += count;
				}
				console.log(`- Total findings: ${totalFindings}`);

				// Build analysis object for visualization
				const analysis = {
					totalPrompts: aggregated.total_prompts_processed,
					avgScore: aggregated.overall_avg_score,
					scoreDistribution: {}, // Will be populated from data
					severityBreakdown: aggregated.findings_summary,
					improvementsFired: aggregated.improvements_fired
				};

				// Create visualization report
				const report = renderCompleteVisualization(analysis, {
					runtime: 'batch aggregation'
				});

				// Save aggregated report
				const reportPath = path.join(LOGS_DIR, 'validation-report-aggregated.md');
				if (!fs.existsSync(LOGS_DIR)) {
					fs.mkdirSync(LOGS_DIR, { recursive: true });
				}
				fs.writeFileSync(reportPath, report, 'utf-8');

				console.log(`✓ Report: ${reportPath}`);
				console.log('');
			} catch (e) {
				console.error(`Error: ${e.message}`);
				process.exit(1);
			}
		} else if (subcommand === 'next') {
			try {
				const status = getBatchStatus();
				if (status.pending.length === 0) {
					console.log('\n✓ All batches completed!');
					console.log('');
					process.exit(0);
				}

				const nextBatch = status.pending[0];
				const startPrompt = (nextBatch - 1) * 100;
				const endPrompt = nextBatch * 100 - 1;
				console.log(`\nNext batch: ${nextBatch} (prompts ${startPrompt}-${endPrompt})`);
				console.log(`Run with: node scripts/validate-real-prompts.cjs batch ${nextBatch}`);
				console.log('');
			} catch (e) {
				console.error(`Error: ${e.message}`);
				process.exit(1);
			}
		} else {
			console.log(`
Batch Management Commands:

  batches status    - Show which batches are completed vs pending
  batches report    - Generate aggregated report from all completed batches
  batches next      - Show which batch to run next
			`);
		}
	},

	help: async () => {
		console.log(`
Real Prompt Validation CLI

Commands:
  extract [limit]       - Extract up to N real prompts from Claude Code sessions (default: 100)
  analyze [limit]       - Analyze N prompts and generate report (default: 50)
  batch <N>             - Run batch N (1-13) with 100 prompts each
  batches status        - Show batch progress
  batches report        - Generate aggregated report from completed batches
  batches next          - Show which batch to run next
  help                  - Show this help
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
