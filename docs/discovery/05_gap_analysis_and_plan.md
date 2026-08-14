# P0.5 — Gap Analysis, Roadmap & Definition of Done

**Project:** The Future Step School ERP (SMS) + Financial Management System (FMS) plugin
**Phase:** Discovery P0.5 · **Date:** 2026-07-27
**Status:** Synthesis only — no code
**Inputs:** `docs/discovery/01`–`04`, `01_Software_Requirements_Specification_v4`, `DATA_DICTIONARY_v3.md`, live codebase
**Purpose:** This document **gates all build phases.** Phase 1 does not start until §7 passes.

---

## 0. Executive summary

Discovery is complete. The architecture is sound and the transaction blocker is solved on staging. But synthesis surfaces something the individual phases did not: **five SRS acceptance criteria cannot be met as written**, because they assume infrastructure this school does not have.

| SRS criterion | Assumes | Reality | Status |
|---|---|---|---|
| **M15** — payroll posts PF/**ESIC**/**PT**/TDS | Those fields exist on the salary record | `SalarySlip.deductions = {pf, tax, loan, other}` — no ESIC, no PT | ❌ **Cannot meet** |
| **M19** — notifications via EMAIL/SMS/WHATSAPP/IN_APP | Mail + SMS + WhatsApp providers configured | `EMAIL_*` referenced in code, **absent from `.env`**; no SMS gateway; no WhatsApp API | ⚠️ **IN_APP only** |
| **M20** — documents encrypted, access-scoped | Cloud object storage | `multer.diskStorage` → **local VPS disk**, unencrypted. Cloudinary is a dependency but unconfigured | ⚠️ **Partial** |
| **M22** — login with optional 2FA | 2FA capability in auth | SMS auth is JWT only. No 2FA anywhere | ❌ **Cannot meet** |
| **M25** — 500 concurrent users, 99.9% uptime | Scaled infrastructure | 230 total accounts ever created; ~10 active students; single 1 GB VPS, no redundancy | ❌ **Not meaningful** |

None of these are defects in the discovery work or the plugin design. They are a specification written to a generic multi-school template being applied to a school with roughly 10 active students and 13 teachers. **The right response is to renegotiate the criteria, not to build to them.** §1.3 proposes revised targets.

Beyond that: the build is well-understood, the blockers are enumerated, and nothing found in P0.1–P0.5 undermines the plugin architecture.

---

## 1. Gap analysis — target vs existing, by SRS module

**Legend:** ✅ exists and reusable · 🟡 partially exists · ❌ net new · ⛔ cannot be built as specified

### 1.1 Modules mapped

| # | Module | Exists in SMS today | Gap | Verdict |
|---|---|---|---|---|
| M1 | Financial Dashboard | 🟡 `GET /api/fees/dashboard`, `/api/expenses/dashboard` — fee & expense summaries only, no ledger | No cash position, no drilldown to GL, no KPI framework | **BUILD NEW** on FMS data |
| M2 | Chart of Accounts | ❌ nothing | Entire CoA, groups, account tree | **BUILD NEW** |
| M3 | Income Management | 🟡 fee receipts exist (3 parallel systems) | No income voucher, no GL posting, no receipt numbering in FMS format | **BUILD NEW** + ingest existing |
| M4 | Expense Management | 🟡 `Expense` + `ExpenseCategory`, 2 docs live | No payable computation, no budget check, no maker-checker, no EXP numbering | **BUILD NEW**, consume SMS as input |
| M5 | Expense Approval Workflow | 🟡 **pattern exists** — `FeeEditRequest` is a working maker-checker | Not generalised; no matrix, no thresholds, no SoD | **BUILD NEW**, model on existing pattern |
| M6 | Budget Management | ❌ nothing | Full module | **BUILD NEW** |
| M7 | Vendor Management | ❌ nothing | Full module incl. GSTIN/PAN validation | **BUILD NEW** |
| M8 | Purchase Workflow | ❌ nothing | PR→PO→GRN→Invoice, three-way match | **BUILD NEW** — fully FMS-internal, no integration |
| M9 | Banking & Reconciliation | ❌ nothing | Bank accounts, statement import, reconciliation | **BUILD NEW**. *NEFT/RTGS execution is out of scope — no bank API* |
| M10 | Petty Cash | ❌ nothing | Float, daily closing, day lock | **BUILD NEW** |
| M11 | General Ledger | ❌ nothing | The core. Balanced double-entry, immutable | **BUILD NEW** — highest value, highest risk |
| M12 | Journal Voucher | ❌ nothing | Manual JV with Dr=Cr enforcement | **BUILD NEW** |
| M13 | Cash Book | ❌ nothing | Derived from GL | **BUILD NEW** |
| M14 | Bank Book | ❌ nothing | Derived from GL | **BUILD NEW** |
| M15 | Payroll Integration | 🟡 `SalarySlip`, 4 docs, `GET /api/salary` | ⛔ **ESIC and PT have no source field** (G1) | **BUILD NEW**, reduced scope — see §1.3 |
| M16 | Financial Reports | 🟡 `Report` model + report engine exists | No TB, P&L, BS, cash flow — those need a ledger | **BUILD NEW**, reuse report engine |
| M17 | Audit Trail | 🟡 `FeeEditRequest` audits fee edits only | No general audit trail, no before/after capture | **BUILD NEW** (`fms_auditTrail`) |
| M18 | RBAC | 🟡 JWT + `RolePermission` matrix + `authorize()` | ⚠️ SMS `checkPermission` **fails open**; only 8 roles vs 12 needed | **BUILD NEW** deny-by-default wrapper; **REUSE** JWT |
| M19 | Notifications | 🟡 `notifications` collection (129 docs), socket.io live | ⛔ EMAIL not configured, no SMS gateway, no WhatsApp | **BUILD NEW** in-app; see §1.3 |
| M20 | Document Management | 🟡 `multer` upload to **local disk**; `uploadAttachment.js` | ⛔ Not encrypted, not cloud-backed, no access scoping | **BUILD NEW**, reduced scope — see §1.3 |
| M21 | Multi-Branch | ✅ **`school` ObjectId scoping on every document** | Consolidated cross-branch reporting absent. *Only 1 school exists* | **REUSE** scoping; build consolidation |
| M22 | Security & FY Control | 🟡 JWT, bcrypt, helmet, rate-limit all present | ⛔ No 2FA. No FY close/lock (no FY concept at all) | **REUSE** auth; **BUILD NEW** FY lock |
| M23 | Data Model Conformance | ✅ camelCase, ObjectId, `school` scoping | Money is **float** everywhere; no soft-delete on finance | **BUILD NEW** to FMS conventions (integer paise) |
| M24 | API & Integration | ✅ `/api` base, `{success,data}` envelope, JWT | No idempotency framework; **`axios` not installed** | **REUSE** conventions; **BUILD NEW** ingest layer |
| M25 | Non-Functional | 🟡 works fine at current load | ⛔ 500-user target not meaningful; no HA; backups incomplete | See §1.3 |

**Tally:** 2 reusable foundations (M21 scoping, M24 conventions), 8 partial, 15 net new, 5 cannot be built as specified.

### 1.2 Cross-cutting gaps

| Gap | Evidence | Consequence |
|---|---|---|
| **No test framework** | `package.json` dependencies: no jest, mocha, supertest, chai | The DoD requires unit + integration tests. Test tooling is **net-new work**, not assumed infrastructure |
| **No HTTP client** | `axios`/`node-fetch`/`got` all absent | FMS must add `axios` — its only new runtime dependency |
| **No migration tool** | No `migrate-mongo`, no `migrations/` | FMS ships its own (P0.3 §6) |
| **No financial year concept** | Nothing in any model | `fms_financialYears` entirely new; SMS `month` is free-text `"April 2026"` and must be parsed defensively |
| **Production not a replica set** | Verified 2026-07-27 | No FMS transaction can run in production |
| **Startup mutates the database** | Backend logs show `Dropped index: busroutes school_1`, `Transport indexes reset` on every boot | Restarting production is not a read-only operation. Relevant to any deployment window |

### 1.3 Proposed revised acceptance criteria

These replace the SRS text for the five modules that cannot be met. **Requires sign-off before Phase 1** — building to unachievable criteria guarantees a failed UAT.

| Module | SRS says | Proposed revision | Rationale |
|---|---|---|---|
| **M15** | Posts PF/ESIC/PT/TDS | Posts **PF, TDS, Staff Loan, Other Deductions** from available fields. ESIC/PT heads created in CoA but never posted from ingest. Balance assertion `gross = net + all deductions` is mandatory | No source fields exist. First confirm with the school whether ESIC/PT are deducted at all — if not, this is correct, not reduced |
| **M19** | EMAIL/SMS/WHATSAPP/IN_APP | **IN_APP only** (socket.io + `fms_notifications`). Channel abstraction built so EMAIL can be enabled later by configuring SMTP — no code change | Email is already non-functional in production today; no SMS or WhatsApp provider exists |
| **M20** | Encrypted, access-scoped documents | Local disk with **access-scoped serving** (auth check before file read), size/format limits, soft-archive. **Not encrypted at rest** | Cloudinary is a dependency but unconfigured. Encryption at rest needs a decision on key management that this deployment cannot support |
| **M22** | Optional 2FA | **FY close/lock/reopen fully implemented** (genuinely needed). **2FA deferred** — record as accepted risk | 2FA would require changing SMS auth, violating the plugin constraint |
| **M25** | 500 concurrent, 99.9%, daily backup | **25 concurrent users, <3s p95, nightly DB backup verified by restore test.** 99.9% uptime dropped — single VPS with no redundancy cannot evidence it | 230 accounts exist in total; ~10 active students. 500 concurrent is 2× the entire user base ever created |

**M25 deserves particular attention.** Testing for 500 concurrent users on a 1 GB single-node VPS would consume real effort to produce a number that means nothing. Backup verification — actually restoring a backup and confirming it works — is far more valuable to this school than a load test, and is currently not done at all.

---

## 2. Decision log

| # | Area | Decision | Rationale | Status |
|---|---|---|---|---|
| **DL1** | Overall architecture | **BUILD NEW** as independent toggleable plugin | Per DD v3. Confirmed viable — zero collisions, no SMS writes needed | ✅ settled |
| **DL2** | Deployment shape (D1) | **In-process** — routes conditionally mounted in existing Express app | Production is 1 GB RAM already running 2 Node processes. Own-process adds ~100 MB and makes every FMS→SMS call a loopback round-trip. Independence is enforced by the REST/`fms_` discipline, not process boundaries. *Trade: an FMS crash takes the SMS down; mitigated by `FMS_ENABLED`* | ⏳ **needs Vijay** |
| **DL3** | Eventual consistency (D2) | **ACCEPT** | A transaction cannot span HTTP. At ~500 payment records, reconciliation gaps are trivially findable | ✅ settled |
| **DL4** | Roles (D3) | **`fms_roleAssignments`**, SMS enum untouched | Extending the enum edits an SMS model — violates constraint 1 for two roles | ✅ settled |
| **DL5** | SMS API enhancements (D4) | **E3 + E5 yes. E1, E2 defer. E4 escalate** | E3/E5 need no SMS behaviour change. E1/E2 are efficiency at scale we don't have. **E4 (delete guard) is escalated from "out of scope" to a Phase 5 prerequisite** — see RR3 | ⏳ **E4 needs Vijay** |
| **DL6** | Ingest cadence (D5) | **Cron nightly + manual sync button** | Webhooks need SMS changes. On-demand alone means silent drift | ⏳ confirm timing |
| **DL7** | Toggle authority (D6) | **Env var + restart** | Route mounting is a startup concern; a DB flag can't unmount routes without a restart anyway | ✅ settled |
| **DL8** | Fee ingest source | **Union of `StudentFee.paymentHistory[]` ∪ `FeeAssignment.payments[]`**, dedup on `receiptNumber`. Ignore `FeePayment` | **Deviation from DD §9.** `payAssignment` mirrors to `StudentFee` only if a ledger exists; 426 assignments vs 56 ledgers means DD §9 would under-report income | ⏳ **needs O4 measurement** |
| **DL9** | Idempotency key (fees) | **`receiptNumber`** | Only key shared by all three fee writes. Subdoc `_id`s differ per array | ⏳ **needs O4 verification** |
| **DL10** | Money | **REUSE nothing — integer paise throughout FMS**; convert once at ingest | SMS float rupees are a precision risk for a ledger | ✅ settled |
| **DL11** | Auth (human) | **REUSE SMS JWT**; **BUILD NEW** deny-by-default FMS wrapper | SMS `checkPermission` fails open by design (documented in its own comments). Correct for the SMS, unacceptable for a ledger | ✅ settled |
| **DL12** | Auth (service) | **BUILD NEW** service user + programmatic re-auth | `JWT_EXPIRE=30d` means a static token dies silently | ✅ settled |
| **DL13** | Service user privilege | **ACCEPT over-privilege short-term**, role `accountant` | No read-only finance role is expressible in the SMS. Documented as RR4 | ⏳ **needs Vijay** |
| **DL14** | Migration tool | **BUILD NEW** minimal FMS-scoped runner | No SMS tool exists; heavyweight tooling unwarranted for a 2-person team | ✅ settled |
| **DL15** | Test framework | **BUILD NEW** — add jest + supertest | None exists. Required by the DoD | ✅ settled |
| **DL16** | Report engine | **REUSE** SMS `Report` model and engine | Working, generic, already produces PDF/Excel | ✅ settled |
| **DL17** | Approval pattern | **REUSE the `FeeEditRequest` pattern**, generalised | A working maker-checker already exists in this codebase. Consistency beats novelty | ✅ settled |
| **DL18** | Purchase module | **BUILD NEW**, fully FMS-internal | No SMS procurement exists — so no REST boundary, so **fully transactional** | ✅ settled |
| **DL19** | Payment gateway | **DEFER** | No gateway installed. `online`/`upi` route to a clearing head, cleared manually | ✅ settled |
| **DL20** | Notification channels | **BUILD NEW** in-app; abstract the channel | Email already broken in production; no SMS/WhatsApp provider | ⏳ **needs §1.3 sign-off** |

---

## 3. Risk register

Likelihood × Impact on a 1–5 scale. Score ≥ 12 requires an owner and a mitigation before the phase it affects.

| # | Risk | L | I | Score | Mitigation | Owner | Phase |
|---|---|---|---|---|---|---|---|
| **RR1** | **Double-posting to the ledger** — the same fee receipt posts twice, overstating income | 3 | 5 | **15** | Unique index on `{sourceSystem, key}` in `fms_ingestState`; state upserted **inside** the posting transaction; union dedup before the posting loop; reconciliation report. Rules R1–R10 (P0.4 §11). **Integration test must attempt a deliberate double-post** | Vijay | P5.1 |
| **RR2** | **Under-posting** — `payAssignment`-route payments never reach the ledger (DL8) | 4 | 5 | **20** | Union ingest. **O4 measurement quantifies current exposure.** Reconciliation report lists SMS receipts with no FMS posting | Vijay | P0 → P5.1 |
| **RR3** | **Source records hard-deleted after posting** — `POST /api/fees/ledger/bulk-delete` can remove many ledgers with embedded payment history, no approval required | 3 | 5 | **15** | Detect on next ingest → compensating reversal + alert. **Escalate E4** (soft-delete guard). Minimum: restrict `bulk-delete` to `superAdmin` before go-live. Note the SMS already guards *edits* via `FeeEditRequest` but not *deletes* | Vijay | before P5.1 |
| **RR4** | **Service credential over-privileged** — the ingest account can delete financial records (G2) | 2 | 5 | **10** | Long random password, `.env` only, never in git, role `accountant` (narrowest qualifying). Rotate on any suspicion. Proper fix is E5 | Vijay | P1.3 |
| **RR5** | **Production replica-set conversion fails or destabilises** | 2 | 5 | **10** | Proven on staging first (done). `mongod.conf.bak` retained. Quiet window. **Note: backend restart triggers index-drop routines — not a no-op** | Vijay | before P1 |
| **RR6** | **Money precision loss** — float→paise conversion applied twice or rounded inconsistently | 2 | 5 | **10** | Single `money.toPaise()` helper, called only at ingest. `fms_feePostings.sourceAmount` retains the original float. Unit tests on rounding boundaries (`.005`, `.995`) | Vijay | P1.4 |
| **RR7** | **Unbalanced posting reaches the database** | 2 | 5 | **10** | `money.isBalanced()` asserted **before** the transaction opens. Balanced-pair insert only via `LedgerPostingService` — no other write path to `fms_ledgerentries` | Vijay | P1.4 |
| **RR8** | **Auth mapping wrong** — a user gets FMS access they shouldn't, or an approver can approve their own request | 3 | 4 | **12** | Deny-by-default wrapper (no `fms_roleAssignments` row → 403). SoD enforced in the approval state machine: `requestedBy !== approvedBy`. RBAC test per endpoint | Vijay | P1.3 |
| **RR9** | **Chart of Accounts wrong** — codes/structure don't match what the school's accountant expects | 3 | 4 | **12** | **O3: accountant signs off before seeding.** Changing account codes after postings exist requires a migration of every ledger entry | Pratiksha | before P2.1 |
| **RR10** | **FY boundary parsing** — SMS free-text `month` (`"April 2026"`) misparsed, posting lands in the wrong financial year | 3 | 3 | **9** | Strict parser; **reject and flag** unparseable values rather than defaulting. Never silently assign to current FY | Vijay | P5.1 |
| **RR11** | **Staging drifts from production** — testing against stale data produces false confidence | 4 | 2 | **8** | Already observed (timetables, 2-day drift). Weekly re-sync: dump → scp → `mongorestore --drop` | Vijay | ongoing |
| **RR12** | **FMS crash takes down the SMS** (consequence of DL2 in-process) | 2 | 4 | **8** | `FMS_ENABLED=false` + restart as the kill switch. FMS routes wrapped in error boundaries; no FMS code paths in SMS request handling | Vijay | P1.1 |
| **RR13** | **Performance at scale** | 1 | 2 | **2** | Not a real risk here. 230 accounts total, ~500 payment records. Indexes per DB design are ample. **Do not spend effort on a 500-user load test** | — | P7.2 |
| **RR14** | **Backup gap** — documents on local disk, DB backup unverified | 3 | 4 | **12** | Nightly `mongodump` + **restore verification test**. Local-disk uploads included in backup scope. Also resolve the Acronis question — where those backups go, and whose account | Vijay | before go-live |
| **RR15** | **Public repo exposure** — spec set describes finance architecture in a public GitHub repo | 2 | 2 | **4** | Conscious decision. `.gitignore` `docs/fms-spec/` if preferred | Vijay | now |

**Highest-scoring risks are RR2 (20), RR1 (15) and RR3 (15) — all in the fee-ingest path.** That path deserves disproportionate test effort.

---

## 4. Phased roadmap

Dependencies are hard unless marked otherwise. Effort is indicative for one developer working part-time.

### Phase 0 — Discovery ✅ complete (P0.1–P0.5)

### Pre-Phase-1 gate — **must close before any code**

| Item | Blocks | Owner |
|---|---|---|
| O1 — ESIC/PT question answered | M15 posting rule, CoA seed | School |
| O3 — CoA codes signed off | Migration 004 | Pratiksha |
| O4 — receipt-number queries run on production | DL8, DL9 | Vijay |
| O6 — production replica set | All FMS transactions | Vijay |
| O7 — DL2 deployment shape confirmed | P1.1 scaffolding | Vijay |
| §1.3 revised acceptance criteria signed off | UAT scope | Vijay + Pratiksha |

### Phase 1 — Foundation & Shared Services

| Prompt | Delivers | SRS | Depends on |
|---|---|---|---|
| P1.1 | Plugin scaffold, `FMS_ENABLED` toggle, `/api/fms/status`, `axios` added | M24 | O7 |
| P1.2 | Migration runner + all 30 `fms_` collections + indexes | M23 | O6 |
| P1.3 | Deny-by-default auth wrapper, `fms_roleAssignments`, service user | M18, M22 | P1.1 |
| P1.4 | **`LedgerPostingService`**, `money` helper, `fms_numberSequences`, `fms_auditTrail` | M11, M17 | P1.2, O6 |
| P1.5 | OpenAPI wiring, `{success,data}` envelope, error contract | M24 | P1.1 |
| — | **jest + supertest** setup (DL15) | — | P1.1 |

> **P1.4 is the keystone.** Everything downstream posts through it. It warrants the most test coverage in the project — balanced-pair enforcement, transaction rollback, idempotency, rounding boundaries.

### Phase 2 — Core Accounting
P2.1 CoA (M2, needs O3) → P2.2 GL view (M11) → P2.3 JV (M12) → P2.4 Cash/Bank Book (M13, M14)

### Phase 3 — Transactions & Approvals
P3.1 Income (M3) → P3.2 Expense (M4) → P3.3 Approval workflow (M5, reuse `FeeEditRequest` pattern) → P3.4 Payment processing

### Phase 4 — Supporting Modules
P4.1 Budget (M6) · P4.2 Vendor (M7) · P4.3 Purchase (M8, fully transactional) · P4.4 Banking (M9) · P4.5 Petty Cash (M10)

### Phase 5 — Integrations ⚠️ highest risk
P5.1 Fee → FMS (**RR1, RR2, RR3**; requires E4 decision) → P5.2 Payroll → FMS (M15, reduced per §1.3) → P5.3 Expense ingest → ~~P5.4 Gateway~~ **deferred (DL19)**

### Phase 6 — Reporting & Dashboard
P6.1 Reports (M16, reuse engine) · P6.2 Audit trail (M17) · P6.3 Notifications (M19, in-app only) · P6.4 Multi-branch (M21) · P6.5 Dashboard (M1)

### Phase 7 — Security & NFR
P7.1 Security controls, FY lock (M22) · P7.2 Performance — **scoped to 25 users per §1.3**

### Phase 8 — Testing & UAT
P8.1 Test completion · P8.2 UAT from `Test_Cases.xlsx`, minus cases covering deferred criteria

### Phase 9 — Documentation, Deployment & Handover
P9.1 Doc sync · P9.2 Go-live — **includes production replica set (if not already done), backup verification (RR14), and the E4 decision**

### Critical path

```
O6 (prod replica set) → P1.2 → P1.4 (LedgerPostingService) → P2.1 (CoA, needs O3)
    → P3.1 (Income) → P5.1 (Fee ingest) → P6.1 (Reports) → P8.2 (UAT) → go-live
```

O6 and O3 are the two items that sit on the critical path and depend on people rather than code. Start both now.

---

## 5. Definition of Done — per module

A module is Done only when **all eight** hold. No partial credit.

| # | Criterion | Evidence |
|---|---|---|
| 1 | **Code complete** | Feature implemented per SRS FR-Mx (or §1.3 revision), reviewed |
| 2 | **Reversible migration** | `up()` + `down()` present; `down()` verified on staging; touches only `fms_` collections |
| 3 | **Unit tests** | Money arithmetic, balance assertions, state machines. **≥80% on services**, 100% on `LedgerPostingService` |
| 4 | **Integration tests** | Endpoint-level via supertest, incl. a deliberate double-post attempt for any ingest path |
| 5 | **RBAC enforced** | Every endpoint passes the deny-by-default wrapper. Test proves a user with no `fms_roleAssignments` row gets 403 |
| 6 | **Audit logging** | Every create/update/cancel writes `fms_auditTrail` with before/after. Financial docs have no hard-delete path |
| 7 | **API documented** | `openapi.yaml` updated; spec validates; request/response match implementation |
| 8 | **UAT cases pass** | Relevant `Test_Cases.xlsx` scenarios pass on staging with production-copy data |

### Additional gates for specific modules

| Module | Extra requirement |
|---|---|
| **M11 (GL)** | Trial balance sums to zero across all postings. Ledger entries provably immutable — no update or delete path exists in code |
| **M15 (Payroll)** | Balance assertion `gross = net + pf + tax + loan + other` enforced; unbalanced slips flagged, **never posted** |
| **Any ingest** | Idempotency proven by re-running the same cycle twice and asserting no new ledger entries |
| **M2 (CoA)** | Accountant sign-off on codes (O3) recorded in the repo |
| **M22 (FY lock)** | Posting to a locked FY rejected; reopen requires an authorised role and is audited |

---

## 6. Environment & data needs

### 6.1 Environments

| | Production | Staging |
|---|---|---|
| Host | Oracle Cloud Ubuntu 22.04 | AlmaLinux 8.10 |
| Address | `portal.thefuturestepschool.in` (HTTPS) | `66.116.251.3` (HTTP, IP-restricted) |
| RAM | 1 GB + 2 GB swap | 3.6 GB + 2 GB swap |
| MongoDB | 7.0 **standalone — ⚠️ no transactions** | 7.0 **replica set `rs0` ✅** |
| FMS | not deployed until UAT passes | **all FMS development happens here** |
| Data | live | production copy, 2026-07-25 |

**Staging needs before Phase 1:** DNS A record → HTTPS via Certbot; weekly re-sync from production (RR11).

**Production needs before go-live:** replica-set conversion (O6); backup verification (RR14); E4 decision (RR3); `FMS_ENABLED` set only at cutover.

### 6.2 Seed data

| Seed | Collection | Source | Blocked by |
|---|---|---|---|
| Financial year | `fms_financialYears` | Indian FY, 1 Apr – 31 Mar | — |
| Account groups | `fms_accountGroups` | DB Design §5.2 | — |
| **Chart of Accounts** | `fms_accounts` | P0.4 §8 proposals | **O3 — accountant sign-off** |
| Number sequences | `fms_numberSequences` | DD §10 | — |
| Role assignments | `fms_roleAssignments` | Manual map of existing `users._id` | — |
| Approval matrix | `fms_approvalMatrix` | Thresholds from the school | school input |
| Fee type → income head | `fms_accounts.feeType` | 13 live `feetypes` | O3 |
| Expense category → head | `fms_accounts.expenseCategory` | 2 live categories | O3 |

### 6.3 Test fixtures

Derived from real staging data — 206 students, 426 fee assignments, 56 ledgers, 4 salary slips, 2 expenses.

Required fixtures: a balanced posting; a **deliberately unbalanced** posting (must be rejected); a duplicate-receipt double-post attempt; a payment present only in `FeeAssignment` (the DL8 case); a salary slip where `gross ≠ net + deductions`; a locked-FY posting attempt; a user with no `fms_roleAssignments` row; a source record deleted after posting (reversal path).

**Note:** test fixtures derived from staging contain real children's names, Aadhaar numbers and parent contact details. Fixtures committed to the repo must be **anonymised** — the repo is public.

---

## 7. ⛔ GO / NO-GO CHECKLIST — Phase 1

Phase 1 does not begin until every box is ticked.

### Blocking — technical

- [ ] **O6** Production MongoDB converted to replica set; `rs.status()` shows PRIMARY; transaction test passes
- [ ] **O4** P0.3 §7 queries run on production: orphan receipt count and value known; zero null/blank receipt numbers; zero duplicates
- [ ] **DL8/DL9** Fee ingest source and idempotency key confirmed against the O4 result
- [ ] Staging on HTTPS with a valid certificate
- [ ] Staging re-synced from production within the last 7 days
- [ ] Git state verified identical: PC ↔ staging ↔ production (`git log --oneline -1`)

### Blocking — decisions

- [ ] **O7 / DL2** Deployment shape confirmed (recommendation: in-process)
- [ ] **O1 / G1** ESIC & Professional Tax question answered by the school; M15 scope fixed
- [ ] **O3 / RR9** Chart of Accounts codes signed off by the school's accountant
- [ ] **§1.3** Revised acceptance criteria for M15, M19, M20, M22, M25 signed off
- [ ] **RR3 / E4** Delete-guard decision made — prerequisite or accepted risk
- [ ] **RR4 / DL13** Service-user privilege level accepted in writing
- [ ] **DL6** Cron cadence confirmed

### Blocking — operational

- [ ] **RR14** Nightly DB backup running **and verified by an actual restore**
- [ ] Acronis question resolved — where backups go, whose account, whether student data leaving the server is acceptable
- [ ] **RR15** Public-repo decision made on `docs/fms-spec/`
- [ ] Rollback plan documented: `FMS_ENABLED=false` → restart → drop `fms_*` if needed

### Non-blocking but recommended

- [ ] Production `JWT_SECRET` rotated (was shared in chat during staging setup)
- [ ] `bulk-delete` restricted to `superAdmin`
- [ ] The 2 students missing the backfilled field investigated
- [ ] Startup index-drop routines understood before any production restart

---

## 8. Sign-off

| Role | Name | Reviewed P0.1–P0.5 | Date | Signature |
|---|---|---|---|---|
| Technical lead | Vijay | ☐ | | |
| School administrator | Pratiksha | ☐ | | |
| Accountant (CoA + M15 only) | *TBC* | ☐ | | |

**Phase 1 may begin only when §7 has no unticked blocking box and this table is signed.**

---

## 9. Note on the specification set

The FMS documentation package is thorough and internally consistent, and rebasing it to the plugin architecture (v3) was the right call. The gaps found in §1.3 are not errors in it — they come from a template written for a general multi-school ERP meeting a school with ten active students.

The honest read is that **this FMS is being built for a school whose entire financial activity is roughly 500 fee payments, 4 salary slips and 2 expense records**. A full double-entry ledger with vendor management, three-way purchase matching and bank reconciliation is a substantial system for that volume.

That is not an argument against building it — a correct ledger has value independent of volume, and building it now while the data is small is far easier than retrofitting later. But it is an argument for **sequencing by value rather than by document order**: the ledger, income posting, fee ingest and reports (M11, M3, M16, plus P5.1) deliver nearly all the practical benefit. Vendor management, purchase workflow and bank reconciliation are correctness infrastructure for a scale this school has not reached.

If effort becomes constrained, defer Phase 4 rather than compressing Phase 1 or Phase 5. The foundation and the ingest path are where errors become permanent.