// frontend/src/pages/PromotionWorkflow.js
//
// FP-063 · Student promotion workflow (§18.3).
//
// Two-step: PREVIEW (read-only, runs the D-011 gates) then CONFIRM (one
// transaction). The client NEVER computes an outcome — every decision comes from
// the FP-052 API, which routes through the FP-037 transaction service. This
// screen is a view over that, plus a confirmation gate.
//
// Promotion is consequential and irreversible-ish, so confirmation is explicit
// and names the counts before committing.

import React, { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { sisAPI, apiErrorMessage } from '../utils/tfsAPI';
import { useAuth } from '../context/AuthContext';
import { LoadingState, EmptyState, Modal, Badge } from '../components/ui';

const ADMIN_ROLES = ['superAdmin', 'schoolAdmin'];

export default function PromotionWorkflow() {
  const { user } = useAuth();
  const canPromote = ADMIN_ROLES.includes(user?.role);

  const [form, setForm] = useState({ classId: '', examGroupId: '', academicYearId: '', toAcademicYearId: '' });
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [blocker, setBlocker] = useState(null); // { code, message, missing }
  const [confirming, setConfirming] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState(null);

  const runPreview = useCallback(async () => {
    if (!form.classId || !form.examGroupId || !form.academicYearId) {
      toast.error('Class, exam group and academic year are required.');
      return;
    }
    setLoading(true);
    setBlocker(null);
    setPreview(null);
    setResult(null);
    try {
      const { data } = await sisAPI.previewPromotion(form);
      setPreview(data.preview);
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (status === 422 && data?.code) {
        // A D-011 blocker: show WHAT is blocking (unpublished group, missing
        // marks) with the missing pairs, so the user can fix it. Not a crash.
        setBlocker({ code: data.code, message: data.message, missing: data.missing || [] });
      } else {
        toast.error(apiErrorMessage(err, 'Could not preview promotion.'));
      }
    } finally {
      setLoading(false);
    }
  }, [form]);

  const confirm = async () => {
    if (!preview) return;
    setConfirming(true);
    try {
      const batchId = `promo-${form.classId}-${form.academicYearId}-${Date.now()}`;
      const { data } = await sisAPI.confirmPromotion({ previewResult: preview, batchId });
      setResult(data);
      setShowConfirm(false);
      if (data.alreadyApplied) {
        toast('This batch was already applied — no changes made.', { icon: 'ℹ️' });
      } else {
        toast.success(`Promotion complete: ${data.promoted} promoted, ${data.retained} retained, ${data.graduated} graduated.`);
      }
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      // Honest, specific failure messages from the backend's own codes.
      if (status === 503) {
        toast.error('Promotion needs a transaction-capable database, which this environment is not configured for.');
      } else if (status === 409) {
        toast.error(`${data?.message || 'Enrolment has drifted.'} Reconcile the class roster and retry.`);
      } else {
        toast.error(apiErrorMessage(err, 'Promotion failed. No changes were made.'));
      }
      setShowConfirm(false);
    } finally {
      setConfirming(false);
    }
  };

  if (!canPromote) {
    return <EmptyState icon="🔒" title="Not available"
      subtitle="Promotion is restricted to administrators." />;
  }

  return (
    <div className="page promotion-workflow">
      <header className="page-header"><h1>Student Promotion</h1></header>

      <section className="promotion-inputs">
        <div className="input-grid">
          <label>Source class
            <input value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}
              placeholder="Class ID" />
          </label>
          <label>Exam group
            <input value={form.examGroupId} onChange={(e) => setForm({ ...form, examGroupId: e.target.value })}
              placeholder="Published exam group ID" />
          </label>
          <label>From year
            <input value={form.academicYearId} onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}
              placeholder="Current academic year ID" />
          </label>
          <label>To year
            <input value={form.toAcademicYearId} onChange={(e) => setForm({ ...form, toAcademicYearId: e.target.value })}
              placeholder="Next academic year ID" />
          </label>
        </div>
        <button className="btn btn-primary" onClick={runPreview} disabled={loading}>
          {loading ? 'Checking…' : 'Preview promotion'}
        </button>
      </section>

      {loading && <LoadingState message="Running eligibility checks…" />}

      {/* ── D-011 blocker: explain, don't crash ────────────────────────────── */}
      {blocker && (
        <div className="alert alert-warning" role="alert">
          <strong>Promotion is blocked.</strong>
          <p>{blocker.message}</p>
          {blocker.code === 'PROMOTION_BLOCKED_MARKS_INCOMPLETE' && blocker.missing.length > 0 && (
            <>
              <p>Missing marks:</p>
              <ul className="missing-list">
                {blocker.missing.slice(0, 20).map((m, i) => (
                  <li key={i}>{m.subjectName || 'Subject'} — student {String(m.student).slice(-6)}</li>
                ))}
              </ul>
              {blocker.missing.length > 20 && <p>…and {blocker.missing.length - 20} more.</p>}
            </>
          )}
        </div>
      )}

      {/* ── Preview table ──────────────────────────────────────────────────── */}
      {preview && !result && (
        <section className="promotion-preview" aria-live="polite">
          <div className="preview-summary">
            <span>{preview.counts.total} students</span>
            <Badge status="promoted" /> {preview.counts.promoted}
            <Badge status="retained" /> {preview.counts.retained}
            <Badge status="graduated" /> {preview.counts.graduated}
          </div>
          <table className="preview-table">
            <thead>
              <tr><th>Student</th><th>Decision</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {preview.rows.map((r, i) => (
                <tr key={i} className={`decision-${r.decision}`}>
                  <td>{String(r.student).slice(-6)}</td>
                  <td><Badge status={r.decision} /></td>
                  <td>{r.decision === 'retained' ? (r.retentionReason || `Failed: ${r.failedSubjects?.join(', ')}`) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-primary" onClick={() => setShowConfirm(true)}>
            Confirm promotion
          </button>
        </section>
      )}

      {/* ── Result ─────────────────────────────────────────────────────────── */}
      {result && (
        <div className="alert alert-success" role="status">
          {result.alreadyApplied
            ? 'This promotion batch was already applied. No changes were made.'
            : `Done. ${result.promoted} promoted, ${result.retained} retained, ${result.graduated} graduated.`}
        </div>
      )}

      {/* ── Consequential confirmation ─────────────────────────────────────── */}
      {showConfirm && preview && (
        <Modal isOpen onClose={() => setShowConfirm(false)} title="Confirm promotion"
          footer={
            <>
              <button className="btn" onClick={() => setShowConfirm(false)} disabled={confirming}>Cancel</button>
              <button className="btn btn-primary" onClick={confirm} disabled={confirming}>
                {confirming ? 'Promoting…' : 'Yes, promote'}
              </button>
            </>
          }>
          <p>
            This will promote <strong>{preview.counts.promoted}</strong>, retain{' '}
            <strong>{preview.counts.retained}</strong> and graduate{' '}
            <strong>{preview.counts.graduated}</strong> students in one operation.
          </p>
          <p>Student records and class rosters will be updated together. This cannot be partially applied.</p>
        </Modal>
      )}
    </div>
  );
}
