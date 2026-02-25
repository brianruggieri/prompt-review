const fs = require('fs');
const path = require('path');

function detectStack(indicators) {
  const stack = [];

  if (indicators.hasPackageJson || indicators.hasTsConfig) {
    stack.push('node');
  }
  if (indicators.hasTsConfig || (indicators.packageJson &&
      (indicators.packageJson.devDependencies?.typescript || indicators.packageJson.dependencies?.typescript))) {
    stack.push('typescript');
  }
  if (indicators.hasPyProject || indicators.hasSetupPy) {
    stack.push('python');
  }
  if (indicators.hasGoMod) {
    stack.push('go');
  }
  if (indicators.hasCargoToml) {
    stack.push('rust');
  }

  // Detect frameworks from package.json
  if (indicators.packageJson) {
    const allDeps = {
      ...indicators.packageJson.dependencies,
      ...indicators.packageJson.devDependencies
    };
    if (allDeps.react) stack.push('react');
    if (allDeps.vue) stack.push('vue');
    if (allDeps.svelte) stack.push('svelte');
    if (allDeps.next) stack.push('nextjs');
    if (allDeps.tailwindcss) stack.push('tailwind');
    if (allDeps.esbuild) stack.push('esbuild');
    if (allDeps.obsidian) stack.push('obsidian-plugin');
  }

  // Detect from CLAUDE.md hints
  if (indicators.claudeMdContent) {
    const content = indicators.claudeMdContent.toLowerCase();
    if (content.includes('obsidian') && content.includes('plugin')) stack.push('obsidian-plugin');
    if (content.includes('fastapi')) stack.push('fastapi');
  }

  return [...new Set(stack)];
}

function detectTestFramework(indicators) {
  if (!indicators.packageJson) return null;
  const allDeps = {
    ...indicators.packageJson.dependencies,
    ...indicators.packageJson.devDependencies
  };
  if (allDeps.vitest) return 'vitest';
  if (allDeps.jest) return 'jest';
  if (allDeps.mocha) return 'mocha';
  if (indicators.hasPyProject) {
    if (indicators.pyProjectContent?.includes('pytest')) return 'pytest';
  }
  return null;
}

function detectBuildTool(indicators) {
  if (!indicators.packageJson) return null;
  const allDeps = {
    ...indicators.packageJson.dependencies,
    ...indicators.packageJson.devDependencies
  };
  if (allDeps.esbuild) return 'esbuild';
  if (allDeps.webpack) return 'webpack';
  if (allDeps.vite) return 'vite';
  if (allDeps.rollup) return 'rollup';
  return null;
}

function extractConventions(claudeMd) {
  if (!claudeMd) return [];
  const conventions = [];
  const lines = claudeMd.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('convention') || lower.includes('preferred') ||
        lower.includes('style') || lower.includes('always') ||
        lower.includes('never') || lower.includes('must')) {
      const trimmed = line.replace(/^[-*#\s]+/, '').trim();
      if (trimmed.length > 10 && trimmed.length < 200) {
        conventions.push(trimmed);
      }
    }
  }
  return conventions.slice(0, 20);
}

function getDirectoryStructure(dir, depth, maxDepth) {
  if (depth >= maxDepth) return [];
  const entries = [];
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;
      const prefix = '  '.repeat(depth);
      if (item.isDirectory()) {
        entries.push(`${prefix}${item.name}/`);
        entries.push(...getDirectoryStructure(path.join(dir, item.name), depth + 1, maxDepth));
      } else if (depth === 0 || item.name.match(/\.(ts|js|py|go|rs|json|toml|yaml|yml|md)$/)) {
        entries.push(`${prefix}${item.name}`);
      }
    }
  } catch (e) {
    // directory not readable
  }
  return entries;
}

function readFileSafe(filePath, maxBytes) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    if (maxBytes && content.length > maxBytes) {
      return content.slice(0, maxBytes) + '\n... (truncated)';
    }
    return content;
  } catch (e) {
    return null;
  }
}

function buildContext(options) {
  const cwd = options.cwd || process.cwd();
  const config = options.config || {};
  const structureDepth = config.structure_depth || 2;

  // Read files (support mock for testing)
  let packageJsonRaw, claudeMdRaw, tsConfigRaw, pyProjectRaw;
  if (options.mockFiles) {
    packageJsonRaw = options.mockFiles['package.json'] || null;
    claudeMdRaw = options.mockFiles['CLAUDE.md'] || null;
    tsConfigRaw = options.mockFiles['tsconfig.json'] || null;
    pyProjectRaw = options.mockFiles['pyproject.toml'] || null;
  } else {
    packageJsonRaw = readFileSafe(path.join(cwd, 'package.json'));
    claudeMdRaw = readFileSafe(path.join(cwd, 'CLAUDE.md'), 8000);
    tsConfigRaw = readFileSafe(path.join(cwd, 'tsconfig.json'));
    pyProjectRaw = readFileSafe(path.join(cwd, 'pyproject.toml'));
  }

  const packageJson = packageJsonRaw ? JSON.parse(packageJsonRaw) : null;

  // Also check for per-project prompt-review config
  let projectOverrides = null;
  if (!options.mockFiles) {
    const overridePath = path.join(cwd, '.claude', 'prompt-review.json');
    const overrideRaw = readFileSafe(overridePath);
    if (overrideRaw) {
      try { projectOverrides = JSON.parse(overrideRaw); } catch (e) { /* ignore */ }
    }
  }

  const indicators = {
    hasPackageJson: !!packageJson,
    packageJson,
    hasTsConfig: !!tsConfigRaw,
    hasClaudeMd: !!claudeMdRaw,
    claudeMdContent: claudeMdRaw,
    hasPyProject: !!pyProjectRaw,
    pyProjectContent: pyProjectRaw,
    hasGoMod: !options.mockFiles && fs.existsSync(path.join(cwd, 'go.mod')),
    hasCargoToml: !options.mockFiles && fs.existsSync(path.join(cwd, 'Cargo.toml')),
    hasSetupPy: !options.mockFiles && fs.existsSync(path.join(cwd, 'setup.py')),
  };

  const stack = detectStack(indicators);
  const testFramework = detectTestFramework(indicators);
  const buildTool = detectBuildTool(indicators);
  const conventions = extractConventions(claudeMdRaw);

  let structure = '';
  if (!options.mockFiles) {
    const entries = getDirectoryStructure(cwd, 0, structureDepth);
    structure = entries.join('\n');
  }

  // Read extra files from project overrides
  let extraContext = '';
  if (projectOverrides?.context?.extra_files && !options.mockFiles) {
    for (const relPath of projectOverrides.context.extra_files) {
      const content = readFileSafe(path.join(cwd, relPath), 4000);
      if (content) {
        extraContext += `\n--- ${relPath} ---\n${content}\n`;
      }
    }
  }

  return {
    projectName: packageJson?.name || path.basename(cwd),
    stack,
    claudeMd: claudeMdRaw,
    structure,
    conventions,
    testFramework,
    buildTool,
    extraContext,
    projectOverrides,
  };
}

module.exports = { buildContext, detectStack, detectTestFramework, detectBuildTool, extractConventions };
