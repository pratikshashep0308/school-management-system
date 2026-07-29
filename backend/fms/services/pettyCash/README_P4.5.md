# P4.5 — Petty Cash · Deploy & Verify

**Delivers:** imprest floats · issue/expense/replenish/return · variance posting · petty cash book · migration 017
**SRS:** M10 / FR-M10 · BPMN WF9 · SCR-43/44/45
**Completes Phase 4.**
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/models/pettyCash/index.js` | new — floats + transactions |
| `backend/fms/services/pettyCash/pettyCashService.js` | new |
| `backend/fms/services/pettyCash/pettyCash.check.js` | new |
| `backend/fms/routes/pettyCash.js` | new |
| `backend/fms/migrations/scripts/017_petty_cash.js` | new |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/petty-cash` |

No new dependencies.

---

## What this deliberately does NOT build

Daily closing — physical count, variance, verification by a second person — **already exists** in `bookService` from P2.4, and works on any account flagged `isCashAccount`. A petty cash account is one.

Building a parallel closing here would mean two places a variance could be recorded, and eventually two answers to "was the cash counted?". The check asserts no `fms_pettycashclosings` collection exists and that the shared `fms_dailyclosings` was used.

Migration 017 declares `dependsOn: ['001_core_collections', '008_daily_closings']` so that reuse is explicit rather than incidental.

**Closing a petty cash day therefore goes through `/api/fms/books/close`**, not a petty-cash-specific endpoint.

---

## What is genuinely new

The imprest arrangement: a named custodian holds a fixed float, spends from it, and has it topped back up to the original amount.

```
float          Dr Petty Cash        Cr Bank/Cash     the tin is filled
expense        Dr <expense head>    Cr Petty Cash    money leaves the tin
replenishment  Dr Petty Cash        Cr Bank/Cash     topped back up
return         Dr Bank/Cash         Cr Petty Cash    unspent cash handed back
adjustment     posted from a VERIFIED closing variance
```

The balance is never stored — it is Σ(debit − credit) on the petty cash head, exactly like the cash book. Section 8 asserts the float position, the trial balance and the cash book all agree.

---

## A verified variance reaches the books

This is the part worth reading. A counted shortfall is **real money gone**. Until it is posted, the ledger says the tin holds more than it does.

Section 2 walks it end to end:

1. ₹5,000 float issued, ₹450 and ₹1,200 spent → books say ₹3,350
2. Count finds ₹3,300 — **₹50 short**
3. A cash close without a count is refused
4. A variance without a reason is refused
5. The closing opens as **`disputed`**, not closed
6. **The variance cannot be posted while unverified**
7. The person who counted **cannot verify their own count**
8. A second person verifies with a note — and **the variance is not erased by verification**
9. Now it posts: `Dr Cash Shortage ₹50 / Cr Petty Cash ₹50`
10. The books agree with the tin
11. The same variance cannot be posted twice

---

## Guards

| | |
|---|---|
| Cannot spend more than is in the tin | physically impossible, so the request means something is wrong |
| A single expense above the float's limit | petty cash is for small sums; raise an expense request |
| Spending must go to an expense head | not to a bank or asset account |
| Cannot cancel an entry on a **closed day** | the count attested to a figure; it must not change afterwards |
| Cannot close a float still holding cash | it would leave money nobody is answerable for |
| Two floats cannot share a cash head | "how much is in the tin" would be unanswerable |
| Entries are cancelled, never deleted | small money, weak controls — the record must be complete |

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\models\pettyCash,backend\fms\services\pettyCash | Out-Null
# save the 6 files
cd backend
node --check fms/models/pettyCash/index.js
node --check fms/services/pettyCash/pettyCashService.js
node --check fms/services/pettyCash/pettyCash.check.js
node --check fms/routes/pettyCash.js
node --check fms/migrations/scripts/017_petty_cash.js
node --test fms/docs/contract.test.js
cd ..
git add -A
git commit -m "P4.5: Petty Cash (M10, WF9)"
git push
```

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node fms/migrations/_runner.js up
node fms/services/pettyCash/pettyCash.check.js 2>&1 | tail -35
pm2 restart staging-backend --update-env
```

### Production

```bash
cd ~/school-management-system && git pull
```

---

## The P4.5 verification

The brief asks: *record issues/expenses, run a daily close with a deliberate variance, and confirm it is captured and requires approval.*

That is section 2 above, in full. Section 3 covers the other stated test — **the closing balance carries forward**: 3 July opens at ₹3,300, exactly where 2 July closed.

---

## Phase 4 complete

| | |
|---|---|
| P4.1 Budgets | 58 checks |
| P4.2 Vendors | 50 checks |
| P4.3 Purchase | 53 checks |
| P4.4 Banking | 40 checks |
| P4.5 Petty Cash | this run |

**255 unit/contract tests · 662+ integration checks.**

---

## Next

**Phase 5 — Integrations.** P5.1 is fee collection into the FMS, which is where this system finally meets the ~500 real payments the school handles, and where P0.3's **F1** finding lives (the `payAssignment` mirror gap that would under-report income).

**O3** — the Chart of Accounts sign-off — remains what turns all of this from tested into usable.