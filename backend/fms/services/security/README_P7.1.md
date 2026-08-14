# P7.1 — Security Controls · Deploy & Verify

**Delivers:** route-guard enumeration (found 5 broken routes) · `fmsResolveScope` · FY close/lock/reopen · **13 new unit tests**
**SRS:** M22 / FR-M22 · SCR-67
**Deploy to:** staging only

---

## ⚠️ This drop fixes a broken feature

FR-M22 states *"RBAC everywhere (already wired)."*

**It was not.** Five notification routes checked `req.fmsRole` by hand:

```javascript
if (!req.fmsRole) throw errors.forbidden('No FMS role');
```

**Nothing outside `fmsAuthorize` sets that field.** So it was always `undefined`, every one of those routes threw, and the notification inbox was **completely unreachable**.

The service tests passed because they exercise the *service*, not the route. Nothing else would have caught it until somebody opened the inbox.

---

## Files

**New:**

| File | |
|---|---|
| `backend/fms/services/security/routeGuards.test.js` | **13 tests** — the enumeration |
| `backend/fms/services/financialYear/financialYearService.js` | close / lock / reopen |
| `backend/fms/services/financialYear/financialYear.check.js` | |

**Replaced:**

| File | |
|---|---|
| `backend/fms/middleware/fmsAuthorize.js` | **adds `fmsResolveScope()`** — keystone file |
| `backend/fms/models/core/index.js` | FY lifecycle fields |
| `backend/fms/routes/notifications.js` | now uses the middleware |
| `backend/fms/routes/financialYear.js` | adds readiness/close/lock/reopen |

No migration, no new dependencies.

---

## `fmsResolveScope` — a new primitive

"Can you read your own inbox" is not a module permission, and inventing one would either be too permissive or exclude people who legitimately need it.

`fmsResolveScope()` resolves the caller's role and branch scope and **still denies anyone without an active FMS role** — it simply does not check a module. It is not a way to skip authorization; it is authorization without a module check.

The test asserts it is confined to `notifications.js`. If it spreads, that is probably somebody avoiding a permission check.

---

## The route enumeration

**175 routes. 174 guarded.**

The exception is `POST /gateway/webhook` — a webhook cannot require an FMS role, it sits behind `protect` (a valid JWT), and it immediately throws "not configured". It is on an allowlist that requires a written reason and is tested for staying at most two entries.

The test also asserts:

- every module key a route names **actually exists** in the permission matrix
- every action likewise
- **no route reads `req.fmsRole` or `req.fmsScope` without middleware to set them** — the exact bug above

---

## Financial year: closed can be reopened, locked cannot

Enforcement already existed — `LedgerPostingService` has refused postings to closed or locked years since P1.4. What was missing is the lifecycle.

| | |
|---|---|
| **closed** | Postings refused, but a genuine omission can still be corrected by reopening — with a reason, an author and an audit record. |
| **locked** | Signed off, filed, audited. **No reopen.** Correcting something now means posting into the current year. |

**If a locked year could be reopened, locking would be a suggestion.** So a locked year refuses even a chairman, and the error says what to do instead.

Three further guards:

- **locking requires the year code typed back** — there is no undo
- **an unbalanced year cannot be closed** — closing it freezes the error in place
- reopening is restricted to chairman, trustee, principal, and needs a reason of real length

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\services\security,backend\fms\services\financialYear | Out-Null
# save the 8 files
cd backend
Test-Path fms\services\security\routeGuards.test.js, fms\services\financialYear\financialYearService.js, fms\services\financialYear\financialYear.check.js
node --check fms/middleware/fmsAuthorize.js
node --check fms/models/core/index.js
node --check fms/routes/notifications.js
node --check fms/routes/financialYear.js
node --check fms/services/financialYear/financialYearService.js
node --test fms/services/security/routeGuards.test.js
node --test fms/docs/contract.test.js
node --test fms/services/ledger/posting.test.js
cd ..
git add -A
git status --short
git commit -m "P7.1: Security controls — route guards, fmsResolveScope, FY lock (M22)"
git push
```

Expect `# pass 13`, `# pass 28`, `# pass 23`.

> **Folders are singular:** `services\security`, `services\financialYear`.

### Staging

`fmsAuthorize.js` is the keystone — **every** route depends on it. Run broadly:

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/services/security/routeGuards.test.js
node --test fms/docs/contract.test.js
node --test fms/services/auth/rbac.test.js
node fms/services/financialYear/financialYear.check.js 2>&1 | tail -40
node fms/services/notification/notification.check.js 2>&1 | tail -3
node fms/services/purchase/purchase.check.js 2>&1 | tail -3
pm2 restart staging-backend --update-env
curl -s http://localhost:5000/api/fms/status; echo
```

The `curl` matters more than usual — if `fmsAuthorize` were broken, the plugin would still boot but every request would fail.

### Production

```bash
cd ~/school-management-system && git pull && cd backend
node --test fms/services/security/routeGuards.test.js 2>&1 | grep -E "^# (pass|fail)"
node --test fms/docs/contract.test.js 2>&1 | grep -E "^# (pass|fail)"
```

---

## The P7.1 verification

The brief asks: *close and lock a FY; confirm no posting succeeds against it and that only an authorised role can reopen, with an audit record.*

Section 2:

- close → **no posting succeeds**, nothing written
- an accountant may not reopen; nor a cashier; a short reason is refused
- a principal reopens with a real reason → **audited with before/after and the status change visible**
- posting works again
- close, then **lock** (year code required)
- **no posting succeeds against a locked year**

Section 3 then proves **even a chairman cannot reopen a locked year**, and the message says to post into the current year instead.

---

## What is NOT in this drop

FR-M22 also lists 2FA, password policy, session timeout, TLS, field encryption and a backup/DR runbook.

- **2FA, password policy, session timeout** are SMS auth concerns — the FMS reuses the SMS JWT and should not build a parallel identity system.
- **TLS** is already in place (Certbot on both servers).
- **Field encryption at rest** would need a key management decision the school has not made. Encrypting with a key sitting in the same `.env` protects against very little, and pretending otherwise would be worse than not doing it.
- **Backup/DR** is a real gap — noted since the discovery phase, still open.

Each of those is a decision rather than a coding task, and none should be quietly ticked off.

---

## Running totals

**415 unit/contract tests · ~1,150 integration checks.**

---

## Next

**P7.2 Performance** — load testing and profiling. The brief says explicitly: *do not micro-optimise prematurely — measure first.*

Then Phase 8 (testing) and Phase 9 (handover).