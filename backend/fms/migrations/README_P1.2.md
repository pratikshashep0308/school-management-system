# P1.2 — Database Migrations · Deploy & Verify

**Delivers:** migration runner + 10 foundational `fms_` collections + seeds
**Status:** migrations 001–004 ready · **005 (Chart of Accounts) is blocked pending O3**
**Deploy to:** staging only

---

## What's in this drop

| File | Purpose |
|---|---|
| `backend/fms/models/core/index.js` | 10 foundational Mongoose models |
| `backend/fms/migrations/_runner.js` | Migration runner — `status` / `up` / `down` / `verify` |
| `backend/fms/migrations/scripts/001_core_collections.js` | Collections + indexes |
| `backend/fms/migrations/scripts/002_seed_financial_year.js` | Current FY + settings |
| `backend/fms/migrations/scripts/003_seed_number_sequences.js` | Voucher numbering |
| `backend/fms/migrations/scripts/004_seed_account_groups.js` | Account-group tree |
| `backend/fms/migrations/scripts/005_seed_chart_of_accounts.js` | **BLOCKED** — see below |

Collections created: `fms_financialyears`, `fms_accountgroups`, `fms_accounts`,
`fms_vouchers`, `fms_ledgerentries`, `fms_numbersequences`, `fms_ingeststate`,
`fms_roleassignments`, `fms_settings`, `fms_audittrail`.

---

## Two corrections to the Database Design Document

Both were found while implementing it. Worth fixing in the source document.

### 1. Model names must be `Fms`-prefixed — this one is dangerous

The DB Design's sample code uses:

```js
module.exports = mongoose.models.Account || mongoose.model('Account', AccountSchema);
```

If a model of that name is already registered, `mongoose.models.X` returns **the
existing model**. The SMS registers `Notification`, `Report` and `Expense` — all
three are also FMS collection names.

Without a prefix, `mongoose.models.Notification` would hand the FMS the SMS
model, and the FMS would read and write the `notifications` collection instead of
`fms_notifications`. No error. No warning. Exactly the boundary violation the
plugin architecture exists to prevent, arriving silently.

Verified in a test: the naive pattern does return `collectionName: 'notifications'`.

Every model here is therefore `FmsAccount`, `FmsLedgerEntry`, and so on.

### 2. `{ collection: ... }` was never set

The doc's conventions require it; its code samples omit it. Mongoose would derive
`accounts`, `vouchers`, `ledgerentries` — unprefixed. Every model here sets it
explicitly, all lowercase, which also resolves the doc's own inconsistency
between `fms_ledgerEntries` and `fms_ledgerentries`.

---

## Deploy (staging)

```powershell
# Windows
cd C:\Users\Admin\Desktop\school-management-systems
git add -A
git commit -m "P1.2: FMS migration runner + foundational collections"
git push
```

```bash
# Staging
cd /root/school-management-system
git pull
cd backend
node --check fms/models/core/index.js
node --check fms/migrations/_runner.js
```

### Dry run first

```bash
node fms/migrations/_runner.js status
```

Expected: 001–004 `pending`, 005 listed as **BLOCKED**. Nothing has been written
yet — `status` is read-only.

The runner refuses to start at all if `mongod` is not a replica set.

### Apply

```bash
node fms/migrations/_runner.js up
```

It applies 001 → 004, then stops at 005 and reports why.

### Verify

```bash
node fms/migrations/_runner.js verify
```

Confirm: 10 `fms_` collections, SMS collection count unchanged, and the unique
index `school_source_sourceId` present on `fms_ingeststate`.

### Prove reversibility — do this before trusting it

```bash
node fms/migrations/_runner.js down --all
node fms/migrations/_runner.js status      # all pending again
node fms/migrations/_runner.js up          # re-apply
node fms/migrations/_runner.js verify
```

A migration you have never rolled back is not reversible; it is only untested.

### Confirm the SMS is unaffected

```bash
mongosh --quiet --eval 'const d=db.getSiblingDB("school_management"); ["students","users","feepayments","studentfees"].forEach(c=>print(c.padEnd(14), d[c].countDocuments()))'
curl -s http://localhost:5000/api/health; echo
curl -s http://localhost:5000/api/fms/health; echo
```

Expect **211, 235, 186, 160** unchanged.

---

## Migration 005 is blocked on purpose

`005_seed_chart_of_accounts.js` exports `blocked: 'O3 — ...'`, and the runner
stops rather than applying it.

The account codes in it are the proposals from
`docs/discovery/04_integration_plan.md` §8. Nobody who understands this school's
books has reviewed them.

Once a ledger entry exists against an account, changing that account's code means
migrating every posting that references it — and because `fms_ledgerentries`
denormalises `accountCode` as a snapshot, historical entries would carry the old
code while the account carries the new one. Seeding unreviewed codes is free
today and expensive in three months.

**To unblock:**

1. Have the school's accountant review §8 of `04_integration_plan.md`
2. Correct the `ACCOUNTS` table in `005_seed_chart_of_accounts.js`
3. Delete the `blocked:` line
4. `node fms/migrations/_runner.js up`

Its `down()` also refuses to run if any account already carries ledger entries.

---

## Design notes

**The runner's core guard.** Every migration declares a `collections` array, and
the runner refuses to execute any migration whose declared collections are not
all `fms_`-prefixed. That makes "the FMS never modifies an SMS collection" an
enforced invariant rather than a code-review convention. Tested: it rejects
`['students']` and rejects `['fms_accounts', 'users']`.

Migrations 002–004 do *read* the SMS `schools` collection to obtain the tenant
id. Reads are permitted — the constraint is on writes.

**`fms_ledgerentries` is append-only**, enforced at the model layer: `updateOne`,
`updateMany`, `findOneAndUpdate`, `deleteOne`, `deleteMany` and
`findOneAndDelete` all throw. Corrections post a reversing voucher.
`fms_audittrail` is the same.

**The unique index on `{school, source, sourceId}`** in `fms_ingeststate` is what
makes idempotency a database property rather than a code promise. Two concurrent
ingest runs cannot double-post: the second insert throws E11000, which the ingest
service catches as "already posted".

**Money is integer paise**, validated at the schema layer — `debit: 123.45`
is rejected, not silently rounded.

**Hooks use async-throw, not callback `next`.** Mongoose 9 dropped the `next`
argument for document middleware. The server runs `^8.4.1`, where both styles
work, but async-throw works on 8 and 9 — so an eventual upgrade won't break the
ledger validator. The mutation blockers are registered with
`{ query: true, document: false }`; without that, Mongoose registers
`updateOne`/`deleteOne` as document middleware as well and legitimate inserts
would be blocked.

---

## Test results

Against Mongoose 8.24.1 (what `^8.4.1` resolves to on the server):

```
Runner guards                        11/11 passed
  migrations load, ordered, 005 blocked
  guard rejects ['students']
  guard rejects ['fms_accounts','users']
  guard rejects empty declaration

Models                               12/12 passed
  10 models, all Fms-prefixed
  all collections fms_-prefixed and lowercase
  no collision with SMS Notification/Report/Expense
  ledger rejects both-zero / both-non-zero / float / negative
  ledger accepts debit-only and credit-only
  ledger blocks updateOne and deleteOne
```

---

## Not in this drop

The remaining ~23 domain collections (vendors, purchase orders, budgets, bank
accounts, petty cash and so on) are **deliberately not here**. Their migrations
belong with the modules that use them, in Phases 3–4. Creating 23 empty
collections now would mean writing schemas from table specifications without the
code that exercises them — and every one would be untested until its phase
arrives anyway.

The 10 here are the ones P1.3 (auth) and P1.4 (the posting engine) actually need.

---

## Next

**P1.3** — `fms_roleAssignments` seeding and the full `fmsAuthorize` lookup. Not
blocked; the collection exists after this drop.

**P1.4** — `LedgerPostingService`. Needs the Chart of Accounts, so it is blocked
behind O3 in practice even though the collections are ready.