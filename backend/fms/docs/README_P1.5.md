# P1.5 — API Foundation & OpenAPI · Deploy & Verify

**Delivers:** shared response envelope · error contract · pagination · validation · served OpenAPI docs · contract test · one example endpoint
**Completes Phase 1.**
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/utils/apiResponse.js` | new — envelope, errors, pagination, validation |
| `backend/fms/middleware/fmsErrorHandler.js` | new — terminal error handler |
| `backend/fms/middleware/fmsAuthorize.js` | **MODIFIED** — now throws shared errors |
| `backend/fms/docs/openapi.js` | new — the spec |
| `backend/fms/docs/contract.test.js` | new — 28 contract tests |
| `backend/fms/routes/financialYear.js` | new — the example endpoint |
| `backend/fms/routes/index.js` | **REPLACES** the P1.1 version |

No new dependencies.

---

## Two decisions worth knowing about

### The spec is JS, and covers implemented endpoints only

The package's `openapi.yaml` describes 97 paths, nearly all unbuilt. Serving that as "living documentation" would document endpoints that return 404 — worse than none, because it invites the frontend to code against something that does not exist.

`fms/docs/openapi.js` documents what is actually implemented. Each phase adds its endpoints, so the two converge by Phase 6. That also keeps the contract test meaningful: it tests real responses against real promises.

It is JS rather than YAML because the SMS has no YAML parser, and adding a dependency to serve a static document is not a trade worth making.

### The contract test found a bug in my own code

`fmsAuthorize` was written in P1.3, before this envelope existed. Its 403 returned `{success, message}` while everything else returned `{success, error: {code, message}}` — two shapes for the same class of failure.

The contract test caught it on first run. `fmsAuthorize` now throws shared errors and lets the handler format them.

That is the argument for the contract test in one incident: the divergence was between two pieces of code written days apart by the same author, and no amount of care would reliably prevent it.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\docs | Out-Null
# save the 7 files
cd backend
node --test fms/docs/contract.test.js
node --test fms/services/auth/rbac.test.js
node --test fms/services/ledger/posting.test.js
cd ..
git add -A
git commit -m "P1.5: API foundation, OpenAPI docs, contract test"
git push
```

Expect 28, 26, 23 — all passing.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/docs/contract.test.js
pm2 restart staging-backend --update-env
curl -s http://localhost:5000/api/fms/docs/openapi.json | head -c 200; echo
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/api/fms/docs
```

Then open **`http://66.116.251.3/api/fms/docs`** in a browser. Redoc should render the spec.

---

## Verify the contract test actually bites

P1.5 asks for this explicitly, and it is worth doing once so you trust the test.

```bash
cd /root/school-management-system/backend
cp fms/routes/index.js /tmp/idx.bak
sed -i "s/currency: config.currency.code,/currency: 999,/" fms/routes/index.js
node --test fms/docs/contract.test.js 2>&1 | grep -E "expected string|# fail"
cp /tmp/idx.bak fms/routes/index.js
node --test fms/docs/contract.test.js 2>&1 | grep "# fail"
```

Expect `$.data.currency: expected string, got number` and `# fail 2`, then `# fail 0` after restoring.

---

## The conventions, briefly

**Success**
```json
{ "success": true, "data": { } }
{ "success": true, "count": 3, "pagination": { "page":1,"limit":25,"total":3,"pages":1 }, "data": [] }
```

**Failure**
```json
{ "success": false, "error": { "code": "VALIDATION_FAILED", "message": "…", "details": { "fields": {} } } }
```

Branch on `code`, never on `message` — messages get reworded, codes do not.

| Status | When |
|---|---|
| 400 | malformed request (bad ObjectId, unknown sort field) |
| 401 | not authenticated |
| 403 | no FMS role, or role lacks the required level |
| 404 | not found — **also** returned for another branch's records |
| 409 | conflicts with state (locked period, duplicate, already posted) |
| 422 | content fails validation; `details.fields` is per-field |
| 503 | transaction unavailable, or authorization could not be determined |

**Pagination:** `?page=&limit=&sort=`. Limit caps at 200, defaults to 25. Sort takes `-` for descending and **rejects unknown fields** rather than ignoring them — silently dropping a requested sort produces results the caller will misread.

---

## Three behaviours that are deliberate

**Authorization runs before validation.** A caller with no FMS role sending a malformed id gets 403, not 400. Validating first would tell an unauthorised caller whether their input was well-formed. There is a test asserting this ordering.

**Another branch's record returns 404, not 403.** Distinguishing "exists but forbidden" from "does not exist" leaks the existence of another branch's records.

**`school` is never a client parameter.** It comes from `req.fmsScope`, set by `fmsAuthorize` from the JWT. Accepting it from the query string would let any authenticated user read another branch's books.

---

## Phase 1 complete

| | Tests |
|---|---|
| P1.1 scaffold | — |
| P1.2 migrations | rollback proven on staging |
| P1.3 RBAC | 26 |
| P1.4 posting engine | 23 unit + 35 integration |
| P1.5 API foundation | 28 |

**77 unit/contract tests, 35 integration checks, no failures.**

---

## Still blocked: O3

Everything in Phase 1 is built. What the system cannot do is post anything real, because there are no accounts.

§8 of `docs/discovery/04_integration_plan.md` — about 40 proposed account codes — needs review by whoever keeps the school's books. Then: correct the table in `005_seed_chart_of_accounts.js`, delete the `blocked:` line, run `up`.

Phase 2 (Chart of Accounts UI, GL views, journal vouchers) starts there.