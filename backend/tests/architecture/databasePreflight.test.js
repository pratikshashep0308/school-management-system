/**
 * FP-093 — the database deliverable preflight must pass as part of regression.
 * Runs the static preflight checker and asserts a clean exit.
 */
const { execFileSync } = require('child_process');
const path = require('path');

test('FP-093 database preflight passes (complete, consistent, read-only validation)', () => {
  const script = path.resolve(__dirname, '../../../database/preflight.js');
  let code = 0;
  try {
    execFileSync('node', [script], { stdio: 'pipe' });
  } catch (e) {
    code = e.status || 1;
  }
  expect(code).toBe(0);
});
