# P4.3 — Purchase Workflow · Deploy & Verify

**Delivers:** PR → quotation compare → PO → GRN → invoice → three-way match → payable → settlement · migration 015 · 4 collections · **38 unit tests** · ~55 integration checks
**SRS:** M8 / FR-M8 · BPMN WF2 · SCR-30..35
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/services/purchase/threeWayMatch.js` | new — pure match logic |
| `backend/fms/services/purchase/threeWayMatch.test.js` | new — 38 unit tests |
| `backend/fms/services/purchase/purchaseService.js` | new — the P2P chain |
| `backend/fms/services/purchase/purchase.check.js` | new |
| `backend/fms/models/purchase/index.js` | new — 4 collections |
| `backend/fms/routes/purchase.js` | new — 16 endpoints |
| `backend/fms/migrations/scripts/015_purchase.js` | new |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/purchase` |

No new dependencies.

> **OpenAPI note:** `docs/openapi.js` is unchanged in this drop. The purchase paths are substantial and I'd rather add them deliberately than pad this one out — the contract test still passes at 28/28, and the endpoints work regardless. Worth doing before Phase 6.

---

## Two postings, not one

```
invoice verified   Dr <expense head>      Cr Sundry Creditors     the liability
payment made       Dr Sundry Creditors    Cr Cash / Bank          the settlement
```

Goods taken on credit create a liability before any money moves, so a direct
`Dr expense / Cr bank` (as in P3.4) would misrepresent the period in between.

The payable posts on **invoice verification**, not on receipt. The GRN says what
arrived; the invoice says what is owed. When they differ, the invoice is what
creates the obligation.

### The Sundry Creditors account

Looked up from `fms_settings` under `accounts.sundryCreditors`, falling back to
account code `2201`. If neither exists, verification **fails with an instruction**
rather than guessing at a liability head — posting a payable into the wrong
place is worse than refusing.

---

## Four collections, because they can disagree

```
fms_purchaserequests   what we want, and the quotes we gathered
fms_purchaseorders     what we committed to buy, and at what rate
fms_goodsreceipts      what arrived, and what we accepted
fms_purchaseinvoices   what the vendor is asking to be paid
```

The whole point of a three-way match is that these can differ. Collapsing them
into one document would make the disagreement unrepresentable — which is the
same as not checking.

---

## The three-way match

Pure logic, 38 unit tests. Blocking discrepancies stop verification; warnings
do not.

| Blocking | Warning |
|---|---|
| billed for more than arrived | short receipt (partial delivery is normal) |
| billed for more than ordered | over receipt |
| a rate that differs from the PO | |
| a line amount that doesn't equal qty × rate | |
| a line that was never ordered | |
| billed with nothing received | |

Two details worth knowing:

**Rejected goods do not count as accepted.** If 10 arrive and 1 is faulty, 9 are
payable — and invoicing for the tenth is caught. Tested explicitly.

**A lower rate is flagged too.** A silent change is still a change, even a
favourable one.

Tolerances exist and default to strict: zero quantity, zero rate, and ₹1 on
amounts for genuine rounding (3 × ₹33.33 billed as ₹100.00).

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\models\purchase,backend\fms\services\purchase | Out-Null
# save the 8 files
cd backend
node --test fms/services/purchase/threeWayMatch.test.js
node --test fms/docs/contract.test.js
cd ..
git add -A
git commit -m "P4.3: Purchase Workflow (M8, WF2)"
git push
```

Expect `# pass 38` and `# pass 28`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/services/purchase/threeWayMatch.test.js
node fms/migrations/_runner.js up
node fms/services/purchase/purchase.check.js
pm2 restart staging-backend --update-env
```

### Production

```bash
cd ~/school-management-system && git pull
```

---

## The P4.3 verification

The brief asks: *run one PR fully to PAID; confirm a PO/GRN/invoice quantity mismatch is flagged and payable/GL postings are correct.*

**Section 1** runs the whole chain — request, two quotations, selection, approval, PO, GRN, invoice, verification, payment, close — and asserts:

- the PO carries the **quoted** rate, not the estimate
- **no ledger entries before verification** — receiving is not owing
- payable posts `Dr 5201 ₹2,500 / Cr 2201 ₹2,500`, balanced, vendor named on both lines
- settlement posts `Dr 2201 / Cr 1201`
- **creditors return to zero** after payment, expense stands at ₹2,500

**Section 2** re-runs the chain receiving 8 but invoicing 10:

- the mismatch is detected, flagged `OVER_INVOICED_VS_RECEIVED`, excess reported as 2
- **verification is blocked and nothing is posted**
- the invoice is marked `disputed`

---

## Overrides are deliberate and attributed

A blocking mismatch can be overridden — a rate genuinely renegotiated after the
quote is a real thing that happens. But it requires a reason, records who did
it, and **keeps the failed match on the record**. Section 4 tests all three.

---

## Two other guards

**Choosing a dearer quotation requires a written reason.** Often the right call —
quality, delivery, a working relationship — and always the first thing an
auditor asks about.

**Cancellation is blocked once goods have arrived.** The stock is here; cancelling
would leave it unaccounted for. Return it and raise a credit note instead.

---

## Running totals

| Phase | Checks |
|---|---|
| Phase 1 | 35 |
| Phase 2 | 200 |
| Phase 3 | 226 |
| P4.1 Budgets | 58 |
| P4.2 Vendors | 50 |
| P4.3 Purchase | ~55 |

**203 unit/contract tests · ~624 integration checks.**

---

## Next

**P4.4 Banking & Reconciliation**, then **P4.5 Petty Cash** closes Phase 4.

Or **Phase 5 fee ingest**, which is where the FMS meets the ~500 real fee
payments this school actually handles, and where P0.3's F1 finding lives.