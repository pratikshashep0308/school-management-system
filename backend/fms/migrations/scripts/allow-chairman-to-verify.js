// backend/fms/migrations/scripts/allow-chairman-to-verify.js
//
// Let the chairman perform the accounts-verification step.
//
//   cd backend && node fms/migrations/scripts/allow-chairman-to-verify.js
//
// ─── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────
// Every approval chain begins with an `accounts` verification step, whatever
// the amount. Only 'accountant' and 'accountsManager' may perform it.
//
// Separately, nobody may act on their own request — enforced at every step, not
// just the approvals.
//
// This school has ONE accountant. So an expense they raise cannot be verified
// by them (their own request) and cannot be verified by anybody else (no other
// accounts-role holder). It sits `submitted` with no legal next move, and the
// chairman never sees it because the chain has not reached an approval step.
//
// That is not a defect in the workflow — it is a workflow designed for a
// finance office with more than one person, meeting a school that has one.
//
// ─── WHAT THIS CHANGES ───────────────────────────────────────────────────────
// Adds 'chairman' to ROLE_FOR_STEP.accounts, so the chairman can verify what
// the accountant raised. Combined with chairman-only approval tiers, the flow
// becomes:
//
//   accountant raises  →  chairman verifies  →  chairman approves  →  payment
//
// ─── WHAT IT COSTS, STATED PLAINLY ───────────────────────────────────────────
// Verification and approval by the same person is weaker than two people doing
// them. The control that survives is real but smaller: the person who SPENDS
// is not the person who APPROVES.
//
// The stronger arrangement is a second finance account — an accounts manager
// who verifies, leaving the chairman to approve. If the school ever appoints
// one, run this with --restore and the two steps separate again.
//
// This edits a source file rather than data, because ROLE_FOR_STEP is a
// constant in approvalMatrix.js and not per-school configuration. Backup is
// written alongside it.

const fs = require('fs');
const path = require('path');

const RESTORE = process.argv.includes('--restore');

const FILE = path.join(__dirname, '..', '..', 'services', 'approval', 'approvalMatrix.js');
const BACKUP = `${FILE}.bak`;

const WITHOUT = "  accounts: ['accountant', 'accountsManager'],";
const WITH =
  "  // 'chairman' added " + new Date().toISOString().slice(0, 10) + ": this school has a\n" +
  "  // single accountant, and nobody may act on their own request — so an expense\n" +
  "  // they raise could never be verified by anyone. See\n" +
  "  // migrations/scripts/allow-chairman-to-verify.js for the reasoning and how\n" +
  "  // to reverse it once a second finance person exists.\n" +
  "  accounts: ['accountant', 'accountsManager', 'chairman'],";

function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`Not found: ${FILE}`);
    process.exit(1);
  }

  const src = fs.readFileSync(FILE, 'utf8');

  if (RESTORE) {
    if (!src.includes("'accountant', 'accountsManager', 'chairman'")) {
      console.log('Already restored — chairman is not on the accounts step.');
      process.exit(0);
    }
    const restored = src.replace(WITH, WITHOUT);
    if (restored === src) {
      // The comment block may have been edited since. Fall back to the array.
      const fallback = src.replace(
        "accounts: ['accountant', 'accountsManager', 'chairman'],",
        "accounts: ['accountant', 'accountsManager'],"
      );
      if (fallback === src) {
        console.error('Could not find the line to restore. Edit approvalMatrix.js by hand.');
        process.exit(1);
      }
      fs.writeFileSync(FILE, fallback);
    } else {
      fs.writeFileSync(FILE, restored);
    }
    console.log('Restored: accounts step is accountant + accountsManager only.');
    console.log('Restart the backend for it to take effect.');
    process.exit(0);
  }

  if (src.includes("'accountant', 'accountsManager', 'chairman'")) {
    console.log('Already applied — chairman can already verify.');
    process.exit(0);
  }

  if (!src.includes(WITHOUT)) {
    console.error('The accounts step does not look as expected. Not changing anything.');
    console.error(`Check ROLE_FOR_STEP in ${FILE}`);
    process.exit(1);
  }

  fs.writeFileSync(BACKUP, src);
  fs.writeFileSync(FILE, src.replace(WITHOUT, WITH));

  console.log('Applied. The accounts step now accepts: accountant, accountsManager, chairman.');
  console.log(`Backup written to ${path.basename(BACKUP)}`);
  console.log('\nFlow is now:');
  console.log('  accountant raises  →  chairman verifies  →  chairman approves  →  payment');
  console.log('\n⚠  Verification and approval by the same person is a weaker control than');
  console.log('   two people doing them. What survives is that the person who SPENDS is');
  console.log('   not the person who APPROVES. A second finance account would be better.');
  console.log('\nRestart the backend:  pm2 restart staging-backend');
  console.log('To undo:  node fms/migrations/scripts/allow-chairman-to-verify.js --restore');
}

main();
