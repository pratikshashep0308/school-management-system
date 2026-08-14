# Gap Closure Report

**The Future Step School ERP · SMS ↔ FMS**
**Period:** 30–31 July 2026 · **Repository:** `pratikshashep0308/school-management-system`
**Environment:** staging (`66.116.251.3`) · **Verified:** 31 July 2026, first live import

---

## 1. Outcome

Every Class D, A and B gap identified in the Phase-3 analysis is closed. Four required code; three closed on evidence once the data could be read.

The finance module now holds real books:

| | |
|---|---|
| Fee payments imported | **213** |
| Vouchers posted | **213** |
| Ledger entries | **426** (exactly two per voucher) |
| Total debits | **₹8,53,698** |
| Total credits | **₹8,53,698** |
| Balanced | **yes** |
| Replay result | `posted: 0, alreadyPosted: 213` |

The total agrees with the SMS Fee Dashboard to the rupee. The replay confirms idempotency against production-shaped data, which means a scheduled sync cannot double-post.

Test suite: **1,816 assertions, 0 failures**, across 46 files.

---

## 2. Class D — integrity divergence

### D1 · Deleted receipts leaving live postings — CLOSED (built)

**The gap.** `DELETE /api/fees/payment/:receiptNumber` hard-deletes a payment from all three fee stores with no audit record. The FMS keeps its income voucher, the ingest claim still reads "posted", and no future sync re-examines it. Nothing compared the two.

**Built.** `receiptReconciliationService` — fetches the full SMS receipt set, compares it against posted `fms_ingeststate` claims, and reports claims whose source has vanished. Surfaced in the Data Import console and the Diagnostics screen.

**Read-only by design.** It reports; it never reverses. Reversal stays an accountant's decision through the existing approval workflow. Automatic reversal off the back of a comparison with an external system is how one bad fetch becomes a corrupted ledger.

**Two guards, both tested.** The full receipt set is fetched with no date window, because a windowed fetch makes "outside the range" indistinguishable from "deleted". An empty SMS response with live claims aborts rather than reporting. Anything above 25% missing returns flagged `suspect` and renders as a warning, not a work list.

**Live result:** *"Every posted receipt is still present in the school system."* No divergence exists today. The mechanism now exists to notice if that changes.

---

## 3. Class A — revenue reaching no ledger

### A1 · Transport fees — CLOSED (decision + evidence)

**The gap.** `POST /api/transport/fees/:id/payment` recorded cash into `TransportFee2`, which no ingest reads. Account 4103 Transport Income would have read zero regardless of collection.

**Decision (30 July):** transport fees are collected through the **fee module**. Verified end to end: `POST /api/fees/generate-transport` creates a `FeeType` with `category: 'transport'`; `/fees/assignments` populates that category; `resolveFeeIncomeAccount` maps it to 4103 automatically. **No ingest, no mapping row, no configuration.**

**Enforced.** `POST /api/transport/fees/generate` and `/:id/payment` now return **410** naming the fee module. Closing them also removed a double-billing path: both generators could run for the same month, and neither knew about the other.

**Live result:** *"No transport fees were ever collected through the transport module."* Confirmed independently by the database dump — `transportfees` and `transportfee2` both hold **0 documents**. **No backlog, no opening journal voucher required.**

### A2 · Admission registration fees — CLOSED (built)

**The gap.** `Admission.registrationFee { amount, paid, paidOn, receiptNo }` — real cash at the counter, no ingest, no account mapping.

**Built.** `admissionIngestService`, keyed on the admission `_id` rather than `receiptNo` (optional, hand-typed, no unique index). Posts to **4110 Admission & Registration Fee Income**, created on the school's decision; falls back to 4107 if 4110 is absent.

**Two things this surfaced:**

- `GET /api/admissions` paginates at 50 and `smsClient` discarded the metadata. The service pages blind until a short page returns. Tested against 250 records across pages.
- `'admission'` was added to `POSTING_SOURCES`. Filing these under `'fee'` would have made the D1 reconciliation walk every registration fee, find no matching receipt, and report all of them as deleted.

**Live result:** *"No registration fees have been collected."* Nothing to import yet; the path is ready.

### A3 · Library fines — CLOSED (recommendation)

**The gap.** `PUT /api/library/return/:issueId` computes `daysLate × ₹5` and stores it on `BookIssue.lateFee`. **No payment step, no receipt, no outstanding list.** The fine is calculated, shown once, and forgotten.

**Assessment:** informational only. Nothing to ingest, and building one would mean inventing an SMS workflow rather than integrating one.

**Built instead — `chartCoverageReport`.** Rather than answer this in isolation, it walks every postable account and asks whether any live path can reach it. The pattern had already bitten three times (2105, 2106, 4108).

**Live result:** *"No library fines have been charged."* Deactivating 4105/4108 is uncontroversial — no revenue stream exists to lose.

**Separate finding, SMS scope:** `GET /api/library/stats` returns the sum of `BookIssue.lateFee` under the key **`lateFeeCollected`**. That field is a charge, not a receipt. The library screen reports money as collected that may never have been received.

---

## 4. Class B — feedable, wrong granularity

### B1 · Statutory payroll deductions — CLOSED (schema chain)

**The gap.** `SalarySlip.deductions` held only `{pf, tax, loan, other}`. Accounts 2105 ESIC and 2106 Professional Tax could never be fed and read zero — indistinguishable from "nothing was deducted".

**A larger finding during the fix:** `pages/Salary.js` sent `{pf:0, tax:0, loan:0, other: deduct}` — a single deduction box with PF, TDS and loan **hardcoded to zero**. PF and TDS were not being captured separately either. Adding two schema fields alone would have been completely inert.

**Built — the full chain:**

| File | Change |
|---|---|
| `models/Salary.js` | `+ esic, professionalTax` |
| `controllers/salaryController.js` | both `pay` and `update` hand-sum deductions; a missing field overstates `netSalary` and breaks the balance assertion, stopping payroll posting entirely |
| `pages/Salary.js` | one deduction box → six labelled heads; payslip printout gains ESIC and professional tax rows |
| `payrollMapping.js` | `COMPONENT_CODES` + 2105/2106; conversion, balance assertion and line building extended; `UNSOURCED_COMPONENTS` now empty |

**Not restated.** Slips written before 30 July keep their combined figure in `other` and stay posted to 2109. Rewriting posted vouchers is not something the books permit.

**Live result:** **3 salary slips carry ₹14,500 with no named head.** That figure and those slips go to the accountant, with the question of whether to reclassify by journal voucher.

**Related and more urgent than the software:** at 15–20+ staff the school is at or over the EPF (20+) and ESIC (10+) thresholds. Registration status should be confirmed, and prior-month statutory breakdowns cannot be reconstructed from the system.

### B2 · Receipts only in the third fee store — CLOSED (evidence)

**The gap.** Three fee collection stores exist; the ingest reads two. `FeePayment` was unreachable over REST, so the question could not be answered.

**Built.** `GET /api/fees/payments-ledger` — read-only, admin-gated, five fields, no writes. The only SMS endpoint added in this work.

**Live result:** *"Every receipt in the third fee store also appears in the two the import reads."* **B2 closes with no further work.** The 213 imported receipts equal the 213 in `feepayments`.

---

## 5. Built beyond the gap list

| Delivered | Why |
|---|---|
| **Diagnostics screen** (7 checks) | The Phase-3 analysis ended in queries somebody had to paste into a shell. Checks in a document get run once; checks behind a button get run when somebody is worried. |
| **Sync logging** (`fms_synclogs`) | Source, document id, endpoint, status, voucher, timestamp, user, failure reason, retries. Request/response bodies excluded by default — storing them would duplicate every student's payment history into an unprotected collection. 180-day TTL. |
| **Chart coverage report** | Accounts nothing can reach read zero, which looks like a measurement. |
| **Access Control screen** | The FMS had 12 roles, a permission matrix and an authorize middleware — and no way to assign anyone a role except editing a migration. |
| **Finance step-up login** | Same password, re-proved, for a 30-minute token only the finance module accepts. Not a second credential: a second password in a small office gets written down, and doubles what must be disabled when somebody leaves. |
| **Separate finance window** | The session lives in `sessionStorage`, which is per-window — closing the window locks the books without anybody remembering to. |

---

## 6. Defects found and fixed en route

Recorded because each was live before this work and none was reported by a user.

| Defect | Consequence had it not been found |
|---|---|
| **`/fees/students` paginates at 50; the ingest called it once** | The import would have posted 50 of 169 fee ledgers, reported success, and produced a plausible, wrong trial balance. Caught because a fetch returned exactly 50. |
| **Same for `/expenses`, the reconciliation and the diagnostics** | The reconciliation would have reported every receipt beyond page one as **deleted**. |
| **`fmsRole` never reached the browser** | `FmsContext` read the role from the notification-preferences endpoint, which returns no role. **Every role-gated menu item was invisible to everybody, always** — Audit Trail, Financial Years, Account Mappings and Data Import had never been reachable. |
| **FMS service credentials were never configured** | Six of seven diagnostics could not run. The FMS could not read the SMS at all. |
| **Four invalid audit-trail actions** | `deactivate` crashed on write; `unlock`, `unlockFailed` and `lockout` failed **silently** — the session gate would have worked with no audit record whatsoever. |
| **Route guards hidden behind a spread** | Four genuinely guarded routes read as unguarded to the static audit. The code was safe; the check proving it was blind. |
| **`smsClient` had no tests** | Token caching, 401 re-auth, envelope unwrapping — the entire integration boundary, untested. With `JWT_EXPIRE` at 30 days, a broken re-auth would have surfaced as "the SMS could not be reached" a month after go-live. |
| **Rollback safety unasserted** | An orphaned ingest claim would permanently block its receipt — the key taken, the money unpostable, a row asserting it had been. |

---

## 7. Still open

| Item | Owner | Note |
|---|---|---|
| **O3 — chart of accounts sign-off** | Accountant | Migration `005` remains blocked on exactly this. 42 accounts now carry 213 postings; a chart gets harder to change from here. |
| **₹14,500 in 2109** | Accountant | Reclassify by journal voucher, or leave. Either is defensible; doing it silently is not. |
| **EPF / ESIC / professional tax registration** | School | Likely at or over both thresholds. Not a software question. |
| **4108 Late Fee Income** | Developer | Unreachable — nothing sets `isLateFee`. Wire it in `normalise()` or deactivate. |
| **`FMS_REQUIRE_SESSION=true`** | Vijay | Gate ships off. Enable once the bookkeeper holds `accountsManager` and expects the prompt. |
| **Service account password** | Vijay | Rotate before production. |
| **`sourceSnapshot` unpopulated** | Developer | Additive; would strengthen D1 evidence. |
| **`lateFeeCollected` mislabel** | SMS owner | Charges reported as receipts. |
| **Stub contract hand-maintained** | Developer | Four independently written fake clients, nothing checking they match the real interface. Bit twice in one day. |
| **`banking.check.js` intermittency** | Developer | Failed twice under `runAll`, passed alone and under `runAll`. Suspected index-build contention. Not reproduced. |

---

## 8. Success criteria

| Criterion | Status |
|---|---|
| Every Class D, A and B gap addressed | **Met** — 4 built, 3 closed on evidence |
| No new ERP functionality beyond closing them | **Met** — one read-only SMS endpoint added, required for B2 |
| SMS remains authoritative; FMS read-only over REST | **Met** — `smsClient` exposes no write methods; asserted in test |
| Idempotent, auditable, reversible, no duplicates | **Met** — replay returned `alreadyPosted: 213, posted: 0` |
| Backward compatible, no regressions | **Met** — 1,816 assertions, 0 failures |

---

## 9. Verification record

```
Test suite            1,816 passed, 0 failed  (46 files, ~60s)
Dry run                 read 213 · would post 213 · 0 failed · 0 anomalies
Live import             posted 213 · failed 0 · skipped 0
Ledger                  213 vouchers · 426 entries · 213 claims
Balance                 Dr ₹8,53,698 = Cr ₹8,53,698
Replay                  posted 0 · alreadyPosted 213
Backup                  pre-first-import-2026-07-30.gz (15M), taken before first write
```

Against the SMS Fee Dashboard: ₹8,53,698 collected, 217 students, 441 assignments, 33% collection rate, ₹17,51,752 outstanding. **The books agree to the rupee.**
