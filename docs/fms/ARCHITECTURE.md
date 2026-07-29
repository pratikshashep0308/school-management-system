# FMS Plugin — Architecture

**The Future Step School ERP** · Financial Management System plugin
**Version:** 0.1.0 (P1.1 scaffold) · **Date:** 2026-07-27

---

## 1. What this is

An **independent, toggleable finance plugin** running inside the existing MERN
School Management System. It adds double-entry accounting without changing how
the SMS behaves.

Four constraints govern everything:

| # | Constraint | Enforced by |
|---|---|---|
| 1 | **Reads SMS data over REST only.** No SMS model import, no SMS collection read, no SMS write | `fms/client/smsClient.js` is the only outbound path, and it exposes **GET helpers only** |
| 2 | **Owns `fms_`-prefixed collections**, same database | Every FMS model sets `{ collection: 'fms_…' }` explicitly |
| 3 | **Toggles via `FMS_ENABLED`.** Off = SMS byte-identical, FMS data preserved | Single guarded `routes.push` in `server.js` |
| 4 | **Stack unchanged** — MERN | One new dependency: `axios` |

**Off is not uninstall.** Toggling off unmounts routes; it never deletes `fms_` data.

---

## 2. Deployment shape

**In-process** (decision DL2). FMS routes mount into the existing Express app.

Chosen over a separate process because production is a 1 GB VPS already running
two Node processes; a third adds ~100 MB and turns every FMS→SMS call into a
loopback round-trip through nginx on the same machine.

**The trade:** an unhandled FMS error can affect the SMS. Mitigated by wrapping
the mount in `try/catch` (a broken plugin degrades to "absent", not "portal
down") and by `FMS_ENABLED=false` as a kill switch. Tracked as risk RR12.

The REST-only boundary is preserved regardless of shape — it is a code
discipline, not a network artifact.

---

## 3. Directory layout

```
backend/
├── server.js                    ← ONE guarded push (see fms/SERVER_PATCH.md)
├── models/  routes/  controllers/  middleware/     ← SMS, untouched
└── fms/                         ← the entire plugin
    ├── index.js                 plugin entry; exports routeTuple()
    ├── config/index.js          FY, currency, cron, number formats, toggle
    ├── client/smsClient.js      the ONLY path to SMS data
    ├── middleware/
    │   └── fmsAuthorize.js      deny-by-default (full impl P1.3)
    ├── routes/index.js          /api/fms router; health + status
    ├── utils/money.js           integer-paise arithmetic
    ├── migrations/              P1.2
    ├── ingest/                  fees | payroll | expenses — Phase 5
    ├── controllers/<domain>/
    ├── services/<domain>/
    ├── models/<domain>/
    └── validators/<domain>/
```

Domains: `accounts, income, expense, approval, budget, vendor, purchase,
banking, pettyCash, ledger, journal, cashBankBook, payrollIntegration, reports,
audit, notifications`.

**Complete removal** = delete `backend/fms/`, revert the `server.js` push, drop
`fms_*` collections. The SMS is then byte-identical to today.

---

## 4. Request flow

```
Client
  │
  ▼
nginx ──► Express (server.js)
             │
             ├─ /api/students, /api/fees, …  ──► SMS routes ──► SMS collections
             │                                    (checkPermission — fails open)
             │
             └─ /api/fms/*   [only if FMS_ENABLED=true]
                      │
                      ├─ /status, /health          public, no auth
                      │
                      └─ everything else
                             │
                             ├─ SMS `protect`      verify JWT, load User
                             ├─ fmsAuthorize()     DENY BY DEFAULT
                             │                      ↑ not checkPermission
                             ├─ controller
                             ├─ service
                             │     ├─ LedgerPostingService ──► fms_ collections
                             │     │        (MongoDB transaction)
                             │     └─ smsClient ──HTTP GET──► SMS API
                             └─ response { success, data }
```

### Why the FMS does not reuse `checkPermission`

`backend/middleware/checkPermission.js` calls `next()` when no `RolePermission`
row exists for the caller's role. Its own comments state this is deliberate — it
preserves behaviour for schools that never configured Access Control.

Reasonable for the SMS. Unacceptable in front of a ledger, where "no rule
configured" must mean "no access". The FMS therefore ships `fmsAuthorize`, which
denies unless an explicit `fms_roleAssignments` row grants the required level.

**The SMS middleware is not modified.**

---

## 5. Data boundary

### FMS owns

33 `fms_`-prefixed collections. Zero collision with SMS names (verified P0.3 §3).

### FMS consumes, read-only

`users`, `schools`, `students`, `teachers`, `classes`, `feetypes`,
`feeassignments`, `studentfees`, `salaryslips`, `expenses`, `expensecategories`,
`rolepermissions` — all via HTTP GET.

### References

SMS record ids are stored as **plain `ObjectId` with no Mongoose `ref`**, plus a
denormalised label captured at ingest. Two reasons: `populate()` across the
boundary would violate constraint 1, and the denormalised value survives if the
SMS record is later edited or deleted.

### Money

The SMS stores **float rupees** everywhere. The FMS stores **integer paise**
everywhere. `money.toPaise()` converts exactly once, at ingest. The original
float is retained in `fms_feePostings.sourceAmount` so the conversion is
provable. The FMS never writes a converted value back.

---

## 6. Consistency model

A MongoDB transaction **cannot span an HTTP call.** Therefore:

- **Inside the FMS** — a voucher and its balanced ledger entries commit
  atomically in one transaction. Requires a replica set.
- **Across the SMS↔FMS boundary** — eventual. The FMS pulls on a cron, posts
  each source record exactly once keyed by its idempotency key, records progress
  in `fms_ingestState`, and a reconciliation report surfaces gaps.

`GET /api/fms/health` returns **503** when `mongod` is not a replica set, because
no posting can succeed in that state. Production is currently standalone.

### Ingest pattern

```
cron tick (or manual POST /api/fms/integrations/*/sync)
  → smsClient.health()                 E3 — fail fast if SMS unreachable
  → smsClient.get(<endpoint>)
  → for each source record:
       key = idempotency key
       if fms_ingestState[key] === 'posted' → skip
       else:
          paise = money.toPaise(record.amount)      once
          LedgerPostingService.post(...)            transaction
          upsert fms_ingestState                    same transaction
```

Idempotency keys: fees → `receiptNumber`; payroll → `salarySlip._id`;
expenses → `expense._id`. A unique index on `{source, sourceId}` makes
double-posting impossible even under concurrent runs.

---

## 7. Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `FMS_ENABLED` | — | *(unset)* | `'true'` mounts the plugin. Strict — `1`/`yes`/`TRUE` all read as off |
| `FMS_SMS_BASE_URL` | — | `http://127.0.0.1:$PORT/api` | SMS API base |
| `FMS_SERVICE_EMAIL` | for ingest | — | Service user |
| `FMS_SERVICE_PASSWORD` | for ingest | — | Service user |
| `FMS_INGEST_ENABLED` | — | `false` | Cron jobs on/off, independent of the plugin toggle |
| `FMS_CRON_FEES` | — | `0 1 * * *` | |
| `FMS_CRON_PAYROLL` | — | `0 2 * * *` | |
| `FMS_CRON_EXPENSES` | — | `30 2 * * *` | |
| `FMS_CRON_RECON` | — | `0 3 * * *` | |

`FMS_INGEST_ENABLED` is separate from `FMS_ENABLED` on purpose: you will want
the UI and reports live before you let a cron write to the ledger unattended.

### Service credential

The service user must hold `superAdmin`, `schoolAdmin` or `accountant` to read
fee data. **All three can also delete fee payments** — there is no read-only
finance role in the SMS. This is discovery finding G2 / risk RR4.

Until enhancement E5 exists: use `accountant`, a long random password, `.env`
only, never committed. Rotate on any suspicion.

`JWT_EXPIRE` is 30 days, so `smsClient` authenticates programmatically and
re-authenticates on 401 rather than holding a static token (finding G3).

---

## 8. Endpoints at P1.1

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/fms/status` | none | `{enabled, version, currency, financialYear}` |
| GET | `/api/fms/health` | none | DB state, replica-set state, `transactionsAvailable`. **503 if standalone** |
| GET | `/api/fms/health/sms` | none | SMS REST reachability (E3) |
| * | `/api/fms/*` | — | 404 in FMS envelope |

With `FMS_ENABLED` unset, all of these are 404 from the SMS handler.

Domain routes are listed as commented mount points in `fms/routes/index.js`,
each annotated with its phase and permission module key.

---

## 9. What P1.1 deliberately does not do

No business logic. No `fms_` collection is created. No migration runs. No ingest
runs. `fmsAuthorize` denies everything — correct at this stage, since there is
no FMS business endpoint to reach, and it guarantees the plugin cannot ship an
open route if P1.3 slips.

| Next | Delivers | Blocked by |
|---|---|---|
| P1.2 | Migration runner, 33 collections, indexes, seed | **O6** production replica set; **O3** CoA sign-off |
| P1.3 | `fms_roleAssignments`, full `fmsAuthorize`, service user | P1.2 |
| P1.4 | **`LedgerPostingService`** — the keystone | P1.2, replica set |
| P1.5 | OpenAPI wiring | P1.1 |

---

## 10. Rollback

| Scope | Action | Effect |
|---|---|---|
| Disable | `FMS_ENABLED=false`, restart | Routes unmount. `fms_` data preserved |
| Remove code | Revert the `server.js` push, delete `backend/fms/` | No FMS code present |
| Remove data | Drop every `fms_*` collection | SMS byte-identical to pre-FMS |

```js
db.getCollectionNames().filter(n => n.startsWith('fms_')).forEach(n => db[n].drop())
```

Safe because the FMS never writes an SMS collection. Nothing in the SMS depends
on anything the FMS created.


