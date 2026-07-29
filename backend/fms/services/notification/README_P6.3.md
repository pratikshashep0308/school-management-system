# P6.3 — Notifications · Deploy & Verify

**Delivers:** 11 events · email + in-app dispatch · preferences · delivery log · migration 022 · **32 unit tests**
**SRS:** M19 / FR-M19 · SCR-64
**Deploy to:** staging only

---

## Files

| File | |
|---|---|
| `backend/fms/services/notification/events.js` | new — pure event definitions |
| `backend/fms/services/notification/events.test.js` | new — 32 unit tests |
| `backend/fms/services/notification/notificationService.js` | new — dispatch |
| `backend/fms/services/notification/notification.check.js` | new |
| `backend/fms/models/notification/index.js` | new — log + preferences |
| `backend/fms/routes/notifications.js` | new |
| `backend/fms/migrations/scripts/022_notifications.js` | new |
| `backend/fms/routes/index.js` | **REPLACES** — mounts `/notifications` |

**No new dependencies** — `nodemailer` and `socket.io` are already SMS dependencies and already configured (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`).

---

## The rule that shaped this module

**A notification must never be able to disrupt the operation that raised it.**

If the mail server is down, the expense is still approved. If a recipient lookup fails, the payment still posts.

`notify()` therefore catches everything, always resolves, and **never rejects** — so a caller cannot accidentally couple a financial transaction to an SMTP timeout by forgetting a `.catch()`. Section 1 of the check tests an *unawaited* call specifically, because that is the shape the mistake actually takes.

The cost of that choice is that failures become invisible unless written down. So **every outcome lands in `fms_notifications` with a reason** — including "nobody was told".

---

## Channel reality

FR-M19 asks for EMAIL, SMS, WHATSAPP and IN_APP. The deployment has two:

| | |
|---|---|
| `email` | ✅ nodemailer, already configured |
| `inApp` | ✅ socket.io already running in `server.js` |
| `sms` | ❌ no gateway, no credentials |
| `whatsapp` | ❌ no Business API, no credentials |

The unavailable two are **not silently dropped**. High-urgency events (`budgetExceeded`, `closingVariance`) declare `sms` because a breach genuinely warrants one — and dispatch records `notConfigured` with the reason.

The log then shows a message was **meant** to go and did not, rather than showing nothing and letting somebody assume it did.

> This came from a test failure worth recording: the first version had the "unavailable" reporting as **dead code** — no event declared an unconfigured channel, so it could never fire. There is now an assertion that at least one event exercises that path.

---

## Preferences narrow, never widen

A preference can drop a channel an event uses. It **cannot add one**.

Asking for a channel the event does not use is **rejected with an explanation**, not silently ignored — otherwise a preference becomes a way to route financial detail to a mailbox the event was never meant to reach. That is a permissions decision wearing a preference's clothes.

Muting is separate and explicit, and a muted recipient is logged as `suppressed` rather than skipped — so "why did nobody act on this?" has an answer.

---

## The eleven events

```
expenseSubmitted   expenseApproved   expenseRejected
budgetExceeded     budgetThreshold   vendorPaymentDue
cashClosingPending closingVariance   settlementOverdue
ingestFailed       monthlySummary
```

Recipients come from **`fms_roleassignments`**, not SMS user roles — a person's SMS role does not imply they should receive financial notifications. Inactive assignments are excluded, and the check asserts it.

Bodies are deliberately short and do not reproduce the record. A notification exists to make somebody open the system; an email containing the full figures is one that leaks them to whatever mailbox it reaches. Tested: no body over 260 characters.

---

## Deploy

```powershell
cd C:\Users\Admin\Desktop\school-management-systems
New-Item -ItemType Directory -Force -Path backend\fms\models\notification,backend\fms\services\notification | Out-Null
# save the 8 files
cd backend
node --check fms/services/notification/events.js
node --check fms/services/notification/notificationService.js
node --check fms/services/notification/notification.check.js
node --check fms/models/notification/index.js
node --check fms/routes/notifications.js
node --check fms/migrations/scripts/022_notifications.js
node --test fms/services/notification/events.test.js
node --test fms/docs/contract.test.js
cd ..
git add -A
git status --short
git commit -m "P6.3: Notifications (M19)"
git push
```

Expect `# pass 32` and `# pass 28`.

### Staging

```bash
cd /root/school-management-system && git pull && cd backend
node --test fms/services/notification/events.test.js
node fms/migrations/_runner.js up
node fms/services/notification/notification.check.js 2>&1 | tail -40
pm2 restart staging-backend --update-env
curl -s http://localhost:5000/api/fms/status; echo
```

The check **deliberately unsets the mail config** before running — proving dispatch survives a missing mail server is the point of section 1.

### Production

```bash
cd ~/school-management-system && git pull
```

---

## The P6.3 verification

The brief asks: *trigger an expense approval and confirm the configured notifications are sent and logged.*

Section 2 does exactly that, and asserts:

- the accountant and the manager are notified
- **the requester is told about their own expense**
- an **inactive** role holder is not
- the in-app copy is delivered, names the amount, and links back to the document
- the email attempt is recorded as `notConfigured` **with a reason**, so nobody assumes it was sent

---

## Nothing is wired to fire yet

The events exist and dispatch works, but **no service calls `notify()` yet**. Wiring them into the approval, budget and closing flows is deliberate follow-on work: each call site needs a decision about what payload it passes, and doing that blind across 31 services would be guesswork.

`notify()` is safe to call from anywhere — it cannot throw — so wiring is additive and low-risk whenever you want it.

---

## Running totals

**402 unit/contract tests · ~976 integration checks.**

---

## Next

**P6.4 Multi-Branch**, **P6.5 Dashboard**. Then Phase 7 (security), 8 (testing), 9 (handover).