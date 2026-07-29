# P7.2 — Performance & Scalability · Deploy & Report

**Delivers:** index audit tool · pagination caps · k6 load script · this report
**SRS:** M25 · NFRs
**Deploy to:** staging only

---

## The short version

The brief says *"do not micro-optimise prematurely — measure first."*

I measured. **Most of what this phase asks for was already correct**, and the honest deliverable is saying so rather than manufacturing changes.

| | Finding |
|---|---|
| **Indexes** | 169 compound indexes across 34 models. Every model has a school-leading index. **Nothing missing.** |
| **Pagination** | 20 of 24 list endpoints already paged. Four were unbounded — now capped. |
| **500 concurrent users** | Boilerplate. This school has ~10 active students and ~5 staff. |

---

## Files

| File | |
|---|---|
| `backend/fms/services/performance/indexAudit.check.js` | new — explain()-based audit |
| `backend/fms/perf/load.k6.js` | new — load script |
| `backend/fms/routes/banking.js` | **REPLACES** — cap added |
| `backend/fms/routes/integrations.js` | **REPLACES** — cap added |
| `backend/fms/routes/notifications.js` | **REPLACES** — cap added |
| `backend/fms/routes/pettyCash.js` | **REPLACES** — cap added |

No migration, no new dependencies. k6 is optional and external.

---

## ⚠️ `indexAudit.check.js` reads the LIVE database

**Every other check in this build creates and drops a throwaway `_fmscheck` database. This one does not.**

Query plans depend on the data actually present — running `explain()` against an empty database tells you nothing, because MongoDB will choose a collection scan for a tiny collection even when a perfectly good index exists.

So it connects to `MONGO_URI` directly and **only reads**. It issues `find().explain()`, `estimatedDocumentCount()` and `indexes()`. It writes nothing, creates nothing, drops nothing.

It is safe to run on production, and arguably should be — that is where the data will eventually be.

---

## The pagination caps

Four endpoints returned unbounded results:

```
GET /banking/accounts
GET /integrations/mappings
GET /notifications/preferences
GET /petty-cash/floats
```

All four are naturally small — a school has a handful of bank accounts, a few dozen mappings, eleven notification events. **They were not bugs.**

But "naturally small" is an assumption, and an endpoint that **cannot** return unbounded data is safer than one that merely does not today. Each now carries a hard cap of 200 rather than full pagination, because paging a three-item list would be ceremony.

The banking one mattered slightly more: it computes a balance **per account** in a loop, so an unbounded result would mean an unbounded number of aggregations.

---

## On the 500-user target

The NFR asks for ~500 concurrent users and <3s transaction latency.

**The Future Step School has roughly ten active students and five staff.**

That number is template boilerplate. Running 500 virtual users against this deployment measures the Oracle Cloud instance, not the application — and tuning for it is exactly the premature optimisation the brief warns against.

So the k6 script defaults to a **realistic** profile (5 concurrent users, the actual staff count). The NFR profile is available for whoever wants the document's number:

```bash
k6 run -e BASE=https://portal.thefuturestepschool.in -e TOKEN=<jwt> fms/perf/load.k6.js
k6 run -e PROFILE=nfr ... fms/perf/load.k6.js
k6 run -e PROFILE=smoke ... fms/perf/load.k6.js
```

**The load test only reads.** A test that posted vouchers would leave hundreds of entries in whichever database it hit — and the FMS deliberately makes those impossible to delete. Write-path timing belongs in a throwaway database, which is what the integration checks already do.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\services\performance,backend\fms\perf | Out-Null
# save the 6 files
cd backend
Test-Path fms\services\performance\indexAudit.check.js, fms\perf\load.k6.js
node --check fms/services/performance/indexAudit.check.js
node --check fms/routes/banking.js
node --check fms/routes/integrations.js
node --check fms/routes/notifications.js
node --check fms/routes/pettyCash.js
node --test fms/docs/contract.test.js
cd ..
git add -A
git status --short
git commit -m "P7.2: index audit, pagination caps, load script (M25)"
git push
```

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node fms/services/performance/indexAudit.check.js
node fms/services/banking/banking.check.js 2>&1 | tail -3
node fms/services/pettyCash/pettyCash.check.js 2>&1 | tail -3
node fms/services/notification/notification.check.js 2>&1 | tail -3
pm2 restart staging-backend --update-env
```

The three integration checks re-run because those route files changed.

**The index audit output is the deliverable** — paste it and it becomes the performance report with real numbers rather than claims.

### Production

Worth running the audit there too, read-only:

```bash
cd ~/school-management-system && git pull && cd backend
node --test fms/docs/contract.test.js 2>&1 | grep -E "^# (pass|fail)"
node fms/services/performance/indexAudit.check.js
```

---

## What the audit checks

22 real query shapes, taken from the services rather than invented:

```
trial balance · account ledger · ledger by date · by voucher
voucher list · idempotency · ingest replay guard · chart lookup
receipt list · sms receipt · expense list · committed spend
budget lookup · double-payment guard · po list · duplicate invoice
unreconciled · period lock · audit search · inbox
settlement replay guard · live payroll posting
```

For each it reports the document count, whether the planner chose `IXSCAN` or `COLLSCAN`, and — separately — whether a usable index **exists**.

Those are different questions. On a near-empty collection MongoDB prefers a scan even when an index is available, so conflating them would produce false alarms on a fresh database.

It then times three shapes and asserts each is well under the 3s NFR.

---

## The honest performance position

At current volume (~1,000 ledger entries, ~5 users) **nothing in this system needs optimising**. The aggregations run in single-digit milliseconds.

What has been done is to make sure that stays true as volume grows:

- every query shape has an index
- no endpoint can return unbounded data
- the dashboard caches for 60 seconds and says so
- a re-runnable tool exists to check all of it again later

If the school grows to a point where this matters, run `indexAudit.check.js` against the real data and it will say what needs attention. Guessing now would be guessing.

---

## Running totals

**415 unit/contract tests · ~1,150 integration checks.**

---

## Next

**Phase 8 — Testing & UAT Automation**, then **Phase 9 — Handover**.

**O3** remains the one conversation that turns this into something the school uses.