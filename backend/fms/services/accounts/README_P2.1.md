# P2.1 — Chart of Accounts · Deploy & Verify

**Delivers:** account group + account CRUD · delete guards · immutability rules · balance endpoint · OpenAPI paths · 30 integration checks
**SRS:** M2 / FR-M2 · SCR-08, SCR-09, SCR-10
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/services/accounts/accountService.js` | new — the rules |
| `backend/fms/services/accounts/integration.check.js` | new — 30 checks |
| `backend/fms/routes/accounts.js` | new — REST layer |
| `backend/fms/docs/openapi.js` | **REPLACES** — adds 6 paths, 3 schemas |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/accounts` |

No new dependencies.

---

## ⚠️ Nobody can currently create an account

The permission matrix (from SRS §9.10) gives `edit` on `accounts` to **`accountsManager` only**. On staging the only two role holders are Vijay (`chairman`) and Pratiksha (`principal`) — both `read`.

So the module deploys **unusable** unless someone is granted rights. That is the matrix working as designed, not a bug, but it needs a decision.

**Simplest fix — a per-user override**, which also exercises the override mechanism:

```bash
mongosh school_management --eval '
db.fms_roleassignments.updateOne(
  { smsUserEmail: "vijayborse@gmail.com" },
  { $set: { "permissions.accounts": "admin" } }
)'
```

`admin` rather than `edit` because DELETE requires admin. Verify:

```bash
mongosh school_management --quiet --eval '
db.fms_roleassignments.find({},{smsUserEmail:1,financeRole:1,permissions:1,_id:0}).forEach(d=>printjson(d))'
```

**A second, larger question:** the P2.1 prompt says "ACCOUNTS_MGR/ACCOUNTANT manage", but SRS §9.10 gives `accountant` only `V` (read) on the Chart of Accounts. The two documents disagree. I followed the matrix, since that is what is implemented and tested. If the school's intent is that an accountant maintains the chart, the matrix row should change — but that is a decision, not a defaulting.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\services\accounts | Out-Null
# save the 5 files
cd backend
node --check fms/services/accounts/accountService.js
node --check fms/routes/accounts.js
node --test fms/docs/contract.test.js
cd ..
git add -A
git commit -m "P2.1: Chart of Accounts (M2)"
git push
```

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/docs/contract.test.js
node fms/services/accounts/integration.check.js
pm2 restart staging-backend --update-env
```

Then reload **`http://66.116.251.3/api/fms/docs`** — a **Chart of Accounts** section should appear with 9 operations.

---

## The P2.1 verification

The prompt asks specifically: *create a nested group + account; attempt to delete an account after posting to it and confirm it is blocked.*

Section 4 of the integration check does exactly that — creates the group tree, creates accounts, posts a real ₹5,000 voucher through `LedgerPostingService`, then attempts to delete both sides and asserts 409 on each. Section 5 then proves deactivation is the working alternative and that posting to an inactive account is rejected.

To see it by hand (needs a JWT and the `accounts` override above):

```bash
TOKEN=<your jwt>
BASE=http://66.116.251.3/api/fms

curl -s -X POST $BASE/accounts/groups -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"groupCode":"4000","groupName":"Income","accountType":"income"}'

curl -s $BASE/accounts/groups/tree -H "Authorization: Bearer $TOKEN"
```

---

## Rules the service enforces

| Rule | Why |
|---|---|
| An account with postings **cannot be deleted** — 409 | Deleting it orphans every posting and makes the trial balance unexplainable |
| `accountCode`, `accountGroup`, `openingBalance` freeze once posted | `fms_ledgerentries` snapshots the code; history would show the old value while the account showed the new one |
| `accountType` / `normalBalance` are **inherited from the group**, never client-set | Letting a client set them independently is how an income head ends up in the expense tree |
| A group with children cannot be deleted | Same reasoning, one level up |
| Group hierarchies cannot cycle | A cycle makes the tree unrenderable and recursive queries hang |
| System groups cannot be deleted | Seeded structure; deactivate instead |
| Account codes are unique per school | Enforced by index; surfaced as 409 rather than a raw E11000 |
| Search terms are regex-escaped | An unescaped user string in a regex is a denial-of-service |

---

## One thing worth understanding: `openingBalance`

It is **stored but not posted.** `currentBalance` reflects ledger postings only.

Opening balances become real when a financial-year opening journal is posted — `fms_financialyears.openingBalancesPosted` tracks that. Adding `openingBalance` into `currentBalance` now would double-count the moment that journal exists.

`GET /accounts/{id}/balance` returns both, plus `openingBalancePosted: false`, so nothing has to be inferred.

---

## Integration check coverage — 30 assertions

```
1  Groups            nested 3 deep, levels computed, normalBalance defaulted
                     duplicate code · type must match parent · CYCLE REJECTED
                     tree nests correctly
2  Accounts          type/normalBalance INHERITED, client values ignored
                     duplicate code · unknown group
3  Delete guard      unused account deletes cleanly
4  P2.1 VERIFICATION post ₹5,000 → DELETE blocked on both sides, 409
                     account survives the blocked delete
5  Deactivate        works · posting to inactive rejected · history survives
6  Immutability      code/group/openingBalance frozen · name still editable
                     LEDGER SNAPSHOT KEEPS THE ORIGINAL NAME
7  Non-postable      posting to a grouping head rejected
8  Group guards      with accounts · with child groups · empty deletes
9  Balance           totals correct · drift 0 · opening excluded
10 Audit             changes audited with before/after
```

Section 6's snapshot assertion is the one I would point at: rename the account, and the existing ledger entry still reads `Tuition Fee Income`. That is what makes historical reports stay truthful.

---

## Next

**P2.2** — General Ledger view. Not blocked; reads `fms_ledgerentries`, which exists.

**Migration 005** is still blocked on O3, but P2.1 changes the options. Rather than us guessing codes and the accountant correcting a migration file, they can now enter the chart directly through the API — which is probably the better path anyway, since they will get the codes right first time and own the result.