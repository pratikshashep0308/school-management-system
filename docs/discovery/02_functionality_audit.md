# 02 — Existing System Functionality Audit

**Project:** The Future Step School ERP → Financial Management System (FMS)
**Phase:** P0.2 (Discovery — exploration only, no code modified)
**Repository analysed:** `school-management-system-main`
**Depends on:** `01_tech_stack.md` (P0.1)
**Feeds:** P0.3 (DB reconciliation), P0.4 (integration plan)
**Date:** 2026-07-24

---

## 0. Method, and one correction to the checklist

Every table, field, endpoint and function below was read out of the repository and is cited to a file
(and line, where useful). Nothing is inferred from the SRS. Where the SRS and the code disagree, **the
code is reported as truth and the divergence is flagged**.

The P0.2 prompt asks for nine named modules including **Inventory** and **HR**, with "special, detailed
attention" to Fee Collection, Payroll and **Inventory**.

> ### ⚠️ Inventory does not exist in this codebase.
> An exhaustive search for `inventory`, `stockItem`, `purchaseOrder`, `vendor`, `Vendor` across
> `models/`, `routes/`, `controllers/` and `services/` returns **zero matches**. There is no stock
> register, no vendor master, no purchase order, no goods-receipt, and therefore no inventory valuation.
> There is nothing to integrate with and nothing to avoid duplicating — the FMS Purchase-to-Pay and
> inventory-valuation scope is **100% greenfield**. This is consistent with the SRS §1.6 module
> inventory, which also omits Inventory.
>
> **HR** likewise does not exist as a module. There is no employee master, leave, or contract model;
> `Teacher` plus `TeacherAttendance` is the entire staff domain, and `SalarySlip` is payroll.

The audit therefore covers the modules that **actually exist**, and records Inventory/HR as absences
rather than inventing tables for them.

### The single most important finding

**Fee Collection is implemented three times over, and one payment writes to two of those systems
simultaneously without a transaction.** `StudentFee`, `FeePayment`/`FeeStructure`, and
`FeeAssignment`/`FeeType` are three overlapping money models. Section 3 documents this in full. It is
the dominant integration risk for the FMS and must be resolved in P0.3 before any ledger is posted.

---

## 1. Module inventory (what actually exists)

Collections are Mongoose models; the MongoDB collection name is the lowercased plural of the model name
(e.g. model `FeeAssignment` → collection `feeassignments`). Model names are used throughout.

| # | Module | Route base | Router file | Model file(s) | Matrix key |
|---|---|---|---|---|---|
| 1 | Auth / RBAC | `/api/auth` | `routes/authRoutes.js` | `models/User.js`, `models/RolePermission.js` | *(ungated)* |
| 2 | School | `/api/school` | `routes/schoolRoutes.js` | `models/School.js` | *(ungated)* |
| 3 | Students | `/api/students` | `routes/studentRoutes.js` | `models/Student.js` | `students` |
| 4 | Student Portal | `/api/student-portal` | `routes/studentPortalRoutes.js` | — | *(ungated)* |
| 5 | Admissions | `/api/admissions` | `routes/admissionRoutes.js` | `models/Admission.js` | `admissions` |
| 6 | Teachers | `/api/teachers` | `routes/teacherRoutes.js` | `models/Teacher.js` | `teachers` |
| 7 | Classes | `/api/classes` | `routes/classRoutes.js` | `models/index.js` (`Class`) | `classes` |
| 8 | Subjects | `/api/subjects` | `routes/subjectRoutes.js` | `models/index.js` (`Subject`) | `subjects` |
| 9 | Attendance | `/api/attendance` | `routes/attendanceRoutes.js` | `models/index.js` (`Attendance`, `TeacherAttendance`, `AttendanceSubmission`) | `attendance` |
| 10 | Exams | `/api/exams`, `/api/exams-adv` | `routes/examRoutes.js`, `examAdvancedRoutes.js` | `models/index.js` (`Exam`, `Result`), `models/examModels.js` | `exams` |
| 11 | **Fee Collection 💰** | `/api/fees` | `routes/feeRoutes.js` | `models/FeeType.js`, `models/FeeAssignment.js`, `models/index.js` (`StudentFee`, `FeePayment`, `FeeStructure`, `FeeEditRequest`) | `fees` |
| 12 | **Class Fee Templates 💰** | `/api/class-fee-templates` | `routes/classFeeTemplateRoutes.js` | `models/ClassFeeTemplate.js` | `fees` |
| 13 | **Expenses 💰** | `/api/expenses` | `routes/expenseRoutes.js` | `models/Expense.js` (`Expense`, `ExpenseCategory`) | `expenses` |
| 14 | **Payroll / Salary 💰** | `/api/salary` | `routes/salaryRoutes.js` | `models/Salary.js` (`SalarySlip`) | **none — ungated** |
| 15 | Timetable | `/api/timetable` | `routes/timetableRoutes.js` | `models/Timetable.js` | `timetable` |
| 16 | Homework | `/api/homework` | `routes/homeworkRoutes.js` | `models/Homework.js` | `homework` |
| 17 | Assignments | `/api/assignments` | `routes/assignmentRoutes.js` | `models/index.js` (`Assignment`) | `assignments` |
| 18 | **Library 💰** | `/api/library` | `routes/libraryRoutes.js` | `models/index.js` (`Book`, `BookIssue`) | `library` |
| 19 | **Transport 💰** | `/api/transport` | `routes/transportRoutes.js` | `models/transportModels.js`, `models/index.js` (`Transport`, `Vehicle`, `TransportFee2`) | `transport` |
| 20 | Notifications | `/api/notifications` | `routes/notificationRoutes.js` | `models/index.js` (`Notification`) | `notifications` |
| 21 | Meetings | `/api/meetings` | `routes/meetingRoutes.js` | `models/Meeting.js` | `meetings` |
| 22 | Behavioural Notes | `/api/behavioural-notes` | `routes/behaviouralNoteRoutes.js` | `models/BehaviouralNote.js` | `behaviourNotes` |
| 23 | Dashboard | `/api/dashboard` | `routes/dashboardRoutes.js` | — | `dashboard` |
| 24 | **Reports 💰** | `/api/reports` | `routes/reportRoutes.js` | `models/Report.js` | `reports` |
| 25 | Admins / Settings | `/api/admins` | `routes/adminRoutes.js` | `models/User.js` | `settings` |
| 26 | Permissions | `/api/permissions` | `routes/permissionRoutes.js` | `models/RolePermission.js` | *(deliberately ungated)* |
| 27 | Uploads | `/api/uploads` | `routes/uploadRoutes.js` | — | *(ungated)* |
| — | ~~Inventory~~ | — | **DOES NOT EXIST** | — | — |
| — | ~~HR~~ | — | **DOES NOT EXIST** | — | — |

💰 = has a financial touchpoint. Route/matrix mapping: `backend/server.js:128–157`.

---

## 2. Non-financial modules (brief)

Documented for completeness; integration relevance is Low unless noted.

**Student Management** — `models/Student.js`, `/api/students`. Roles: schoolAdmin, teacher, accountant (read),
student/parent (own record). The `Student._id` is the join key for every fee document, so it is the FMS's
primary subject dimension. `Student.class`, `.section`, `.rollNumber`, `.isActive`, `.parentId` matter for
fee segmentation and defaulter reporting. *Relevance: Medium — dimension, not money.*

**Admission** — `models/Admission.js`, `/api/admissions`. **Has a financial touchpoint**:
`Admission.registrationFee { amount, paid, paidOn, receiptNo }` (`models/Admission.js:152–157`). This is a
real cash receipt that is **completely disconnected from the fee module** — it does not create a
`FeePayment`, a `StudentFee.paymentHistory` entry, or a `FeeAssignment`. Registration fee income is
therefore **invisible to every existing financial report**. *Relevance: Medium — small but genuinely
unrecorded income stream.*

**Attendance** — `Attendance`, `TeacherAttendance`, `AttendanceSubmission` (`models/index.js`).
Worth noting for the FMS: `AttendanceSubmission` implements a **draft → submitted → pending_approval →
approved** lifecycle with an append-only `auditLog[]` (`models/index.js`, `AttendanceAuditEntrySchema`).
This is the cleanest existing approval-workflow precedent in the codebase and is a better structural
model for FMS voucher approval than the fee-edit pattern the SRS points at. `TeacherAttendance` is a
potential future input to payroll (LOP) but **is not currently used by `salaryController`**.
*Relevance: Low for money, High as a pattern.*

**Exams, Timetable, Homework, Assignments, Meetings, Behavioural Notes, Notifications, Student Portal** —
no money fields. *Relevance: Low.*

**Reports** — `models/Report.js`, `services/reportEngine.js`, `/api/reports`, plus scheduled delivery in
`jobs/scheduledReports.js`. Generic report definitions with pdfkit/exceljs/json2csv export. This is
**reusable FMS infrastructure** — the FMS should register its statements as report definitions rather
than build a second export stack. *Relevance: High as infrastructure.*

---

## 3. 💰 FEE COLLECTION — detailed

**Purpose:** bill students and record fee receipts.
**Primary roles:** `superAdmin`, `schoolAdmin`, `accountant` (the `ADMIN` array in `routes/feeRoutes.js`);
students/parents read their own via `/api/fees/student/:studentId`.
**Route file:** `routes/feeRoutes.js` · **Controller:** `controllers/feeController.js` (~1200 lines) ·
**Service:** `services/feeService.js` · **Templates:** `services/classFeeTemplateService.js`.

### 3.1 The three-parallel-systems problem 🔴

| System | Models | Written by | Status |
|---|---|---|---|
| **A. Student fee ledger** | `StudentFee` (+ embedded `paymentHistory[]`) | `recordPayment`, `setupClassLedger`, assignment creation | **Live — primary** |
| **B. Structure + payment** | `FeeStructure`, `FeePayment` | `recordPayment` (`feeController.js:178`), `createStructure` (`:417`) | **Live — parallel** |
| **C. Assignment** | `FeeType`, `FeeAssignment` (+ embedded `installments[]`, `payments[]`) | `createAssignment` (`:503`), `generateTransportFees` (`:586`), `payAssignment` (`:619`) | **Live — parallel** |

All three are actively written. `recordPayment` (`feeController.js:129–178`) performs a **dual write**:
it updates `StudentFee.paymentHistory[]` **and** creates a separate `FeePayment` document for the same
rupees — with **no transaction** wrapping the pair (consistent with P0.1 finding ④: no `startSession`
anywhere in the codebase).

**Consequences the FMS must handle:**

1. **Double-count risk.** A naive hook posting from both `StudentFee.paymentHistory[]` and `FeePayment`
   books the same receipt twice. The ledger must post from **exactly one** source.
2. **Partial-failure drift.** If the `FeePayment.create` at `:178` fails after `StudentFee` saved, the two
   systems silently disagree. There is no reconciliation job.
3. **`FeeAssignment.payments[]` is a third, independent receipt store** written by `payAssignment` (`:619`).
4. **No standalone receipt entity.** Receipts live embedded in three different arrays.

**Recommendation for P0.3/P0.4:** designate **`StudentFee.paymentHistory[]` as the single posting source**
— it is what `getFinanceSummary` already treats as school income (§3.6) — and treat `FeePayment` as a
legacy mirror. Confirm with a data-count reconciliation before Phase 1.

### 3.2 Exact tables and columns

**`StudentFee`** — `models/index.js`, exported line ~`module.exports.StudentFee`. *(Primary ledger.)*

| Column | Type | Financial meaning |
|---|---|---|
| `student` | ObjectId → Student, **unique** | Subject. Unique ⇒ **one ledger per student, no academic-year dimension** |
| `class`, `section`, `school` | ObjectId / String | Scoping |
| `totalFees` | Number (float ₹) | Amount billed |
| `paidAmount` | Number (float ₹) | **Derived** — recomputed in `pre('save')` from `paymentHistory[]` |
| `pendingAmount` | Number (float ₹) | **Derived** — `max(0, totalFees − paidAmount)` |
| `paymentStatus` | enum `not_paid｜partial｜paid` | **Derived** |
| `paymentHistory[]` | array | **The receipt store** |

`paymentHistory[]` sub-fields: `amount`, `paidOn`, `method` (`cash｜online｜cheque｜bank｜upi`),
`transactionId`, `receiptNumber`, `month`, `year`, `remarks`, `collectedBy` → User, `feeStructure` →
FeeStructure, plus receipt-rendering fields `periodLabel`, `periodMonths`, `periodCovered`, `items[]`
(`label`, `perMonth`, `total`, `payingNow`), `subtotal`, `discountPct`, `discountAmt`, `totalAmount`,
`balanceAfter`, `paidBeforeThis`, `parentName`.

> **`discountPct` / `discountAmt` sit inside the payment record.** A discount is recorded at *collection*
> time, not as a billing adjustment — so scholarships/waivers are invisible until someone pays. The FMS
> must decide whether these post as contra-revenue.

**`FeePayment`** — `models/index.js`. Columns: `student`, `feeStructure`, `amount`, `paidOn`, `method`,
`transactionId`, `receiptNumber` (**`unique: true` globally — not per-school**), `status`
(`paid｜pending｜overdue｜partial`), `month`, `year`, `remarks`, `collectedBy`, `school`.

**`FeeStructure`** — `models/index.js`. Columns: `name`, `class`, `amount`, `frequency`
(`monthly｜quarterly｜annually｜one-time`), `dueDay`, `lateFee`, `description`, `school`.

**`FeeType`** — `models/FeeType.js`. Columns: `name`, `description`, `category`
(`tuition｜exam｜transport｜uniform｜library｜sports｜other`), `isRecurring`, `frequency`,
`defaultAmount`, `isActive`, `school`, `createdBy`. Unique on `{school, name}`.
**This is the closest thing to a revenue chart-of-accounts and is the natural COA mapping key.**

**`FeeAssignment`** — `models/FeeAssignment.js`. Columns: `student`, `class`, `section`, `feeType`,
`baseAmount`, `discountPct`, `discountAmt`, `discountReason` (*"Scholarship", "Sibling", "Waiver"*),
`finalAmount`, `lateFeePerDay`, `transportRoute`, `paidAmount`, `pendingAmount`, `status`
(`pending｜partial｜paid｜overdue｜waived`), `dueDate`, `month`, `year`, `hasInstallments`,
`installments[]`, `payments[]`, `school`, `createdBy`.

`installments[]`: `number`, `amount`, `dueDate`, `paidAmount`, `paidOn`, `status`, `receiptNumber`.
`payments[]`: `amount`, `paidOn`, `method`, `transactionId`, `receiptNumber`, `remarks`, `collectedBy`,
`installmentNumber`.

> **Late fee is computed but never persisted.** `FeeAssignmentSchema.pre('save')` calculates
> `daysLate × lateFeePerDay` into `this._lateFeeAccrued` — an underscore-prefixed **non-schema** property.
> It is discarded on save. Accrued late fees are therefore **not receivable anywhere in the database**.
> Any FMS late-fee revenue is net-new.

**`FeeEditRequest`** — `models/index.js`. The **maker-checker** trail: `payment` → FeePayment,
`receiptNumber`, `student`, `changes[]` (`field`, `from`, `to`), `reason`, `status`
(`pending｜approved｜rejected`), `requestedBy`/`requestedByName`/`requestedAt`,
`reviewedBy`/`reviewedByName`/`reviewedAt`, `reviewNote`, `school`.

**`ClassFeeTemplate`** — `models/ClassFeeTemplate.js`, per-class default fee heads.

### 3.3 Exact endpoints (`routes/feeRoutes.js`, all verified)

| Method | Path | Handler | Moves money? |
|---|---|---|---|
| POST | `/api/fees/pay` | `recordPayment` | **YES — dual-write** |
| POST | `/api/fees/payments` | `recordPayment` (alias, line 57) | **YES — same handler** |
| POST | `/api/fees/assignments/:id/pay` | `payAssignment` | **YES** |
| DELETE | `/api/fees/payment/:receiptNumber` | `deletePayment` | **YES — hard delete** 🔴 |
| POST | `/api/fees/assignments` | `createAssignment` | Billing |
| PUT | `/api/fees/assignments/:id` | `updateAssignment` | Billing |
| DELETE | `/api/fees/assignments/:id` | `deleteAssignment` | Billing — hard delete |
| POST | `/api/fees/generate-transport` | `generateTransportFees` | Billing (auto) |
| POST | `/api/fees/setup-ledger` | `setupClassLedger` | Billing (bulk upsert) |
| POST / PUT | `/api/fees/structures`, `/structures/:id` | `createStructure`, `updateStructure` | Config |
| GET / POST / PUT / DELETE | `/api/fees/types…` | fee-type CRUD | Config |
| DELETE | `/api/fees/ledger/:id` | `deleteStudentFee` | **Deletes a ledger** 🔴 |
| POST | `/api/fees/ledger/bulk-delete` | `bulkDeleteStudentFees` | **Bulk deletes ledgers** 🔴 |
| POST | `/api/fees/payments/:receiptNumber/edit-request` | `requestPaymentEdit` | Maker |
| POST | `/api/fees/edit-requests/:id/review` | `reviewFeeEditRequest` | Checker |
| GET | `/api/fees/edit-requests` | `getFeeEditRequests` | Read |
| GET | `/api/fees/receipt/:receiptNumber` \| `/pdf` | `getReceipt`, `downloadReceipt` | Read |
| GET | `/api/fees/dashboard`, `/summary`, `/class-summary`, `/analytics`, `/recent-payments`, `/students`, `/export`, `/student/:studentId` | reporting | Read |

🔴 **Hard deletes on financial data exist today** (`feeController.js:309`, `DELETE /payment/:receiptNumber`,
`/ledger/bulk-delete`), directly contradicting the guardrail *"no hard deletes on financial documents."*
Once the ledger exists, a hard delete silently orphans posted entries. These endpoints must be
soft-delete-converted or blocked for posted periods in Phase 1.

### 3.4 Transaction lifecycle (as actually implemented)

```
Billing:   setupClassLedger / createAssignment / generateTransportFees
             → StudentFee upsert (totalFees)  ± FeeAssignment.create
                 ↓
Receipt:   POST /api/fees/pay  (recordPayment)
             → StudentFee.paymentHistory.push({...})   ← receipt lives here
             → StudentFee.save()  → pre('save') recomputes paid/pending/status
             → FeePayment.create({...})                ← parallel copy, NO transaction
                 ↓
Receipt #: genReceiptNumber()  (utils, aliased feeController.js:19)
                 ↓
Print:     GET /api/fees/receipt/:receiptNumber(/pdf)
                 ↓
Correction: POST /payments/:receiptNumber/edit-request  → FeeEditRequest(pending)
            POST /edit-requests/:id/review              → approved ⇒ payment updated
```

**There is no invoice entity.** The cycle is *billed-amount-on-ledger → payment → receipt*, **not**
invoice → payment → receipt. The FMS should not assume an invoice exists.

### 3.5 Consumed / consuming

Consumes `Student`, `Class`, `Transport`/`TransportAssignment` (transport fee auto-generation), `User`
(`collectedBy`). Consumed by `services/expenseService.js` (income figure), `/api/dashboard`,
`/api/reports`, `jobs/scheduledReports.js`.

### 3.6 🔴 Existing accounting work — do not duplicate

`services/expenseService.js:92–124` already computes an **informal cash-basis P&L**:

```js
StudentFee.aggregate([{ $match:{school} }, { $group:{ _id:null, totalIncome:{ $sum:'$paidAmount' } } }])
...
incomeVsExpense: { totalIncome, totalExpenses, profit: totalIncome - totalExpenses, isProfit, profitPct }
```

Surfaced at **`GET /api/expenses/finance`** (`getFinanceSummary`, `controllers/expenseController.js:327`).

**This is the system's current "profit & loss".** Note what it means for the FMS:

- Income = `StudentFee.paidAmount` **only**. It **excludes** `FeeAssignment.payments[]`, library late fees,
  and `Admission.registrationFee` — so today's reported income is **understated**.
- Expenses = `Expense.amount` only. **Excludes payroll entirely** — `SalarySlip` is not in this aggregate,
  so the largest real cost is missing from the P&L.
- It is cash-basis, single-entry, with no accruals and no FY boundary.

The FMS accrual P&L **will not match** this number. Expect the divergence, explain it to the school, and
plan to retire `/api/expenses/finance` rather than run two contradictory profit figures side by side.

Also already built (reuse, don't rebuild): fee dashboards/analytics/class summaries
(`/api/fees/dashboard`, `/summary`, `/class-summary`, `/analytics`), CSV/Excel export (`/api/fees/export`),
receipt PDF generation, and the `FeeEditRequest` maker-checker.

---

## 4. 💰 PAYROLL / SALARY — detailed

**Purpose:** record monthly salary slips for teachers.
**Primary roles:** `superAdmin`, `schoolAdmin`, `accountant` (`ADMIN`, `routes/salaryRoutes.js:5`).
**Route file:** `routes/salaryRoutes.js` (lazy-loads controller) · **Controller:** `controllers/salaryController.js`.

> 🔴 **`/api/salary` is NOT gated by `checkPermission`.** In `server.js:141` the tuple is
> `['/api/salary', './routes/salaryRoutes']` — **no third element**, unlike `/api/fees` and
> `/api/expenses`. Salary data is protected only by `authorize()`; the RolePermission matrix cannot
> restrict it. For the most sensitive data in the school, this is a live gap.

### 4.1 Exact table and columns — `SalarySlip` (`models/Salary.js`)

| Column | Type | Notes |
|---|---|---|
| `school` | ObjectId → School, indexed | Scoping |
| `teacher` | ObjectId → Teacher | **Teachers only — non-teaching staff cannot be paid** |
| `month`, `year` | Number | 1–12 / YYYY |
| `basicSalary` | Number (float ₹) | |
| `allowances.hra｜da｜ta｜medical｜other` | Number | Embedded |
| `deductions.pf｜tax｜loan｜other` | Number | Embedded |
| `grossSalary`, `netSalary` | Number | |
| `paymentMode` | enum `cash｜bank｜upi｜cheque` | |
| `paymentDate` | Date | |
| `status` | enum `paid｜pending｜hold` | |
| `remarks` | String | |
| `paidBy` | ObjectId → User | |
| `createdAt`/`updatedAt` | timestamps:true | |

Indexes: `{school, teacher, month, year}` **unique**; `{school, month, year}`.

### 4.2 Statutory gap 🔴

The P0.2 prompt asks specifically about **PF / ESIC / PT / TDS**. Evidence:

- `deductions.pf` — exists, but is a **plain manually-entered number**. No wage ceiling, no 12%/13% split,
  no employer contribution, no UAN, no ECR output.
- `deductions.tax` — a generic field. **Not TDS**: no PAN, no section codes, no Form 16/24Q, no slab logic.
- **ESIC — does not exist.** No field, anywhere.
- **Professional Tax (PT) — does not exist.** No field, anywhere.
- **No employer-side contributions at all** (employer PF/ESIC are a real cost and are absent).
- No loan/advance master — `deductions.loan` is an unlinked number with no outstanding balance.

**All statutory payroll compliance is greenfield FMS scope.** Nothing here can be reused beyond the raw
allowance/deduction totals.

### 4.3 Endpoints (`routes/salaryRoutes.js`, all verified)

| Method | Path | Handler | Moves money? |
|---|---|---|---|
| GET | `/api/salary` | `getAll` | Read |
| POST | `/api/salary` | `pay` | **YES — creates/marks a slip paid** (`salaryController.js:31`, sets `status:'paid'`, `paidBy`, line 46) |
| GET | `/api/salary/sheet` | `getSalarySheet` | Read |
| GET | `/api/salary/:id` | `getOne` | Read |
| PUT | `/api/salary/:id` | `update` | **YES — mutates amounts** (`:54`) |
| DELETE | `/api/salary/:id` | `remove` | **YES — hard delete** 🔴 (`:75`) |

### 4.4 Lifecycle and gaps

```
POST /api/salary  →  SalarySlip upsert (status 'paid', paidBy, paymentDate)  →  done
```

That is the whole lifecycle. **No approval step, no maker-checker, no payroll run/batch entity, no
period lock, and no audit trail** (`SalarySlip` has no `editHistory[]`/`auditTrail`, unlike `Expense`).
`PUT /:id` silently overwrites amounts; `DELETE /:id` hard-deletes a salary payment. `TeacherAttendance`
exists but is **not** consumed by `salaryController` — no LOP calculation.

Payroll is also **absent from `incomeVsExpense`** (§3.6), so salary cost appears in no existing P&L.

*Integration relevance: **High**. `SalarySlip.status → 'paid'` is a clean posting trigger, but the FMS
must add approval, audit, statutory computation, and non-teaching staff support.*

---

## 5. ~~INVENTORY~~ — ABSENT

Confirmed by exhaustive search (§0). No `inventory`, `stockItem`, `purchaseOrder`, `vendor`, `Vendor`,
goods-receipt, or valuation model exists in `models/`, `routes/`, `controllers/`, or `services/`.

| Prompt asked for | Reality |
|---|---|
| Exact tables | **None exist** |
| Exact columns | **None exist** |
| Endpoints/functions/events | **None exist** |
| Inventory valuation touchpoint | **None exists** |
| Transaction lifecycle | **None exists** |

**Integration relevance: N/A — greenfield.** FMS vendor master, purchase requisition, PO, GRN,
three-way match, vendor payment and inventory valuation are all net-new. There is nothing to duplicate,
but also **no procurement data to migrate**, and no existing vendor list to seed from.

The **only** adjacent artefact is `Expense.attachmentUrl` (Cloudinary bills) — unstructured images of
purchases, with no vendor entity behind them.

---

## 6. 💰 Other financial touchpoints (smaller, but real)

**Expenses** — `models/Expense.js`, `/api/expenses`. `Expense.amount` (float ₹, `min:0`), `category` →
`ExpenseCategory`, `date`, `description`, `paymentMethod` (`cash｜upi｜bank｜cheque｜online`),
`attachmentUrl`/`attachmentType` (Cloudinary), recurring config (`isRecurring`, `recurringType`,
`recurringDay`, `nextDueDate`, `parentExpense`), `budgetLimit`, and — importantly —
**`editHistory[]` (`editedBy`, `editedAt`, `oldAmount`, `oldDesc`, `note`)**, the audit-trail pattern the
guardrail says to generalise. `ExpenseCategory` is the **de-facto expense chart-of-accounts** and the
natural COA mapping key. `budgetLimit` is a primitive budget already present.
Endpoints: `GET/POST /`, `DELETE /:id`, category CRUD, `/dashboard`, `/finance`, `/report`, `/export`,
`/recurring`. **No approval workflow** — an expense is created and immediately final.
*Relevance: **High**.*

**Transport fees** — `models/index.js` (`TransportFee2`: `studentName`, `studentId`, `routeId`,
`routeName`, `amount`, `month`, `year`, `status` `pending｜paid｜partial`, `dueDate`, `paidDate`, `school`)
**plus** `FeeAssignment.transportRoute` **plus** `POST /api/fees/generate-transport`. **A fourth money
store**, overlapping the fee module. Which one production actually uses must be settled in P0.3.
*Relevance: **High** (ambiguity risk).*

**Library late fees** — `BookIssue.lateFee` (`models/index.js`), computed at **₹5/day hard-coded** in
`routes/libraryRoutes.js:115` (`const lateFee = daysLate * 5`) and aggregated at `:135`. Real income,
**never posted to any fee or income record**. *Relevance: Medium.*

**Admission registration fee** — `Admission.registrationFee{amount,paid,paidOn,receiptNo}`
(`models/Admission.js:152–157`). Real receipt, disconnected from fees. *Relevance: Medium.*

**Scheduled financial email** — `jobs/scheduledReports.js` cron (daily 06:00, weekly Mon 06:30, monthly
1st 07:00) mails financial summaries. Reusable delivery rail. *Relevance: Medium.*

---

## 7. Summary table

| Module | Key tables (models) | Financial touchpoints | Integration relevance |
|---|---|---|---|
| **Fee Collection** | `StudentFee`, `FeePayment`, `FeeStructure`, `FeeAssignment`, `FeeType`, `FeeEditRequest`, `ClassFeeTemplate` | Billing, receipts (3 parallel stores), discounts/waivers, maker-checker, hard deletes | **HIGH** 🔴 |
| **Payroll** | `SalarySlip` | Basic/allowances/deductions, `status:'paid'`; no PF/ESIC/PT/TDS logic; no audit; ungated | **HIGH** 🔴 |
| **Expenses** | `Expense`, `ExpenseCategory` | Expense amounts, categories (de-facto COA), `budgetLimit`, `editHistory[]` | **HIGH** |
| **Transport** | `TransportFee2`, `Transport`, `Vehicle`, `transportModels.js` | Transport fee amounts (4th money store) | **HIGH** |
| **Reports** | `Report` + `reportEngine` | Export/delivery infrastructure | **HIGH** (infra) |
| **Admissions** | `Admission` | `registrationFee` — unrecorded income | **MEDIUM** |
| **Library** | `Book`, `BookIssue` | `lateFee` ₹5/day — unrecorded income | **MEDIUM** |
| **Students** | `Student` | Subject dimension for all fees | **MEDIUM** |
| **Auth/RBAC** | `User`, `RolePermission` | Roles gating money endpoints | **MEDIUM** |
| **Attendance** | `AttendanceSubmission` | Approval-lifecycle pattern to copy | **MEDIUM** (pattern) |
| **Teachers** | `Teacher` | Payee dimension for payroll | **MEDIUM** |
| ~~Inventory~~ | **none** | **none** | **N/A — greenfield** |
| ~~HR~~ | **none** | **none** | **N/A — greenfield** |
| Exams / Timetable / Homework / Assignments / Meetings / Notifications / Behaviour / Portal | various | none | **LOW** |

---

## 8. Concrete integration hooks for the FMS

Each is a real, verified attachment point. **Every hook must be idempotent per source `_id`** and — per
P0.1 finding ④ — cannot use a transaction until the replica set exists.

### Tier 1 — required for Phase 1

| # | Hook | Type | File | Ledger event |
|---|---|---|---|---|
| H1 | `recordPayment` | Controller fn | `controllers/feeController.js:129` | **Fee receipt** → Dr Cash/Bank, Cr Fee Income. Post from `StudentFee.paymentHistory[]` **only** (not the `FeePayment` copy at `:178`) |
| H2 | `POST /api/fees/pay` + `/api/fees/payments` | Endpoint | `routes/feeRoutes.js:56–57` | Same event, two paths — hook the controller, not the routes |
| H3 | `payAssignment` | Controller fn | `controllers/feeController.js:619` | **Fee receipt (assignment path)** — third receipt store |
| H4 | `salaryController.pay` | Controller fn | `controllers/salaryController.js:31` | **Payroll** → Dr Salary Expense, Cr Bank + Cr statutory liabilities |
| H5 | `Expense` create | Controller/model | `controllers/expenseController.js`, `POST /api/expenses` | **Expense** → Dr Expense (by `ExpenseCategory`), Cr Cash/Bank |
| H6 | `StudentFee` billing upserts | Controller fn | `setupClassLedger` (`:394`), `createAssignment` (`:503`), `generateTransportFees` (`:586`) | **Fee receivable** (accrual) |

### Tier 2 — required for correctness

| # | Hook | Type | File | Purpose |
|---|---|---|---|---|
| H7 | `FeeEditRequest` approve | Controller fn | `reviewFeeEditRequest`, `routes/feeRoutes.js:30` | **Adjustment entry** — never mutate a posted ledger line |
| H8 | `deletePayment` | Endpoint | `DELETE /api/fees/payment/:receiptNumber` | **Must become reversal, not delete** 🔴 |
| H9 | `deleteStudentFee` / `bulkDeleteStudentFees` | Endpoint | `routes/feeRoutes.js:67–68` | **Must be blocked for posted periods** 🔴 |
| H10 | `salaryController.update` / `.remove` | Controller fn | `salaryController.js:54`, `:75` | **Must become adjustment/reversal** 🔴 |
| H11 | `FeeType` | Collection | `models/FeeType.js` | Map each `FeeType` → revenue COA account |
| H12 | `ExpenseCategory` | Collection | `models/Expense.js` | Map each category → expense COA account |

### Tier 3 — completeness and reuse

| # | Hook | Type | File | Purpose |
|---|---|---|---|---|
| H13 | `Admission.registrationFee.paid → true` | Model field | `models/Admission.js:152` | Capture currently-unrecorded income |
| H14 | `BookIssue.lateFee` on return | Route logic | `routes/libraryRoutes.js:115` | Capture currently-unrecorded income |
| H15 | `TransportFee2` | Collection | `models/index.js` | Resolve vs `FeeAssignment` first |
| H16 | `reportEngine` + `Report` | Service | `services/reportEngine.js` | **Register FMS statements — don't build a second export stack** |
| H17 | `jobs/scheduledReports.js` cron | Job | `jobs/scheduledReports.js` | Recurring postings + statement delivery |
| H18 | `AttendanceSubmission.auditLog[]` | Pattern | `models/index.js` | **Copy this shape** for voucher approval |
| H19 | `Expense.editHistory[]` | Pattern | `models/Expense.js:47` | Generalise into `auditTrail` |
| H20 | `checkPermission` + `server.js:128–157` | Middleware | `middleware/checkPermission.js` | Add `fms` matrix keys; **gate `/api/salary`, currently ungated** 🔴 |

---

## 9. Verification pass

*Per the P0.2 Verify step: every table and endpoint named for Fee Collection, Payroll and Inventory,
confirmed against the codebase. Nothing unconfirmed is retained.*

**Fee Collection — models:** `StudentFee` ✅, `FeePayment` ✅, `FeeStructure` ✅, `FeeEditRequest` ✅
(all exported from `models/index.js`); `FeeType` ✅ (`models/FeeType.js`); `FeeAssignment` ✅
(`models/FeeAssignment.js`); `ClassFeeTemplate` ✅ (`models/ClassFeeTemplate.js`).

**Fee Collection — endpoints:** all 25+ verified present in `routes/feeRoutes.js` lines 16–71.
Dual-write confirmed at `feeController.js:178` (`FeePayment.create`) alongside `StudentFee` save.
`setupClassLedger` `:394`, `createAssignment` `:503`, `generateTransportFees` `:586`, `payAssignment` `:619`,
`StudentFee.deleteOne` `:309` — all confirmed by line.

**Payroll — model:** `SalarySlip` ✅ (`models/Salary.js`), all columns and both indexes read directly.
**Payroll — endpoints:** all 6 confirmed in `routes/salaryRoutes.js` lines 10–15; handlers confirmed in
`salaryController.js` (`getAll:4`, `getOne:19`, `pay:31`, `update:54`, `remove:75`, `getSalarySheet:84`).
Absence of `checkPermission` on `/api/salary` confirmed at `server.js:141`.

**Inventory:** ✅ **confirmed absent** — zero matches for `inventory｜Inventory｜stockItem｜purchaseOrder｜
PurchaseOrder｜vendor｜Vendor` across `models`, `routes`, `controllers`, `services`. No tables, columns or
endpoints are claimed. **HR** likewise confirmed absent.

**Claims deliberately recorded as absences** (each verified by exhaustive search, not assumed):
no Inventory, no HR, no ESIC field, no PT field, no invoice entity, no standalone receipt collection,
no payroll approval/audit trail, no persisted late fee on `FeeAssignment`, no transaction wrapping the
fee dual-write.

**Nothing in this document is unsubstantiated.** Two items are explicitly marked as *requiring live-data
confirmation* rather than stated as fact, because static code cannot settle them:

1. Which of the four fee/transport money stores production actually populates (needs row counts — P0.3).
2. Whether `StudentFee` and `FeePayment` currently agree in production (needs a reconciliation query — P0.3).

---

## 10. Open questions for the team

1. **Which fee system is authoritative?** Three parallel systems are live and `recordPayment` dual-writes.
   The FMS must post from exactly one. Recommendation: `StudentFee.paymentHistory[]`. **Blocks P0.4.**
2. **Do `StudentFee` and `FeePayment` currently reconcile in production?** If they already drift, the
   opening ledger balance is disputed before it is written.
3. **`StudentFee.student` is `unique: true`** — one ledger per student for all time, with no academic-year
   dimension. How should the FMS represent year-on-year balances and carry-forward?
4. **Transport fees:** `TransportFee2` or `FeeAssignment.transportRoute`? Which does production use?
5. **Discounts/waivers** are recorded inside the payment record, not against the bill. Should scholarships
   post as contra-revenue, and is there a policy list of valid `discountReason` values?
6. **Late fees are never persisted** (`_lateFeeAccrued` is discarded). Should the FMS accrue them, and from
   what date — retrospectively, or from go-live?
7. **Library ₹5/day and admission registration fees** are unrecorded income. In FMS scope from day one?
8. **Payroll statutory scope:** PF has only a manual number; ESIC/PT/TDS do not exist. Which are actually
   required for this school, and are there employer-side contributions to book?
9. **Non-teaching staff:** `SalarySlip.teacher` → `Teacher` only. How are they paid today, and does the FMS
   need an employee master?
10. **`/api/salary` is ungated by the permission matrix.** Fix now as a security patch, or bundle into Phase 1?
11. **Hard deletes exist on fees and salary.** Approved to convert to soft-delete/reversal, and what
    happens to records deleted *before* the FMS goes live?
12. **`GET /api/expenses/finance` reports a cash-basis "profit"** that excludes payroll and most income.
    Retire it at FMS go-live, or keep it and accept two contradictory profit figures?
13. **Opening balances:** does the ledger open with migrated historical fee/expense/salary data, or with a
    clean opening-balance voucher at a cut-off date?
14. **Are there other schools in production** (multi-tenant `school` scoping), or only The Future Step School?