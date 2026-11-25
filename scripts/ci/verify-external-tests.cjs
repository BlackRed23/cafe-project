'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Fail closed when a hosted runner accidentally receives a partial test checkout.
// Floors match the accepted 106-file external regression inventory (30/59/17).
const MINIMUM_SUITES = Object.freeze({ api: 30, agent: 59, web: 17 });

function validateExternalTestRegistry(testRoot, minimums = MINIMUM_SUITES) {
  const root = path.resolve(testRoot);
  const entry = path.join(root, 'run-tests.cjs');
  if (!fs.existsSync(entry) || !fs.statSync(entry).isFile()) {
    throw new Error('REQUIRED_TEST_ASSETS_UNAVAILABLE: ' + entry);
  }

  const files = [{ absolute: entry, relative: 'run-tests.cjs' }];
  const suites = {};
  for (const app of Object.keys(MINIMUM_SUITES)) {
    const dir = path.join(root, 'apps', app, 'tests');
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new Error('REQUIRED_TEST_SUITE_MISSING: ' + dir);
    }
    const testFiles = fs.readdirSync(dir, { withFileTypes: true })
      .filter(item => item.isFile() && item.name.endsWith('.test.cjs'))
      .map(item => item.name).sort();
    const floor = minimums[app];
    if (!Number.isSafeInteger(floor) || floor < 1) {
      throw new Error('INVALID_TEST_FLOOR: ' + app);
    }
    if (testFiles.length < floor) {
      throw new Error('INCOMPLETE_TEST_SUITE: ' + app + ' has ' +
        testFiles.length + ', requires at least ' + floor);
    }
    suites[app] = testFiles.length;
    for (const file of testFiles) {
      files.push({
        absolute: path.join(dir, file),
        relative: 'apps/' + app + '/tests/' + file,
      });
    }
  }

  const digest = createHash('sha256');
  for (const item of files) {
    digest.update(item.relative);
    digest.update('\0');
    digest.update(fs.readFileSync(item.absolute));
    digest.update('\0');
  }
  return { testRoot: root, suites, total: files.length - 1,
    registrySha256: digest.digest('hex') };
}

module.exports = { MINIMUM_SUITES, validateExternalTestRegistry };
