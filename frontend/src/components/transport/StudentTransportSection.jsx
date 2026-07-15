// components/StudentTransportSection.jsx
// Transport section for the admin's Student Profile.
//   • "Is Transport Required?" Yes/No
//   • Yes → Route, Pickup Stop, Drop Stop (stops load for the chosen route),
//     Start/End date, Monthly Fee (auto-filled from route), Deposit, Status, Remarks
//   • Saving creates/updates a real TransportAssignment via the existing API, so
//     the student appears in the Transport Module automatically (no duplicate entry).
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { routeAPI, stopAPI, assignmentAPI } from '../utils/transportAPI';

const INP = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid var(--color-border, #E5E7EB)', fontSize: 13,
  outline: 'none', boxSizing: 'border-box', background: 'var(--color-paper, #fff)',
  color: 'var(--color-ink, #111827)',
};
const LBL = { fontSize: 10, fontWeight: 700, color: 'var(--color-muted, #6B7280)', textTransform: 'uppercase', display: 'block', marginBottom: 4 };

export default function StudentTransportSection({ studentId, canEdit = true }) {
  const [required, setRequired] = useState(false);
  const [routes,   setRoutes]   = useState([]);
  const [stops,    setStops]    = useState([]);
  const [existing, setExisting] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [loading,  setLoading]  = useState(true);

  const [form, setForm] = useState({
    routeId: '', busId: '', pickupStopId: '', dropStopId: '',
    startDate: '', endDate: '', monthlyFee: '', securityDeposit: '',
    status: 'active', remarks: '',
  });

  // Load routes + any existing assignment for this student
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, aRes] = await Promise.all([
        routeAPI.getAll(),
        assignmentAPI.getAll({ student: studentId }),
      ]);
      setRoutes(rRes.data?.data || []);
      const a = (aRes.data?.data || [])[0];
      if (a) {
        setExisting(a);
        setRequired(true);
        setForm({
          routeId:      a.routeId?._id || a.routeId || '',
          busId:        a.busId?._id   || a.busId   || '',
          pickupStopId: a.pickupStopId?._id || a.pickupStopId || '',
          dropStopId:   a.dropStopId?._id   || a.dropStopId   || '',
          startDate:    a.startDate ? String(a.startDate).slice(0, 10) : '',
          endDate:      a.endDate ? String(a.endDate).slice(0, 10) : '',
          monthlyFee:   a.monthlyFee ?? '',
          securityDeposit: a.securityDeposit ?? '',
          status:       a.isActive === false ? 'inactive' : 'active',
          remarks:      a.remarks || '',
        });
      }
    } catch {
      toast.error('Failed to load transport info');
    } finally { setLoading(false); }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  // When a route is chosen: load its stops, auto-fill route's bus + monthly fee
  useEffect(() => {
    if (!form.routeId) { setStops([]); return; }
    let active = true;
    stopAPI.getByRoute(form.routeId)
      .then(r => { if (active) setStops(r.data?.data || []); })
      .catch(() => { if (active) setStops([]); });

    const route = routes.find(r => r._id === form.routeId);
    if (route) {
      setForm(f => ({
        ...f,
        busId: route.assignedBus?._id || route.assignedBus || f.busId,
        // Only auto-fill the fee if the user hasn't typed one (or it matches an old route)
        monthlyFee: (f.monthlyFee === '' || f.monthlyFee == null)
          ? (route.monthlyFee ?? '')
          : f.monthlyFee,
      }));
    }
    return () => { active = false; };
  }, [form.routeId, routes]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.routeId)      return toast.error('Select a route');
    if (!form.pickupStopId) return toast.error('Select a pickup stop');
    if (!form.dropStopId)   return toast.error('Select a drop stop');
    if (!form.busId)        return toast.error('This route has no bus assigned. Assign a bus to the route first.');
    setSaving(true);
    try {
      await assignmentAPI.create({
        studentId,
        routeId:      form.routeId,
        busId:        form.busId,
        pickupStopId: form.pickupStopId,
        dropStopId:   form.dropStopId,
        monthlyFee:   Number(form.monthlyFee) || 0,
        startDate:    form.startDate || undefined,
        endDate:      form.endDate || undefined,
        securityDeposit: Number(form.securityDeposit) || 0,
        remarks:      form.remarks || '',
      });
      toast.success('Transport details saved — student added to Transport Module');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save transport details');
    } finally { setSaving(false); }
  };

  const removeTransport = async () => {
    if (!existing?._id) { setRequired(false); return; }
    if (!window.confirm('Remove transport for this student? Future transport fees will stop.')) return;
    try {
      await assignmentAPI.remove(existing._id);
      toast.success('Transport removed');
      setExisting(null);
      setRequired(false);
      setForm({ routeId: '', busId: '', pickupStopId: '', dropStopId: '', startDate: '', endDate: '', monthlyFee: '', securityDeposit: '', status: 'active', remarks: '' });
    } catch {
      toast.error('Failed to remove transport');
    }
  };

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>⏳ Loading transport…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Is Transport Required? */}
      <div style={{ background: 'var(--color-paper,#fff)', border: '1px solid var(--color-border,#E5E7EB)', borderRadius: 14, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-ink,#0B1F4A)' }}>🚌 Is Transport Required?</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {['Yes', 'No'].map(opt => {
              const on = (opt === 'Yes') === required;
              return (
                <button key={opt}
                  onClick={() => canEdit && setRequired(opt === 'Yes')}
                  disabled={!canEdit}
                  style={{
                    padding: '7px 22px', borderRadius: 20, cursor: canEdit ? 'pointer' : 'default', fontSize: 13, fontWeight: 700,
                    border: on ? '1.5px solid #0B1F4A' : '1.5px solid var(--color-border,#E5E7EB)',
                    background: on ? '#0B1F4A' : 'var(--color-paper,#fff)',
                    color: on ? '#fff' : 'var(--color-muted,#6B7280)',
                  }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Fields — only when Yes */}
      {required && (
        <div style={{ background: 'var(--color-paper,#fff)', border: '1px solid var(--color-border,#E5E7EB)', borderRadius: 14, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div>
            <label style={LBL}>Route *</label>
            <select style={INP} value={form.routeId} onChange={e => { set('routeId', e.target.value); set('pickupStopId', ''); set('dropStopId', ''); }} disabled={!canEdit}>
              <option value="">Select route…</option>
              {routes.map(r => (
                <option key={r._id} value={r._id}>{r.code ? `${r.code} — ` : ''}{r.name}</option>
              ))}
            </select>
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
            <label style={LBL}>Transport End Date (optional)</label>
            <input type="date" style={INP} value={form.endDate} onChange={e => set('endDate', e.target.value)} disabled={!canEdit} />
          </div>

          <div>
            <label style={LBL}>Monthly Transport Fee (₹)</label>
            <input type="number" style={INP} value={form.monthlyFee} onChange={e => set('monthlyFee', e.target.value)} placeholder="Auto-filled from route" disabled={!canEdit} />
          </div>

          <div>
            <label style={LBL}>Security Deposit (optional)</label>
            <input type="number" style={INP} value={form.securityDeposit} onChange={e => set('securityDeposit', e.target.value)} disabled={!canEdit} />
          </div>

          <div>
            <label style={LBL}>Status</label>
            <select style={INP} value={form.status} onChange={e => set('status', e.target.value)} disabled={!canEdit}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={LBL}>Remarks</label>
            <textarea rows={2} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} value={form.remarks} onChange={e => set('remarks', e.target.value)} disabled={!canEdit} placeholder="Any notes about this student's transport…" />
          </div>

          {canEdit && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              {existing && (
                <button onClick={removeTransport}
                  style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Remove Transport
                </button>
              )}
              <button onClick={save} disabled={saving}
                style={{ padding: '10px 24px', borderRadius: 10, background: '#0B1F4A', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? '⏳ Saving…' : (existing ? '💾 Update Transport' : '➕ Save Transport')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* When No + an assignment exists → offer to remove it */}
      {!required && existing && canEdit && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#92400E' }}>This student currently has transport assigned. Set to "No" and remove it?</span>
          <button onClick={removeTransport}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Remove Transport
          </button>
        </div>
      )}
    </div>
  );
}