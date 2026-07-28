    # P3.3 — Expense Approval Workflow · Deploy & Verify

**Delivers:** threshold routing · four-guard state machine · inbox · history · configurable matrix · migration 011 · 10 OpenAPI paths · **54 boundary unit tests** · ~60 integration checks
**SRS:** M5 / FR-M5 · BPMN WF1 · SCR-18/19/20/21
**Deploy to:** staging only

---

## Built test-first, as the playbook asks

The playbook calls this the most business-critical workflow and recommends writing the state-machine tests from BPMN WF1 before implementing. That is what happened here.

`approvalMatrix.js` is **pure** — every function takes its inputs as arguments. No database, no request, no clock. Threshold routing is where an off-by-one has the largest consequence (₹10,000 and ₹10,001 go to different people), and pure logic can be exhaustively tested without fixtures.

`approvalMatrix.test.js` runs anywhere in under a second and includes a sweep proving **every amount from ₹0 to ₹3,00,001 matches exactly one tier** — no gaps, no overlaps.

```
node --test fms/services/approval/approvalMatrix.test.js
# tests 54, pass 54, fail 0
```

---

## Files

| File | |
|---|---|
| `backend/fms/services/approval/approvalMatrix.js` | new — pure routing |
| `backend/fms/services/approval/approvalMatrix.test.js` | new — 54 boundary tests |
| `backend/fms/services/approval/approvalService.js` | new — DB-facing workflow |
| `backend/fms/services/approval/approval.check.js` | new — integration checks |
| `backend/fms/models/approval/index.js` | new — matrix + approval records |
| `backend/fms/routes/approval.js` | new — 10 endpoints |
| `backend/fms/migrations/scripts/011_approval_workflow.js` | new — seeds default thresholds |
| `backend/fms/docs/openapi.js` | **REPLACES** — 46 paths, 21 schemas |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/approvals` |

No new dependencies.

---

## How states and tiers fit together

The brief lists one chain, but tier 1 needs only a Dept Head and tier 4 adds a Trustee — so which states apply depends on the amount.

**Resolution: the state records the last completed approval, and becomes `paymentPending` once the chain is complete.** No states were invented.

| Amount | Chain | States |
|---|---|---|
| ≤ ₹10,000 | accounts → deptHead | submitted → accountsVerified → paymentPending |
| ₹10,001–50,000 | accounts → principal | submitted → accountsVerified → paymentPending |
| ₹50,001–2,00,000 | accounts → principal → chairman | … → principalApproved → paymentPending |
| > ₹2,00,000 | accounts → principal → chairman → trustee | … → chairmanApproved → paymentPending |

That leaves one ambiguity — is a `chairmanApproved` expense finished, or waiting for a trustee? — which `nextAction` answers directly, so no caller has to work it out from the tier. Two tests assert exactly that case.

---

## Four guards, every action

1. **Status** — the expense must be where this step is next
2. **Order** — no skipping, enforced by the pure chain
3. **Role** — only roles mapped to the step may act
4. **Duties** — nobody approves what they raised, submitted, *or already acted on*

The fourth has two halves. The obvious one blocks approving your own request. The second blocks one person occupying two steps of the same chain — a chairman may act at both the principal and trustee steps by role, and without this guard a single person could carry a ₹3,00,000 expense most of the way alone.

A 403 explains which step was expected and which roles may perform it. "Forbidden" on its own tells an approver nothing about whose turn it is.

---

## Returning restarts the chain

When an expense is returned and corrected, resubmission starts again **from accounts**. Approvals given to the version that was returned do not carry over.

Otherwise a corrected request could slide past approvals granted to a document that no longer exists — which is precisely the hole a return-for-correction flow is supposed to close.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\models\approval,backend\fms\services\approval | Out-Null
# save the 9 files
cd backend
node --test fms/services/approval/approvalMatrix.test.js
node --test fms/docs/contract.test.js
node -e "const s=require('./fms/docs/openapi'); console.log(Object.keys(s.paths).length+' paths, '+Object.keys(s.components.schemas).length+' schemas')"
cd ..
git add -A
git commit -m "P3.3: Expense Approval Workflow (M5, WF1)"
git push
```

Expect `# pass 54`, `# pass 28`, and `46 paths, 21 schemas`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/services/approval/approvalMatrix.test.js
node fms/migrations/_runner.js up
node fms/services/approval/approval.check.js
pm2 restart staging-backend --update-env
```

Migration 011 applies and seeds the default thresholds; 005 stays blocked.

### Production

```bash
cd ~/school-management-system && git pull
```

Nothing to run.

---

## The P3.3 verification

The brief asks: *push expenses of ₹9,000 / ₹40,000 / ₹1,50,000 / ₹3,00,000 through and confirm each follows the correct approver chain; confirm a reject and a return behave correctly and the history is complete.*

Section 1 runs all four end to end and asserts the chain at each stage — including that ₹1,50,000 sits at `principalApproved` rather than jumping to `paymentPending`, and that ₹3,00,000 at `chairmanApproved` still reports a trustee as required.

Sections 2 and 3 cover reject (terminal) and return (restarts the chain). Section 8 checks the history is complete, ordered, and snapshots the amount and tier at each action.

---

## Configurable thresholds (SCR-20)

`PUT /api/fms/approvals/matrix` replaces them. **A matrix with a gap or an overlap is rejected outright** — a gap leaves amounts unroutable, an overlap makes routing depend on iteration order.

Saving supersedes the previous version rather than editing it, so the routing that applied to past approvals stays reconstructable. Section 10 changes the thresholds mid-run and confirms routing changes with them.

---

## Approval records are append-only

`fms_expenseapprovals` rejects update and delete at the model layer. These records are the evidence of how a payment came to be authorised; altering them would destroy the only account of it. Migration 011's `down()` also refuses to run if any exist.

---

## Running totals

| | Checks |
|---|---|
| Phase 1 | 35 |
| Phase 2 | 200 |
| P3.1 Income | 60 |
| P3.2 Expense | 49 |
| P3.3 Approvals | ~60 |

**131 unit/contract tests · ~404 integration checks.**

---

## Next

**P3.4 — Payment Processing.** The last piece of Phase 3, and the point where an approved expense finally **posts to the ledger**: Dr expense/payable, Cr cash/bank, with idempotency so an expense cannot be paid twice.