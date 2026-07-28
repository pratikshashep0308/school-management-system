# P3.1 — Income Management · Deploy & Verify

**Delivers:** record money received · printable receipt · immediate GL posting · cancel-reverses · migration 009 · 4 OpenAPI paths · 60 integration checks
**SRS:** M3 / FR-M3 · SCR-11/12/13
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/models/income/index.js` | new — `fms_incomevouchers` |
| `backend/fms/services/income/incomeService.js` | new |
| `backend/fms/services/income/income.check.js` | new — 60 checks |
| `backend/fms/routes/income.js` | new — 4 endpoints |
| `backend/fms/migrations/scripts/009_income_vouchers.js` | new |
| `backend/fms/docs/openapi.js` | **REPLACES** — 31 paths, 16 schemas |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/income` |

No new dependencies.

---

## Three decisions worth knowing

### One number, not two

The brief implies a receipt number and a GL voucher number. I used **one**: the voucher number *is* the receipt number.

Two sequences means a receipt book and a ledger that can disagree — a gap in one, a duplicate in the other, and a reconciliation problem nobody notices for months. One number is allocated inside the posting transaction, so it is gapless by construction and traces straight to the ledger. The check asserts gaplessness explicitly.

### No draft state

A journal voucher is a *proposal*: draft, approve, post. An income voucher is a *record of a fact* — the money is already in the drawer. Holding it in draft while a parent waits for a receipt would be absurd, and would leave cash on hand the books do not know about.

So creation posts immediately. The only later transition is cancellation, which reverses.

### Online and UPI must name their account

For cash, cheque, bank and DD the debit account is inferred when exactly one such account exists. For **online and UPI it must be supplied**, and the check asserts the request fails without it.

That is not fussiness. Money paid online has not reached the bank yet. Posting it to the main bank head would overstate the balance until settlement, and nobody would notice because the trial balance would still be perfectly balanced. Discovery §2.5 routes these through a clearing head; this makes that a requirement rather than a convention.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\models\income,backend\fms\services\income | Out-Null
# save the 7 files
cd backend
node --check fms/models/income/index.js
node --check fms/services/income/incomeService.js
node --check fms/routes/income.js
node --check fms/migrations/scripts/009_income_vouchers.js
node --test fms/docs/contract.test.js
node -e "const s=require('./fms/docs/openapi'); console.log(Object.keys(s.paths).length+' paths, '+Object.keys(s.components.schemas).length+' schemas')"
cd ..
git add -A
git commit -m "P3.1: Income Management (M3)"
git push
```

Expect `# pass 28` and `31 paths, 16 schemas`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node fms/migrations/_runner.js up
node fms/services/income/income.check.js
pm2 restart staging-backend --update-env
```

Migration 009 applies; 005 stays blocked. Expect **60 passed, 0 failed**.

### Production

```bash
cd ~/school-management-system && git pull
```

Nothing to run.

---

## The P3.1 verification

The brief asks: *record an income voucher; confirm receipt output, GL posting balances, and that cancelling posts a reversal.*

Section 1 records ₹12,500 of tuition fees from a named student, then asserts:

- receipt number `INC-2026-27-00001`, and it **is** the voucher number
- Dr cash ₹12,500 / Cr tuition income ₹12,500, **balanced**
- the payer's name appears on both ledger lines
- the receipt renders with the number, the amount, **the amount in words**, and print CSS
- cancelling **posts a reversal**, trial balance still balances, cash returns to zero
- **the original ledger entries are untouched**
- the cancelled receipt renders with a CANCELLED watermark and the reason

That last point is deliberate: a cancelled receipt still renders rather than 404-ing. The payer may still be holding the paper copy, and it must be possible to show them why it is void.

---

## Check coverage — 60 assertions

```
1  P3.1 VERIFICATION  one number · balanced GL · receipt renders with words
                      cancel posts a reversal · original entries untouched
                      cancelled receipt shows CANCELLED and the reason
2  Immutability       cancel twice · deleteOne · deleteMany · bulk amount edit
                      all blocked; the record survives
3  Accounts           crediting an expense or asset head rejected
                      non-postable head · unknown account
4  Payment mode       cash→cash, cheque→bank inferred
                      cheque needs an instrument number
                      ONLINE and UPI must name the account explicitly
5  Amount and date    float rupees · zero · negative · future date
                      date outside any FY · unknown category
6  Categories         donation from an organisation; numbers sequential
7  Totals             cancelled receipts kept in the record set
                      but EXCLUDED from the collections total
8  Cash book          CASH BOOK = TRIAL BALANCE FOR CASH; continuous
9  FY lock            cannot record or cancel into a locked year
10 Integrity          audited with before/after · debits = credits
                      RECEIPT NUMBERS ARE GAPLESS
```

Section 7 is worth noting: cancelled receipts stay in the record set — they were issued and must remain visible — but are excluded from the collections total. Including them would overstate collections, which is the number people actually read.

---

## Amount in words

Every receipt shows the amount written out, Indian numbering (lakh/crore), with correct singulars:

```
₹1        → One Rupee Only
₹1.01     → One Rupee and One Paisa Only
₹1,234.56 → One Thousand Two Hundred Thirty Four Rupees and Fifty Six Paise Only
₹1,50,000 → One Lakh Fifty Thousand Rupees Only
```

Small, but it is printed on a document a parent keeps.

---

## Running totals

| | Checks |
|---|---|
| Phase 1 | 35 |
| P2.1–P2.4 | 200 |
| P3.1 | 60 |

**77 unit/contract tests · 295 integration checks · zero failures.**

---

## Next

**P3.2 — Expense Management**, then P3.3 the approval workflow, which the playbook calls the most business-critical piece in the project.

Still gated by **O3**: income posts to income heads that do not exist yet.