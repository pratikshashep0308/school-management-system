# 01 — Technology Stack Assessment

**Project:** The Future Step School ERP → Financial Management System (FMS)
**Phase:** P0.1 (Discovery — exploration only, no code modified)
**Repository analysed:** `school-management-system-main`
**Date:** 2026-07-24
**Status:** Complete — 5 blocking issues raised for architect sign-off

---

## 0. Method & scope

Read-only exploration of the repository. Every finding below cites the exact file
(and where useful, line) that evidences it. No production code was written or modified
in this task, per the P0.1 mandate.

Repository is a **two-package monorepo** (no workspace tooling):

```
school-management-system-main/
├── backend/     Node.js + Express + Mongoose        ← FMS will be hosted here
├── frontend/    React 18 CRA + Tailwind
└── ecosystem.config.js   PM2 process definitions
```

**Which service hosts the FMS:** `backend/`. It is the only service with data access,
and it already owns the three modules the FMS must extend (Expense, Fee, Salary).

---

## 1. Summary stack table

| Layer | Technology | Version | Evidence file |
|---|---|---|---|
| Backend runtime | Node.js (CommonJS) | not pinned — no `engines` field | `backend/package.json` |
| Backend framework | Express | ^4.19.2 | `backend/package.json` |
| Async error handling | express-async-errors | ^3.1.1 | `backend/package.json`, `backend/server.js` |
| Database | MongoDB | server version not pinned in repo | `backend/config/db.js` |
| ODM | Mongoose | ^8.4.1 | `backend/package.json` |
| Migrations | **None** — ad-hoc seed/patch scripts only | — | `backend/utils/`, `backend/scripts/` |
| Auth | JWT (Bearer), bcryptjs hashing | jsonwebtoken ^9.0.2, bcryptjs ^2.4.3 | `backend/middleware/auth.js`, `backend/models/User.js` |
| RBAC | `authorize(...roles)` + `RolePermission` matrix | — | `backend/middleware/auth.js`, `backend/middleware/checkPermission.js`, `backend/models/RolePermission.js` |
| API style | REST, base `/api`, **unversioned** | — | `backend/server.js` (lines 128–157) |
| Response envelope | `{ success, data }` (+ `count`, `message`) | — | `backend/routes/_allRoutes.js` |
| Error handling | Central error middleware | — | `backend/middleware/errorHandler.js` |
| Security middleware | helmet, express-rate-limit, cors | ^7.1.0, ^7.3.1, ^2.8.5 | `backend/server.js` |
| Realtime | socket.io | ^4.8.3 | `backend/sockets/transportSocket.js` |
| Scheduler | node-cron | ^4.2.1 | `backend/jobs/scheduledReports.js` |
| File/blob storage | Cloudinary + multer; local disk fallback | cloudinary ^1.41.3, multer ^1.4.5-lts.1 | `backend/controllers/expenseController.js`, `backend/middleware/uploadAttachment.js` |
| Email | nodemailer | ^6.9.14 | `backend/controllers/authController.js`, `backend/jobs/scheduledReports.js` |
| Exports | exceljs, pdfkit, json2csv | ^4.4.0, ^0.15.2, ^6.0.0-alpha.2 | `backend/package.json` |
| Frontend framework | React | ^18.3.1 | `frontend/package.json` |
| Frontend build | Create React App (react-scripts) | 5.0.1 | `frontend/package.json` |
| Styling | Tailwind CSS + PostCSS | ^3.4.4 | `frontend/tailwind.config.js` |
| HTTP client | axios | ^1.7.2 | `frontend/package.json` |
| Charts | Chart.js + react-chartjs-2 | ^4.4.3 / ^5.2.0 | `frontend/package.json` |
| Routing | react-router-dom | ^6.24.0 | `frontend/package.json` |
| Package manager | npm (`package-lock.json`) | — | both `package-lock.json` files |
| **Testing (backend)** | **None** | — | no test dep in `backend/package.json`; no spec files found |
| **Testing (frontend)** | RTL/Jest installed, **unused** | — | `frontend/package.json`; no spec files found |
| **Linting/formatting** | CRA eslint only; **no Prettier, no backend lint** | — | `frontend/package.json` `eslintConfig` |
| **CI/CD** | **None** | — | no `.github/`, `.gitlab-ci.yml`, `Jenkinsfile` |
| **Containerisation** | **None** | — | no `Dockerfile` / `docker-compose.yml` |
| Process manager | PM2 | — | `ecosystem.config.js` |
| Hosting | Oracle Cloud Ubuntu 22.04 VPS, HTTPS via Certbot | — | `backend/server.js` CORS allowlist (`portal.thefuturestepschool.in`, `80.225.252.56`) |

---

## 2. Detailed findings

### 2.1 Backend language, framework, versions
`backend/package.json` declares CommonJS Express 4.19.2 on Node.js. **No `engines` field**, so the
Node version is environment-dictated rather than repo-pinned — a reproducibility gap the FMS should close.
`express-async-errors` is required at the top of `server.js`, so `async` route handlers throw straight to
`errorHandler.js` without explicit `try/catch`. The FMS can rely on this idiom.

### 2.2 Frontend
Create React App 5.0.1 — **not** Vite/Next. Notable for the FMS because CRA is unmaintained, has no
code-splitting config surface without ejecting, and is memory-hungry at build time (the 1 GB VPS
requires swap + `NODE_OPTIONS=--max-old-space-size=1024`). Tailwind 3.4.4 via PostCSS is the styling
system; `frontend/tailwind.config.js` is the design-token surface the FMS screens should extend.

### 2.3 Database, ODM, migrations
Mongoose 8.4.1 connects in `backend/config/db.js` via `process.env.MONGO_URI`.

> **Two significant findings here.**

**(a) No migration framework.** Schema evolution is handled by hand-written one-off scripts —
`backend/utils/seedData.js`, `seedTransport.js`, `migrateParents.js`, `backend/scripts/backfillAdmissionSnapshot.js`.
None are reversible, none are tracked in a migrations ledger, and none record whether they have already run.
The playbook guardrail *"schema changes go through reversible Mongoose migration/seed scripts"* has **no
existing tool to reference** — contrary to the assumption in P0.3, which says the migration prompt
"references the existing migration tool discovered in P0.1." There is none. This must be built.

**(b) Destructive index drops on every boot.** `config/db.js` drops eight indexes on startup
(`transportassignments`, `buses`, `busroutes`), and `server.js` repeats three of them in
`dropTransportIndexes()`. These are one-time migrations that were never retired. They run on
every process restart, are silently swallowed by empty `catch` blocks, and are exactly the kind of
untracked schema mutation the FMS ledger cannot tolerate.

### 2.4 Authentication and authorization
**Authentication:** JWT Bearer tokens. `User.getSignedJwtToken()` (`models/User.js:51`) signs
`{ id, role }` with `JWT_SECRET`, default expiry 30d. `protect` (`middleware/auth.js`) verifies the
token, reloads the user, and rejects inactive accounts. **No OAuth2, no sessions, no refresh tokens** —
a 30-day non-revocable access token is the entire auth story.

**Authorization** is two independent layers:

1. `authorize(...roles)` — hard-coded role allowlist per route.
2. `checkPermission(moduleKey)` — the `RolePermission` matrix, applied per module at mount time in
   `server.js` (the third element of each route tuple, e.g. `['/api/fees', './routes/feeRoutes', 'fees']`).

Levels are `none | read | edit | admin`, cached 30 s in-process (`checkPermission.js`).

**Roles** (`models/User.js:28`) — the complete enum:
`superAdmin, schoolAdmin, teacher, student, parent, accountant, librarian, transportManager`

**Multi-tenancy:** every scoped query filters on `req.user.school` (an ObjectId on `User`). This is
convention, not enforcement — there is no global Mongoose plugin guaranteeing it.

### 2.5 API style and conventions
REST over `/api`, mounted from a table in `server.js:128–157`. Envelope is `{ success: true, data }`
with optional `count` and, on failure, `{ success: false, message }`.

- **No versioning.** No `/api/v1`. Any doc specifying `/api/v1` is wrong against this codebase.
- **No standard pagination.** No shared `limit`/`skip`/`page` helper; list endpoints return full
  collections (e.g. `teacherRouter.get('/')` in `_allRoutes.js`). At school scale this is survivable;
  for `ledgerEntries` it is not — the FMS must introduce pagination.
- **Error format** is a bare `message` string, with no error codes or field-level validation detail.

### 2.6 Async, caching, storage
- **Scheduler:** `node-cron` in `backend/jobs/scheduledReports.js` — three jobs (daily 06:00, weekly Mon 06:30, monthly 1st 07:00).
- **Queues:** none. No BullMQ/Redis/Agenda. Cron jobs run in-process on the single PM2 backend instance.
- **Caching:** none, other than the 30 s in-memory permission Map. No Redis.
- **Storage:** Cloudinary (expense attachments) plus local-disk multer uploads served statically from `backend/uploads`. Local disk on a single VPS is not durable — relevant for FMS voucher attachments.

### 2.7 Testing, linting
**Zero automated tests.** No Jest/Mocha/Supertest in `backend/package.json`; no `*.test.js` or
`*.spec.js` anywhere in the repo. The frontend ships CRA's RTL/Jest dependencies but has no spec files.
Effective coverage: **0%**.

Linting is CRA's built-in `react-app` eslint config, frontend only. The backend has **no linter and no
formatter**. There is no Prettier config, so style is unenforced.

This directly conflicts with the guardrail *"write tests alongside code; do not mark work done while
tests fail."* There is no harness to run. **Standing up the test harness is a prerequisite to Phase 1**,
not an optional extra — a double-entry ledger without tests is indefensible.

### 2.8 Build, CI/CD, deployment
No Docker, no CI/CD pipeline, no IaC. Deployment is manual:
`local VS Code → git push → server git pull → react-scripts build → pm2 restart`.

`ecosystem.config.js` is **stale and Windows-only** — `cwd` paths point at
`C:/Users/Admin/Desktop/school-management-systems/...`, which cannot resolve on the Ubuntu VPS.
The production PM2 processes are therefore running from a config that is not the one in the repo.

### 2.9 Third-party services integrated
| Service | Purpose | Evidence |
|---|---|---|
| Cloudinary | Expense attachment storage | `controllers/expenseController.js` |
| Nodemailer (SMTP) | Password reset, scheduled report delivery | `controllers/authController.js`, `jobs/scheduledReports.js` |
| Socket.IO | Live transport tracking | `sockets/transportSocket.js` |

**No payment gateway** (no Razorpay/PayU/Stripe), **no SMS provider**, **no WhatsApp Business API**.
Fee payments are recorded manually with a `method` enum (`cash, upi, online, cheque, bank` —
`models/FeeAssignment.js:61`); WhatsApp "sharing" is a client-side share link, not an API integration.
Any FMS requirement assuming online payment collection or automated SMS/WhatsApp receipts is
**net-new integration work**, not a reuse.

---

## 3. Compatibility with FMS target

Target: MongoDB via Mongoose · REST + JWT · integer-paise money · RolePermission RBAC.

### 3.1 Exact matches — adopt as-is
| Target requirement | Existing reality | Verdict |
|---|---|---|
| MongoDB + Mongoose | Mongoose 8.4.1 | ✅ Match |
| REST + JWT | Express REST, JWT Bearer | ✅ Match |
| `{success,data}` envelope | Already universal | ✅ Match |
| `/api` base path | Already `/api` | ✅ Match |
| ObjectId ids & refs | Standard throughout | ✅ Match |
| `school` scoping | On every scoped model | ✅ Match (convention only) |
| RolePermission RBAC | Model + middleware exist | ⚠️ Match with defects (§3.2 #2, #3) |
| Cron for recurring postings | node-cron in place | ✅ Match |
| Excel/PDF/CSV export | exceljs, pdfkit, json2csv | ✅ Match |
| Soft-delete/audit precedent | `Expense.editHistory[]` (`models/Expense.js:47`) | ✅ Generalise this |

### 3.2 Mismatches — must be resolved

**① Money is float rupees, not integer paise. 🔴 BLOCKING**
Every money field is `{ type: Number }` holding rupees:
`Expense.amount` (`models/Expense.js:21`), `FeeAssignment.baseAmount / finalAmount / paidAmount /
pendingAmount / installments[].amount` (lines 9–61), `Salary.basicSalary / grossSalary / netSalary` and
all allowance/deduction sub-fields (`models/Salary.js:6–24`).

JS `Number` is IEEE-754 double. Fractional rupees accumulate representation error, and a double-entry
ledger asserting `SUM(debit) === SUM(credit)` **will fail intermittently** on such data. This is the
single highest-risk mismatch in the assessment.

*Recommendation:* the FMS ledger stores **integer paise** exclusively, in new collections. Do **not**
retro-convert the existing float fields in place (that breaks working modules and violates the
"don't repurpose existing fields" guardrail). Instead the integration hooks convert at the boundary
(`Math.round(rupees * 100)`) and the reconciliation report flags any source document whose float value
is not exactly representable. A written reconciliation note is required before Phase 1.

**② `checkPermission` fails open, not deny-by-default. 🔴 BLOCKING**
`middleware/checkPermission.js` returns `next()` — i.e. **allows** the request — when (a) no
`RolePermission` row exists for the role, (b) the module key is absent from the matrix, or
(c) the permission lookup throws. The file documents this as deliberate backwards-compatibility.

The guardrail requires *"deny by default."* For fee collection, ledger posting and financial-year locks,
fail-open is unacceptable. *Recommendation:* the FMS route group gets its own strict wrapper that denies
on missing-row / missing-key / lookup-error, leaving the legacy middleware untouched for existing modules.

**③ Two required FMS roles do not exist. 🔴 BLOCKING**
The documentation manifest maps *Purchase Officer → `purchaseOfficer`* and *Auditor → `auditor`*.
Neither value is in the `User.role` enum (`models/User.js:28`) or the `RolePermission.role` enum
(`models/RolePermission.js`). Writing either value fails Mongoose enum validation.

*Recommendation:* add `purchaseOfficer` and `auditor` to both enums in a reversible migration before
Phase 1. This is an additive enum change and safe. All other manifest role mappings verified correct.

**④ MongoDB transactions are unproven on this deployment. 🔴 BLOCKING**
`grep` for `startSession` / `withTransaction` across the backend returns **zero results** — the codebase
has never used a transaction. `config/db.js` passes no replica-set options, and the VPS runs a local
single-node `mongod`, which by default is **standalone**. MongoDB multi-document transactions require
a replica set; on a standalone they throw *"Transaction numbers are only allowed on a replica set member or mongos."*

The core FMS invariant — *"every money event posts balanced ledgerEntries inside a MongoDB transaction"* —
is therefore **not currently executable on production**. *Recommendation:* convert the VPS `mongod` to a
single-node replica set (`replSet` in `mongod.conf` + `rs.initiate()`), then prove it with a spike that
commits and aborts a two-collection transaction. Until that spike passes, Phase 1 cannot start.
Note the 1 GB RAM constraint — verify the oplog sizing is modest.

**⑤ No test harness. 🔴 BLOCKING for the guardrail**
Zero tests exist (§2.7). *Recommendation:* add Jest + Supertest + `mongodb-memory-server` to the backend
as the first Phase-1 commit, before `LedgerPostingService`.

### 3.3 Lower-severity risks
| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 6 | Boot-time index drops (`config/db.js`, `server.js`) | Untracked schema mutation every restart | Retire into a run-once migration |
| 7 | Stale Windows `ecosystem.config.js` | Deployed config ≠ repo config | Rewrite for Ubuntu paths |
| 8 | No API pagination | `ledgerEntries` will grow unbounded | FMS list endpoints paginate from day one |
| 9 | No CI/CD | Tests can't gate merges | Add GitHub Actions running the new suite |
| 10 | 30-day non-revocable JWT | Long window on a finance system | Shorten expiry / add revocation for finance roles |
| 11 | `school` scoping is convention | One missed filter leaks cross-tenant financial data | Mongoose plugin or query helper on FMS models |
| 12 | Cron in-process, single instance | Duplicate postings if ever scaled to 2 PM2 instances | Idempotency keys per source `_id` (already a guardrail) |
| 13 | Local-disk uploads on one VPS | Voucher attachments not durable | Route FMS attachments to Cloudinary |
| 14 | CRA + 1 GB RAM | Build OOM as FMS screens land | Swap + `--max-old-space-size`; consider Vite migration later |
| 15 | No payment gateway / SMS / WhatsApp API | Assumed-existing integrations don't exist | Scope as net-new or drop from FMS requirements |

---

## 4. Recommendation

**Adopt the existing stack. Adapt the FMS target in two narrow places.**

The stack is a genuine match on every structural axis that matters — MongoDB/Mongoose, REST, JWT,
`{success,data}`, `/api`, ObjectId refs, `school` scoping, RolePermission RBAC, cron, and export
tooling all align with the FMS target. Rebuilding or introducing a second stack would be unjustifiable.

The two adaptations:

1. **Money.** Keep integer paise in the FMS ledger, but convert at the integration boundary rather than
   retro-fitting the existing float fields. The FMS is internally exact; legacy modules keep working.
2. **Permissions.** Add a strict deny-by-default wrapper for FMS routes instead of changing the
   fail-open behaviour of the shared middleware.

**Five items block Phase 1** and need architect sign-off: transactions/replica-set spike (④),
test harness (⑤), the two new roles (③), the money-conversion reconciliation note (①), and the strict
permission wrapper (②).

**Suggested pre-Phase-1 order:** ④ replica-set spike → ⑤ test harness → ③ role enums → ② strict wrapper → ① reconciliation note.

---

## 5. Open questions for the team

1. **MongoDB topology** — can the production `mongod` be converted to a single-node replica set, and is there a maintenance window? Without it there is no double-entry guarantee. *(Blocks everything.)*
2. **Backups** — the manifest lists backup automation as "not yet implemented." What is the RPO/RTO for financial data, and does the FMS go live before backups exist?
3. **Historical money data** — are there existing `Expense`/`FeeAssignment`/`Salary` records with fractional-paise float values, and should the ledger open with a migrated historical balance or a clean opening-balance voucher?
4. **Financial year** — the manifest references `School.academicYear` + a `financialYears` lock. Should the FY follow the Indian Apr–Mar convention independently of the academic year?
5. **Roles** — do Purchase Officer and Auditor map to real staff at this school, or should Phase 1 defer both and reuse `accountant`?
6. **Payment gateway** — is online fee collection in FMS scope? There is no gateway today; it is net-new.
7. **Node version** — what Node major runs on the VPS? Needs pinning via `engines` for reproducibility.
8. **Hosting headroom** — will the 1 GB / 1-OCPU VPS be upgraded? A replica set plus ledger growth plus CRA builds is tight.
9. **Index drops** — is it safe to retire the boot-time `dropIndex` calls, or is some environment still depending on them?
10. **`ecosystem.config.js`** — what is the actual PM2 config running in production, so the repo can be corrected to match?

---

## 6. Verification pass (per playbook)

Every stack-table row was re-checked against the cited file. All claims substantiated.
Claims deliberately marked as *absences* — no migration tool, no tests, no linter on backend, no CI/CD,
no Docker, no transactions, no payment gateway, no `purchaseOfficer`/`auditor` roles — were each
confirmed by exhaustive search rather than inferred, and are stated as findings in their own right.

Nothing in the table is unsubstantiated. Three items are explicitly **not pinned by the repo** and are
flagged as such rather than guessed: Node.js version, MongoDB server version, and the live PM2 config.