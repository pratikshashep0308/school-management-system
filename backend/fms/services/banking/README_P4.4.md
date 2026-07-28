# P4.4 — Banking & Reconciliation · Deploy & Verify

**Delivers:** bank accounts · deposits/withdrawals/transfers · statement import · auto + manual matching · reconciliation with period lock · migration 016 · **52 unit tests**
**SRS:** M9 / FR-M9 · BPMN WF7 · SCR-36..42
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/services/banking/statementMatcher.js` | new — pure parsing + matching |
| `backend/fms/services/banking/statementMatcher.test.js` | new — 52 unit tests |
| `backend/fms/services/banking/bankingService.js` | new |
| `backend/fms/services/banking/banking.check.js` | new |
| `backend/fms/models/banking/index.js` | new — 3 collections |
| `backend/fms/routes/banking.js` | new |
| `backend/fms/migrations/scripts/016_banking.js` | new |
| `backend/fms/services/ledger/LedgerPostingService.js` | **REPLACES** — period lock |
| `backend/fms/middleware/fmsErrorHandler.js` | **REPLACES** — new error code |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/banking` |

No new dependencies.

---

## A note on this build

A complete P4.4 was written earlier in the session and I lost it from context, then rebuilt the matcher under a second name. Both versions worked and both had passing tests.

**I kept the original set and deleted the duplicate.** Two matchers in one repo, one of them dead code, is the kind of thing that costs someone an afternoon later.

One piece of the rebuild was worth keeping and has been merged in — see below.

---

## The reconciled period lock

This is the change to `LedgerPostingService`, and it is the point of the module.

The original enforced the lock inside the banking service. That covers banking routes — but a **journal voucher** could still post into a reconciled month, and a reconciliation that can be silently altered afterwards has not reconciled anything.

The check now sits at the posting layer, so it applies to every path into the ledger:

```
BANK_PERIOD_RECONCILED → 409
"Bank — Current is reconciled up to 2026-07-31; a posting dated
 2026-07-15 would change a closed period"
```

It only looks up accounts flagged `isBankAccount`, so there is no cost for ordinary postings. `assertPeriodOpen` remains in the banking service as a second line — belt and braces is right for a control like this.

---

## What reconciling actually means

Not "the two numbers are equal" — they almost never are. It means every difference is **identified**:

```
statement closing − ledger closing
  = unpresented cheques − deposits in transit + charges not booked + other
```

A reconciliation completes only when that holds. An unexplained difference means something is missing, and closing the period would bury it.

---

## Three things the parser gets right

**Commas inside narrations.** `"NEFT CR-SBIN123, SHARMA STATIONERS, INV 4471"` is one field. Naive splitting mangles it, and the damage surfaces weeks later as an unmatchable line. Full RFC 4180 parsing — quoted fields, escaped quotes, embedded newlines.

**Ambiguous dates read day-first.** `03/04/2026` is 3 April. Reading it as 4 March would shift a transaction by a month, silently. A month above 12 is rejected rather than guessed.

**Unparseable rows are reported, not dropped.** A silently skipped line is a transaction the reconciliation will never know is missing.

---

## The sign convention flips

A bank **credit** (money into the account) is a **debit** to the school's bank ledger account. Getting this backwards is the classic reconciliation error, and there are tests asserting it in both directions.

---

## Two guards on matching

**An entry is claimed by at most one line.** Two identical statement lines against one ledger entry: the better score wins, the other waits for a person. Matching both would double-count.

**A manual match still has to be arithmetically possible.** Overriding the amount check would let a reconciliation "balance" on entries that are not the same transaction.

**Re-importing a statement is harmless.** Each line carries a hash; duplicates are counted and skipped. A double click or an overlapping month is a normal accident, and without this it doubles every transaction.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\models\banking,backend\fms\services\banking | Out-Null
# save the 10 files
cd backend
node --test fms/services/banking/statementMatcher.test.js
node --test fms/services/ledger/posting.test.js
node --test fms/docs/contract.test.js
cd ..
git add -A
git commit -m "P4.4: Banking & Reconciliation (M9, WF7)"
git push
```

Expect `# pass 52`, `# pass 23`, `# pass 28`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/services/banking/statementMatcher.test.js
node fms/migrations/_runner.js up
node fms/services/banking/banking.check.js 2>&1 | tail -30
pm2 restart staging-backend --update-env
```

### Production

```bash
cd ~/school-management-system && git pull
```

---

## Running totals

| Phase | Checks |
|---|---|
| Phase 1 | 35 |
| Phase 2 | 200 |
| Phase 3 | 226 |
| P4.1–P4.3 | 161 |
| P4.4 | 52 unit |

**255 unit/contract tests · ~622 integration checks.**

---

## Next

**P4.5 Petty Cash** closes Phase 4. Then Phase 5 — fee ingest, where the FMS meets the ~500 real fee payments this school handles.