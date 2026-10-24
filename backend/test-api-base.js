const fs = require('fs');
const path = require('path');
const assert = require('assert');

const projectRoot = path.resolve(__dirname, '..');
const files = [
  path.join(projectRoot, 'auth-view.html'),
  path.join(projectRoot, 'mobile-app.js')
];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const hasRuntimeDetection = /window\.location\.hostname|window\.location\.search|localStorage\.getItem\('shpajzaApiBase'\)|location\.hostname/.test(content);
  const hasResolvedAssignment = /const API_BASE = resolveApiBase\(\)/.test(content);
  const hasHardcodedLiteralAssignment = /const API_BASE = ['"](?:https?:\/\/[^'"]+|file:\/\/[^'"]+)['"]/.test(content);

  assert.ok(hasRuntimeDetection, `${path.basename(file)} should resolve API base at runtime instead of a fixed host.`);
  assert.ok(hasResolvedAssignment, `${path.basename(file)} should assign API_BASE from a runtime resolver.`);
  assert.ok(!hasHardcodedLiteralAssignment, `${path.basename(file)} should not assign a raw hardcoded API URL.`);
}

console.log('PASS: API base configuration is runtime-aware.');
