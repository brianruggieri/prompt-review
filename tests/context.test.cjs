const assert = require('assert');
const path = require('path');
const { buildContext, detectStack, detectTestFramework } = require('../context.cjs');

// Test: detectStack finds TypeScript from tsconfig
{
  const stack = detectStack({
    hasPackageJson: true,
    packageJson: { devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0', esbuild: '^0.19' } },
    hasTsConfig: true,
    hasClaudeMd: true,
    claudeMdContent: 'Obsidian desktop plugin'
  });
  assert.ok(stack.includes('typescript'), 'Should detect typescript');
  assert.ok(stack.includes('node'), 'Should detect node');
}

// Test: detectStack finds Python from pyproject.toml
{
  const stack = detectStack({
    hasPyProject: true,
    pyProjectContent: '[tool.pytest]'
  });
  assert.ok(stack.includes('python'), 'Should detect python');
}

// Test: detectTestFramework finds vitest
{
  const framework = detectTestFramework({
    hasPackageJson: true,
    packageJson: { devDependencies: { vitest: '^1.0.0' } }
  });
  assert.strictEqual(framework, 'vitest');
}

// Test: detectTestFramework finds jest
{
  const framework = detectTestFramework({
    hasPackageJson: true,
    packageJson: { devDependencies: { jest: '^29.0.0' } }
  });
  assert.strictEqual(framework, 'jest');
}

// Test: buildContext returns valid ProjectContext shape
{
  // Use a mock directory scan result
  const ctx = buildContext({
    cwd: '/tmp/fake-project',
    mockFiles: {
      'package.json': JSON.stringify({ name: 'test', devDependencies: { vitest: '1.0' } }),
      'CLAUDE.md': '# Test Project\nFunctional style preferred.'
    }
  });
  assert.ok(ctx.projectName, 'Should have projectName');
  assert.ok(Array.isArray(ctx.stack), 'stack should be an array');
  assert.ok(Array.isArray(ctx.conventions), 'conventions should be an array');
}

console.log('context.test: all tests passed');
