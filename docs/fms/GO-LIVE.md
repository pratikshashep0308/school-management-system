# Go-Live Checklist

**The Future Step School — Financial Management System**

---

## Where this stands

The system is **built and tested**. It is **not ready to go live**, and the reason is not code.

| | |
|---|---|
| Modules built | 33 across 9 phases |
| Automated tests | 415 unit + 1,162 integration = **1,577, all passing** |
| Production status | Deployed, **plugin dormant** (`FMS_ENABLED` unset) |
| Staging status | Running, 36 collections, migrations 001–004 + 006–022 |
| **Real financial data processed** | **None** |

That last row is the important one. Every number this system has ever handled came from a test fixture.

---

## 🔴 Blocking — go-live cannot happen without these

### O3 — Chart of Accounts sign-off

**Nothing works without this.** Fee ingest, payroll, expenses, reports — every one refuses to run and says why:

> *No postable accounts exist — the Chart of Accounts has not been set up*

Migration `005_seed_chart_of_accounts` is deliberately blocked pending this.

**What is needed:** one sitting with whoever keeps the school's books, going through roughly forty account codes in §8 of `docs/discovery/04_integration_plan.md`. Not a technical task.

**What it unlocks:** approximately 500 real fee payments sitting in the SMS, ready to ingest.

**When it happens, run the dry run first:**

```
POST /api/fms/integrations/fees/sync   { "dryRun": true }
```

It resolves all ~500 and reports what *would* happen without writing anything — surfacing every fee type that needs a mapping before a single posting is made. That is the right way to meet real data for the first time.

### Backups — no tested restore

A nightly `mongodump` cron exists. There is **no tested restore and no off-server copy**.

An untested backup is a hope, not a backup. Before go-live:

1. Take a dump
2. Restore it to a scratch database
3. Confirm the trial balance ties out
4. Get the dump off the server

### Opening balances

If the school has existing balances — bank, cash, creditors, corpus — they must be posted as an opening journal before any transaction, or every report will be wrong by the opening position.

`fms_accounts` carries an `openingBalancePosted` flag for exactly this.

---

## 🟡 Decisions the school must make

### O1 — ESIC and Professional Tax

`SalarySlip` has no fields for either. Payroll posts gross, net, PF, TDS, loan and other deductions — **not** ESIC or Professional Tax, and every response says so.

**The question: does the school deduct either?**

- **No** → the current implementation is correct, and this closes.
- **Yes** → the money is inside `deductions.other` and invisible. Fixing it means an SMS schema change, which is a sanctioned-change decision rather than something the plugin can do.

### Who owns settlement?

Online and UPI receipts accumulate in `1202` until somebody settles them against a bank credit. **Weekly task, needs a named person.** Without one, the clearing head grows and the bank balance reads low.

### Who counts the cash?

Daily closing needs a counter, and a variance needs a **different person** to verify. With five staff, decide who does which before somebody discovers they cannot verify their own count.

---

## 🟢 Known gaps — documented, not blocking

| Gap | Detail |
|---|---|
| **OpenAPI 45% complete** | 81 of 179 routes documented. The undocumented ones **work** and are covered by integration checks — what is missing is the written contract. `node fms/docs/specCoverage.js --missing` lists them. |
| **Notifications not wired** | The events, dispatch and log all work. Nothing calls `notify()` yet, so nothing fires. Additive and safe to add later. |
| **M20 Document Management** | Never built. Not in the playbook; the SMS already has Cloudinary file handling. 10 UAT cases are unaddressed by design. |
| **No payment gateway** | None installed. Online receipts are settled manually — see O3 above. Design documented for when one is added. |
| **500-user NFR** | Boilerplate. The school has ~10 active students and ~5 staff. Indexes are sound (22/22 query shapes use them); tuning for 500 users would be optimising for a load that will not arrive. |

---

## Pre-go-live sequence

**1. Chart of accounts**
```bash
# after O3 sign-off
node fms/migrations/_runner.js up      # unblocks 005
```

**2. Reference data**
- Financial year, marked current
- Number sequences per voucher type
- Role assignments in `fms_roleassignments` — the FMS reads **its own** roles, not SMS roles
- Account mappings for every fee type

**3. Opening balances** — as a journal voucher, before anything else

**4. Full suite on staging**
```bash
node fms/test/runAll.js        # want 1,577 passing
```

**5. Smoke test on staging, in this order**
- Log in, confirm an FMS role resolves
- Record an income receipt → check the ledger has two balanced entries
- Raise an expense → approve it → pay it → confirm the payable cleared
- Generate a trial balance → confirm debits = credits
- `GET /api/fms/reports/verify` → all three identities pass

**6. Backup proven** — see above

**7. Enable on production**
```bash
# .env
FMS_ENABLED=true
pm2 restart school-backend --update-env
curl -s https://portal.thefuturestepschool.in/api/fms/status
```

**8. Fee ingest dry run, then live**

---

## Rollback

The FMS is a plugin. If anything goes wrong:

```bash
# unset FMS_ENABLED, restart
pm2 restart school-backend --update-env
```

**The SMS is completely unaffected** and the FMS data is preserved — reactivating picks up where it left off. This was the founding architectural constraint and it has held throughout.

The one thing that is *not* reversible is postings. Reversal creates a new entry; it never deletes the original. That is deliberate.

---

## Where the risk actually is

Not in the code. 1,577 tests pass, the ledger cannot be made to imbalance, nothing can be deleted, and every posting is attributable.

**The risk is in the first contact with real data.**

- ~500 fee payments will be ingested at once. The dry run exists so that happens on a report first.
- Opening balances, if wrong, make every subsequent report wrong.
- The three manual routines — daily cash close, weekly settlement, monthly reconciliation — need owners. Software cannot do them.

The system has been built to fail loudly rather than quietly. When something is wrong it refuses and says why, rather than posting something plausible. That is the property to preserve.