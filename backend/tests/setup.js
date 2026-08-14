/**
 * Shared test setup (BP-001).
 *
 * Guard: the integration tier must never run against the working database.
 * If MONGO_URI_TEST is unset, integration tests are skipped and reported as
 * NOT EXECUTED — ENVIRONMENT UNAVAILABLE. If it is set but identical to
 * MONGO_URI, we abort: the suites seed and wipe data.
 */
const testUri = process.env.MONGO_URI_TEST;
const workingUri = process.env.MONGO_URI;

if (testUri && workingUri && testUri.trim() === workingUri.trim()) {
  throw new Error(
    'MONGO_URI_TEST is identical to MONGO_URI. The test suites seed and wipe ' +
    'data; running them against the working database would destroy it.'
  );
}

global.__DB_AVAILABLE__ = Boolean(testUri && testUri.trim());

/** describeWithDb — runs a block only when a test database is configured. */
global.describeWithDb = global.__DB_AVAILABLE__ ? describe : describe.skip;

if (!global.__DB_AVAILABLE__ && process.env.JEST_ANNOUNCE_DB !== 'quiet') {
  // Printed once so a skipped tier is never mistaken for a passing one.
  console.log(
    '\n[tests] MONGO_URI_TEST not set — integration tier: NOT EXECUTED — ENVIRONMENT UNAVAILABLE\n'
  );
}
