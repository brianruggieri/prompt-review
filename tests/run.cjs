const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testsDir = __dirname;
const testFiles = fs.readdirSync(testsDir)
  .filter(f => f.endsWith('.test.cjs'))
  .sort();

let passed = 0;
let failed = 0;

for (const file of testFiles) {
  const filePath = path.join(testsDir, file);
  try {
    execSync(`node "${filePath}"`, { stdio: 'pipe', encoding: 'utf-8' });
    console.log(`  PASS  ${file}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${file}`);
    console.log(`        ${e.stderr || e.message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
