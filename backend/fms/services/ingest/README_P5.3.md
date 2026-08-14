# P5.3 — Inventory/Purchase → FMS · Deploy & Verify

**Delivers:** SMS expense import · migration 020
**Spec:** `docs/discovery/04_integration_plan.md` §4
**Deploy to:** staging only

---

## Most of this was already built

§4 is unambiguous:

> *There is no SMS source. No procurement model, no vendor model, no inventory model, no purchase routes... **This is not an integration.***

The two postings P5.3 asks for —

```
goods receipt   Dr <expense or asset head>   Cr 2201 Sundry Creditors
payment         Dr 2201 Sundry Creditors     Cr 1201 Bank / 1101 Cash
```

— are **already implemented and tested in P4.3** (53 checks). Rebuilding them would duplicate a working module and create two paths to the same postings.

Section 1 of the check asserts this positively: the Purchase module has `creditorsAccount`, `verifyInvoice` and `payInvoice`, and the expense ingest **does not**.

**The prompt's "bridge to the existing Inventory module" cannot be built** — the audit found no inventory module to bridge to.

---

## The one genuine boundary

SMS `Expense` records, consumed read-only via `GET /expenses`, keyed on `expense._id`. That is a real ingest and follows the §2 pattern.

| File | |
|---|---|
| `backend/fms/services/ingest/expenseIngestService.js` | new |
| `backend/fms/services/ingest/expenseIngest.check.js` | new |
| `backend/fms/models/expense/index.js` | **REPLACES** — ingest linkage |
| `backend/fms/routes/integrations.js` | **REPLACES** — adds expense routes |
| `backend/fms/migrations/scripts/020_expense_ingest.js` | new |

No new collection: imported expenses live in `fms_expenserequests` alongside FMS-raised ones, because people want **one list of expenses**.

---

## The decision that matters

An SMS expense is **money already spent**.

Running it through the FMS approval chain retroactively would fabricate a verification, an approval and a payment authorisation that never took place. An audit trail describing events that did not happen is worse than no trail at all.

So an imported expense is recorded as `paymentCompleted` with exactly **one** workflow entry:

> *"Imported from the SMS. This expense was NOT verified or approved through the FMS workflow — it was already recorded as spent."*

Section 3 asserts every part of that: one entry, action `import`, those words present, and **zero approval records fabricated**.

It sits beside FMS-raised expenses, but it never pretends to be one.

---

## Unmapped categories behave differently from unmapped fee types

| | |
|---|---|
| **Fee type** with no mapping | **Errors.** Fee types are a controlled list; a new one means somebody added it and nobody told the FMS. |
| **Expense category** with no mapping | **Falls back to `5299 Other Expenses` and is flagged.** Categories are free text in the SMS; refusing every new label would block the import entirely. |

§8.4 supports this — only two categories exist today, so it is a small manual mapping rather than a rule.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems\backend
# save the 5 files
node --check fms/services/ingest/expenseIngestService.js
node --check fms/services/ingest/expenseIngest.check.js
node --check fms/models/expense/index.js
node --check fms/routes/integrations.js
node --check fms/migrations/scripts/020_expense_ingest.js
node --test fms/docs/contract.test.js
cd ..
git add -A
git status --short
git commit -m "P5.3: SMS expense import (integration plan §4)"
git push
```

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node fms/migrations/_runner.js up
node fms/services/ingest/expenseIngest.check.js 2>&1 | tail -40
node fms/services/purchase/purchase.check.js 2>&1 | tail -4
pm2 restart staging-backend --update-env
```

Re-run the **purchase** check too — `models/expense/index.js` changed, and P4.3 depends on it.

### Production

```bash
cd ~/school-management-system && git pull
```

---

## The P5.3 verification

The brief asks: *trigger a goods-receipt from Inventory and confirm payable posted once and settleable through payment.*

There is **no Inventory module to trigger from** — §4 confirms it. The equivalent path is FMS-internal and already verified in `purchase.check.js` section 1: GRN → invoice → `Cr 2201` → payment → `Dr 2201` → creditors back to zero.

What this check adds is section 1's assertion that P5.3 **did not duplicate** it, plus the expense import in sections 2–7.

---

## A note worth passing on

Section 7 asserts `SUNDRY CREDITORS NEVER MOVED` during expense import — imported expenses are cash-out records, not payables. If the school starts recording *unpaid* bills in the SMS Expense model, this import would post them as though already paid. Worth knowing before that happens rather than after.

---

## Next

**P5.4 — Payment Gateway & Bank Import.** §5 says no gateway is installed: no SDK, no webhook route, no credentials. It is **deferred**, and the design is documented for when one is added.

Meanwhile `online`/`upi` fee payments accumulate in the `1202` clearing head and are cleared manually during bank reconciliation. **That is a real, ongoing manual task** — and §5 says explicitly it is worth telling the school it exists.

The bank import half (§6) is already built in P4.4.