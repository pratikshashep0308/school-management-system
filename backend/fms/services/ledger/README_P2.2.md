# P2.2 — General Ledger · Deploy & Verify

**Delivers:** GL read APIs · running balances · trial balance · voucher drill-down · 4 OpenAPI paths · 45 integration checks
**SRS:** M11 / FR-M11 · SCR-46
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/services/ledger/ledgerQueryService.js` | new |
| `backend/fms/services/ledger/gl.check.js` | new — 45 checks |
| `backend/fms/routes/ledger.js` | new |
| `backend/fms/docs/openapi.js` | **REPLACES** — now 15 paths, 11 schemas |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/ledger` |

No new dependencies.

---

## Endpoints — all GET, none can write

| | |
|---|---|
| `GET /api/fms/ledger` | General journal, filtered, with whole-set totals |
| `GET /api/fms/ledger/trial-balance` | Per-account totals + the system-wide check |
| `GET /api/fms/ledger/accounts/{id}` | Account statement: opening, movements, closing |
| `GET /api/fms/ledger/vouchers/{id}` | Drill-down, both ends of a reversal chain |

The prompt asks that no endpoint writes ledger entries directly. That holds three ways over, independently:

1. `fms_ledgerentries` rejects `updateOne` / `deleteOne` / `deleteMany` at the model layer (P1.2)
2. `LedgerPostingService` is the only code that inserts (P1.4)
3. No role has `edit` on the `ledger` module, asserted by a test in `rbac.test.js` — so a future matrix edit that opened it would fail CI (P1.3)

Human-created postings arrive in P2.3 as journal vouchers, and go through `LedgerPostingService` like everything else.

---

## Two things worth understanding

### Running balances are computed before pagination

A row on page 3 must show the balance after every earlier row — including rows on pages 1 and 2. Accumulating in JS over the current page would be wrong, and wrong in a way nobody notices until they try to reconcile.

So the running total uses `$setWindowFields` with `window: ['unbounded', 'current']`, applied **before** `$skip`/`$limit`. The period's opening balance is a separate aggregate over everything before the from-date, added on top.

Section 3 of the check paginates 10 entries across three pages and asserts each page continues correctly from the last, and that the final row equals the closing balance.

### Balances are presented the way an accountant reads them

The ledger stores Σdebit − Σcredit, so an income account holding ₹25,000 of income has `balance: -2500000`. Technically true, practically useless.

Every balance therefore returns three fields:

```json
{ "balance": -2500000, "naturalBalance": 2500000, "drCr": "Cr" }
```

`balance` is the raw signed value for arithmetic. `naturalBalance` is sign-flipped for credit-normal accounts, so positive always means the normal side. `drCr` is the label.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems\backend
# save the 5 files
node --check fms/services/ledger/ledgerQueryService.js
node --check fms/services/ledger/gl.check.js
node --check fms/routes/ledger.js
node --test fms/docs/contract.test.js
node -e "const s=require('./fms/docs/openapi'); console.log(Object.keys(s.paths).length+' paths, '+Object.keys(s.components.schemas).length+' schemas')"
cd ..
git add -A
git commit -m "P2.2: General Ledger read APIs (M11)"
git push
```

Expect `# pass 28` and `15 paths, 11 schemas`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/docs/contract.test.js
node fms/services/ledger/gl.check.js
pm2 restart staging-backend --update-env
```

Expect **45 passed, 0 failed**.

### Production

```bash
cd ~/school-management-system && git pull
```

Nothing to run. `FMS_ENABLED` is unset, so none of this loads.

---

## The P2.2 verification

The prompt asks: *post a sample income and expense, confirm the GL shows both, balances are correct, and total debits equal total credits.*

Section 1 does exactly that — posts ₹25,000 of tuition income and ₹18,000 of salary expense, then asserts:

- all four ledger lines appear
- both vouchers are present by number
- `summary.balanced` is true and `difference` is 0
- cash shows Dr 25,000 / Cr 18,000, closing 7,000 **Dr**
- income shows as **Cr** with a positive natural balance
- the trial balance covers 3 accounts and balances

---

## Check coverage — 45 assertions

```
1  P2.2 VERIFICATION  income + expense posted, GL shows both
                      debits = credits, per-account totals, Dr/Cr presentation
2  Account statement  opening, closing, movement totals, running balance, date order
3  Pagination         10 entries over 3 pages — each page continues from the last
                      final row equals the closing balance
4  Date filtering     opening balance carries the prior period forward
                      closing = opening + movement
                      'to' includes the WHOLE day, not up to midnight
5  Drill-down         voucher + lines, debits first, FY resolved, unknown → 404
6  Reversal           trial balance stays balanced; reversal ADDS lines, never removes
                      links resolve both directions; original untouched
7  Filters            account · voucherType · financialYear · branch isolation
                      invalid date rejected
8  Read-only          updateMany and deleteMany blocked
                      no role can edit the ledger
                      FINAL: system-wide debits = credits
```

Section 6's second assertion is the one I would watch: after a reversal, total debits and credits both **increase**. A correction that reduced them would mean history had been edited rather than reversed.

---

## Next

**P2.3 — Journal Voucher.** The first FMS endpoint that lets a human create a posting. It goes through `LedgerPostingService`, so every invariant already proven applies to it unchanged.

Still gated by **O3**: the GL will be empty on staging until there are accounts and postings. The checks create their own fixtures, so they pass regardless — but there is nothing to look at in the UI until the chart exists.