# P4.1 — Budget Management · Deploy & Verify

**Delivers:** budgets with derived actuals · revision workflow · Budget vs Actual · configurable over-budget policy · migration 013 · 7 OpenAPI paths · ~55 integration checks
**SRS:** M6 / FR-M6 · SCR-22/23/24/25
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/models/budget/index.js` | new — `fms_budgets` |
| `backend/fms/services/budget/budgetService.js` | new |
| `backend/fms/services/budget/budget.check.js` | new |
| `backend/fms/routes/budget.js` | new — 7 endpoints |
| `backend/fms/migrations/scripts/013_budgets.js` | new |
| `backend/fms/services/expense/expenseService.js` | **REPLACES** — now delegates |
| `backend/fms/docs/openapi.js` | **REPLACES** — 60 paths, 24 schemas |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/budgets` |

No new dependencies.

---

## The double-counting trap

A paid expense exists **twice**: as a ledger entry, and as an expense request. Sum both and every paid expense counts double — the budget looks exhausted at half its real spend, and nobody spots it because the arithmetic is internally consistent.

```
actual     = posted to the ledger              money gone
committed  = approved but NOT yet paid          money promised
consumed   = actual + committed                 no overlap
available  = effectiveBudget − consumed
```

`committed` deliberately excludes `paymentCompleted` and `closed` — those are already in `actual`. There is an assertion named `A PAID EXPENSE IS NOT COUNTED TWICE`.

---

## Actuals are derived, never stored

There is no `actualSpending` field and no `availableBalance` field. Both are computed at query time from `fms_ledgerentries` and `fms_expenserequests`.

A stored figure would be a second copy of the ledger, drifting the first time anything posted outside the update path — and a budget report that disagrees with the ledger is worse than no report at all. Section 10 asserts those fields are absent from the stored document.

What **is** stored is the allowance: how much may be spent, who revised it, and why.

---

## expenseService now delegates

P3.2 computed committed spend itself. It now calls `budgetService.checkAvailability`.

Two implementations of "how much is left" would eventually disagree, and which answer someone saw would depend on which screen they opened. One implementation, one answer.

The `notChecked` behaviour is unchanged: when no live budget exists the check reports `checked: false`, not `ok`.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\models\budget,backend\fms\services\budget | Out-Null
# save the 8 files
cd backend
node --check fms/models/budget/index.js
node --check fms/services/budget/budgetService.js
node --check fms/services/expense/expenseService.js
node --check fms/routes/budget.js
node --check fms/migrations/scripts/013_budgets.js
node --test fms/docs/contract.test.js
node -e "const s=require('./fms/docs/openapi'); console.log(Object.keys(s.paths).length+' paths, '+Object.keys(s.components.schemas).length+' schemas')"
cd ..
git add -A
git commit -m "P4.1: Budget Management (M6)"
git push
```

Expect `# pass 28` and `60 paths, 24 schemas`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node fms/migrations/_runner.js up
node fms/services/budget/budget.check.js
node fms/services/expense/expense.check.js
pm2 restart staging-backend --update-env
```

Re-run `expense.check.js` too — P3.2's budget path now goes through the new service, and that check should still pass unchanged.

### Production

```bash
cd ~/school-management-system && git pull
```

---

## The P4.1 verification

The brief asks: *set a budget, post expenses beyond it, and confirm Budget vs Actual reflects spend and the over-budget control fires.*

Section 1 does exactly that:

1. ₹20,000 budget created as a **draft** — and a draft is confirmed **not** consulted
2. Activated
3. ₹8,000 expense approved and **paid** → `ACTUAL ROLLS UP FROM REAL POSTINGS`
4. ₹5,000 expense approved but unpaid → counted as **committed**, not actual
5. `consumed = 13,000`, and the double-count assertion holds
6. ₹10,000 request → **`OVER-BUDGET SUBMISSION BLOCKED`**, stays in draft
7. Resubmitted with acknowledgement → accepted, recorded as `exceeded`
8. Budget vs Actual shows the head over budget and counts it in the totals

---

## Three behaviours worth knowing

**Revisions preserve the original.** `budgetAmount` is never overwritten; `revisedBudget` sits beside it with the full revision history. "What was originally allocated" stays answerable at year end.

Revising **below** what has already been consumed is permitted, with a warning rather than a refusal — it records a real decision (the money is spent) instead of pretending it cannot happen.

**The over-budget policy is per budget.** `block` refuses unless acknowledged; `warn` allows and flags. Section 3 proves a `warn` head lets an over-budget request through with no acknowledgement while still recording it as exceeded.

**A reversed payment releases budget.** Section 9 pays ₹20,000, bounces the cheque, and confirms `actual` returns to zero while the amount comes back as `committed` — the expense is payable again, so the money is promised but no longer gone.

---

## Check coverage — ~55 assertions

```
1  P4.1 VERIFICATION  draft not consulted · actual from real postings
                      committed ≠ actual · A PAID EXPENSE IS NOT COUNTED TWICE
                      OVER-BUDGET BLOCKED · acknowledgement · vs-actual reflects it
2  Warning threshold  80% quiet · 95% warns without blocking
3  Policy             'warn' allows without acknowledgement, still records exceeded
4  Revision           reason required · no-op rejected
                      ORIGINAL PRESERVED · effective = revision
                      revising below consumed is allowed WITH A WARNING
5  Head validation    income head · non-postable · duplicate · float
6  Status rules       draft editable · live must be revised · closed terminal
                      never deleted
7  Department scope   a department budget beats the school-wide one
8  Unbudgeted         checked:false not ok · request still submits
9  Reversal           A REVERSED PAYMENT RELEASES THE BUDGET
10 Derived            no actualSpending or availableBalance stored · audited
```

---

## Running totals

| Phase | Checks |
|---|---|
| Phase 1 | 35 |
| Phase 2 | 200 |
| Phase 3 | 226 |
| P4.1 | ~55 |

**131 unit/contract tests · ~516 integration checks.**

---

## Next

**P4.2 Vendor Management**, then P4.3 Purchase, P4.4 Banking, P4.5 Petty Cash.

Worth remembering the gap analysis view: Phase 4 is correctness infrastructure for a scale this school has not reached — 2 expense records, 4 salary slips. **Phase 5 (fee ingest)** is where the FMS meets money the school genuinely handles, and where P0.3's F1 finding lives.