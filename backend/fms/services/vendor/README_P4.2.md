# P4.2 — Vendor Management · Deploy & Verify

**Delivers:** vendor master · GSTIN checksum validation · KYC documents · transaction history · migration 014 · 8 OpenAPI paths · **34 unit tests** · ~45 integration checks
**SRS:** M7 / FR-M7 · SCR-26/27/28/29
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/services/vendor/taxIdValidation.js` | new — pure GSTIN/PAN validation |
| `backend/fms/services/vendor/taxIdValidation.test.js` | new — 34 unit tests |
| `backend/fms/services/vendor/vendorService.js` | new |
| `backend/fms/services/vendor/vendor.check.js` | new |
| `backend/fms/models/vendor/index.js` | new — vendors + documents |
| `backend/fms/routes/vendor.js` | new — 8 endpoints |
| `backend/fms/migrations/scripts/014_vendors.js` | new |
| `backend/fms/docs/openapi.js` | **REPLACES** — 68 paths, 27 schemas |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/vendors` |

No new dependencies.

---

## The GSTIN checksum

A GSTIN carries a mod-36 check character. Validating only the **shape** accepts every single-digit typo — `27AAPFU0939F1ZV` and `27AAPFU0939F1ZW` look equally valid to a regex, and one of them is wrong.

That matters practically: a wrong GSTIN on an invoice means the school cannot substantiate the expense when it is questioned. Catching it at entry costs twenty lines.

**The implementation is confirmed independently.** It generates the check characters of five publicly published GSTINs without those values being hardcoded:

```
27AAPFU0939F1ZV   Maharashtra
29AAGCB7383J1Z4   Karnataka
07AAACB2894G1ZP   Delhi
24AAACC1206D1ZM   Gujarat
09AAACH7409R1ZZ   Uttar Pradesh
```

One test walks all 36 possible check characters for a known prefix and asserts exactly one is accepted.

### PAN is honest about what it cannot check

PAN's final character is a check digit, but its algorithm is not published. So PAN is validated on **format and holder type only**, and the response carries `checksumVerified: false`.

Claiming to verify something we cannot would be worse than not claiming it — someone would rely on it.

### The two must agree

A GSTIN contains the PAN at characters 3–12. If both are supplied they must match; two individually-valid identifiers describing different people is a real data-entry outcome, not a hypothetical.

A GSTIN also fixes the state, so an address contradicting it is refused. That difference decides whether GST is CGST+SGST or IGST.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\models\vendor,backend\fms\services\vendor | Out-Null
# save the 9 files
cd backend
node --test fms/services/vendor/taxIdValidation.test.js
node --test fms/docs/contract.test.js
node -e "const s=require('./fms/docs/openapi'); console.log(Object.keys(s.paths).length+' paths, '+Object.keys(s.components.schemas).length+' schemas')"
cd ..
git add -A
git commit -m "P4.2: Vendor Management (M7)"
git push
```

Expect `# pass 34`, `# pass 28`, and `68 paths, 27 schemas`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/services/vendor/taxIdValidation.test.js
node fms/migrations/_runner.js up
node fms/services/vendor/vendor.check.js
pm2 restart staging-backend --update-env
```

### Production

```bash
cd ~/school-management-system && git pull
```

---

## The P4.2 verification

The brief asks: *create a vendor with documents; confirm invalid GST/PAN is rejected and the history view aggregates its transactions.*

Section 1:

- a GSTIN with a wrong check character is **rejected**
- a malformed PAN is **rejected**
- a GSTIN and PAN describing different people are **rejected**
- **nothing is persisted** by any rejection
- a valid vendor is created, `VEN-2026-27-00001`, with the **PAN derived from the GSTIN** and the state decoded as Maharashtra
- two documents attached; the uploader **cannot verify their own**, a different person can
- an expense is raised, approved and paid; a second is left unpaid
- history reports **2 expenses, 1 payment, billed − paid = outstanding**

---

## Forward dependency, held honestly

Purchase orders are **P4.3**. The history response returns an empty `purchaseOrders` array **and a note saying so**, rather than implying the totals are complete. Same principle as the budget check returning `notChecked` rather than `ok`.

---

## Two smaller decisions

**Activation requires bank details.** A vendor that cannot be paid should not read as active — that state is what a purchase officer trusts when selecting a supplier.

**Blacklisting requires a reason.** It stops payments, and someone will eventually ask why. The reason and the author are both recorded.

---

## Check coverage

```
1  P4.2 VERIFICATION  bad checksum · malformed PAN · mismatched pair
                      nothing persisted · PAN DERIVED FROM GSTIN
                      documents · self-verification blocked
                      HISTORY AGGREGATES · outstanding = billed − paid
                      purchase orders absent AND SAID TO BE
2  Duplicates         same GSTIN rejected · two vendors without GSTIN allowed
3  Status rules       activation needs bank details · blacklist needs a reason
                      blacklisted cannot be transacted with
4  Tax identifiers    GSTIN alone derives PAN · PAN alone accepted
                      contradicting state code rejected
                      adding a GSTIN later updates the PAN
5  Documents          expiring surfaced, sorted · cannot verify twice
6  Never deleted      deleteOne and deleteMany blocked · audited
```

---

## Running totals

| Phase | Checks |
|---|---|
| Phase 1 | 35 |
| Phase 2 | 200 |
| Phase 3 | 226 |
| P4.1 Budgets | 58 |
| P4.2 Vendors | ~45 |

**165 unit/contract tests · ~564 integration checks.**

---

## Next

**P4.3 Purchase Workflow** (PR → PO → GRN → three-way match, WF2), then P4.4 Banking and P4.5 Petty Cash.