'use strict';

// This is a CI/runtime launcher, not test source. Test code remains in the
// separate artifacts workspace and must be provided explicitly on CI.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateExternalTestRegistry } = require('./verify-external-tests.cjs');

const sourceRoot = path.resolve(__dirname, '../..');
const testRoot = process.env.CAFE_PROJECT_TEST_ROOT
  ? path.resolve(process.env.CAFE_PROJECT_TEST_ROOT)
  : path.resolve(sourceRoot, '../../cafe-project-artifacts/testing');
const mode = process.argv[2] || 'normal';

if (!['normal', 'mock', 'verify'].includes(mode)) {
  console.error('Usage: npm test | npm run test:mock | node scripts/ci/run-external-tests.cjs verify');
  process.exit(2);
}
try {
  const inventory = validateExternalTestRegistry(testRoot);
  console.log('EXTERNAL_TEST_REGISTRY ' + JSON.stringify(inventory));
} catch (error) {
  console.error(error.message);
  console.error('Set CAFE_PROJECT_TEST_ROOT to the complete external testing workspace.');
  process.exit(2);
}
if (mode === 'verify') process.exit(0);

const entry = path.join(testRoot, 'run-tests.cjs');
const result = spawnSync(process.execPath, [entry, mode], {
  cwd: sourceRoot,
  env: { ...process.env, CAFE_PROJECT_ROOT: sourceRoot },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) {
  console.error('TEST_LAUNCH_FAILED: ' + result.error.message);
  process.exit(2);
}
process.exit(result.status === null ? 1 : result.status);
