# P5.1 — Fee Collection → FMS · Deploy & Verify

**Delivers:** batch fee ingest · source union (F1) · account mappings · idempotent posting · migration 018 · **26 unit tests**
**Spec:** `docs/discovery/04_integration_plan.md` §2 and §8
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/services/ingest/accountMapper.js` | new — pure mapping resolution |
| `backend/fms/services/ingest/accountMapper.test.js` | new — 26 unit tests |
| `backend/fms/services/ingest/feeIngestService.js` | new |
| `backend/fms/services/ingest/feeIngest.check.js` | new |
| `backend/fms/models/integration/index.js` | new — `fms_accountmappings` |
| `backend/fms/models/income/index.js` | **REPLACES** — SMS linkage fields |
| `backend/fms/routes/integrations.js` | new |
| `backend/fms/migrations/scripts/018_integrations.js` | new |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/integrations` |

No new dependencies.

---

## The source union — why this module matters most

The DB Design specified reading `StudentFee.paymentHistory[]`.

P0.3 found that `payAssignment` mirrors into `StudentFee` **only when a ledger already exists**. With 441 assignments against 169 ledgers, most payments taken that way live in `FeeAssignment.payments[]` alone.

Reading StudentFee only would have **under-reported income by most of it** — with every posting balanced, every total internally consistent, and nothing looking wrong.

```
sources = StudentFee.paymentHistory[]  ∪  FeeAssignment.payments[]
key     = receiptNumber
FeePayment ignored entirely (legacy mirror, same receiptNumber)
```

Because `recordPayment` writes the same receipt number to both, the union self-deduplicates for dual-written payments and recovers the rest. Where both copies exist, **the richer record wins** — the one carrying a fee type, so the posting can be classified.

---

## Two deviations from the plan

### No `fms_feePostings` collection

The plan called for one. I did not build it.

`fms_incomevouchers` already records "money received from X, for Y, on date Z" — which is what a fee receipt is. `fms_ingeststate` already provides idempotency. A third record of one event is a third thing to keep in step, and a third answer to "did we post this receipt?".

Instead the income voucher gains `sourceSystem`, `sourceReceiptNumber`, `sourceCollection`, `sourceDocId` and `needsReclassification`, with a **unique partial index** on the SMS receipt number so a replay is impossible at the database, not merely checked in code.

### One mappings collection, not four

§8 defines four mapping tables (fee type, payment method, payroll component, expense category). They are all the same question — "this thing over there, which head does its money go to?" — so `fms_accountmappings` carries a `mappingType` discriminator. Four collections would mean four resolvers that drift.

---

## The distinction the brief insists on

Two situations that must never be treated the same:

| | |
|---|---|
| **No fee type at all** | A StudentFee-ledger payment carries none. **Expected.** Posts to `4109 Fee Income — Unclassified` and is **flagged** for reclassification. |
| **A fee type with no mapping** | Somebody added a fee type and nobody told the FMS where its money goes. **Not expected.** Fails loudly with the fee type named and a hint. |

Absorbing the second into a fallback would let a new fee type pool silently into "unclassified" for a year. There is a unit test asserting the two resolutions are never equal.

---

## Online and UPI go to a clearing head

`1202 Bank — Online Collections`, not `1201`.

The money has not settled. Posting it straight to the bank head would overstate the balance until it does, and leave the bank reconciliation (P4.4) nothing to match against.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\models\integration,backend\fms\services\ingest | Out-Null
# save the 9 files
cd backend
node --check fms/services/ingest/accountMapper.js
node --check fms/services/ingest/feeIngestService.js
node --check fms/services/ingest/feeIngest.check.js
node --check fms/models/integration/index.js
node --check fms/models/income/index.js
node --check fms/routes/integrations.js
node --check fms/migrations/scripts/018_integrations.js
node --test fms/services/ingest/accountMapper.test.js
node --test fms/docs/contract.test.js
cd ..
git add -A
git status --short
git commit -m "P5.1: Fee Collection to FMS (integration plan §2)"
git push
```

Expect `# pass 26` and `# pass 28`, and **9 files** in `git status --short`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/services/ingest/accountMapper.test.js
node fms/migrations/_runner.js up
node fms/services/ingest/feeIngest.check.js 2>&1 | tail -40
pm2 restart staging-backend --update-env
curl -s http://localhost:5000/api/fms/status; echo
```

### Production

```bash
cd ~/school-management-system && git pull
```

---

## The P5.1 verification

The brief asks: *fire a fee-receipt event, confirm one income voucher + balanced GL; fire the same event again and confirm no second posting.*

Section 2 of the check does exactly that. The SMS client is **stubbed**, so this proves the FMS side without needing the SMS running or real fee data present — and the stub asserts the real call signature rather than accepting anything.

- two receipts posted, one income voucher each
- cash → `Dr 1101`, online → **`Dr 1202` (clearing, not bank)**
- the StudentFee receipt credits `4109` and is flagged; the assignment receipt credits `4101` and is not
- **replay: 0 posted, 2 already present, no second voucher, the trial balance does not double**

Section 3 covers the other stated test — an unmapped fee type **fails** rather than being skipped, the rest of the batch continues, and once a mapping is added it posts.

---

## ⚠️ This cannot run for real yet

`sync` refuses with a clear message when the Chart of Accounts is empty:

> *No postable accounts exist — the Chart of Accounts has not been set up*

The check creates its own chart, so it passes. Real ingest needs **O3**.

When the chart does exist, run a **dry run first**:

```
POST /api/fms/integrations/fees/sync   { "dryRun": true }
```

It resolves every payment and reports what would happen without writing anything — which is the right way to meet ~500 real receipts for the first time.

---

## Next

**P5.2 Payroll → FMS**, which carries discovery finding **G1**: `SalarySlip` has no ESIC or Professional Tax fields, so the posting specified in the SRS cannot be built as written. §3.1 of the integration plan sets out the alternative.