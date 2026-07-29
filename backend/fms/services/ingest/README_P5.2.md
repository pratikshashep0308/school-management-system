# P5.2 — Payroll → FMS · Deploy & Verify

**Delivers:** payroll posting · balance assertion · G4 date rule · §3.5 reversal · review screen · migration 019 · **35 unit tests**
**Spec:** `docs/discovery/04_integration_plan.md` §3 · SRS M15 / FR-M15 · SCR-54
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/services/ingest/payrollMapping.js` | new — pure mapping, balance, date rule |
| `backend/fms/services/ingest/payrollMapping.test.js` | new — 35 unit tests |
| `backend/fms/services/ingest/payrollIngestService.js` | new |
| `backend/fms/services/ingest/payrollIngest.check.js` | new |
| `backend/fms/services/ingest/feeIngestService.js` | **REPLACES** — field-name fix |
| `backend/fms/models/payroll/index.js` | new — `fms_payrollpostings` |
| `backend/fms/routes/integrations.js` | **REPLACES** — adds payroll routes |
| `backend/fms/migrations/scripts/019_payroll_postings.js` | new |

No new dependencies.

---

## ⚠️ G1 — two components cannot be built

The brief asks for six: Salary Expense, Salary Payable, PF, **ESIC**, **Professional Tax**, TDS.

The SMS `SalarySlip` schema is:

```javascript
allowances: { hra, da, ta, medical, other }
deductions: { pf, tax, loan, other }
basicSalary, grossSalary, netSalary
```

| Requested | Available |
|---|---|
| Salary Expense | ✅ `grossSalary` |
| Salary Payable | ✅ `netSalary` |
| PF | ✅ `deductions.pf` |
| TDS | ✅ `deductions.tax` |
| **ESIC** | ❌ **no field** |
| **Professional Tax** | ❌ **no field** |
| Loan recovery | ✅ `deductions.loan` — **not in the requested list, but must be posted or the slip will not balance** |

Option (a) from §3.1 is implemented: **post what exists**.

`2105 ESIC Payable` and `2106 Professional Tax Payable` may exist in the chart but **are never posted from ingest**. Every cycle response names them and says why, so nobody reads "no movement on ESIC Payable" as "nothing was deducted". If the school does deduct either, the money is inside `deductions.other` and cannot be separated here.

**This is still the O1 question**: *does the school deduct ESIC or Professional Tax at all?* With 13 teachers and 4 slips, it may simply not apply — in which case option (a) is not a compromise, it is correct.

---

## The balance assertion refuses rather than plugs

```
gross === net + pf + tax + loan + other
```

`grossSalary` and `netSalary` are computed in an SMS controller with **no schema-level guarantee they reconcile**. A slip that fails this is not posted.

Plugging the difference would produce a voucher that balances arithmetically while describing something that never happened. There is no tolerance — one paisa out is still out.

---

## G4 — which date the posting belongs to

`paymentDate` defaults to `Date.now` when the document is **created**, before `status` becomes `paid`. On an unpaid or freshly drafted slip it records when somebody opened the form, not when salary left the school.

**Rule:** use `paymentDate` only when the slip is genuinely `paid` *and* the date is not in the future. Otherwise `updatedAt`.

Both dates and the choice are stored on `fms_payrollpostings`, so a question about a posting date years later has an answer rather than a guess.

---

## §3.5 — status regression

A slip can move `paid → pending`; nothing in the SMS prevents it.

1. The next cycle detects it and posts a **reversal**
2. The posting is marked `reversed`
3. If it returns to `paid`, it posts **fresh with a new voucher number**

Never an un-reversal — the period in which the salary was un-paid genuinely happened, and erasing it would misstate that period.

The check ends with two records for the same slip: one reversed, one live.

---

## A bug caught before shipping

Both this module and P5.1 queried `status` on `fms_ingeststate`, where the field is `ingestStatus`.

MongoDB does not complain about either. The consequences would have been:

- the fee status endpoint reporting **zero failures forever**
- a reversed payroll slip returning to `paid` being **silently blocked** from re-posting, violating §3.5

Both would have looked like the system working. The pre-ship cross-check caught it by erroring rather than passing. `feeIngestService.js` is re-issued here with the fix.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\models\payroll | Out-Null
# save the 8 files
cd backend
node --check fms/services/ingest/payrollMapping.js
node --check fms/services/ingest/payrollIngestService.js
node --check fms/services/ingest/payrollIngest.check.js
node --check fms/services/ingest/feeIngestService.js
node --check fms/models/payroll/index.js
node --check fms/routes/integrations.js
node --check fms/migrations/scripts/019_payroll_postings.js
node --test fms/services/ingest/payrollMapping.test.js
node --test fms/docs/contract.test.js
cd ..
git add -A
git status --short
git commit -m "P5.2: Payroll to FMS (integration plan §3, G1/G4)"
git push
```

Expect `# pass 35` and `# pass 28`. Every path in `git status --short` must start `backend/fms/`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/services/ingest/payrollMapping.test.js
node fms/migrations/_runner.js up
node fms/services/ingest/payrollIngest.check.js 2>&1 | tail -40
node fms/services/ingest/feeIngest.check.js 2>&1 | tail -4
pm2 restart staging-backend --update-env
```

Re-run the **fee** check too — `feeIngestService.js` changed.

### Production

```bash
cd ~/school-management-system && git pull
```

---

## The P5.2 verification

The brief asks: *post a sample payroll; confirm the six components hit the right accounts and the batch balances; re-post and confirm idempotency.*

Section 2 does that, with the G1 caveat made explicit:

- ₹50,000 gross → `Dr 5101`
- `Cr 2101` net 42,200 · `Cr 2102` PF 3,600 · `Cr 2103` TDS 2,200 · `Cr 2104` loan 1,500 · `Cr 2109` other 500
- six lines, one debit, **balanced**
- **`2105` and `2106` do not appear** — asserted explicitly
- re-run: 0 posted, 1 already present, no second voucher, trial balance unchanged

Section 3 proves a non-reconciling slip fails and the good one is unaffected. Section 5 walks the full reversal cycle.

---

## Next

**P5.3 Inventory/Purchase → FMS**, then P5.4 Gateway and P5.5 Bank. Then Phase 6 (reporting), 7 (security), 8 (testing), 9 (handover).

**O3** still gates everything real, and **O1** — the ESIC/PT question — decides whether option (a) here is correct or merely pragmatic.