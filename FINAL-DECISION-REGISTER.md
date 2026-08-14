# FINAL DECISION REGISTER — TFS-EOS Delta Build

**Status: FROZEN (rev 2)** · **Date:** 14 August 2026 · **Authority:** Final Re-Baseline ratification

**Revision 2** adds R-1, R-2, R-3 and M-01, closing the three items the LLD reconciliation
raised plus the Meeting schema gap. Recorded in LLD Amendment **A-01**; the frozen LLD
itself is not retroactively edited.

---

## Summary

| Status | Count | Meaning |
|---|---|---|
| **APPROVED** | 22 | Binding. Governs the final LLD and implementation. |
| **WAIVED** | 1 | Source artifact unavailable; limitation declared, not worked around. |
| **ENVIRONMENT VALIDATION PENDING** | 1 | Code proceeds; verification happens in MODE B. |
| **OPEN** | 6 | Provider or policy choice. Adapter boundary defined; no vendor invented. |
| **Total** | **30** | |

**No entry carries an unexplained 'Unresolved' status.** The six former ADR unknowns are
reclassified as OPEN DECISION / ADAPTER BOUNDARY, each with its implementation boundary
and whether work can proceed stated explicitly.

---

## Approved decisions (22)

### D-001 — Architecture — assessment authority

| Field | Value |
|---|---|
| **ID** | D-001 |
| **Category** | Architecture — assessment authority |
| **Description** | Two exam systems run simultaneously: legacy Exam/Result at /api/exams and the advanced ExamGroup/ExamSubject/ExamMark stack at /api/exams-adv. Neither the Specification nor LLD v1.0_2 acknowledged the second. |
| **Decision** | The Advanced Exam module is authoritative for examination, marks, results, final results, pass/fail, promotion eligibility, promotion, retention and result override. Legacy Exam/Result is preserved but not authoritative; no TFS-EOS module writes examination data to it. |
| **Rationale** | The advanced system natively supplies every input promotion requires — isPass already computed, publication state, grace marks, retest policy. Building against legacy would reimplement a computation that exists and would be wrong for any school using the advanced module. |
| **Source** | decision.md, uploaded 14 Aug 2026 |
| **Status** | **APPROVED** |
| **Affected LLD section** | §2.2, §5.5, §11, §17.4, §17.5, §18.3, §29, ADR-18 |
| **Affected modules** | 5.5 Assessment Engine, 5.4 SIS |
| **Affected tests** | Pass/fail from ExamMark.isPass; grace marks applied; three retest policies; isAbsent handling; assertion that legacy Result is not consulted |

### D-002 — Data model — entity identity

| Field | Value |
|---|---|
| **ID** | D-002 |
| **Category** | Data model — entity identity |
| **Description** | Class has no academicYear field and carries a unique index on {name, section, school}. 'Rollover carries forward class structure' was undefined against that schema. |
| **Decision** | Class remains GLOBAL. Not cloned per academic year. The unique index is unchanged — not removed, weakened, or replaced with an academicYearId-based uniqueness model. |
| **Rationale** | Year-scoping would require altering a unique index on a collection eight other modules reference — a rewrite move, not a delta move. History is preserved by immutable year-stamped records instead. |
| **Source** | decision.md |
| **Status** | **APPROVED** |
| **Affected LLD section** | §10.1, §10.2, §17.2, ADR-17 |
| **Affected modules** | 5.2 Calendar, 5.4 SIS |
| **Affected tests** | TEST 3 asserts no Class record and no Class.students[] array is cloned; validate-db asserts the unique index is intact |

### D-003 — Workflow — academic year lifecycle

| Field | Value |
|---|---|
| **ID** | D-003 |
| **Category** | Workflow — academic year lifecycle |
| **Description** | Rollover behaviour was described as 'carries forward class/section structure' without defining the operation. |
| **Decision** | Rollover carries forward exactly two things: the AcademicYear document, and holidays where recurringAnnually is true. It does not carry forward Class records, Class.students[], enrolments or historical Class copies. Non-recurring holidays are explicitly NOT copied. |
| **Rationale** | Follows from D-002. A rollover that writes to Class, Class.students[], Student.class or any enrolment record is a defect. |
| **Source** | decision.md |
| **Status** | **APPROVED** |
| **Affected LLD section** | §17.2.8, §17.2.10, BR-CAL-06, §18.1 |
| **Affected modules** | 5.2 Calendar |
| **Affected tests** | TEST 3 — new year exists, recurring holidays copied, non-recurring NOT copied, nothing cloned |

### D-004 — Data integrity — transaction boundary

| Field | Value |
|---|---|
| **ID** | D-004 |
| **Category** | Data integrity — transaction boundary |
| **Description** | LLD v1.0_2 instructed updating Student.grade, a field that does not exist. Class.students[] maintenance during promotion was unspecified. |
| **Decision** | Promotion re-points Student.class to the EXISTING target Class and updates both source and target Class.students[] arrays, all inside ONE database transaction. Student.grade is never written. Batch-level transaction with one $pull and one $addToSet per class pair; cap 200 students. |
| **Rationale** | Student.class and the two Class.students[] arrays are three representations of one fact. A partial write leaves a state no read path can interpret, and the divergence would be silent. |
| **Source** | decision.md; batch structure from LLD §S.11.5 |
| **Status** | **APPROVED** |
| **Affected LLD section** | §10.4, §17.4.9–.11, §18.3, §26, ADR-19 |
| **Affected modules** | 5.4 SIS |
| **Affected tests** | TEST 1 post-conditions committed atomically; TEST 2 forced failure leaves everything unchanged; membership pre-condition; batch write-count assertion |

### D-005 — Data model — semantics

| Field | Value |
|---|---|
| **ID** | D-005 |
| **Category** | Data model — semantics |
| **Description** | Class.students[] could be mistaken for a historical enrolment record. |
| **Decision** | Class.students[] is a CURRENT-COHORT CACHE. It answers 'which students are currently associated with this Class?' It never answers a question about a previous academic year. Historical enrolment must never be reconstructed from it. |
| **Rationale** | Because Class is global (D-002), the array holds only the present cohort. Any historical query against it returns today's members labelled as last year's. |
| **Source** | decision.md |
| **Status** | **APPROVED** |
| **Affected LLD section** | §10.1, §10.9, §17.4, §29 |
| **Affected modules** | 5.4 SIS |
| **Affected tests** | TEST 4 asserts reconstruction without reading Class.students[] |

### D-006 — Data integrity — historical preservation

| Field | Value |
|---|---|
| **ID** | D-006 |
| **Category** | Data integrity — historical preservation |
| **Description** | BR-SIS-04 requires promotion to preserve all history. With Class global and students[] a cache, the mechanism was undefined. |
| **Decision** | Historical enrolment is reconstructed from PromotionRecord (fromClass/toClass) correlated with academicYearId-stamped Attendance, Result and Timetable records. NOTE: academicYearId did not exist on any of those collections and is created by migration 002. |
| **Rationale** | Immutable records that reference the Class and the year carry the evidence. Class cloning must not be introduced merely to preserve history. |
| **Source** | decision.md; missing-field discrepancy verified by code inspection 14 Aug 2026 |
| **Status** | **APPROVED** |
| **Affected LLD section** | §10.1, §10.4, §17.4.11 BR-SIS-04, §18.3, §21 |
| **Affected modules** | 5.4 SIS, 5.2 Calendar |
| **Affected tests** | TEST 4; migration 002 idempotency and pre-flight tests |

### D-007 — Architecture — notification providers

| Field | Value |
|---|---|
| **ID** | D-007 |
| **Category** | Architecture — notification providers |
| **Description** | No SMS dispatcher exists; Notification.isSMSSent is a flag with no implementation. TFS-EOS additionally requires a WhatsApp channel with no Specification antecedent. |
| **Decision** | Providers are configurable through an administrator screen, never hardcoded. Architecture: Notification Service → Channel → Provider Adapter → Configured Provider. Separate SMS and WhatsApp configuration. |
| **Rationale** | Changing provider must not require a code change. Business logic must not couple to a vendor SDK. |
| **Source** | decision.md |
| **Status** | **APPROVED** |
| **Affected LLD section** | §10.1, §11, §13, §17.3.8, §17.9, ADR-05 |
| **Affected modules** | 5.9 Notification Center, 5.1 IAM (OTP) |
| **Affected tests** | TEST 5 configuration persisted and used; provider swap with no business-logic change; no provider literal in dispatch |

### D-008 — Business rule — sender resolution

| Field | Value |
|---|---|
| **ID** | D-008 |
| **Category** | Business rule — sender resolution |
| **Description** | Behaviour when no provider/sender configuration exists was undefined. |
| **Decision** | Where a provider/sender configuration exists, the configured sender is used. Where none exists, the phone number currently sending the SMS/WhatsApp message is used as the active sender identity. |
| **Rationale** | Degrades gracefully rather than failing dispatch outright. |
| **Source** | decision.md |
| **Status** | **APPROVED** |
| **Affected LLD section** | §13, §17.9, ADR-05 |
| **Affected modules** | 5.9 Notification Center |
| **Affected tests** | TEST 6 — no provider configured, current sending number used |

### D-009 — Data model — entity placement

| Field | Value |
|---|---|
| **ID** | D-009 |
| **Category** | Data model — entity placement |
| **Description** | GAP-PLC-004 offered two options: a new collection, or extending ContentItem. |
| **Decision** | BestPracticeResource is a NEW DEDICATED COLLECTION. It does not extend ContentItem, is not embedded within it, and does not reuse it as a persistence model. |
| **Rationale** | Approved as a business decision. It is its own entity with its own lifecycle, ownership and publication semantics. This REVERSES the reconciliation's own recommendation to fold it into ContentItem. |
| **Source** | decision.md |
| **Status** | **APPROVED** |
| **Affected LLD section** | §10.5, §11, §17.8, ADR-09 |
| **Affected modules** | 5.8 PLC Hub |
| **Affected tests** | TEST 7 — collection exists, ContentItem provably unmodified, permissions and audit enforced |

### D-010 — Business rule — result publication

| Field | Value |
|---|---|
| **ID** | D-010 |
| **Category** | Business rule — result publication |
| **Description** | ExamGroup.classes[] is an array with a single group-level status. Announcing for one class publishes for every class in the group. |
| **Decision** | Announcement is GROUP-LEVEL and explicit. The confirmation screen and API response name EVERY class in ExamGroup.classes[]. Per-class announcement is achieved by creating one ExamGroup per class — an operational convention requiring no code change. |
| **Rationale** | Maharashtra State Board schools announce on 1 May, grade-wide, for all students at once. A multi-class group is the NORMAL case, so this describes existing practice. Per-class publication state was rejected: it would add a sub-document to a live collection, contradict the single-status model, and force every status read path to be rewritten. |
| **Source** | User approval and business context, 14 Aug 2026 |
| **Status** | **APPROVED** |
| **Affected LLD section** | §17.4.10, §17.5, Appendix S §S.11.2 |
| **Affected modules** | 5.5 Assessment Engine |
| **Affected tests** | Announce response names every class in classes[]; re-announcement idempotent |

### D-011 — Business rule — promotion eligibility

| Field | Value |
|---|---|
| **ID** | D-011 |
| **Category** | Business rule — promotion eligibility |
| **Description** | ExamGroup.status and ExamMark.status are independent; a published group can contain draft marks. |
| **Decision** | Eligibility requires ExamGroup.status === 'published' AND a published ExamMark for every student/subject pair. A missing ExamMark BLOCKS with PROMOTION_BLOCKED_MARKS_INCOMPLETE naming the gaps. Only an explicit isAbsent = true counts as absence. |
| **Rationale** | Conflating 'no data' with 'the student failed' retains a student because a teacher had not finished data entry, and the record looks legitimate afterwards. Six months on there is no way to tell which occurred. |
| **Source** | User approval, 14 Aug 2026 |
| **Status** | **APPROVED** |
| **Affected LLD section** | §17.4.11, Appendix S §S.11.3 |
| **Affected modules** | 5.5 Assessment Engine, 5.4 SIS |
| **Affected tests** | Missing mark blocks and names the gap; isAbsent handled per rule; group unpublished blocks |

### DEP-01 — Deployment context

| Field | Value |
|---|---|
| **ID** | DEP-01 |
| **Category** | Deployment context |
| **Description** | Whether prior-year historical records exist determined whether academicYearId required derivation or could be populated at creation. |
| **Decision** | TFS-EOS is implemented from academic year 2026-27. No prior-year historical records exist. academicYearId is populated at creation, required on write from the outset, with existing rows stamped in one update per collection. |
| **Rationale** | Removes the date-range derivation, per-collection confidence grading, and the exceptions-resolution workflow from scope. |
| **Source** | User statement, 14 Aug 2026 |
| **Status** | **APPROVED** |
| **Affected LLD section** | §10.1, §21, Appendix S §S.6.1 |
| **Affected modules** | 5.2 Calendar, 5.4 SIS |
| **Affected tests** | IR-H-06 mandatory pre-flight; migration 002 idempotency; refusal path when records predate the year |

### DEP-02 — Deployment context — academic calendar

| Field | Value |
|---|---|
| **ID** | DEP-02 |
| **Category** | Deployment context — academic calendar |
| **Description** | Academic year boundaries were required by migration 001 and drive term validation. |
| **Decision** | 2026-27 runs 15 June 2026 to 30 April 2027. Maharashtra State Board schools open around 15 June and close 30 April every year. Results are announced 1 May 2027. |
| **Rationale** | Operational reality of the target schools. The 1 May announcement falling one day after the year ends needs no special handling: ExamGroup.academicYearId is an explicit reference, not date-derived, and nothing validates resultsPublishedAt against the boundary. |
| **Source** | User statement, 14 Aug 2026 |
| **Status** | **APPROVED** |
| **Affected LLD section** | §10.2, §21, Appendix S §S.6.1 |
| **Affected modules** | 5.2 Calendar |
| **Affected tests** | Boundary days not blocked (15 Jun, 30 Apr); days either side blocked (1 May, 14 Jun) |

### E-01 — Engineering — test stack

| Field | Value |
|---|---|
| **ID** | E-01 |
| **Category** | Engineering — test stack |
| **Description** | ADR-16 recorded a test-stack recommendation but no decision. The core backend had no runner and no tests. |
| **Decision** | Jest + Supertest is the approved backend test stack. mongodb-memory-server or a separate MONGO_URI_TEST database for the integration tier. |
| **Rationale** | Jest matches the 14 existing FMS test files, making them runnable at the same time rather than requiring a second runner. |
| **Source** | Ratified 14 Aug 2026; implemented commit aa82a1c |
| **Status** | **APPROVED** |
| **Affected LLD section** | §27, ADR-16 |
| **Affected modules** | Platform / QA |
| **Affected tests** | The six characterisation tests are the first deliverable of this stack |

### E-02 — Engineering — calendar boundary rule

| Field | Value |
|---|---|
| **ID** | E-02 |
| **Category** | Engineering — calendar boundary rule |
| **Description** | calendarService queried Holiday and SpecialEvent by school and date but never consulted AcademicYear. A date between academic years is not a Sunday and carries no Holiday record, so attendance was markable throughout the ~6-week summer break. |
| **Decision** | RETAINED. isNonInstructionalDay() returns reason 'outside-academic-year' when no AcademicYear covers the date. Checked FIRST as the broadest condition. The system must prevent academic-year operations outside the configured boundaries where the LLD defines them. |
| **Rationale** | Recording the break as a six-week Holiday would be wrong: a holiday belongs to an academic year, and this window belongs to neither. The absence of a year IS the reason. Without the guard, summer-break attendance records would feed the alert calculations the calendar work exists to fix. |
| **Source** | Ratified 14 Aug 2026; implemented commit 47d372c |
| **Status** | **APPROVED** |
| **Affected LLD section** | §17.2.2, §17.2.11 BR-CAL-08 (new) |
| **Affected modules** | 5.2 Calendar, Attendance |
| **Affected tests** | 15 Jun and 30 Apr not blocked; 1 May and 14 Jun blocked; mid-break blocked; precedence over a stray holiday record |

### E-03 — Engineering — attendance calculation

| Field | Value |
|---|---|
| **ID** | E-03 |
| **Category** | Engineering — attendance calculation |
| **Description** | 'excused' counted in the sub-75% denominator but not the numerator, silently penalising authorised absence. |
| **Decision** | 'excused' is EXCLUDED from the denominator when calculating attendance percentage for the 75% eligibility rule. Formula: pct = round(100 × (present + late) / (records − nonInstructional − excused)). |
| **Rationale** | An authorised absence must neither help nor harm the percentage. Counting it in the denominator alone made authorised absence indistinguishable from truancy. |
| **Source** | Ratified 14 Aug 2026; implemented commit b00b939 |
| **Status** | **APPROVED** |
| **Affected LLD section** | §17.2.11 BR-CAL-02 (amended) |
| **Affected modules** | Attendance |
| **Affected tests** | present only; absent only; excused only; mixed; exactly 75%; below 75%; above 75% |

### E-04 — Engineering — failure behaviour

| Field | Value |
|---|---|
| **ID** | E-04 |
| **Category** | Engineering — failure behaviour |
| **Description** | Behaviour when the calendar cannot be read was unspecified, and the correct answer differs by component. |
| **Decision** | Calendar operations fail CLOSED: isNonInstructionalDay() rejects with CALENDAR_UNAVAILABLE and attendance marking is blocked. Alert and notification operations fail OPEN: checkAndSendAlerts falls back to unfiltered counting with a loud log. This rule applies ONLY to the components named in the LLD, never generically. |
| **Rationale** | Fail closed — permitting marking on a possible holiday is the defect this work exists to prevent. Fail open — suppressing every parent notification is worse than an occasional false positive, and an alert failure must not block the underlying attendance operation. |
| **Source** | Ratified 14 Aug 2026; implemented commit b00b939 |
| **Status** | **APPROVED** |
| **Affected LLD section** | §17.2.2, §17.2.10, §17.2.13 |
| **Affected modules** | 5.2 Calendar, Attendance, 5.9 Notification |
| **Affected tests** | CALENDAR_UNAVAILABLE rejection on marking path; unfiltered fallback with log on alert path |

### E-05 — Engineering — release packaging

| Field | Value |
|---|---|
| **ID** | E-05 |
| **Category** | Engineering — release packaging |
| **Description** | An earlier instruction named a specific user Desktop path as the release destination. Two stray files literally named '3000' also carried a developer's Windows paths into the release package. |
| **Decision** | No hardcoded release-specific filesystem path. All release and install paths are configuration-driven (--out, TFS_RELEASE_OUTPUT_DIR) or resolved relative to the installation context (default ./dist). A two-tier local-path scan hard-fails on generated output and warns on pre-existing content. |
| **Rationale** | A build artifact embedding one person's home directory is not portable, leaks the machine layout of whoever produced it, and breaks for every other operator. |
| **Source** | Ratified 14 Aug 2026; implemented commit 4097625 |
| **Status** | **APPROVED** |
| **Affected LLD section** | §26, §33 |
| **Affected modules** | Release |
| **Affected tests** | Portability tests assert no generated artifact carries a user directory; packager refuses to ship one |

### R-1 — Business rule — PLC action items

| Field | Value |
|---|---|
| **ID** | R-1 |
| **Category** | Business rule — PLC action items |
| **Description** | GAP-PLC-003 specified actionItems as [{text, owner, dueDate, status}]. The field ALREADY EXISTS at models/Meeting.js:64-69 as [{text, assignedTo, dueDate, done}]. No requirement text anywhere defines what the status values would be, so neither artifact could be preferred without inventing a state machine. |
| **Decision** | Binary completion is sufficient for the current approved requirement. RETAIN actionItems.done:Boolean and actionItems.assignedTo. Do NOT introduce a status enum and do NOT invent values (open, in_progress, blocked, done, cancelled, deferred) unless a future approved requirement explicitly requires them. GAP-PLC-003 is SATISFIED by the existing binary completion model, subject to validation on the four fields. |
| **Rationale** | Adding a status enum would require inventing business states no requirement defines. assignedTo is already populated by meetingController.js:105 and included in the editable field list at :216; renaming to owner would break that populate for no functional gain. |
| **Source** | Approved 14 Aug 2026, closing reconciliation item R-1 |
| **Status** | **APPROVED** |
| **Affected LLD section** | §10.2 (Meeting extensions), §26; Amendment A-01 |
| **Affected modules** | 5.8 PLC Hub |
| **Affected tests** | Validation and unit tests for text, assignedTo, dueDate, done. Characterisation test asserts owner and status are ABSENT from the sub-schema. |

### R-2 — Presentation — export colour bands

| Field | Value |
|---|---|
| **ID** | R-2 |
| **Category** | Presentation — export colour bands |
| **Description** | Attendance threshold literals appear in export colouring at attendanceService.js:557 and :627 (>= 90, >= 75), alongside the business thresholds. Whether presentation should follow School.aiThresholds was undecided. |
| **Decision** | Export colouring bands are PRESENTATION rules and remain INDEPENDENT from School.aiThresholds. Report colouring does not automatically inherit attendance warning or critical thresholds. However the bands must not stay scattered as literals: centralise them in a report/export presentation constant. Changing attendanceWarningPct or attendanceCriticalPct must NOT alter export colouring unless explicitly configured to do so. |
| **Rationale** | A colour band and an eligibility threshold answer different questions. Coupling them means a business threshold change silently repaints every historical report. Keeping them separate is correct; leaving them scattered is not. |
| **Source** | Approved 14 Aug 2026, closing reconciliation item R-2 |
| **Status** | **APPROVED** |
| **Affected LLD section** | §21.1, §27; Amendment A-01 |
| **Affected modules** | Attendance, 3.1 Reporting |
| **Affected tests** | Assert export colouring does not change when aiThresholds change; assert no colour literal remains outside the presentation constant |

### R-3 — Configuration — attendance thresholds

| Field | Value |
|---|---|
| **ID** | R-3 |
| **Category** | Configuration — attendance thresholds |
| **Description** | Eleven threshold literals were found across the attendance code. The value appears as both 75 and 0.75 in the same file (attendanceService.js:133 vs :178), and a second undocumented threshold — the 60 critical level — has the same problem. |
| **Decision** | Both thresholds become configuration-driven: School.aiThresholds.attendanceWarningPct (default 75) and School.aiThresholds.attendanceCriticalPct (default 60). Replace ALL hardcoded attendance threshold literals with the configuration source. Normalise percentage/fraction handling so the same rule cannot exist as both 75 and 0.75. Existing business meaning of 75 and 60 is UNCHANGED. |
| **Rationale** | The same rule expressed two ways in one file is a bug waiting for someone to change one and not the other. The 60 critical level was undocumented and shared the defect. |
| **Source** | Approved 14 Aug 2026, closing reconciliation item R-3 |
| **Status** | **APPROVED** |
| **Affected LLD section** | §10.2 (School.aiThresholds), §21.1, §38; Amendment A-01 |
| **Affected modules** | 5.3 Admin Configuration, Attendance, 6.6 AI Analytics |
| **Affected tests** | Config validation: 0 <= criticalPct < warningPct <= 100. Assert no attendance threshold literal remains. Assert percentage handling is normalised to one representation. Assert 75 and 60 remain the defaults. |

### M-01 — Data integrity — schema validation

| Field | Value |
|---|---|
| **ID** | M-01 |
| **Category** | Data integrity — schema validation |
| **Description** | MeetingSchema is declared strict:false, so meetingSubtype and lessonStudyCycle (GAP-PLC-001) can be written today with NO validation, silently accepting typos. |
| **Decision** | Treat as a genuine implementation gap. Add explicit schema definitions and validation for meetingSubtype and lessonStudyCycle. Do not rely on strict:false. Use approved enum values ONLY where the requirements already define them; do not invent new business states. |
| **Rationale** | strict:false accepting an unvalidated field is indistinguishable from a typo reaching the database. Explicit declaration is the only way GAP-PLC-001 can be verified. |
| **Source** | Approved 14 Aug 2026, raised by the LLD reconciliation report |
| **Status** | **APPROVED** |
| **Affected LLD section** | §10.2, §38; Amendment A-01 |
| **Affected modules** | 5.8 PLC Hub |
| **Affected tests** | Assert an invalid meetingSubtype is rejected despite strict:false; assert existing Meeting documents remain valid |

---

## Waived source artifacts (1)

### U-01 — Source artifact

| Field | Value |
|---|---|
| **ID** | U-01 |
| **Category** | Source artifact |
| **Description** | Original Level 1 approved requirements are not present in any upload, the repository, or the project workspace. |
| **Decision** | WAIVED FOR THIS BUILD. Technical & Functional Specification v1.2(2) plus the approved decision records become the highest available requirements baseline. Level 1 requirements must not be invented, reconstructed or inferred. |
| **Rationale** | The artifact is unavailable and cannot be fabricated. Every requirement that IS available is traced completely. |
| **Source** | Explicit waiver issued 14 Aug 2026; recorded in SOURCE-BASELINE-WAIVER.md |
| **Status** | **WAIVED** |
| **Affected LLD section** | §C — Waived Source Artifacts |
| **Affected modules** | All — traceability scope |
| **Affected tests** | Traceability matrix carries an explicit Level 1 column marked unavailable; no fabricated mapping |

---

## Environment validation pending (1)

### U-08 — Environment capability

| Field | Value |
|---|---|
| **ID** | U-08 |
| **Category** | Environment capability |
| **Description** | D-004 requires MongoDB multi-document transactions, which are unavailable on a standalone mongod. The target deployment's topology has not been verified. |
| **Decision** | ENVIRONMENT VALIDATION PENDING. Does not block the LLD, traceability, build prompts or source-code implementation. A runtime validation script checks the actual deployment in MODE B. Where unsupported: startup fails with a named error and the remedy; the code must NOT silently fall back to a non-transactional implementation. |
| **Rationale** | The check belongs to MODE B — installation and runtime validation. Code generation does not require a live server. |
| **Source** | Ratification §2, 14 Aug 2026 |
| **Status** | **ENVIRONMENT VALIDATION PENDING** |
| **Affected LLD section** | §26, §40, ADR-14 |
| **Affected modules** | 5.4 SIS (promotion), Platform |
| **Affected tests** | scripts/check-mongodb — exit 3 with remedy when no replica set; startup assertion in config/db.js. Status when unreachable: NOT EXECUTED — ENVIRONMENT UNAVAILABLE |

---

## Open decisions — adapter boundary (6)

### ADR-02 — Open decision — Authentication policy

| Field | Value |
|---|---|
| **ID** | ADR-02 |
| **Category** | Open decision — Authentication policy |
| **Description** | Parent session policy — JWT reuse versus short-lived tokens plus refresh. The OTP provider half is closed by D-007 (configured SMS adapter). |
| **Decision** | OPEN DECISION / ADAPTER BOUNDARY. Implementation proceeds to the adapter interface. No vendor is invented and no fake provider is implemented. Provider-specific implementation is marked pending. |
| **Rationale** | The design isolates the choice behind an interface, so unrelated modules are not blocked. Inventing a provider would produce code that must be discarded. |
| **Source** | LLD §35 ADR register; ratification §4, 14 Aug 2026 |
| **Status** | **OPEN** |
| **Affected LLD section** | §17.1.8–.12, ADR-02 |
| **Affected modules** | 5.1 IAM |
| **Affected tests** | Interface conformance tests only. Provider-specific tests: NOT EXECUTED — DEPENDENCY PENDING. Implementation boundary: authController session issuance; JWT payload stays {id, role}. Can proceed: Yes for the OTP flow and adapter; NO for the session-lifetime implementation |

### ADR-04 — Open decision — Domain modelling

| Field | Value |
|---|---|
| **ID** | ADR-04 |
| **Category** | Open decision — Domain modelling |
| **Description** | Principal actor modelling. No principal role exists in the User.role enum; principal-facing features currently bind to schoolAdmin. |
| **Decision** | OPEN DECISION / ADAPTER BOUNDARY. Implementation proceeds to the adapter interface. No vendor is invented and no fake provider is implemented. Provider-specific implementation is marked pending. |
| **Rationale** | The design isolates the choice behind an interface, so unrelated modules are not blocked. Inventing a provider would produce code that must be discarded. |
| **Source** | LLD §35 ADR register; ratification §4, 14 Aug 2026 |
| **Status** | **OPEN** |
| **Affected LLD section** | §10.1, §17.7, §17.21, ADR-04 |
| **Affected modules** | 5.7 Principal Dashboard, 6.9 Principal Copilot |
| **Affected tests** | Interface conformance tests only. Provider-specific tests: NOT EXECUTED — DEPENDENCY PENDING. Implementation boundary: User.role enum and routes/permissionRoutes.js ROLES. Can proceed: Partially — dashboards can be built against schoolAdmin; role separation pending |

### ADR-05 — Open decision — Provider selection

| Field | Value |
|---|---|
| **ID** | ADR-05 |
| **Category** | Open decision — Provider selection |
| **Description** | SMS gateway provider. The adapter interface and configuration model are closed by D-007; the vendor is not selected. Indian DLT/TRAI registration is a lead-time dependency. |
| **Decision** | OPEN DECISION / ADAPTER BOUNDARY. Implementation proceeds to the adapter interface. No vendor is invented and no fake provider is implemented. Provider-specific implementation is marked pending. |
| **Rationale** | The design isolates the choice behind an interface, so unrelated modules are not blocked. Inventing a provider would produce code that must be discarded. |
| **Source** | LLD §35 ADR register; ratification §4, 14 Aug 2026 |
| **Status** | **OPEN** |
| **Affected LLD section** | §13, §17.9, ADR-05 |
| **Affected modules** | 5.9 Notification Center |
| **Affected tests** | Interface conformance tests only. Provider-specific tests: NOT EXECUTED — DEPENDENCY PENDING. Implementation boundary: services/notification/smsAdapter.js — interface defined, no concrete provider. Can proceed: Yes to the adapter and configuration; NO to a concrete provider implementation |

### ADR-08 — Open decision — Data lifecycle

| Field | Value |
|---|---|
| **ID** | ADR-08 |
| **Category** | Open decision — Data lifecycle |
| **Description** | AuditLog and Message archival policy — retention period, archival target, purge authority. |
| **Decision** | OPEN DECISION / ADAPTER BOUNDARY. Implementation proceeds to the adapter interface. No vendor is invented and no fake provider is implemented. Provider-specific implementation is marked pending. |
| **Rationale** | The design isolates the choice behind an interface, so unrelated modules are not blocked. Inventing a provider would produce code that must be discarded. |
| **Source** | LLD §35 ADR register; ratification §4, 14 Aug 2026 |
| **Status** | **OPEN** |
| **Affected LLD section** | §10.8, §14, ADR-08 |
| **Affected modules** | 5.11 Audit Console |
| **Affected tests** | Interface conformance tests only. Provider-specific tests: NOT EXECUTED — DEPENDENCY PENDING. Implementation boundary: models/AuditLog.js — collection defined, no retention policy. Can proceed: Yes — the collection and audit() helper are complete; archival is additive later |

### ADR-10 — Open decision — Provider selection

| Field | Value |
|---|---|
| **ID** | ADR-10 |
| **Category** | Open decision — Provider selection |
| **Description** | Translation provider for parent-facing content. |
| **Decision** | OPEN DECISION / ADAPTER BOUNDARY. Implementation proceeds to the adapter interface. No vendor is invented and no fake provider is implemented. Provider-specific implementation is marked pending. |
| **Rationale** | The design isolates the choice behind an interface, so unrelated modules are not blocked. Inventing a provider would produce code that must be discarded. |
| **Source** | LLD §35 ADR register; ratification §4, 14 Aug 2026 |
| **Status** | **OPEN** |
| **Affected LLD section** | §13, §16, §17.22, ADR-10 |
| **Affected modules** | 5.9 Notification, 6.10 Parent AI |
| **Affected tests** | Interface conformance tests only. Provider-specific tests: NOT EXECUTED — DEPENDENCY PENDING. Implementation boundary: services/ai/translationService.js — adapter boundary; confidence and reviewed fields already modelled. Can proceed: Yes to the adapter, the translations map and the low-confidence review gate; NO to a concrete provider |

### ADR-11 — Open decision — Provider selection

| Field | Value |
|---|---|
| **ID** | ADR-11 |
| **Category** | Open decision — Provider selection |
| **Description** | LLM provider and model. ADR-12 (AI data-privacy boundary) depends on this — whether PII is sent or stripped cannot be decided without knowing the provider. |
| **Decision** | OPEN DECISION / ADAPTER BOUNDARY. Implementation proceeds to the adapter interface. No vendor is invented and no fake provider is implemented. Provider-specific implementation is marked pending. |
| **Rationale** | The design isolates the choice behind an interface, so unrelated modules are not blocked. Inventing a provider would produce code that must be discarded. |
| **Source** | LLD §35 ADR register; ratification §4, 14 Aug 2026 |
| **Status** | **OPEN** |
| **Affected LLD section** | §16, §17.20–.22, ADR-11, ADR-12 |
| **Affected modules** | 6.8, 6.9, 6.10 |
| **Affected tests** | Interface conformance tests only. Provider-specific tests: NOT EXECUTED — DEPENDENCY PENDING. Implementation boundary: services/ai/aiProvider.js — adapter boundary. Can proceed: Yes to the adapter, audit wiring and draft-only constraints; NO to concrete generation |

---

## Freeze declaration

This register is the decision baseline for the final LLD. Downstream artifacts cite
decision IDs from here; none reinterprets a decision or reintroduces a rejected alternative.

**Rejected alternatives remain binding constraints.** None of the following may appear in
the LLD, any build prompt, or implementation:

- Cloning `Class` by academic year
- Changing, weakening or replacing the `Class` unique index on `{name, section, school}`
- Using `Class.students[]` as a historical enrolment source
- Creating separate historical `Class` entities
- Creating a second promotion source of truth
- Using the legacy `Exam`/`Result` module as the TFS-EOS promotion authority
- Hardcoding an SMS or WhatsApp provider
- Using `ContentItem` as the `BestPracticeResource` persistence model
- Per-class publication state on `ExamGroup`
- Treating a missing `ExamMark` as absence or as a fail
- Gating promotion on `ExamGroup.status` alone
- Inventing, reconstructing or inferring Level 1 requirements
- Silently falling back to a non-transactional promotion implementation
- Implementing a fake or placeholder provider for any open ADR
- Hardcoding a release-specific filesystem path
- **Introducing a PLC action-item status enum** or inventing its values (rejected by R-1)
- **Renaming `actionItems.assignedTo` to `owner`** (rejected by R-1)
- **Coupling export colour bands to `School.aiThresholds`** (rejected by R-2)
- **Leaving any attendance threshold as a code literal** (rejected by R-3)
- **Relying on `strict:false` for `meetingSubtype` or `lessonStudyCycle`** (rejected by M-01)

## What this register does not claim

Six decisions remain OPEN — provider and policy selections isolated behind adapters. They
block concrete provider implementation in specific modules, not the design and not
unrelated modules. One source artifact is waived; traceability is verified downward from
Specification v1.2, not from Level 1.


---

## ADR-13 — Authorization infrastructure failure fails closed (APPROVED, 15 Aug 2026)

Controlled amendment recorded in `LLD-AMENDMENT-A-02-ADR-13.md`. The `checkPermission`
catch block now denies (403) with a safe client message and a server-side
`authorization.failure` audit carrying no secrets. Paths "no role" and "superAdmin"
ratified APPROVED FAIL-OPEN; "no matrix" and "unknown key" escalated to ADR-14.
Requirement: GAP-IAM-006. Acceptance: AC-SEC-01. Prompt: applied at FP-043 scope extension.

## ADR-14 — Matrix-gap fail-open (OPEN — REQUIRES DECISION)

Whether `checkPermission` should deny when no matrix row or no key exists for a role.
Precondition: a complete, verified permission matrix for every role/route, which cannot
be derived while U-01 (original Level 1 requirements) is waived. Mitigated today by
per-route `authorize()`. Blocks nothing in this build; SEC-001 remains PARTIALLY
MITIGATED until decided.
