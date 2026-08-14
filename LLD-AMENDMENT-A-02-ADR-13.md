# ADR-13 — Authorization failure behaviour: infrastructure errors fail closed

**Status:** APPROVED · **Date:** 15 August 2026 · **Supersedes:** the fail-open catch-block path documented in SEC-001
**Decision owner:** Product/Security owner (instruction of 15 Aug 2026)
**Affected components:** `backend/middleware/checkPermission.js`
**Related:** SEC-001, FINAL LLD 1.1 §6, §31, §44 · Decision Register Rev 2

---

## Context

SEC-001 recorded that `checkPermission` fails open at **five** paths. The owner has
resolved the most consequential of them — the `catch` block — and directed a
path-by-path classification of the remaining four, reconciled against the approved
baseline rather than against conventional security practice.

---

## Decision

### Primary: authorization-infrastructure failure FAILS CLOSED

When permission lookup, permission-matrix retrieval, role resolution or another
authorization dependency throws an unexpected runtime error, the request is
**denied** with HTTP 403. It is no longer allowed through via `next()`.

- The client receives a generic authorization error carrying a short opaque
  reference (`authz-<base36>`), and **no internal error detail**.
- The full error is logged and audited **server-side** under
  `action: 'authorization.failure'`, with **no credentials, tokens or secrets** in
  the payload.
- The audit is best-effort and independently wrapped, so a failure to audit can
  never turn the denial back into an allow.

### Classification of the remaining four paths

Each is reconciled against FINAL LLD 1.1 and Decision Register Rev 2. Policy is
**not** inferred from general security convention.

| # | Path | Classification | Basis |
|---|---|---|---|
| 1 | **No role** | **APPROVED FAIL-OPEN** | An unauthenticated request has no role. FINAL LLD 1.1 §31 places `protect` ahead of `checkPermission`; `protect` already rejects unauthenticated access on protected routes. Reaching `checkPermission` with no role means the route is public by design. Denying here would not add security and would break intentionally public routes. **No change.** |
| 2 | **superAdmin** | **APPROVED FAIL-OPEN** | `superAdmin` bypassing the matrix is the intended platform-admin model. §44 and `DEFAULT_GRANTS` treat `superAdmin` as unconditionally authorised; the role is assigned only to platform operators. This is a design grant, not a gap. **No change.** |
| 3 | **No permission matrix** | **REQUIRES ADDITIONAL DECISION** | §31 documents this as fail-open and §44 notes "a missing key causes fail-open," but **no decision record ratifies it as intended**. Flipping it to fail-closed requires a complete verified matrix for every role/route — unavailable while U-01 (original Level 1 requirements) is waived. Mitigated today by per-route `authorize()`. **Deferred to ADR-14** (matrix-completeness precondition), not changed blind. |
| 4 | **Unknown module key** | **REQUIRES ADDITIONAL DECISION** | Same reasoning as #3. The **startup assertion** already prevents an *unregistered* key from shipping (boot failure), so the residual case is a key registered globally but absent from a given role's stored map. Closing that safely needs the same complete matrix as #3. **Deferred to ADR-14.** Mitigated by per-route `authorize()`. |

Only path 5 (infrastructure error) is changed by this ADR. Paths 1 and 2 are
ratified as correct. Paths 3 and 4 are explicitly escalated to **ADR-14** rather
than resolved by assumption, because the correct fail-closed matrix cannot be
derived while U-01 is waived.

---

## Consequences

- The catch block denies. A transient DB error during permission lookup now
  produces a 403, not an allow. This is a behaviour change on **every** gated
  route, but only in the error path, which should be rare and was previously
  unsafe.
- Because the change is confined to the error path, no route that currently
  authorises correctly is affected in its normal flow.
- Paths 3 and 4 remain fail-open pending ADR-14; SEC-001 stays on the risk
  register as PARTIALLY MITIGATED rather than closed.
- The FMS plugin is unaffected — it already bypasses `checkPermission` with its
  own deny-by-default wrapper.

---

## Compliance evidence

Behavioural tests in `backend/tests/unit/authorizationFailClosed.test.js`:

1. lookup succeeds + authorized → allowed
2. lookup succeeds + unauthorized → denied
3. lookup throws → denied (403)
4. client receives a safe error response (no internal detail)
5. the internal failure is auditable (`authorization.failure` recorded)
6. no credentials/tokens/secrets appear in the audit payload

Live behaviour against a real deployment is covered by the unit tests with a
mocked request/response; no database is required for this decision.

---

## Change-control record

This ADR is a controlled amendment. FINAL LLD 1.1 is **not** silently edited; the
change is captured here and cross-referenced. Updated artifacts:

- Decision Register Rev 2 → append ADR-13 (this decision) and ADR-14 (deferred)
- Security risk register → SEC-001 reclassified PARTIALLY MITIGATED
- Requirement traceability → new row GAP-IAM-006 (authorization failure handling)
- Build-prompt traceability → FP-043 extended scope note
- Acceptance criteria → AC-SEC-01 (infrastructure failure denies) added
