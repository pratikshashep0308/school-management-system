/**
 * Jest configuration — TFS-EOS Delta Build (BP-001)
 *
 * Test tiers follow the build gate classification:
 *   tests/unit            LOCAL UNIT GATE      — no external infrastructure
 *   tests/architecture    STATIC GATE          — module-graph assertions
 *   tests/characterisation LOCAL UNIT GATE     — pins existing behaviour, no DB
 *   tests/integration     ENVIRONMENT GATE     — requires MONGO_URI_TEST
 *
 * The integration tier is skipped, not failed, when MONGO_URI_TEST is absent.
 * A skipped environment test is never reported as a pass.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 20000,
  collectCoverageFrom: [
    'models/**/*.js', 'services/**/*.js', 'controllers/**/*.js',
    'middleware/**/*.js', 'utils/**/*.js',
    '!fms/**',
  ],
  verbose: true,
};
