# Changelog — TFS-EOS Delta Build

All notable changes in this delta build. This is an ADDITIVE delta on the
operating EduCore platform: existing student, attendance, fee, exam, library and
transport functionality is preserved and unchanged.

## [1.0.0] — TFS-EOS Delta Build

### Added
- **Academic calendar & rollover** — AcademicYear, Holiday, SpecialEvent
  collections replacing the writer-less in-memory holiday store; year rollover
  carries only the AcademicYear and recurring-annual holidays (D-003).
- **Competency assessment** — competency framework, formative observations,
  reading log, subject models; deterministic flagging.
- **Learning passport** — per-student longitudinal record.
- **Parent partnership** — multi-child parent accounts (GAP-PA-004),
  provider-configurable SMS/WhatsApp notifications (D-007/D-008), OTP.
- **Promotion & SIS** — transaction-based promotion (one transaction per batch,
  D-004), append-only PromotionRecord, single promotion API entry point (FP-052),
  historical enrolment derived from PromotionRecord (D-006).
- **Audit console** — append-only audit surface.
- **Offline capability** — client write queue and server sync endpoint with
  idempotent replay, conflict detection, per-operation authorization.
- **AI layer** — insight, teacher/principal copilot, and translation services,
  each behind a provider boundary (ADR-10/ADR-11) with no vendor hardcoded;
  copilots enforce grounding/scope/no-actions (ADR-12).
- **Security** — authorization fails closed on infrastructure failure (ADR-13).

### Preserved (explicitly unchanged)
- Legacy Exam/Result modules retained but never consulted for promotion (D-001);
  the Advanced Exam module is authoritative.
- Class is global and never cloned per year (D-002).
- `Student.grade` is never written (it does not exist in the schema, D-004).

### Open decisions carried into deployment
- ADR-05 (concrete SMS/WhatsApp provider), ADR-10 (translation vendor),
  ADR-11 (LLM provider), ADR-14 (permission-matrix completeness), ADR-02
  (parent session). These are boundaries, not blockers, for MODE-A.

### Environment-validation pending
- Live MongoDB multi-document transaction (U-08), migration execution against a
  live database, offline end-to-end on a real device, and MODE-B.
