# P2.3 — Journal Voucher · Deploy & Verify

**Delivers:** manual JV with approval workflow · state machine · post via LedgerPostingService · reversal · migration 007 · 7 OpenAPI paths · 58 integration checks
**SRS:** M12 / FR-M12 · SCR-47/48/49
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/models/journal/index.js` | new — `fms_journalvouchers` |
| `backend/fms/services/journal/journalService.js` | new — state machine |
| `backend/fms/services/journal/jv.check.js` | new — 58 checks |
| `backend/fms/routes/journal.js` | new — 8 endpoints |
| `backend/fms/migrations/scripts/007_journal_vouchers.js` | new |
| `backend/fms/docs/openapi.js` | **REPLACES** — 22 paths, 13 schemas |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/journal` |

No new dependencies.

---

## ⚠️ Separation of duties needs two people

The service enforces that the approver is **not** the creator or the submitter. Approving your own journal voucher returns 403.

That is the correct control — one person raising and approving their own entry is not a control at all — but it has an operational consequence:

**On staging today, no journal voucher can be posted.** Only Vijay (`chairman`) and Pratiksha (`principal`) have FMS roles, and neither has `admin` on `journal`. Even after granting it, whoever creates a JV cannot approve it.

Two people are needed with `journal` rights, at least one of them `admin`. For example:

```bash
# Pratiksha can approve
mongosh school_management --eval '
db.fms_roleassignments.updateOne(
  { smsUserEmail: "pratikshashep0308@gmail.com" },
  { $set: { "permissions.journal": "admin" } })'

# Vijay can create and submit
mongosh school_management --eval '
db.fms_roleassignments.updateOne(
  { smsUserEmail: "vijayborse@gmail.com" },
  { $set: { "permissions.journal": "edit" } })'
```

The integration check uses two distinct test identities, so it exercises the real path regardless.

---

## State machine

```
draft ──submit──▶ submitted ──approve──▶ posted ──reverse──▶ reversed
  ▲                   │
  └──────reject───────┘   (editing a rejected JV returns it to draft)
  │
  └──cancel──▶ cancelled     terminal, pre-posting only, never deleted
```

| Status | Editable | Notes |
|---|---|---|
| `draft` | ✅ | Lines must already balance |
| `submitted` | ❌ | Awaiting approval |
| `posted` | ❌ | In the ledger. Reverse, do not edit |
| `rejected` | ✅ | Editing returns it to draft, so the correction cannot skip re-approval |
| `cancelled` | ❌ | Terminal. Record of the attempt survives |
| `reversed` | ❌ | Original posting intact; an opposite one exists |

There is deliberately **no DELETE route**.

---

## Two design decisions

### A draft is not a posting

`fms_journalvouchers` is a separate collection holding the proposal — editable, rejectable, abandonable, none of which a ledger entry may ever be. Only on approval does it go through `LedgerPostingService`, which creates the real voucher and the append-only entries.

Keeping them apart is what lets a JV be a workflow document while the ledger stays a permanent record.

### Balance is checked twice, on purpose

`journalService` validates balance at save, and `LedgerPostingService` validates again at post. That looks redundant but the prompt requires an unbalanced JV to be unsavable — so it must fail long before anything tries to post it. Section 1 asserts that a rejected create leaves **nothing** persisted.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\models\journal,backend\fms\services\journal | Out-Null
# save the 7 files
cd backend
node --check fms/models/journal/index.js
node --check fms/services/journal/journalService.js
node --check fms/routes/journal.js
node --test fms/docs/contract.test.js
node -e "const s=require('./fms/docs/openapi'); console.log(Object.keys(s.paths).length+' paths, '+Object.keys(s.components.schemas).length+' schemas')"
cd ..
git add -A
git commit -m "P2.3: Journal Voucher (M12)"
git push
```

Expect `# pass 28` and `22 paths, 13 schemas`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node fms/migrations/_runner.js status
node fms/migrations/_runner.js up
node fms/services/journal/jv.check.js
pm2 restart staging-backend --update-env
```

Migration 007 applies; 005 stays blocked. Expect **58 passed, 0 failed**.

### Production

```bash
cd ~/school-management-system && git pull
```

Nothing to run. No migrations there.

---

## The P2.3 verification

The prompt asks: *create an unbalanced JV (expect rejection), a balanced one (post), then reverse it and confirm the mirror entry and unchanged original.*

Section 1 does exactly that, and asserts more than was asked:

- unbalanced create rejected **and nothing persisted**
- balanced JV saved as draft with **no ledger entries** — a draft is not a posting
- approval allocates `JV-2026-27-00001` and writes 2 entries
- reversal produces an equal-and-opposite mirror, flagged `isReversal`
- **original ledger entries unchanged** — still 2, still the same amounts
- trial balance still balances; cash returns to zero

---

## Check coverage — 58 assertions

```
1  P2.3 VERIFICATION  unbalanced rejected, nothing persisted
                      draft ≠ posting · post · reverse · mirror · original intact
2  Immutability       posted JV cannot be edited, re-submitted, cancelled or
                      double-reversed; narration unchanged after a blocked edit
3  Separation of duty creator cannot approve · submitter cannot reject
                      voucher stays submitted · a different approver succeeds
4  Reject & correct   reason mandatory · no ledger entries from a rejection
                      editing a rejected JV returns it to DRAFT
5  Validation         <2 lines · float rupees · both sides non-zero
                      non-postable head rejected AT SAVE · unknown account
                      date outside the financial year
6  Cancel             cancelled but NOT deleted · cannot cancel twice or submit
7  FY lock            cannot approve or create into a locked year; works reopened
8  Workflow trail     every step with actor and timestamp; audit before/after
9  Final              debits = credits; one ledger voucher per posted JV
```

Section 5's `non-postable head rejected AT SAVE` is the one worth noting: the same rule exists in `LedgerPostingService`, but catching it at save means the author finds out while they can still fix it, rather than the approver hitting it days later.

---

## Next

**P2.4 — Cash Book & Bank Book.** Derived entirely from ledger postings, so no new storage. Completes Phase 2.

Still gated by **O3** for anything real: journal vouchers need accounts to post to.