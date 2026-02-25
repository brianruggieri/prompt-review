const assert = require('assert');

// Phase 2 Reviewer Accuracy Tests

// 2.1: Security - Template Safety Detection
{
	const security = require('../reviewers/security.cjs');

	// Test: Detects template engine usage
	const templateEngine = security.detectTemplateLanguage('Generate HTML with Handlebars template');
	assert.strictEqual(templateEngine, 'handlebars', 'Should detect handlebars template engine');

	// Test: Flags template without escaping
	const findings1 = security.checkTemplateOutputSafety('Generate HTML with Handlebars');
	assert(findings1.length > 0, 'Should flag template without escaping');
	assert.strictEqual(findings1[0].severity, 'major', 'Should be major severity');

	// Test: Allows template with escaping mention
	const findings2 = security.checkTemplateOutputSafety('Generate HTML with Handlebars and escape user input');
	assert.strictEqual(findings2.length, 0, 'Should allow template with escaping mentioned');

	// Test: Flags innerHTML without sanitization
	const findings3 = security.checkTemplateOutputSafety('Use innerHTML to set HTML content');
	assert(findings3.length > 0, 'Should flag innerHTML without sanitization');
	assert.strictEqual(findings3[0].severity, 'blocker', 'innerHTML should be blocker');
}

// 2.2: Documentation - Project Maturity Awareness
{
	const documentation = require('../reviewers/documentation.cjs');

	// Test: Infers MVP maturity for new projects
	const mvpMaturity = documentation.inferProjectMaturity({ projectAge: 'new' });
	assert.strictEqual(mvpMaturity, 'MVP', 'Should infer MVP for new projects');

	// Test: Infers MVP for very small projects (<50 files)
	const mvpSmall = documentation.inferProjectMaturity({ stats: { files: 30 } });
	assert.strictEqual(mvpSmall, 'MVP', 'Should infer MVP for <50 file projects');

	// Test: Infers growing for medium projects (50-300 files)
	const growingMaturity = documentation.inferProjectMaturity({ stats: { files: 150 } });
	assert.strictEqual(growingMaturity, 'growing', 'Should infer growing for 50-300 file projects');

	// Test: Infers stable maturity from large projects (300+ files)
	const stableMaturity = documentation.inferProjectMaturity({ stats: { files: 400 } });
	assert.strictEqual(stableMaturity, 'stable', 'Should infer stable for 300+ file projects');

	// Test: Infers stable from established age
	const stableByAge = documentation.inferProjectMaturity({ projectAge: 'established' });
	assert.strictEqual(stableByAge, 'stable', 'Should infer stable for established projects');

	// Test: MVP doesn't require CHANGELOG for bugfixes
	const mvpExpectations = documentation.buildDocumentationExpectations('MVP', 'Fix crash in login');
	assert.strictEqual(mvpExpectations.requireCHANGELOG, false, 'MVP should skip CHANGELOG for bugfixes');

	// Test: Stable requires CHANGELOG for features
	const stableExpectations = documentation.buildDocumentationExpectations('stable', 'Add new authentication method');
	assert.strictEqual(stableExpectations.requireCHANGELOG, true, 'Stable should require CHANGELOG for features');
}

// 2.3: Domain SME - File Path Validation
{
	const domainSme = require('../reviewers/domain-sme.cjs');

	// Test: Extracts file references from prompt
	const files1 = domainSme.extractFileReferences('Refer to src/types.ts and update config.json');
	assert(files1.includes('src/types.ts'), 'Should extract src/types.ts');
	assert(files1.includes('config.json'), 'Should extract config.json');

	// Test: Validates file paths
	const context = {
		files: ['src/types.ts', 'src/config.ts', 'package.json']
	};
	const validation1 = domainSme.validateFilePathsExist(['src/types.ts', 'src/config.ts'], context);
	assert.strictEqual(validation1.valid.length, 2, 'Should find both files');
	assert.strictEqual(validation1.invalid.length, 0, 'Should find no invalid files');

	// Test: Detects non-existent files
	const validation2 = domainSme.validateFilePathsExist(['src/types.ts', 'src/missing.ts'], context);
	assert.strictEqual(validation2.valid.length, 1, 'Should find one valid file');
	assert.strictEqual(validation2.invalid.length, 1, 'Should find one invalid file');
	assert(validation2.invalid.includes('src/missing.ts'), 'Should identify missing file');
}

console.log('reviewer-accuracy-phase2.test: all tests passed ✓');
