// components/transport/StudentTransportSection.jsx
// Transport section for the admin's Student Profile — stateful workflow:
//   • No active transport → "Is Transport Required?" (Yes/No). Yes → assignment form.
//   • Active transport    → read-only Transport Details + Update / Remove (no Yes/No).
//   • Remove              → confirmation dialog (optional reason) → soft-remove
//                           (history, fee records and receipts are preserved).
//   • After removal       → Yes/No card returns, so transport can be re-assigned.
//   • Transport History   → always shown below once any record exists (active or removed).
// Saving creates/updates a real TransportAssignment via the existing API, so the
// student appears in the Transport Module automatically (no duplicate entry).
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { routeAPI, stopAPI, assignmentAPI } from '../../utils/transportAPI';

const INP = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--color-border, #E5E7EB)', fontSize: 13,
  outline: 'none', boxSizing: 'border-box', background: 'var(--color-paper, #fff)',
  color: 'var(--color-ink, #111827)',
};
const LBL = { fontSize: 10, fontWeight: 700, color: 'var(--color-muted, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 };
const CARD = { background: 'var(--color-paper,#fff)', border: '1px solid var(--color-border,#E5E7EB)', borderRadius: 16, padding: 18 };

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const money = (n) => (n || n === 0) ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ active, small }) {
  const s = active
    ? { bg: 'var(--sage-soft,#eef4ef)', fg: 'var(--sage,#4a7c59)', label: 'Active' }
    : { bg: 'var(--danger-soft,#fdecec)', fg: 'var(--danger,#dc2626)', label: 'Removed' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: small ? '2px 9px' : '4px 12px', borderRadius: 999,
      background: s.bg, color: s.fg, fontSize: small ? 10.5 : 12, fontWeight: 700,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.fg }} />
      {s.label}
    </span>
  );
}

export default function StudentTransportSection({ studentId, canEdit = true }) {
  const [routes,   setRoutes]   = useState([]);
  const [stops,    setStops]    = useState([]);
  const [active,   setActive]   = useState(null);   // current active assignment (or null)
  const [history,  setHistory]  = useState([]);     // all assignments incl. removed
  const [showForm, setShowForm] = useState(false);  // "Yes" chosen → show assignment form
  const [saving,   setSaving]   = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [removeModal, setRemoveModal] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [removing, setRemoving] = useState(false);

  const [form, setForm] = useState({
    routeId: '', busId: '', pickupStopId: '', dropStopId: '',
    startDate: '', endDate: '', monthlyFee: '', securityDeposit: '', remarks: '',
  });

  const resetForm = () => setForm({
    routeId: '', busId: '', pickupStopId: '', dropStopId: '',
    startDate: '', endDate: '', monthlyFee: '', securityDeposit: '', remarks: '',
  });

  // Load routes + this student's assignments (active + history)
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, hRes] = await Promise.all([
        routeAPI.getAll(),
        assignmentAPI.getHistory(studentId),
      ]);
      setRoutes(rRes.data?.data || []);
      const all = hRes.data?.data || [];
      setHistory(all);
      const act = all.find(a => a.isActive) || null;
      setActive(act);
      setShowForm(false);
      if (act) {
        setForm({
          routeId:      act.routeId?._id || act.routeId || '',
          busId:        act.busId?._id   || act.busId   || '',
          pickupStopId: act.pickupStopId?._id || act.pickupStopId || '',
          dropStopId:   act.dropStopId?._id   || act.dropStopId   || '',
          startDate:    act.startDate ? String(act.startDate).slice(0, 10) : '',
          endDate:      act.endDate ? String(act.endDate).slice(0, 10) : '',
          monthlyFee:   act.monthlyFee ?? '',
          securityDeposit: act.securityDeposit ?? '',
          remarks:      act.remarks || '',
        });
      } else {
        resetForm();
      }
    } catch {
      toast.error('Failed to load transport info');
    } finally { setLoading(false); }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  // When a route is chosen: load its stops, auto-fill bus + monthly fee
  useEffect(() => {
    if (!form.routeId) { setStops([]); return; }
    let alive = true;
    stopAPI.getByRoute(form.routeId)
      .then(r => { if (alive) setStops(r.data?.data || []); })
      .catch(() => { if (alive) setStops([]); });

    const route = routes.find(r => r._id === form.routeId);
    if (route) {
      setForm(f => ({
        ...f,
        busId: route.assignedBus?._id || route.assignedBus || f.busId,
        monthlyFee: (f.monthlyFee === '' || f.monthlyFee == null) ? (route.monthlyFee ?? '') : f.monthlyFee,
      }));
    }
    return () => { alive = false; };
  }, [form.routeId, routes]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.routeId)      return toast.error('Select a route');
    if (!form.pickupStopId) return toast.error('Select a pickup stop');
    if (!form.dropStopId)   return toast.error('Select a drop stop');
    setSaving(true);
    try {
      await assignmentAPI.assign({
        studentId,
        routeId:      form.routeId,
        busId:        form.busId || undefined,
        pickupStopId: form.pickupStopId,
        dropStopId:   form.dropStopId,
        monthlyFee:   Number(form.monthlyFee) || 0,
        startDate:    form.startDate || undefined,
        endDate:      form.endDate || undefined,
        securityDeposit: Number(form.securityDeposit) || 0,
        remarks:      form.remarks || '',
      });
      toast.success(active ? 'Transport updated' : 'Transport assigned — student added to Transport Module');
      await load();
    } catch (e) {
      const msg = e?.response
        ? (e.response.data?.message || `Server error (${e.response.status})`)
        : `Could not reach the server (network/CORS). Detail: ${e?.message || 'unknown'}`;
      console.error('Transport save failed:', e?.response?.data || e?.message || e);
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const confirmRemove = async () => {
    if (!active?._id) { setRemoveModal(false); return; }
    setRemoving(true);
    try {
      await assignmentAPI.remove(active._id, removeReason);
      toast.success('Transport removed. History and fee records are preserved.');
      setRemoveModal(false);
      setRemoveReason('');
      await load();
    } catch {
      toast.error('Failed to remove transport');
    } finally { setRemoving(false); }
  };

  const routeLabel = (r) => r ? `${r.code ? r.code + ' — ' : ''}${r.name || ''}` : '—';

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-muted,#9CA3AF)' }}>⏳ Loading transport…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ══ ACTIVE TRANSPORT → read-only details + Update/Remove ══ */}
      {active && !showForm && (
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-ink,#0B1F4A)' }}>🚌 Transport Details</span>
            <StatusPill active />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            {[
              ['Route',        routeLabel(active.routeId)],
              ['Pickup Stop',  active.pickupStopId?.name || '—'],
              ['Drop Stop',    active.dropStopId?.name || '—'],
              ['Start Date',   fmtDate(active.startDate)],
              ['Monthly Fee',  money(active.monthlyFee)],
              ['Security Deposit', money(active.securityDeposit)],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={LBL}>{k}</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink,#111827)' }}>{v}</div>
              </div>
            ))}
            {active.remarks && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={LBL}>Remarks</div>
                <div style={{ fontSize: 13, color: 'var(--color-slate,#374151)' }}>{active.remarks}</div>
              </div>
            )}
          </div>

          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button onClick={() => setRemoveModal(true)}
                style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid var(--danger,#FCA5A5)', background: 'var(--danger-soft,#FEF2F2)', color: 'var(--danger,#DC2626)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Remove Transport
              </button>
              <button onClick={() => setShowForm(true)}
                style={{ padding: '10px 24px', borderRadius: 10, background: 'var(--accent,#d4522a)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                ✏️ Update Transport
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══ NO ACTIVE TRANSPORT → Is Transport Required? ══ */}
      {!active && !showForm && (
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-ink,#0B1F4A)' }}>🚌 Is Transport Required?</div>
              <div style={{ fontSize: 12, color: 'var(--color-muted,#6B7280)', marginTop: 3 }}>Assign a bus route and stops for this student.</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => canEdit && setShowForm(true)} disabled={!canEdit}
                style={{ padding: '9px 26px', borderRadius: 20, cursor: canEdit ? 'pointer' : 'default', fontSize: 13, fontWeight: 700,
                  border: 'none', background: 'var(--accent,#d4522a)', color: '#fff' }}>
                Yes
              </button>
              <button disabled
                style={{ padding: '9px 26px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'default',
                  border: '1.5px solid var(--color-border,#E5E7EB)', background: 'var(--color-paper,#fff)', color: 'var(--color-muted,#6B7280)' }}>
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ASSIGNMENT / UPDATE FORM ══ */}
      {showForm && (
        <div style={{ ...CARD, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-ink,#0B1F4A)' }}>
              {active ? '✏️ Update Transport' : '➕ Assign Transport'}
            </span>
            <button onClick={() => { setShowForm(false); if (!active) resetForm(); else load(); }}
              style={{ border: 'none', background: 'transparent', color: 'var(--color-muted,#6B7280)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              ✕ Cancel
            </button>
          </div>

          <div>
            <label style={LBL}>Route *</label>
            <select style={INP} value={form.routeId} onChange={e => { set('routeId', e.target.value); set('pickupStopId', ''); set('dropStopId', ''); }} disabled={!canEdit}>
              <option value="">Select route…</option>
              {routes.map(r => <option key={r._id} value={r._id}>{routeLabel(r)}</option>)}
            </select>
            {form.routeId && !form.busId && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#B45309', background: '#FEF3C7', padding: '6px 9px', borderRadius: 8 }}>
                ⚠ This route has no bus assigned. Assign a bus under Transport → Routes before saving.
              </div>
            )}
          </div>

          <div>
            <label style={LBL}>Pickup Stop *</label>
            <select style={INP} value={form.pickupStopId} onChange={e => set('pickupStopId', e.target.value)} disabled={!canEdit || !form.routeId}>
              <option value="">{form.routeId ? 'Select stop…' : 'Choose a route first'}</option>
              {stops.map(st => <option key={st._id} value={st._id}>{st.name}</option>)}
            </select>
          </div>

          <div>
            <label style={LBL}>Drop Stop *</label>
            <select style={INP} value={form.dropStopId} onChange={e => set('dropStopId', e.target.value)} disabled={!canEdit || !form.routeId}>
              <option value="">{form.routeId ? 'Select stop…' : 'Choose a route first'}</option>
              {stops.map(st => <option key={st._id} value={st._id}>{st.name}</option>)}
            </select>
          </div>

          <div>
            <label style={LBL}>Transport Start Date</label>
            <input type="date" style={INP} value={form.startDate} onChange={e => set('startDate', e.target.value)} disabled={!canEdit} />
          </div>

          <div>
            <label style={LBL}>Monthly Transport Fee (₹)</label>
            <input type="number" style={INP} value={form.monthlyFee} onChange={e => set('monthlyFee', e.target.value)} placeholder="Auto-filled from route" disabled={!canEdit} />
          </div>

          <div>
            <label style={LBL}>Security Deposit (optional)</label>
            <input type="number" style={INP} value={form.securityDeposit} onChange={e => set('securityDeposit', e.target.value)} disabled={!canEdit} />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={LBL}>Remarks</label>
            <textarea rows={2} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} value={form.remarks} onChange={e => set('remarks', e.target.value)} disabled={!canEdit} placeholder="Any notes about this student's transport…" />
          </div>

          {canEdit && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={save} disabled={saving}
                style={{ padding: '10px 24px', borderRadius: 10, background: 'var(--accent,#d4522a)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? '⏳ Saving…' : (active ? '💾 Update Transport' : '✓ Assign Transport')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══ TRANSPORT HISTORY ══ */}
      {history.length > 0 && (
        <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border,#E5E7EB)', fontWeight: 700, fontSize: 14, color: 'var(--color-ink,#0B1F4A)' }}>
            📜 Transport History
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--color-warm,#F9FAFB)' }}>
                  {['Route', 'Pickup', 'Drop', 'Start Date', 'End Date', 'Monthly Fee', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--color-muted,#6B7280)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map(a => (
                  <tr key={a._id} style={{ borderTop: '1px solid var(--color-border,#F3F4F6)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-ink,#0B1F4A)' }}>{routeLabel(a.routeId)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-slate,#374151)' }}>{a.pickupStopId?.name || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-slate,#374151)' }}>{a.dropStopId?.name || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-slate,#374151)' }}>{fmtDate(a.startDate)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-slate,#374151)' }}>{a.isActive ? '—' : fmtDate(a.endDate || a.removedAt)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-slate,#374151)' }}>{money(a.monthlyFee)}</td>
                    <td style={{ padding: '10px 14px' }}><StatusPill active={a.isActive} small /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ REMOVE CONFIRMATION DIALOG ══ */}
      {removeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => !removing && setRemoveModal(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 440, background: 'var(--color-paper,#fff)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px 8px' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-ink,#111827)' }}>Remove Transport?</div>
              <p style={{ fontSize: 13, color: 'var(--color-slate,#4a453f)', marginTop: 8, lineHeight: 1.5 }}>
                This will stop future transport services for this student. Previously generated transport records, transport fee history, and receipts will remain available.
              </p>
              <div style={{ marginTop: 12 }}>
                <label style={LBL}>Reason (optional)</label>
                <textarea rows={2} value={removeReason} onChange={e => setRemoveReason(e.target.value)}
                  placeholder="e.g. Student changed address / discontinued bus"
                  style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', background: 'var(--color-warm,#faf7f2)', borderTop: '1px solid var(--color-border,#E5E7EB)' }}>
              <button onClick={() => setRemoveModal(false)} disabled={removing}
                style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid var(--color-border,#E5E7EB)', background: 'var(--color-paper,#fff)', color: 'var(--color-slate,#4a453f)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={confirmRemove} disabled={removing}
                style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'var(--danger,#dc2626)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: removing ? 0.7 : 1 }}>
                {removing ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}