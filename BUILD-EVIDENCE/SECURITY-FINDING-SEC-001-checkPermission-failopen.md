# SECURITY RISK / DESIGN FINDING — `checkPermission` fails open

> **UPDATE 15 Aug 2026 — ADR-13 APPROVED.** The owner has resolved path 5
> (infrastructure error → allow): it now **fails closed** with a safe 403 and a
> server-side audit. Paths 1 (no role) and 2 (superAdmin) are ratified as
> **APPROVED FAIL-OPEN**. Paths 3 (no matrix) and 4 (unknown key) are escalated
> to **ADR-14** (they need a complete verified permission matrix, blocked by the
> U-01 waiver). This finding is therefore PARTIALLY MITIGATED, not closed.
> See `LLD-AMENDMENT-A-02-ADR-13.md`.


**Finding ID:** SEC-001 · **Raised:** 14 August 2026 · **Status:** PARTIALLY MITIGATED (ADR-13, 15 Aug 2026)
**Component:** `backend/middleware/checkPermission.js`
**Severity:** Medium (mitigated at startup; residual runtime exposure)

> This finding must not disappear into the build log. It is recorded here as a
> standing item and referenced from the final release report. It is **not** marked
> PASS, and it is **not** marked FAIL — see §5 and §7.

---

## 1. Current behavior

`checkPermission(moduleKey)` is the matrix gate mounted in front of most route
groups. It calls `next()` — allowing the request through to the route's own
`authorize()` — in **five** distinct situations rather than the four originally
noted. Each is a fail-*open* decision: when the gate cannot make a confident
*deny*, it permits.

| # | Path | Line | Condition |
|---|---|---|---|
| 1 | No role | `checkPermission.js:60` | `req.user.role` is absent |
| 2 | superAdmin | `:63` | role is `superAdmin` — bypasses the matrix entirely |
| 3 | No permission matrix | `:69` | no `RolePermission` row exists for the role |
| 4 | Unknown module key | `:74` | the `moduleKey` is absent from the stored permission map |
| 5 | **Lookup error** | **`:120`** | **any exception during permission resolution** |

Path 5 was not in the original count of four. The `catch` block comments *"Never
take the API down because of a permission-lookup failure"* and calls `next()`.
It is the most consequential of the five, because a transient database error
during permission lookup results in the request being **allowed**, not rejected.

## 2. Where it occurs

Solely in `backend/middleware/checkPermission.js`, within the middleware factory
returned by `checkPermission(moduleKey)`. Every route mounted with the
three-element `[path, file, moduleKey]` tuple in `config/routeTable.js` passes
through it. Routes mounted with the two-element tuple bypass it deliberately
(the FMS plugin does this and supplies its own deny-by-default wrapper).

## 3. Existing mitigation

Three layers already reduce the exposure, and this build strengthened the first:

1. **Startup module-key assertion (FP-003, strengthened FP-040).**
   `assertModuleKeys()` runs before `app.listen()` and fails the boot if any
   mounted `moduleKey` is absent from the `MODULES` registry. This closes path 4
   *for keys that are simply unregistered* — an unregistered key can never reach
   production silently, because the server will not start. It does **not** close
   path 4 for a key that is registered but missing from a particular role's
   stored map.

2. **Route-level `authorize()`.** Every new TFS-EOS route additionally carries an
   explicit `authorize(...roles)` inside the router. `checkPermission` failing
   open still leaves `authorize()` in force, so a request that slips the matrix
   gate is not thereby unauthenticated or unrestricted — it still meets the
   route's own role check.

3. **`protect`.** Authentication runs ahead of `checkPermission`, so path 1 (no
   role) implies an unauthenticated request, which `protect` already rejects on
   protected routes.

The residual exposure is therefore narrower than "the matrix does nothing": it is
that a **role/key combination the administrator intended to deny via the matrix
alone**, with no backing `authorize()`, would be permitted under paths 3, 4 or 5.
New TFS-EOS routes are not in that category because they carry `authorize()`. Some
pre-existing routes may be.

## 4. Why it was not changed

- **No approved requirement or LLD section directs a change.** FINAL LLD 1.1 §31
  documents the behaviour as pre-existing and states explicitly that altering it
  "is a separate change needing its own risk assessment." The delta build's remit
  is the 114 in-scope requirements; silently flipping a platform-wide middleware
  to fail-closed is outside it and would change the behaviour of every gated
  legacy route at once.

- **The blast radius is large and untested for legacy routes.** Flipping to
  fail-closed could deny access on pre-existing routes whose access currently
  depends on the fail-open path — for example a role whose stored matrix predates
  a module and lacks its key. Without the original Level 1 requirements (U-01,
  waived) there is no authoritative statement of intended access for those
  routes, so the correct fail-closed matrix cannot be derived with confidence.

- **The instruction for this tier is explicit:** do not silently change fail-open
  behaviour unless an approved requirement requires it; if the LLD does not settle
  the question, flag it rather than invent a policy. That is what this document does.

## 5. Which approved LLD/decision permits the current behavior

FINAL LLD 1.1 **§31** documents the fail-open behaviour and the constraint it
imposes (every new route carries `authorize()`), and records that changing it is
out of scope for this build. **§6** (existing-system architecture) states the same
under "`checkPermission` fails open."

This is **documentation of an inherited behaviour, not an approval of it as
correct.** The LLD permits the build to proceed *around* it; it does not assert
that fail-open is the desired end state. No decision record (D-, E-, R-, U-series)
ratifies fail-open as intended security policy.

## 6. Whether it requires a future security decision

**Yes.** This is the gap. The LLD says "not in this build" but no decision record
says "fail-open is acceptable in production" or "fail-closed is required by date
X." The question is genuinely unsettled, so per the instruction it is raised
rather than resolved by invention.

**Proposed decision for the owner (ADR-13, new):**

> Should `checkPermission` remain fail-open, or move to fail-closed?
>
> A fail-closed move requires, as a precondition, a complete and verified
> permission matrix for **every** role/route combination — including pre-existing
> routes — because fail-closed turns every gap into a denial. That matrix cannot
> be derived with confidence while the original Level 1 requirements remain
> unavailable (U-01). So the realistic sequence is: (a) resolve U-01 or accept
> Specification v1.2 as authoritative for access intent, (b) generate and verify
> the full matrix, (c) flip path 5 (error → deny) first as the highest-value,
> lowest-ambiguity change, (d) flip paths 3 and 4 once the matrix is complete.

Path 5 (lookup error → deny) is separable and could be decided independently of
the matrix-completeness problem, because it does not depend on knowing intended
access — an error is never a good reason to *grant*.

## 7. Whether it affects release acceptance

**It is a documented RELEASE RISK, not a release blocker under the current
baseline.**

- It does **not** fail any approved acceptance criterion. No criterion in FINAL
  LLD 1.1 §49 requires fail-closed behaviour.
- It is **not** PASS: the presence of the startup assertion does not make the
  runtime behaviour safe, and this document does not claim it does.
- It is **not** FAIL: the approved baseline does not require fail-closed, so
  measuring the code against a fail-closed standard it was never given would be
  inventing the standard.

**Recommended disposition:** the release may proceed with SEC-001 listed as a
known risk in the release notes, provided the owner acknowledges it and schedules
ADR-13. If the owner considers fail-open unacceptable for their deployment, that
is a decision to make **before** release, and it would reclassify SEC-001 as a
blocker — but that reclassification is the owner's to make, not the build's to
assume.

---

## Verification of the mitigation claim

The startup assertion is real and tested. This finding does not rest on it being
sufficient — only on it being present.

```
tests/unit/authorization.test.js
  ✓ every mounted moduleKey is registered — startup assertion passes
  ✓ the advanced exam module has its OWN key, split from legacy
```

The `authorize()` layer is verified per-route in FP-091 (security tier, pending).

---

**This finding is referenced from `FINAL-RELEASE-REPORT.md` and must appear in the
release notes as SEC-001 until ADR-13 is decided.**
