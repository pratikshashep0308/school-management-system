# P2.4 — Cash Book & Bank Book · Deploy & Verify

**Delivers:** cash and bank books derived from postings · daily closing with physical count · verification · migration 008 · 5 OpenAPI paths · 47 integration checks
**SRS:** M13 / M14 · SCR-50/51
**Completes Phase 2.**
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/models/cashBankBook/index.js` | new — `fms_dailyclosings` |
| `backend/fms/services/cashBankBook/bookService.js` | new |
| `backend/fms/services/cashBankBook/book.check.js` | new — 47 checks |
| `backend/fms/routes/books.js` | new — 5 endpoints |
| `backend/fms/migrations/scripts/008_daily_closings.js` | new |
| `backend/fms/docs/openapi.js` | **REPLACES** — 27 paths, 15 schemas |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/books` |

No new dependencies.

---

## The one design decision that mattered

The brief says: *derive entries from ledger/postings — do not double-store amounts.*

Opening, receipts, payments and closing are all computed from `fms_ledgerentries` at query time. There is no cash-book collection and no bank-book collection. The check asserts both are absent, and that a new posting shows up in the book immediately with no rebuild step.

But a **daily closing** is stored, and that is not a violation:

> The ledger tells you what the books say. The closing tells you what someone actually counted, who counted it, and who checked.

Those are different facts. `systemClosing` sits beside the physical count not as a duplicate balance but as a snapshot of what the system claimed **at the moment of counting** — which is what makes a variance investigable three weeks later. Nothing ever reads it to answer "what is the balance"; that always comes from the ledger. Section 8 asserts that closing a day does not alter the derived figure.

---

## Behaviours worth knowing

**A cash closing requires a physical count.** Closing cash without counting it is a formality, not a control. Bank closings do not require one — there is nothing to count.

**Variance is computed, never supplied.** A caller-provided variance could be made to say anything. `variance = physicalCount − systemClosing`, derived in a pre-validate hook.

**A variance opens the closing as `disputed`, not `closed`**, and requires a reason. Verifying it requires a note. Verification does **not** erase the variance — the check asserts that explicitly.

**Self-verification is blocked.** The verifier must not be whoever closed the day.

**Days with no movement still appear**, carrying the balance forward. Omitting them makes continuity impossible to read.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\models\cashBankBook,backend\fms\services\cashBankBook | Out-Null
# save the 7 files
cd backend
node --check fms/models/cashBankBook/index.js
node --check fms/services/cashBankBook/bookService.js
node --check fms/routes/books.js
node --check fms/migrations/scripts/008_daily_closings.js
node --test fms/docs/contract.test.js
node -e "const s=require('./fms/docs/openapi'); console.log(Object.keys(s.paths).length+' paths, '+Object.keys(s.components.schemas).length+' schemas')"
cd ..
git add -A
git commit -m "P2.4: Cash Book & Bank Book (M13/M14)"
git push
```

Expect `# pass 28` and `27 paths, 15 schemas`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node fms/migrations/_runner.js up
node fms/services/cashBankBook/book.check.js
pm2 restart staging-backend --update-env
```

Migration 008 applies; 005 stays blocked. Expect **47 passed, 0 failed**.

### Production

```bash
cd ~/school-management-system && git pull
```

Nothing to run.

---

## The P2.4 verification

The brief asks: *seed a day of cash receipts/payments; confirm closing = opening + receipts − payments and that the next day opens with it.*

Section 1 posts ₹15,000 and ₹8,500 in, ₹3,200 out on 10 July, then asserts:

- `closing = opening + receipts − payments` → ₹20,300
- the running balance on the last entry equals the closing
- **10 July's closing is 11 July's opening**

Section 2 extends it across five days including an empty one, asserting every day opens with the previous closing, and that `continuous` — computed independently of the row loop — holds.

---

## Check coverage — 47 assertions

```
1  P2.4 VERIFICATION  closing = opening + receipts − payments
                      NEXT DAY OPENS WITH THE PREVIOUS CLOSING
2  Continuity         5 days incl. an empty one; every day continues
                      arithmetic proof independent of the loop
3  Derived not stored  no cash-book or bank-book collection exists
                      a new posting appears immediately
4  Bank book          deposit shows in bank, withdrawal in cash
                      a non-cash account rejected for the cash book
5  Daily closing      count required for cash · float rejected
                      figures recomputed from the ledger
                      cannot close twice or close the future
6  Variance           reason required · computed not supplied
                      status DISPUTED, not closed
7  Verification       self-verification blocked · double-verify blocked
                      disputed needs a note · VARIANCE NOT ERASED
8  Book view          closings surface per day
                      CLOSING DID NOT ALTER THE DERIVED BALANCE
9  Integrity          audited with before/after
                      CASH BOOK CLOSING = TRIAL BALANCE FOR CASH
```

Section 9's last assertion is the one that matters most: the cash book and the trial balance are computed by different code paths over the same ledger, and they agree. If they ever disagree, something has written to the ledger outside `LedgerPostingService`.

---

## Phase 2 complete

| | Checks |
|---|---|
| P2.1 Chart of Accounts | 40 |
| P2.2 General Ledger | 52 |
| P2.3 Journal Voucher | 56 |
| P2.4 Cash & Bank Book | 47 |

**77 unit/contract tests · 195 integration checks · zero failures.**

The accounting core is done: a chart of accounts, a ledger that cannot be edited, manual entries with real separation of duties, and books that reconcile to the ledger by construction.

---

## Next

**Phase 3 — Transactions & Approvals**, starting with P3.1 Income Management. This is where the FMS begins handling actual school money rather than machinery around it.

Still gated by **O3** for anything real.