# P6.2 — Audit Trail · Deploy & Verify

**Delivers:** delete guards on 15 previously-unprotected models · enumeration test · audit viewer · **20 new unit tests**
**SRS:** M17 / FR-M17 · SCR-61
**Deploy to:** staging only

---

## ⚠️ This drop fixes a real integrity gap

FR-M17 states *"no hard deletes anywhere — verify by code review."*

**It was not true.** Sixteen of thirty-two models permitted hard deletes. Two mattered a great deal:

| Model | What deleting it would have done |
|---|---|
| **`fms_vouchers`** | Ledger entries were guarded; the **header** was not. Deleting one orphans its entries — postings with no document behind them, and a trial balance that still balances. |
| **`fms_ingeststate`** | Each row is the claim that a source record has already been posted. Deleting one **releases its idempotency key**, so the next fee or payroll cycle posts it again. |

Also unguarded: `fms_numbersequences` (deleting restarts gapless numbering and produces duplicate voucher numbers), `fms_dailyclosings` (a signed physical cash count), `fms_banktransactions` (the statement as the bank sent it), `fms_accounts`, `fms_financialyears`, `fms_roleassignments`, and eight more.

**31 of 32 now block deletes.** The sole exception is `FmsSettings` — configuration only, no financial record, no approval, no idempotency claim.

---

## Files

**New:**

| File | |
|---|---|
| `backend/fms/services/audit/auditService.js` | query, diff, history, activity, export, retention |
| `backend/fms/services/audit/deleteGuards.test.js` | **20 tests** — the enumeration |
| `backend/fms/routes/audit.js` | the viewer (SCR-61) |

**Replaced — delete guards added:**

```
backend/fms/models/core/index.js           7 models guarded
backend/fms/models/purchase/index.js       messages now name their collection
backend/fms/models/journal/index.js        1
backend/fms/models/cashBankBook/index.js   1
backend/fms/models/banking/index.js        2
backend/fms/models/integration/index.js    1
backend/fms/models/pettyCash/index.js      1
backend/fms/models/vendor/index.js         1
backend/fms/models/approval/index.js       1
backend/fms/routes/index.js                mounts /audit
```

No migration, no new dependencies.

---

## The enumeration test

Code review does not scale and does not run in CI. `deleteGuards.test.js` loads **every** FMS model and asserts each either blocks deletes or appears on an allowlist with a written reason.

A model added later without a guard **fails this test** rather than being discovered when somebody deletes a voucher.

It also:

- names twelve critical models individually, each with the specific reason a regression would be severe
- asserts the allowlist stays small (≤3) and every entry gives a real reason
- asserts nothing on the allowlist carries a money or approval field
- exercises **every guard's error message** and requires it to name its collection

---

## What P6.2 did NOT rebuild

Recording was already done — **31 services** write to `fms_audittrail` with actor, role, IP, user agent and before/after snapshots.

`auditService.record()` exists so new code has one obvious way to do it, but the existing direct writes are identical in shape. Refactoring 31 call sites would risk more than it would gain.

---

## The viewer

`GET /api/fms/audit` with filters on entity, action, actor, role, IP and date.

**Entries show a `changes` diff, not raw snapshots.** Comparing whole documents is what makes an audit trail unreadable — every entry becomes a wall of unchanged fields. The diff drops `updatedAt`/`__v` noise and sorts money fields first. Full before/after remains available on the single-entry endpoint.

Other endpoints:

| | |
|---|---|
| `/audit/history/:entity/:entityId` | what happened to this document, oldest first |
| `/audit/activity` | who has been doing what — for spotting the unusual |
| `/audit/retention` | how much is held and how old |
| `/audit/export?format=csv` | flat rows |

**Read-only by construction:** there is no write endpoint, and the model blocks updates and deletes. An audit trail with an edit button is not one.

---

## Retention

FR-M17 requires ten years. `/audit/retention` reports what is held and how old.

**Nothing purges automatically.** Deletion is blocked at the model, so removing anything would require a deliberate migration and a reason — which is the right bar for destroying an audit trail.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\services\audit | Out-Null
# save the 13 files
cd backend
node --check fms/services/audit/auditService.js
node --check fms/routes/audit.js
node --test fms/services/audit/deleteGuards.test.js
node --test fms/docs/contract.test.js
node --test fms/services/ledger/posting.test.js
cd ..
git add -A
git status --short
git commit -m "P6.2: Audit Trail — delete guards on 15 models, enumeration test, viewer"
git push
```

Expect `# pass 20`, `# pass 28`, `# pass 23`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/services/audit/deleteGuards.test.js
node --test fms/docs/contract.test.js
```

Then **re-run several integration checks** — the model changes touch nearly everything:

```bash
node fms/services/purchase/purchase.check.js 2>&1 | tail -3
node fms/services/banking/banking.check.js 2>&1 | tail -3
node fms/services/pettyCash/pettyCash.check.js 2>&1 | tail -3
node fms/services/ingest/feeIngest.check.js 2>&1 | tail -3
pm2 restart staging-backend --update-env
curl -s http://localhost:5000/api/fms/status; echo
```

### Production

```bash
cd ~/school-management-system && git pull && cd backend
node --test fms/services/audit/deleteGuards.test.js
node --test fms/docs/contract.test.js
```

---

## The P6.2 verification

The brief asks: *edit a voucher and confirm the before/after is logged; attempt a hard delete anywhere and confirm it's impossible.*

The second half is what `deleteGuards.test.js` proves — **systematically, across every model**, rather than by trying one and inferring the rest. That inference is precisely what had been happening, and it was wrong sixteen times.

---

## Two smaller fixes

**The audit routes used a module key that does not exist** (`auditTrail`; the real key is `audit`). `fmsAuthorize` throws on unknown keys at construction, so this surfaced at load time rather than as a 403 on a live request. That design decision paid for itself here.

**Reading a schema enum at module load** made the router depend on require *order* — it worked standalone and failed under the contract test. Now read lazily.

---

## Running totals

**370 unit/contract tests · ~976 integration checks.**

---

## Next

**P6.3 Notifications**, P6.4 multi-branch, P6.5 dashboard. Then Phase 7 (security), 8 (testing), 9 (handover).