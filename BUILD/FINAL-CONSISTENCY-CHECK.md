# FP Phase 4 — Final Consistency Check

Every invariant below was checked against the actual source at release commit.

| # | Invariant | Result |
|---|-----------|--------|
| 1 | Exactly one promotion implementation (no duplicate engine) | PASS — single promotionService; no second PromotionRecord.create path |
| 2 | `Student.grade` never written (field does not exist) | PASS — no `student.grade =` anywhere; the `.grade =` hits are ExamMark/Result letter grades and a curriculum query filter, unrelated to Student |
| 3 | Controllers never import PromotionRecord directly | PASS — no controller requires PromotionRecord |
| 4 | `Class.students[]` not mutated outside promotion | PASS — no `.students.push/.pull/=` on Class documents in controllers/services outside the promotion transaction |
| 5 | Exam/notification/AI/translation all behind adapter boundaries | PASS — notification and insight registries start EMPTY at load; providers are registered, never hardcoded |
| 6 | Secrets never persisted | PASS — OTP stores only a salted hash with `select:false`; notification credentials resolved transiently, never stored |
| 7 | Offline promotion prohibited | PASS — SUPPORTED_OPS = lessonPlan.create/update, formativeObservation.create, readingLog.create; promotion.* absent |
| 8 | Audit append-only | PASS — no update/delete path to audit records |
| 9 | Authorization fails closed | PASS — checkPermission.js denies (403, opaque ref, server-side audit) on infrastructure failure (ADR-13) |
| 10 | FP-series is authoritative; no unapproved business rule | PASS — no business rule introduced beyond the Decision Register; ADR-14 matrix gap left open by waiver, not closed by invented policy |

**Conclusion:** the build is internally consistent with the approved design and
decision register. No contradiction, no duplicate authority, no scope creep.
