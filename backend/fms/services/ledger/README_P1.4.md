# P1.4 — LedgerPostingService · Deploy & Verify

**Delivers:** the double-entry posting engine · reversal · trial balance · 23 unit tests · 40-odd transactional integration checks
**Deploy to:** staging only

---

## Correcting something I said earlier

I previously described P1.4 as blocked on O3. That was wrong, and worth being clear about.

The posting service is **account-agnostic** — it takes account ids and posts balanced entries against them. It does not care whether an account is called `4101 Tuition Fee Income` or anything else. O3 blocks *seeding the real Chart of Accounts*, and therefore blocks real fee ingest (Phase 5). It does not block building or testing the engine.

What O3 still gates: migration 005, and anything that posts against real accounts.

---

## Files

| File | Purpose |
|---|---|
| `backend/fms/services/ledger/LedgerPostingService.js` | The engine |
| `backend/fms/services/ledger/posting.test.js` | 23 unit tests, no DB needed |
| `backend/fms/services/ledger/integration.check.js` | Transactional checks, needs the replica set |

No new dependencies.

---

## One deliberate departure from the specification

DB Design §6.3 guards idempotency like this:

```js
const existing = await Voucher.findOne({ source, sourceRef }).session(session);
if (existing) return;                    // already posted
```

That is a read-then-write check. Two concurrent ingest runs can both read "not found" and both post — the exact double-posting it is meant to prevent (risk RR1, the highest-impact item in the register). MongoDB's snapshot isolation will not catch this, because the two transactions never touch the same document.

Instead the service **claims the key first**, inserting into `fms_ingeststate` inside the transaction. The unique index on `{school, source, sourceId}` from P1.2 means the second writer gets `E11000` and its entire transaction aborts.

Idempotency becomes a property of the database rather than a promise made by code.

The integration check fires five concurrent posts of the same receipt and asserts exactly one voucher results.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\services\ledger | Out-Null
# save the 3 files
cd backend
node --check fms/services/ledger/LedgerPostingService.js
node --test fms/services/ledger/posting.test.js
cd ..
git add -A
git commit -m "P1.4: LedgerPostingService — atomic double-entry posting"
git push
```

Expect `# pass 23`, `# fail 0`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/services/ledger/posting.test.js
node fms/services/ledger/integration.check.js
```

The integration check runs against **`school_management_fmscheck`** — a separate database on the same replica set. It creates its own fixtures and drops the database at the end. It never reads or writes `school_management`.

That isolation is deliberate rather than fastidious: `fms_ledgerentries` is append-only and rejects `deleteMany`, so cleaning up test postings inside the real database would mean either bypassing the model layer or leaving junk in the ledger. Neither is acceptable in a system whose value depends on the ledger being trustworthy.

Confirm afterwards:

```bash
mongosh --quiet --eval 'print(db.adminCommand({listDatabases:1}).databases.map(d=>d.name).join(", "))'
```

No `_fmscheck` database should remain.

---

## What the integration check covers

```
1  Posting          voucher created · number INC-2026-27-00001 · 2 entries
                    account snapshots denormalised · balances updated
                    trial balance = 0
2  Rejections       unbalanced · non-postable account · unknown account
                    date outside FY — and NOTHING written by any of them
3  Idempotency      repeat ingest is a no-op returning the same voucher
                    5 CONCURRENT posts → exactly 1 voucher
4  Append-only      updateOne / deleteOne / deleteMany all blocked
5  Reversal         flipped lines · original marked but untouched
                    balances restored · double reversal blocked
                    trial balance still 0
6  Period lock      posting into a locked FY rejected
7  Numbering        sequential · all unique
8  Balance cache    recomputed from the ledger, drift = 0
```

Item 2's last assertion is the one I would watch: a rejection must leave the database exactly as it found it. A partial write here would be worse than a hard failure, because it would be invisible.

---

## Design notes

**Balance is asserted before the transaction opens.** `validateLines()` is pure and runs first. An unbalanced set never reaches MongoDB, so there is no window in which a half-written voucher could exist.

**Account snapshots are denormalised onto every entry** (`accountCode`, `accountName`). If an account is later renamed, historical entries still show what they were posted to. Same reasoning for `partyName` — it survives the SMS deleting the student.

**The balance cache is maintained inside the posting transaction.** `verifyAccountBalance()` recomputes from the ledger and reports drift; the aggregate over `fms_ledgerentries` is always authoritative, and the cache is only ever a convenience.

**Reversal is terminal for an ingest key.** Once reversed, a reappearing source record posts as a *new* voucher rather than un-reversing the old one. Reversals are never undone — otherwise the audit trail stops being linear and "what happened" becomes unanswerable.

**Errors carry codes** (`UNBALANCED`, `FY_LOCKED`, `ACCOUNT_NOT_POSTABLE`, …) so callers can branch on them instead of matching message strings.

---

## Still gated by O3

The engine is done and tested. What it cannot yet do is post anything real, because there are no accounts to post to.

To get there:

1. The school's accountant reviews §8 of `docs/discovery/04_integration_plan.md`
2. Correct the `ACCOUNTS` table in `005_seed_chart_of_accounts.js`
3. Delete the `blocked:` line
4. `node fms/migrations/_runner.js up`

At that point the ledger is live and Phase 2 (Chart of Accounts UI, GL views, journal vouchers) can begin.

---

## Next

**P1.5 — OpenAPI wiring.** Not blocked. Completes Phase 1.

**Phase 2** — needs O3.