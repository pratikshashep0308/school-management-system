# FMS Operations Runbook

**The Future Step School — Financial Management System**
For whoever operates this system day to day.

---

## Before anything else: is it on?

```bash
curl -s https://portal.thefuturestepschool.in/api/fms/status
```

- `"enabled": true` — the plugin is running
- `404` or `"enabled": false` — `FMS_ENABLED` is unset, and **the SMS is completely unaffected**. That is the design: the FMS can be switched off and the school management system carries on.

**Production currently has the FMS switched OFF.** All the code is deployed; the plugin is dormant. Turning it on is setting `FMS_ENABLED=true` and restarting.

---

## ⚠️ The three things nobody will tell you

### 1. Online fee payments do not reach the bank on their own

Every `online` and `upi` fee receipt posts to **`1202 Bank — Online Collections`**, not to the bank account. That is deliberate — the money has not settled yet, and posting it to the bank would overstate the balance.

**It stays there until somebody settles it.**

```
GET  /api/fms/integrations/settlements/pending
POST /api/fms/integrations/settlements
```

The bank shows **one** credit for a day's collections; the clearing head holds a dozen individual receipts. Settlement is what turns many into one, and it has to happen before bank reconciliation can work.

**This is a weekly task that needs an owner.** If nobody does it, `1202` grows indefinitely and the bank balance reads low. `/settlements/status` warns once anything has been sitting a fortnight — at which point either the money never arrived or nobody has been settling.

### 2. Notifications are built but nothing triggers them

The eleven events, the dispatch, the preferences and the log all work. **No service calls `notify()` yet.** No approval or budget breach sends anything.

Wiring is safe and additive — `notify()` cannot throw — but until it is done, do not expect emails.

### 3. There is no automated backup

Flagged since discovery, still open. A nightly `mongodump` cron exists for the database, but there is no tested restore and no off-server copy.

**Before go-live, prove a restore works.** An untested backup is a hope.

---

## Daily

**Close the cash.** Someone counts the cash and records it:

```
POST /api/fms/books/close
     { account, date, physicalCount, varianceReason? }
```

A variance opens the closing as `disputed` and it must be verified by **someone other than the counter**. A verified variance then posts to the ledger — until it does, the books say the tin holds more than it does.

A day left open cannot be reconciled later against what was actually there.

---

## Weekly

**Settle online collections** — see above.

**Run the fee ingest** if it is not on a cron:

```
POST /api/fms/integrations/fees/sync    { "dryRun": true }   ← always first
POST /api/fms/integrations/fees/sync
```

The dry run resolves every payment and reports what would happen without writing anything. It will surface any fee type that needs an account mapping **before** a single posting is made.

Replays are safe — the idempotency key makes a second run a no-op, not a double-post.

---

## Monthly

**Bank reconciliation.**

1. Export the statement as CSV
2. `POST /api/fms/banking/statements/import`
3. `POST /api/fms/banking/match` — auto-matches what it is confident about
4. Resolve the rest by hand
5. `POST /api/fms/banking/reconcile`

A reconciliation completes **only when it balances**:

```
statement − ledger = unpresented cheques − deposits in transit + charges not booked + other
```

If that does not hold, something is missing. The system refuses rather than letting you close over it.

**Once a period is reconciled, no posting can be dated into it** — including a journal voucher. That is enforced at the posting layer, not just in the banking screens.

---

## Financial year end

```
GET  /api/fms/financial-years/{id}/readiness   ← what argues against closing
POST /api/fms/financial-years/{id}/close
POST /api/fms/financial-years/{id}/lock        ← IRREVERSIBLE
```

**An unbalanced year cannot be closed.** Closing it would freeze the error in place and make it somebody else's problem.

**`closed` can be reopened. `locked` cannot.**

- Reopening needs chairman, trustee or principal, a real reason, and is audited
- Locking requires typing the year code back, because there is no undo
- After locking, a correction can only be made by posting into the **current** year — which is what an auditor expects to see

If a locked year could be reopened, locking would be a suggestion.

---

## Adding things

**A new account head**

```
POST /api/fms/accounts
```

Must belong to a group, and the code determines its type. An account that has been posted to cannot be edited into a different type — the history would stop meaning what it said.

**Withdrawing one:** accounts and groups are **deactivated, never deleted**. They stop accepting postings and disappear from pickers, but the record that somebody created and withdrew them survives. A group must be empty first, or its children would be orphaned.

**A new fee type mapping**

When the SMS gains a fee type, the FMS must be told where its money goes:

```
PUT /api/fms/integrations/mappings
    { mappingType: "feeType", sourceKey: "<FeeType._id>", account: "<account._id>" }
```

Until then, **fee ingest will fail for that type and say so**. It does not quietly pool the money into "unclassified" — that would hide a new fee type for a year.

**A new branch**

Every FMS collection carries `school`. A new branch needs its own chart of accounts, financial year and number sequences. Consolidated reporting across branches requires a `multiBranch` role assignment — a single-branch user cannot consolidate.

---

## When something looks wrong

**"The trial balance does not balance"**

It cannot, by construction — every posting goes through one service that rejects unbalanced entries inside a transaction. If it does not balance, something wrote to `fms_ledgerentries` outside that service.

```
GET /api/fms/reports/verify
```

Three identities: trial balance balances, assets = liabilities + equity, and the period result in equity equals the P&L surplus.

**"A figure on a report looks wrong"**

Every report is computed from the ledger at request time. Nothing is cached except the dashboard, for 60 seconds, and it always says so:

```
GET /api/fms/dashboard?live=true      ← bypass the cache
POST /api/fms/dashboard/refresh       ← clear it
```

**"Who changed this?"**

```
GET /api/fms/audit/history/{entity}/{entityId}
```

Everything is audited with before/after, actor, role and IP. Nothing can be deleted — 31 of 32 collections refuse it at the model layer.

---

## Running the tests

```bash
cd backend

node fms/test/runAll.js --unit      # 415 tests, no database, 4 seconds
node fms/test/runAll.js             # everything, ~45 seconds
node fms/test/traceability.js       # UAT coverage against the 400 cases
node fms/services/performance/indexAudit.check.js   # query plans, read-only
node fms/docs/specCoverage.js       # how much of the API is documented
```

**Run `--unit` on every change.** Run the full suite before any production deploy.

The integration checks each create and drop their own `<db>_fmscheck<pid>` database. They never touch live data. `indexAudit.check.js` is the one exception — it reads the live database, because query plans depend on real data. It writes nothing.

---

## Deploying

```bash
# staging first, always
cd /root/school-management-system && git pull && cd backend
node fms/migrations/_runner.js up
node fms/test/runAll.js
pm2 restart staging-backend --update-env
curl -s http://localhost:5000/api/fms/status

# production, only after staging is green
cd ~/school-management-system && git pull && cd backend
node fms/test/runAll.js --unit
node fms/migrations/_runner.js up     # only when enabling the FMS
```

**Staging's `frontend/.env.production` and `public/index.html` differ from production deliberately** — the API URL and the STAGING banner. Never `git checkout .` on staging; it would point the staging frontend at the production database.

---

## Migrations

```bash
node fms/migrations/_runner.js status
node fms/migrations/_runner.js up
node fms/migrations/_runner.js down <id>     # refuses if data exists
```

Migrations 001–004 and 006–022 are applied. **005 is deliberately blocked** — it seeds the Chart of Accounts, and those codes need an accountant's sign-off (see O3 in the go-live checklist).

Rollbacks refuse when live data exists. That is intentional: dropping a collection with postings in it is not something a command should do quietly.