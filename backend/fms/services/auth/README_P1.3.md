# P1.3 — Auth & RBAC · Deploy & Verify

**Delivers:** deny-by-default authorization guard · 12-role × 15-module permission matrix · role-assignment seeding · 26 RBAC tests
**Deploy to:** staging only

---

## Files

| File | Action |
|---|---|
| `backend/fms/services/auth/permissionMatrix.js` | **new** |
| `backend/fms/services/auth/rbac.test.js` | **new** |
| `backend/fms/middleware/fmsAuthorize.js` | **REPLACES** the P1.1 stub |
| `backend/fms/migrations/scripts/006_seed_role_assignments.js` | **new** |

No new npm dependencies. Tests use `node:test`, built into Node 18+.

---

## Resolving a conflict between the specs

The Prompt Playbook asks for **10 permission actions** (CREATE, EDIT, DELETE,
VIEW, APPROVE, REJECT, PRINT, EXPORT, CANCEL, REOPEN). The Data Dictionary §1
specifies **4 levels** (`none | read | edit | admin`) and gives the mapping.

The Data Dictionary wins — it is canonical, every other deliverable is written
against it, and `fms_roleassignments.permissions` already stores levels.

So **levels are stored, actions are the API**:

```js
router.post('/vouchers', fmsAuthorize('journal', 'CREATE'), ...)   // needs 'edit'
router.post('/expenses/:id/approve', fmsAuthorize('approvals', 'APPROVE'), ...)  // needs 'admin'
```

One thing in the database to reason about, both vocabularies honoured.

`DELETE` maps to `admin` and always means **soft-cancel** — no FMS financial
document has a hard-delete path. The action name is kept because the SRS uses it.

---

## The default matrix

Translated directly from **SRS §9.10**, not invented. `V→read`, `C/E→edit`,
`A→admin`, `-→none`.

```
module            chairm truste princi vicePr accoun accoun cashie purcha deptHe teache audito readOn
accounts          V      V      V      -      E      V      -      -      -      -      V      V
income            V      V      V      V      E      E      E      -      -      -      V      V
expenses          V      V      A      A      E      E      V      E      E      E      V      V
approvals         A      A      A      A      A      V      -      -      A      -      V      -
budgets           V      V      A      V      E      V      -      -      V      -      V      V
vendors           V      V      V      -      E      V      -      E      -      -      V      V
purchase          V      V      A      A      V      V      -      E      E      -      V      V
banking           V      V      V      -      E      E      V      -      -      -      V      V
pettyCash         V      V      V      -      A      V      E      -      -      -      V      V
ledger            V      V      V      -      V      V      -      -      -      -      V      V
journal           V      V      V      -      A      E      -      -      -      -      V      V
payments          V      V      A      A      E      E      E      -      -      -      V      V
financialReports  V      V      V      V      V      V      V      V      V      -      V      V
audit             V      V      V      -      V      -      -      -      -      -      V      -
financialYear     A      V      A      -      E      -      -      -      -      -      V      -
```

**`ledger` is read-only for every one of the 12 roles.** There is deliberately no
role that can write a ledger entry through the API — `fms_ledgerentries` is
append-only and written solely by `LedgerPostingService`. A test asserts this,
so a future matrix edit that grants ledger `edit` will fail the suite.

`payments` and `financialYear` are not in SRS §9.10; they are derived from the
workflows that use them and are the two rows most worth a second opinion.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\services\auth | Out-Null
# save the 4 files
cd backend
node --check fms/services/auth/permissionMatrix.js
node --check fms/middleware/fmsAuthorize.js
node --check fms/migrations/scripts/006_seed_role_assignments.js
node --test fms/services/auth/rbac.test.js
cd ..
git add -A
git commit -m "P1.3: FMS deny-by-default RBAC + role assignments"
git push
```

Expect `# pass 26`, `# fail 0`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/services/auth/rbac.test.js
node fms/migrations/_runner.js status
node fms/migrations/_runner.js up
```

006 applies; 005 stays blocked.

### Verify the seeding

```bash
mongosh --quiet --eval 'db.getSiblingDB("school_management").fms_roleassignments.find({},{smsUserEmail:1,financeRole:1,multiBranch:1,_id:0}).forEach(d=>printjson(d))'
```

Expect one row per `superAdmin` / `schoolAdmin` / `accountant` user:

| SMS role | FMS role |
|---|---|
| `superAdmin` | `chairman` (multiBranch) |
| `schoolAdmin` | `principal` |
| `accountant` | `accountant` |

**Everyone else gets no row, and therefore no FMS access.** Teachers, students
and parents have no business in a ledger, and deny-by-default means we never
have to enumerate them.

### Prove reversibility

```bash
node fms/migrations/_runner.js down
node fms/migrations/_runner.js status     # 006 pending again
node fms/migrations/_runner.js up
```

### Confirm the SMS is unaffected

```bash
mongosh --quiet --eval 'const d=db.getSiblingDB("school_management"); ["students","users","feepayments","studentfees"].forEach(c=>print(c.padEnd(14), d[c].countDocuments()))'
curl -s http://localhost:5000/api/fms/health; echo
```

Still 211 / 235 / 186 / 160.

---

## Design notes

**Misconfiguration throws at mount time, not request time.**
`fmsAuthorize('nonsense')` throws when the route file is required, so a typo
breaks the boot rather than silently creating an unguarded route.

**A lookup failure returns 503, never `next()`.** If the database is unreachable
the guard cannot determine permission — so it refuses. This is the specific
behaviour that distinguishes it from the SMS's `checkPermission`, which calls
`next()` on a miss.

**Cache misses deny.** There is a 30s TTL cache mirroring the SMS's approach, but
a miss means "look it up", and a lookup finding nothing means 403.

**Separation of duties** ships as `requireDifferentActor(getOriginatorId)` —
mount after `fmsAuthorize` on approve/reject routes so nobody approves their own
request. Wired into the expense workflow in P3.3.

**Branch scoping** sets `req.fmsScope = { school, multiBranch }`. Every FMS query
must filter on it; `assertInScope(req, doc)` checks single documents.

---

## Test coverage — 26 assertions

```
deny by default            no assignment · unknown role · unknown module · unknown action
playbook cases             READ_ONLY cannot APPROVE (all 15 modules)
                           CASHIER cannot post journals
                           CASHIER can do petty cash and income
level ordering             read ⊅ edit · admin ⊃ all · none ⊃ nothing
ledger safety              no role has edit/admin on ledger (all 12 roles)
per-user overrides         grant above default · revoke below default
                           Mongoose Map form · garbage value falls back to default, not allow
matrix integrity           12 roles × 15 modules × 10 actions all valid
                           auditor read-only everywhere
                           teacher locked out of money movement
                           only chairman + principal can reopen a financial year
```

The garbage-override case is the one worth noting: an invalid permission string
falls back to the role default rather than being treated as permissive.

---

## Next

**P1.4 — `LedgerPostingService`.** The keystone. Still blocked on **O3**: it
needs accounts to post to, and migration 005 stays blocked until the school's
accountant signs off the codes in `docs/discovery/04_integration_plan.md` §8.

**P1.5 — OpenAPI wiring.** Not blocked.