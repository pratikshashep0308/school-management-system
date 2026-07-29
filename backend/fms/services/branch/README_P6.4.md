# P6.4 — Multi-Branch · Deploy & Verify

**Delivers:** branch isolation proof · consolidated statements · inter-branch detection
**SRS:** M21 / FR-M21 · SCR-66
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/services/branch/branchService.js` | new |
| `backend/fms/services/branch/branchIsolation.check.js` | new |
| `backend/fms/routes/branches.js` | new |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/branches` |

**No migration, no new collections, no dependencies.**

---

## Branch scoping was already built

This is not new work:

- **all 34 FMS collections** carry a `school` field
- `fmsAuthorize` puts the caller's branch on `req.fmsScope`, with a `multiBranch` flag
- every service filters on it

P6.4 does not add scoping. It **proves** it, and adds consolidation on top.

---

## An honest note on scale

**The Future Step School has one branch.** Consolidation is infrastructure for a situation that does not yet exist, and that is worth saying rather than implying otherwise.

**The isolation proof matters today, though.** With a single branch a scoping bug is *invisible* — every query returns the right data because there is only one set of it. The day a second branch is added, the same bug is a data breach, and by then this code will be years old and nobody will remember which services were checked.

So the check creates **two branches with deliberately identical shapes** — same account codes, same dates, overlapping amounts — and proves every read path returns only its own.

---

## Two design decisions

### Consolidation cannot become a way around scoping

A single-branch user asking to consolidate across branches is **refused**.

Without that, `GET /branches/statements?branches=A,B` would be a hole straight through `fmsAuthorize` — read any branch's figures by naming it in a query string.

They may still consolidate their *own* branch alone, which is a no-op but harmless. Asking for somebody else's branch alone is refused too.

### Inter-branch entries are reported, never netted

If head office pays a supplier on behalf of a campus, the same money is an expense in one branch and a liability in the other. Summing naively counts it twice.

But **which side carries the real cost is an accounting judgement, not an arithmetic one.** A report that silently eliminates one side has made that judgement on the school's behalf without saying so.

So inter-branch entries are identified, reported separately, and flagged when they do not net to zero across the group — which means one side has been posted and the other has not.

---

## Accounts consolidate by CODE, not `_id`

Each branch has its own chart documents, so `4101 Tuition Fee Income` in one branch is a different `_id` from the same head in another.

Consolidating on `_id` would produce a report listing the same account once per branch. The check asserts consolidated fee income appears **once**, with the per-branch split retained underneath.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\services\branch | Out-Null
# save the 4 files
cd backend
Test-Path fms\services\branch\branchService.js, fms\services\branch\branchIsolation.check.js, fms\routes\branches.js
node --check fms/services/branch/branchService.js
node --check fms/services/branch/branchIsolation.check.js
node --check fms/routes/branches.js
node --test fms/docs/contract.test.js
cd ..
git add -A
git status --short
git commit -m "P6.4: Multi-Branch — isolation proof and consolidation (M21)"
git push
```

Three `True`, then `# pass 28`.

> **Watch the folder name.** The last two drops landed in plural folders (`models\notifications`, `services\notifications`) and had to be moved. This one is `services\branch` — **singular**.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node fms/services/branch/branchIsolation.check.js 2>&1 | tail -40
pm2 restart staging-backend --update-env
curl -s http://localhost:5000/api/fms/status; echo
```

No migration to run.

### Production

```bash
cd ~/school-management-system && git pull && cd backend
node --test fms/docs/contract.test.js 2>&1 | grep -E "^# (pass|fail)"
```

---

## The P6.4 verification

The brief asks: *post in two branches; confirm each branch report is isolated and the consolidated report is their correct sum.*

**Section 1 — isolation.** Branch A collects ₹60,000 and pays ₹40,000; branch B collects ₹25,000 and pays ₹15,000. Same account codes throughout.

- each branch's fee income is its own, and **neither includes the other**
- each balances independently
- A's surplus ₹20,000, B's ₹10,000
- an account ledger returns only its branch
- **branch A cannot read branch B's account ledger** — the id does not resolve
- a budget counts only its own branch's spending

**Section 2 — consolidation.** Fee income sums to ₹85,000, appears **once** with the per-branch split, and the consolidated surplus of ₹30,000 equals A + B exactly.

**Section 3** proves consolidation respects RBAC. **Section 4** posts a one-sided inter-branch entry and confirms it is detected, not netted, and flagged as unsettled.

---

## Running totals

**402 unit/contract tests · ~1,012 integration checks.**

---

## Next

**P6.5 Financial Dashboard** closes Phase 6. Then Phase 7 (security), 8 (testing), 9 (handover).

**O3** remains the one conversation that turns all of this into something the school can use.