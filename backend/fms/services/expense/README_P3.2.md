# P3.2 — Expense Management · Deploy & Verify

**Delivers:** expense requests with GST breakdown · attachments · `EXP-{FY}-{n}` numbering · budget check · draft → submitted · migration 010 · 5 OpenAPI paths · 52 integration checks
**SRS:** M4 / FR-M4 · SCR-14/15/16/17
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/models/expense/index.js` | new — `fms_expenserequests` |
| `backend/fms/services/expense/expenseService.js` | new |
| `backend/fms/services/expense/expense.check.js` | new — 52 checks |
| `backend/fms/routes/expense.js` | new — 5 endpoints |
| `backend/fms/migrations/scripts/010_expense_requests.js` | new |
| `backend/fms/docs/openapi.js` | **REPLACES** — 36 paths, 18 schemas |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/expenses` |

No new dependencies.

---

## Nothing here posts to the ledger

An expense request is a *request*. No money has moved. The ledger is touched at **payment** (P3.4).

That is not a shortcut — posting a payable the moment someone types a request would put unapproved, possibly rejected spending into the books. Two checks assert the ledger stays empty throughout.

---

## Two forward dependencies, held honestly

The brief says "validate against budget availability", but **budgets are P4.1** and **vendors are P4.2**. Neither collection exists.

### The budget check returns `checked: false`, not `ok`

```json
{ "checked": false, "outcome": "notChecked",
  "reason": "Budget module not yet installed (P4.1) — no budget was consulted" }
```

This is the decision I would most want reviewed. Returning `ok` when nothing was consulted would let every request pass a control that was never applied — and the stored record would later read as though it had been. `notChecked` and `ok` are different facts and the API keeps them different.

The check is fully implemented behind that guard: when `fms_budgets` exists it computes committed spend, warns at 90%, and blocks over-budget. The check proves this by creating the collection mid-run and watching the outcome change.

### Vendors and departments are name + nullable ref

When P4.2 lands, the ref is populated and the name stays as the denormalised snapshot. No migration of existing records, and no fake foreign key in the meantime.

---

## GST is validated at the schema layer

`totalAmount` must equal `base + GST + otherTax`, and:

- **intra-state** uses CGST + SGST
- **inter-state** uses IGST
- **both together is rejected**

That last rule matters because getting it wrong has tax consequences, and an expense with CGST *and* IGST would still add up arithmetically — nothing else would catch it.

Enforced in a schema hook, so no code path can save an expense whose parts do not reconcile.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\models\expense,backend\fms\services\expense | Out-Null
# save the 7 files
cd backend
node --check fms/models/expense/index.js
node --check fms/services/expense/expenseService.js
node --check fms/routes/expense.js
node --check fms/migrations/scripts/010_expense_requests.js
node --test fms/docs/contract.test.js
node -e "const s=require('./fms/docs/openapi'); console.log(Object.keys(s.paths).length+' paths, '+Object.keys(s.components.schemas).length+' schemas')"
cd ..
git add -A
git commit -m "P3.2: Expense Management (M4)"
git push
```

Expect `# pass 28` and `36 paths, 18 schemas`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node fms/migrations/_runner.js up
node fms/services/expense/expense.check.js
pm2 restart staging-backend --update-env
```

Migration 010 applies; 005 stays blocked. Expect **52 passed, 0 failed**.

### Production

```bash
cd ~/school-management-system && git pull
```

Nothing to run.

---

## The P3.2 verification

The brief asks: *create a draft expense with attachments; submit it; confirm status SUBMITTED and that an over-budget attempt raises the configured warning/block.*

Section 1 does all three, and shows the budget check changing behaviour as the module appears:

1. Draft created with an invoice attached, `EXP-2026-27-00001` allocated
2. **No ledger entries** — nothing has been spent
3. Submitted → status `submitted`, budget check recorded as **`notChecked`** with the reason
4. A `fms_budgets` document is inserted mid-run
5. A ₹20,000 request against a ₹15,000 budget is **blocked with 409**, and stays in draft
6. Resubmitted with `acknowledgeOverBudget: true` → accepted, recorded as `exceeded`, and the acknowledgement written into the workflow trail

Section 2 then proves the warning path at 95% of budget, and that **committed spend counts** — a second request sees the first, so ten pending requests cannot each pass a check they collectively blow.

---

## Check coverage — 52 assertions

```
1  P3.2 VERIFICATION  draft + attachment · EXP numbering · no ledger entries
                      SUBMITTED · budget notChecked (not ok) with a reason
                      OVER-BUDGET BLOCKED, stays draft
                      acknowledgement required, and recorded
2  Budget threshold   warning at 95% does not block
                      COMMITTED spend counted, not just paid
3  Numbering          sequential, gapless, carries the FY
                      duplicate rejected by the unique index
4  GST                intra (CGST+SGST) · inter (IGST)
                      total must add up · intra+IGST rejected · float rejected
5  Budget head        income head rejected · non-postable · unknown
6  Submission         NO ATTACHMENT BLOCKED · cannot submit twice
                      cannot edit once submitted
7  Return             editing a RETURNED request sends it back to DRAFT
8  Cancel             never deleted · cannot cancel twice
                      a PAID expense cannot be cancelled
9  FY lock            cannot create in a locked year
10 Audit              before/after · STILL no ledger entries · branch isolation
```

Section 6's attachment rule is worth noting: a request cannot be submitted without at least one supporting document. An approver being asked to authorise spending with no invoice attached is being asked to guess.

---

## Running totals

| | Checks |
|---|---|
| Phase 1 | 35 |
| Phase 2 | 200 |
| P3.1 | 60 |
| P3.2 | 52 |

**77 unit/contract tests · 347 integration checks · zero failures.**

---

## Next

**P3.3 — Expense Approval Workflow.** The playbook calls it the most business-critical piece in the project: an eight-state machine with threshold routing (≤10k Dept Head, 10,001–50,000 Principal, 50,001–200,000 Principal+Chairman, >200,000 Principal+Chairman+Trustee), reject and return branches, and boundary-value tests at every threshold.

It recommends building that one test-first. I would follow that.