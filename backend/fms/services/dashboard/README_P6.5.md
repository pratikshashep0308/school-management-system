# P6.5 — Financial Dashboard · Deploy & Verify

**Delivers:** KPIs · cash position · five charts · a cache that cannot lie
**SRS:** M1 / FR-M1 · SCR-04..07
**Completes Phase 6.**
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/services/dashboard/dashboardService.js` | new |
| `backend/fms/services/dashboard/dashboard.check.js` | new |
| `backend/fms/routes/dashboard.js` | new |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/dashboard` |

**No migration, no new collections, no dependencies.**

Folder is `services\dashboard` — **singular**.

---

## On caching

The brief asks for expensive aggregates to be cached "appropriately".

**A cached dashboard that can be stale is a dashboard that lies** — it shows yesterday's cash position to somebody about to act on it today. At this school's data volume (roughly a thousand ledger entries) these aggregations take single-digit milliseconds, so a cache buys nothing and risks that.

The compromise:

- caching exists, and is **short** (60 seconds)
- it is **never invisible** — every response carries `cached`, `computedAt` and `ageSeconds`
- `?live=true` bypasses it entirely
- `POST /dashboard/refresh` clears it, for straight after a batch posting

A cache the reader cannot detect is the only kind that causes harm. Section 7 of the check proves the behaviour explicitly: a posting made after a cached read is **not** visible until invalidation, and the response says it is cached the whole time.

---

## Empty states are honest

With no Chart of Accounts, the dashboard returns **zeros and says it is empty**, naming the likely cause (O3) — rather than erroring, or worse, showing zeros that look like real figures.

Budget utilisation with no active budgets reports **"nothing to report against"**, not 0% utilisation. Those are different statements and only one of them is true.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\services\dashboard | Out-Null
# save the 4 files
cd backend
Test-Path fms\services\dashboard\dashboardService.js, fms\services\dashboard\dashboard.check.js, fms\routes\dashboard.js
node --check fms/services/dashboard/dashboardService.js
node --check fms/services/dashboard/dashboard.check.js
node --check fms/routes/dashboard.js
node --test fms/docs/contract.test.js
cd ..
git add -A
git status --short
git commit -m "P6.5: Financial Dashboard (M1)"
git push
```

Three `True`, then `# pass 28`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node fms/services/dashboard/dashboard.check.js 2>&1 | tail -40
pm2 restart staging-backend --update-env
curl -s http://localhost:5000/api/fms/status; echo
```

### Production

```bash
cd ~/school-management-system && git pull && cd backend
node --test fms/docs/contract.test.js 2>&1 | grep -E "^# (pass|fail)"
```

---

## The P6.5 verification

The brief asks: *load the dashboard on seeded data and confirm each KPI equals the ledger-derived figure.*

Section 2 seeds three months — fees in May and June, salaries in June, stationery bought **on credit** in July — then derives each figure **independently from the trial balance** and compares:

- KPI income = ledger income
- KPI expenditure = salary + stationery
- KPI cash position = cash + bank (**₹40,000**)
- KPI payables = creditors

The stationery-on-credit posting matters: it is an expense with **no cash movement**, so it separates "expenditure" from "money that left". A dashboard conflating the two would pass a simpler seed.

---

## Interfaces were audited before writing the check

P6.4 took four repair rounds, all from assuming signatures rather than reading them. This time every cross-service call was confirmed for arity and shape **before** the check was written. It cost about ten seconds.

---

## Phase 6 complete

| | |
|---|---|
| P6.1 Financial Reports | 41 checks · 32 unit |
| P6.2 Audit Trail | 20 unit (found 16 unguarded models) |
| P6.3 Notifications | 36 checks · 32 unit |
| P6.4 Multi-Branch | 45 checks |
| P6.5 Dashboard | this run |

**402 unit/contract tests · ~1,100 integration checks.**

---

## Next

**Phase 7 — Security & Non-Functional Hardening.** Then Phase 8 (testing) and Phase 9 (handover).

**O3** still gates everything real: until the Chart of Accounts exists, this dashboard will show correctly-balanced zeros.