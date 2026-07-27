# P0.3 — Database & Data-Model Reconciliation

**Project:** The Future Step School ERP (SMS) + FMS plugin
**Phase:** P0.3 (Discovery — design only, no schema changes executed)
**Date:** 2026-07-27 · **Rev 2** (adds F4 — full delete surface, §2.4)
**Source of truth read:** `school-management-system-main/backend/models/*`, `routes/*`, `controllers/feeController.js`; live staging DB (`school_management`, 4,007 docs, restored 2026-07-25)
**Reference specs:** `DATA_DICTIONARY_v3.md` (§0, §9, §11), `03_DB_Design.md`, `08_Existing_System_Discovery_Report.md`

---

## 0. Executive summary

Three findings change the build plan. Two are blocking.

| # | Finding | Severity | Effect |
|---|---|---|---|
| **F1** | `payAssignment` only mirrors to `StudentFee` **if a ledger already exists**. 426 `feeassignments` vs 56 `studentfees` — most students have no ledger. | **BLOCKING** | The ingest path prescribed in DD §9 (`StudentFee.paymentHistory[]` only) would **silently omit** an unknown share of real collections from the ledger. |
| **F2** | `receiptNumber` — not the subdocument `_id` — is the only key shared by all three fee writes. | **BLOCKING** (design) | DD §9 names `StudentFee.paymentHistory[]._id` as the idempotency key. Subdocument `_id`s are per-array and differ across the three systems for the *same* payment. |
| **F3** | Production `mongod` is still standalone; only staging was converted to a replica set. | **BLOCKING** (deployment) | No FMS-internal transaction can run in production. `LedgerPostingService` cannot be deployed until converted. |
| **F4** | Hard-delete surface is wider than H8/H9/H10 recorded — including `POST /api/fees/ledger/bulk-delete`, reachable by `accountant`. Editing a payment requires second-admin approval; **deleting one does not**. | High | Strengthens the case for **E4**. See §2.4. |

No `fms_`-prefixed collection collides with any existing SMS collection (verified §3). No step in this plan reads, writes, drops, or renames an SMS collection or field.

---

## 1. Current SMS data model (as built)

19 model files declare **~45 collections**; several are defined inline in `models/index.js` rather than as separate files, which is why the file count understates the schema.

**Live document counts (staging, restored from production 2026-07-25):**

| Collection | Docs | | Collection | Docs |
|---|---|---|---|---|
| attendances | 2311 | | studentfees | **56** |
| feeassignments | **426** | | feepayments | **61** |
| users | 230 | | feetypes | 13 |
| admissions | 212 | | classes | 8 |
| students | 206 | | timetables | 8 |
| teacherattendances | 132 | | classfeetemplates | 7 |
| notifications | 129 | | rolepermissions | 7 |
| homeworks | 66 | | salaryslips | 4 |
| | | | expenses | 2 |
| | | | **feestructures** | **0** |

`feestructures` is empty despite `FeePayment.feeStructure` referencing it — that reference is dead in practice.

### 1.1 Money representation

Every monetary field in the SMS is a **float-rupee `Number`**: `StudentFee.totalFees/paidAmount/pendingAmount`, `FeeAssignment.baseAmount/finalAmount/paidAmount`, `Salary.basicSalary/grossSalary/netSalary` and all allowance/deduction sub-fields, `Expense.amount`.

**Reconciliation rule:** the FMS converts once at ingest via `toPaise(r) = Math.round(r * 100)` and stores integer paise in every `fms_` field. The FMS never writes back to an SMS float field. Rounding is applied at the boundary and recorded in `fms_ingestState` alongside the source value, so a reconciliation report can prove the conversion.

### 1.2 Naming conventions

SMS is already camelCase fields / `ObjectId _id` / `ref`-style relations — consistent with the FMS target. **No naming reconciliation needed.** The one divergence is collection naming: SMS lets Mongoose derive names (lowercased plurals, e.g. `studentfees`); FMS models **must set `{ collection: 'fms_...' }` explicitly**, otherwise Mongoose would produce `fms_ledgerentries` from a `fms_ledgerEntries` model name and the two spellings would drift.

> The Data Dictionary itself contains both `fms_ledgerEntries` and `fms_ledgerentries`. **Adopt the lowercase Mongoose-derived form as canonical** (`fms_ledgerentries`) and set it explicitly in every model to remove ambiguity.

---

## 2. The three fee systems — reconciled

This is the highest-risk area in the whole integration. Reading `controllers/feeController.js`:

### 2.1 `recordPayment` (POST `/api/fees/pay`, `/api/fees/payments`)

Writes **three times** with one shared `receiptNumber`:

1. `StudentFee.paymentHistory.push({...receiptNumber})` — always
2. `FeeAssignment.payments.push({...receiptNumber})` — **only if `assignmentId` supplied**
3. `FeePayment.create({...receiptNumber})` — always

No transaction wraps these. A crash between writes leaves them divergent.

### 2.2 `payAssignment` (POST `/api/fees/assignments/:id/pay`) — **F1**

```js
// Sync to StudentFee ledger
if (assignment.student) {
  const ledger = await StudentFee.findOne({ student: ..., school: ... });
  if (ledger) {                    // ← silent no-op when absent
    ledger.paymentHistory.push({ ...receiptNumber });
    await ledger.save();
  }
}
```

The mirror is conditional on a `StudentFee` document already existing. It is **never created** if missing. With 426 assignments against 56 ledgers, most students have an assignment and no ledger — so a payment taken through this route is recorded **only** in `FeeAssignment.payments[]`.

**Consequence:** DD §9's instruction to ingest from `StudentFee.paymentHistory[]` and *"do not also post from `FeeAssignment.payments[]`"* would under-report income. The exact amount at risk is unknown until measured (query in §7).

**Resolution — ingest from the union, deduplicated on `receiptNumber`:**

```
sources = StudentFee.paymentHistory[] ∪ FeeAssignment.payments[]
key     = receiptNumber
post once per key; ignore FeePayment entirely (legacy mirror, same receiptNumber)
```

Because `recordPayment` writes the *same* `receiptNumber` to both, the union self-deduplicates for dual-written payments and picks up assignment-only payments that would otherwise be lost. This is a **deviation from DD §9** and must be recorded as such.

### 2.3 `deletePayment` (DELETE `/api/fees/payment/:receiptNumber`)

Hard-deletes from all three, but is **gated on the payment existing in `StudentFee`** — it returns 404 first if not found there. So an assignment-only payment (§2.2) can be created but not deleted through this route. Asymmetric, and worth reporting to the SMS side independently of the FMS.

Confirms discovery items **H8/H9/H10**: the SMS can hard-delete posted financial records. The plugin cannot prevent this across REST; it detects absence on the next ingest and posts a compensating reversal with an alert. Preventing it needs **E4** (SMS-side guard), out of default scope.

### 2.4 Full delete surface — **F4 (new, 2026-07-27)**

Re-reading `backend/routes/` shows the hard-delete exposure is wider than §2.3 alone suggests:

| Endpoint | Effect | Authorised roles |
|---|---|---|
| `DELETE /api/fees/payment/:receiptNumber` | Deletes one payment across all three systems | superAdmin, schoolAdmin, **accountant** |
| `DELETE /api/fees/ledger/:id` | Deletes an entire `StudentFee` ledger **including its whole `paymentHistory[]`** | same |
| `POST /api/fees/ledger/bulk-delete` | Deletes **many ledgers in one call** | same |
| `DELETE /api/fees/assignments/:id` | Deletes a `FeeAssignment` and its `payments[]` | same |
| `DELETE /api/salary/:id` | Deletes a salary slip | same |
| `DELETE /api/expenses/:id` | Deletes an expense | same |

`POST /api/fees/ledger/bulk-delete` is the significant one — a single request can remove many ledgers, each carrying embedded payment history, with no confirmation step in the API contract.

Two observations that sharpen the E4 argument:

- The SMS **already has a maker-checker guard for editing** payments — `FeeEditRequest` requires a second admin to approve any field change, and the original stays untouched until then. **Deleting has no equivalent guard.** Edits are protected; deletions are not. That asymmetry looks unintentional rather than designed.
- Today a deletion loses one record. Once the FMS is live, the ledger becomes the school's financial record of account, and a silent upstream deletion means the compensating reversal is the *only* remaining evidence the payment existed. The consequence of the same action changes materially.

**Recommendation:** promote **E4** from "out of default scope" to a prerequisite for Phase 5 (Integrations). Extending the existing `FeeEditRequest` pattern to cover deletes would be consistent with the design already present in the codebase, so the work is small. At minimum, restrict `bulk-delete` to `superAdmin` before FMS go-live.

---

## 3. Collision check — `fms_` vs existing collections

30 canonical `fms_` collections (Data Dictionary §11 inventory):

`fms_accountGroups`, `fms_accounts`, `fms_approvalMatrix`, `fms_auditTrail`, `fms_bankAccounts`, `fms_bankReconciliations`, `fms_bankTransactions`, `fms_budgetRevisions`, `fms_budgets`, `fms_chequeRegister`, `fms_departments`, `fms_expenseApprovals`, `fms_feePostings`, `fms_financialYears`, `fms_goodsReceipts`, `fms_incomeVouchers`, `fms_ingestState`, `fms_journalVouchers`, `fms_ledgerentries`, `fms_notifications`, `fms_numberSequences`, `fms_paymentVouchers`, `fms_payrollPostings`, `fms_pettyCashTransactions`, `fms_purchaseOrders`, `fms_purchaseRequests`, `fms_receiptVouchers`, `fms_roleAssignments`, `fms_settings`, `fms_vendorDocuments`, `fms_vendors`, `fms_vouchers`

**Result: zero collisions.** No existing collection begins with `fms`. Namespace separation is clean; `db.getCollectionNames().filter(n => n.startsWith('fms_'))` cleanly isolates all plugin data for backup, export, or removal.

Two name-overlap notes (different collections, no conflict, but avoid confusion in reports): `fms_notifications` vs SMS `notifications`; `fms_departments` — SMS has no departments collection, so this is genuinely new.

---

## 4. Mapping table

| FMS collection | SMS source consumed via REST | SMS endpoint | Action | Notes |
|---|---|---|---|---|
| `fms_accounts`, `fms_accountGroups` | — | — | NEW | Seeded chart of accounts |
| `fms_ledgerentries`, `fms_vouchers` | — | — | NEW | Posted only by `LedgerPostingService`, inside txn |
| `fms_journalVouchers` | — | — | NEW | |
| `fms_incomeVouchers` | StudentFee + FeeAssignment payments | `GET /api/fees/students`, `GET /api/fees/assignments`, `GET /api/fees/recent-payments` | NEW + READ-VIA-REST | **Union ingest, key = `receiptNumber` (§2.2)** |
| `fms_feePostings` | as above | as above | NEW | Idempotency log, one row per `receiptNumber` |
| `fms_payrollPostings` | `Salary` where `status='paid'` | `GET /api/salary` | NEW + READ-VIA-REST | Key = `salarySlip._id` + `month`/`year`. Only 4 docs today |
| `fms_paymentVouchers` | SMS `Expense` (reference only) | `GET /api/expenses` | NEW + READ-VIA-REST | FMS owns its own expense workflow; SMS expense is an input |
| `fms_expenseApprovals`, `fms_approvalMatrix` | — | — | NEW | Maker-checker-approver; model on existing `FeeEditRequest` pattern |
| `fms_vendors`, `fms_vendorDocuments` | — | — | NEW | SMS has no vendor domain |
| `fms_purchaseRequests`, `fms_purchaseOrders`, `fms_goodsReceipts` | — | — | NEW | SMS has no procurement |
| `fms_budgets`, `fms_budgetRevisions` | — | — | NEW | |
| `fms_bankAccounts`, `fms_bankTransactions`, `fms_bankReconciliations`, `fms_chequeRegister` | — | — | NEW | |
| `fms_pettyCashTransactions` | — | — | NEW | |
| `fms_financialYears`, `fms_numberSequences` | — | — | NEW | Seeded |
| `fms_roleAssignments` | `User` | `GET /api/admin/users` (verify) | NEW + READ-VIA-REST | Keyed by SMS `User._id` as opaque ObjectId |
| `fms_settings` | — | — | NEW | Includes toggle state if D6 → DB |
| `fms_auditTrail` | — | — | NEW | FMS-internal only |
| `fms_notifications` | — | — | NEW | **SMS email is non-functional** (`EMAIL_*` referenced in code, absent from `.env`) — FMS notifications are in-app only unless SMTP is configured |
| `fms_departments` | — | — | NEW | |

**There is no EXTEND row.** No FMS operation alters an SMS collection.

---

## 5. Reference data the FMS must point at, not recreate

Stored as **opaque `ObjectId`s captured at ingest** — not Mongoose `ref`s, since the FMS must not import SMS models. Display values are resolved by REST lookup or denormalised at ingest.

| Entity | SMS collection | FMS usage |
|---|---|---|
| Users | `users` (230) | `fms_roleAssignments.userId`, `createdBy`/`updatedBy` on every FMS doc |
| School / branch | `schools` (1) | **`school` scoping on every FMS document** — mandatory |
| Students | `students` (206) | Income voucher party reference |
| Classes | `classes` (8) | Fee analytics dimension |
| Fee types | `feetypes` (13) | Maps to income account heads in `fms_accounts` |
| Teachers | `teachers` (13) | Payroll voucher party reference |
| Salary slips | `salaryslips` (4) | Payroll ingest source |
| Expense categories | `expensecategories` (2) | Seeds expense account heads |

**Academic/financial year:** the SMS has **no** financial-year collection. `fms_financialYears` is entirely FMS-owned. Note that SMS fee records carry a free-text `month` (`"April 2026"`) and numeric `year` — the FMS must parse these into its own FY boundaries at ingest, and reject/flag anything unparseable rather than defaulting silently.

---

## 6. Migration strategy (additive, reversible)

The SMS has **no migration tool** (confirmed P0.1 — no `migrate-mongo`, no `migrations/`). Introducing a heavyweight one for a 2-person team is unwarranted.

**Proposal: a minimal in-repo runner, FMS-scoped.**

```
backend/fms/migrations/
  000_guard.js                 // abort unless replica set + FMS_ENABLED
  001_create_collections.js
  002_indexes.js
  003_seed_account_groups.js
  004_seed_chart_of_accounts.js
  005_seed_financial_year.js
  006_seed_number_sequences.js
  007_seed_role_assignments.js
  008_backfill_ingest_fees.js      // initial REST ingest, union source
  009_backfill_ingest_payroll.js
  _runner.js                       // up/down, records applied in fms_settings
```

**Rules:**

- **Additive only.** Every migration creates or seeds `fms_` collections. No migration touches a non-`fms_` namespace. `000_guard.js` asserts this by refusing to run if any target name lacks the `fms_` prefix.
- **Reversible.** Every file exports `up()` and `down()`. `down()` for 001–007 drops only the `fms_` collections it created. Rollback of the whole plugin = run all `down()` + unset `FMS_ENABLED`; the SMS is byte-identical afterwards.
- **Backfill is separate from schema.** 008/009 are re-runnable ingests, idempotent on `receiptNumber` / `salarySlip._id`, not destructive migrations. They can be re-run after a reversal without double-posting.
- **Applied-state** recorded in `fms_settings` (`{ key: 'migrations.applied', value: [...] }`) — no new collection needed for bookkeeping.
- **Ordering:** guard → collections → indexes → seed reference data → seed FY/sequences → roles → backfill. Backfill last because it depends on the chart of accounts existing.

**Refs:** FMS→FMS relations use real Mongoose `ObjectId` refs. FMS→SMS relations store the SMS `_id` as a **plain `ObjectId` field with no `ref`**, plus a denormalised label captured at ingest (e.g. `studentName`) so FMS reports render without an SMS round-trip and survive SMS deletion.

---

## 7. Verification — run before P1.1

**F1 exposure.** How much money is recorded only in `FeeAssignment`? Run on **production** (read-only):

```js
// Receipts present in FeeAssignment.payments but absent from StudentFee.paymentHistory
const sfReceipts = new Set(
  db.studentfees.aggregate([
    { $unwind: '$paymentHistory' },
    { $project: { r: '$paymentHistory.receiptNumber' } }
  ]).toArray().map(d => d.r)
);
const orphans = db.feeassignments.aggregate([
  { $unwind: '$payments' },
  { $project: { r: '$payments.receiptNumber', amt: '$payments.amount' } }
]).toArray().filter(d => !sfReceipts.has(d.r));
print('orphan receipts: ' + orphans.length);
print('orphan value ₹: ' + orphans.reduce((s, d) => s + d.amt, 0));
```

**A non-zero result confirms F1 and fixes the ingest design as §2.2.** A zero result means every payment has so far gone through `recordPayment` with a pre-existing ledger, and the union ingest is cheap insurance rather than a correction.

**Null/blank receipt numbers** — would break the idempotency key:

```js
db.studentfees.countDocuments({ 'paymentHistory.receiptNumber': { $in: [null, ''] } })
db.feeassignments.countDocuments({ 'payments.receiptNumber': { $in: [null, ''] } })
```

Both must be `0`. If not, the key must fall back to a composite (`student` + `paidOn` + `amount`).

**Receipt uniqueness** — `genReceipt()` must not collide:

```js
db.studentfees.aggregate([
  { $unwind: '$paymentHistory' },
  { $group: { _id: '$paymentHistory.receiptNumber', n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } }
]).toArray()
```

Empty = safe.

**E1 confirmed absent.** No fee, salary, or expense route accepts `?since=` / `?updatedAfter=`. Full re-scan per cycle: ~500 payment records — negligible. E1 stays deferred.

---

## 8. Deviations from the specification

| Ref | Spec says | This plan does | Why |
|---|---|---|---|
| DD §9 | Ingest `StudentFee.paymentHistory[]`; do not post from `FeeAssignment.payments[]` | Ingest the **union**, dedup on `receiptNumber` | `payAssignment` writes assignment-only payments when no ledger exists (§2.2) |
| DD §9 | Idempotency key = source `_id` / `receiptNumber` | Key = **`receiptNumber` only** | Subdocument `_id`s differ across the three systems for the same payment |
| DD §0.2 | Own-process preferred | **In-process** recommended | 1 GB production VPS; see D1 recommendation |
| DD §0.3 | Replica set required before Phase 1 | Staging done; **production outstanding** | F3 |

---

## 9. Definition of done for P0.3

- [x] Current model extracted from code and live DB
- [x] `fms_` collision check — zero collisions
- [x] Mapping table with no EXTEND rows
- [x] Reference entities identified as opaque-ObjectId, not refs
- [x] Naming/type reconciliation rules stated (float→paise; explicit collection names)
- [x] Additive, reversible migration strategy with file list
- [x] No migrations executed
- [ ] **F1 exposure measured on production** (§7)
- [ ] **Production converted to replica set** (F3)
- [ ] D1 confirmed by Vijay
- [ ] **E4 decision — delete guard as Phase 5 prerequisite, or accepted risk** (F4, §2.4)

P0.4 (Integration Architecture) should not start until the §7 queries have been run — the ingest contract it defines depends on the F1 result.