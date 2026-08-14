# P6.1 — Financial Reports · Deploy & Verify

**Delivers:** Balance Sheet · Income & Expenditure · Cash Movement · department and fee reports · PDF and Excel export · **32 unit tests**
**SRS:** M16 / FR-M16 · SCR-55..60
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/services/reports/financialStatements.js` | new — pure statement arithmetic |
| `backend/fms/services/reports/financialStatements.test.js` | new — 32 unit tests |
| `backend/fms/services/reports/reportService.js` | new |
| `backend/fms/services/reports/exporters.js` | new — PDF + Excel |
| `backend/fms/services/reports/reports.check.js` | new |
| `backend/fms/routes/reports.js` | new — 11 endpoints |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/reports` |

**No new dependencies** — `exceljs@^4.4.0` and `pdfkit@^0.15.2` are already declared in the SMS `package.json`. Worth confirming before deploying:

```bash
node -e "['exceljs','pdfkit'].forEach(m=>{try{console.log('OK  '+m+' '+require(m+'/package.json').version)}catch(e){console.log('MISSING '+m)}})"
```

If either is missing, reports still work as JSON — export degrades to a clear 503 rather than taking the router down.

---

## The thing that had to be right

A Balance Sheet balances **only if the period result reaches equity**.

```
Assets = Liabilities + Equity + (Income − Expenditure)
```

Omitting the surplus leaves the sheet out by *exactly* the surplus — which looks like a different bug entirely, and sends whoever is debugging it in the wrong direction. So the surplus is a **visible line** in equity, not folded into a total, and one test deliberately demonstrates the failure it prevents.

---

## The subtler trap

A Balance Sheet is a position **as at** a date. The surplus is a **period** figure.

So assets, liabilities and equity are taken from inception to the end date, while income and expenditure are taken from the period only.

Taking the whole sheet from the period start would report each account's *movement* as though it were its *balance* — **and it would still balance**, which is what makes it dangerous. Section 5 tests a July-only sheet: full asset position, July-only surplus.

---

## What was NOT rebuilt

| Report | Served by |
|---|---|
| Trial Balance, General Ledger | `ledgerQueryService` (P2.2) |
| Cash Book, Bank Book | `bookService` (P2.4) |
| Budget vs Actual | `budgetService` (P4.1) |
| Vendor Outstanding | `vendorService` (P4.2) |

These are exposed under `/reports/*` for convenience but are the **same code**. `GET /reports` returns a catalogue naming the source of each, so it is visible which are reused.

Two implementations would eventually give two answers to the same question.

---

## Two smaller calls

**"Income & Expenditure", not "Profit & Loss". "Surplus", not "profit".** A school is not trying to make one, and the wrong word invites the wrong question at a trustee meeting. Both URL paths are served so nobody has to guess.

**The cash report says plainly it is a movement statement, not a statutory cash flow.** A statutory indirect cash flow needs opening and closing balance sheets and working-capital movements. Overclaiming here would matter.

---

## Export

`?format=pdf|excel` on any report.

Excel amounts go in as **numbers with a display format**, not strings — a spreadsheet whose figures cannot be summed is a picture of a report. Indian digit grouping throughout: `1,23,456.78`.

Both exporters consume the same `tabulate()` output, so a report added to one appears in the other rather than the two drifting.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\services\reports | Out-Null
# save the 7 files
cd backend
node --check fms/services/reports/financialStatements.js
node --check fms/services/reports/reportService.js
node --check fms/services/reports/exporters.js
node --check fms/services/reports/reports.check.js
node --check fms/routes/reports.js
node --test fms/services/reports/financialStatements.test.js
node --test fms/docs/contract.test.js
cd ..
git add -A
git status --short
git commit -m "P6.1: Financial Reports (M16)"
git push
```

Expect `# pass 32` and `# pass 28`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node -e "['exceljs','pdfkit'].forEach(m=>{try{console.log('OK  '+m+' '+require(m+'/package.json').version)}catch(e){console.log('MISSING '+m)}})"
node --test fms/services/reports/financialStatements.test.js
node fms/services/reports/reports.check.js 2>&1 | tail -40
pm2 restart staging-backend --update-env
```

No migration — reports read the ledger and store nothing.

### Production

```bash
cd ~/school-management-system && git pull
```

---

## The P6.1 verification

The brief asks: *generate Trial Balance and Balance Sheet on seeded data; confirm they balance and PDF/Excel export works.*

Section 2 seeds a small but complete set of books — corpus contributed, fees collected, salaries paid, stationery bought on credit — and asserts:

- income ₹90,000, expenditure ₹60,000, **surplus ₹30,000**
- assets ₹90,000 = liabilities ₹10,000 + equity ₹80,000, **balanced**
- the surplus appears as its own line
- all three identities hold
- **Excel export produces a real xlsx** (`PK` zip magic)
- **PDF export produces a real PDF** (`%PDF-` magic)

Checked by magic bytes rather than "it did not throw" — a zero-byte file also does not throw.

---

## `GET /reports/verify`

The three identities that must hold before anyone circulates a statement:

1. trial balance debits = credits
2. assets = liabilities + equity
3. the period result in equity = the P&L surplus

If any fails, the response says so and says not to rely on the statements.

---

## Running totals

**350 unit/contract tests · ~1,000 integration checks.**

---

## Next

**P6.2 Audit Trail**, then P6.3 notifications, P6.4 multi-branch, P6.5 dashboard. Then Phase 7 (security), 8 (testing), 9 (handover).

**O3** still gates everything real — these reports will produce empty but correctly balanced statements until the Chart of Accounts exists.