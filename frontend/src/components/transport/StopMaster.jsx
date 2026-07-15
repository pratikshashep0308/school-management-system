// components/transport/StopMaster.jsx
// Stop Master — manage all bus stops in one place (add / edit / deactivate /
// restore / search). Stops belong to a route; each row shows how many students
// use it so staff know before deactivating.
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { routeAPI, stopAPI } from '../../utils/transportAPI';

const INP = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid #E5E7EB', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const LBL = { fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', display: 'block', marginBottom: 4 };

const EMPTY = {
  route: '', name: '', landmark: '', sequence: 1,
  morningArrivalTime: '', eveningArrivalTime: '',
  location: { lat: '', lng: '' },
};

export default function StopMaster() {
  const [stops,   setStops]   = useState([]);
  const [routes,  setRoutes]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [fRoute, setFRoute] = useState('');

  const [modal, setModal] = useState(null);   // null | {mode:'add'|'edit', data}
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.all([
        showInactive ? stopAPI.getAllWithInactive() : stopAPI.getAll(),
        routeAPI.getAll(),
      ]);
      setStops(sRes.data?.data || []);
      setRoutes(rRes.data?.data || []);
    } catch {
      toast.error('Failed to load stops');
    } finally { setLoading(false); }
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

  const routeName = (id) => {
    const r = routes.find(x => x._id === (id?._id || id));
    return r ? `${r.code ? r.code + ' — ' : ''}${r.name}` : '—';
  };

  const openAdd = () => setModal({ mode: 'add', data: { ...EMPTY } });
  const openEdit = (s) => setModal({ mode: 'edit', data: {
    _id: s._id, route: s.route?._id || s.route || '', name: s.name || '',
    landmark: s.landmark || '', sequence: s.sequence || 1,
    morningArrivalTime: s.morningArrivalTime || '', eveningArrivalTime: s.eveningArrivalTime || '',
    location: { lat: s.location?.lat ?? '', lng: s.location?.lng ?? '' },
  }});

  const save = async () => {
    const d = modal.data;
    if (!d.route) return toast.error('Select a route');
    if (!d.name.trim()) return toast.error('Stop name is required');
    if (!d.morningArrivalTime) return toast.error('Morning arrival time is required');
    setSaving(true);
    try {
      const payload = {
        route: d.route, name: d.name.trim(), landmark: d.landmark,
        sequence: Number(d.sequence) || 1,
        morningArrivalTime: d.morningArrivalTime,
        eveningArrivalTime: d.eveningArrivalTime || undefined,
        location: (d.location.lat || d.location.lng)
          ? { lat: Number(d.location.lat) || undefined, lng: Number(d.location.lng) || undefined }
          : undefined,
      };
      if (modal.mode === 'edit') await stopAPI.update(d._id, payload);
      else await stopAPI.create(payload);
      toast.success(modal.mode === 'edit' ? 'Stop updated' : 'Stop added');
      setModal(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save stop');
    } finally { setSaving(false); }
  };

  const deactivate = async (s) => {
    if (!window.confirm(`Deactivate stop "${s.name}"?`)) return;
    try { await stopAPI.delete(s._id); toast.success('Stop deactivated'); load(); }
    catch (e) { toast.error(e?.response?.data?.message || 'Failed to deactivate'); }
  };
  const restore = async (s) => {
    try { await stopAPI.restore(s._id); toast.success('Stop reactivated'); load(); }
    catch { toast.error('Failed to restore'); }
  };

  const q = search.trim().toLowerCase();
  const filtered = stops.filter(s => {
    if (fRoute && String(s.route?._id || s.route) !== fRoute) return false;
    if (!q) return true;
    return [s.name, s.landmark, routeName(s.route)].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header + filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...INP, width: 220 }} placeholder="🔍 Search stop / landmark…" value={search} onChange={e => setSearch(e.target.value)} />
          <select style={{ ...INP, width: 190 }} value={fRoute} onChange={e => setFRoute(e.target.value)}>
            <option value="">All Routes</option>
            {routes.map(r => <option key={r._id} value={r._id}>{r.code ? `${r.code} — ` : ''}{r.name}</option>)}
          </select>
          <label style={{ fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        </div>
        <button onClick={openAdd}
          style={{ padding: '10px 20px', borderRadius: 10, background: '#0B1F4A', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Add Stop
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ background: '#0B1F4A', padding: '11px 16px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>📍 Stop Master</span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{filtered.length} stops</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>⏳ Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
            <div style={{ fontSize: 34 }}>📍</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>No stops found.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  {['#', 'Stop', 'Route', 'Morning', 'Evening', 'Students', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr key={s._id} style={{ borderBottom: '1px solid #F3F4F6', background: s.isActive === false ? '#FEF9F5' : (i % 2 ? '#FAFAFA' : '#fff') }}>
                    <td style={{ padding: '10px 14px', color: '#9CA3AF' }}>{s.sequence ?? i + 1}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0B1F4A' }}>
                      {s.name}
                      {s.landmark && <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 400 }}>{s.landmark}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>{routeName(s.route)}</td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{s.morningArrivalTime || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{s.eveningArrivalTime || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: s.studentCount ? '#DCFCE7' : '#F3F4F6', color: s.studentCount ? '#166534' : '#9CA3AF' }}>
                        {s.studentCount || 0}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: s.isActive === false ? '#FEE2E2' : '#DCFCE7', color: s.isActive === false ? '#B91C1C' : '#166534' }}>
                        {s.isActive === false ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(s)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✎ Edit</button>
                        {s.isActive === false ? (
                          <button onClick={() => restore(s)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>↻ Restore</button>
                        ) : (
                          <button onClick={() => deactivate(s)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Deactivate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, marginTop: 40, overflow: 'hidden' }}>
            <div style={{ background: '#0B1F4A', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{modal.mode === 'edit' ? '✎ Edit Stop' : '+ Add Stop'}</span>
              <button onClick={() => setModal(null)} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LBL}>Route *</label>
                <select style={INP} value={modal.data.route} onChange={e => setModal(m => ({ ...m, data: { ...m.data, route: e.target.value } }))}>
                  <option value="">Select route…</option>
                  {routes.map(r => <option key={r._id} value={r._id}>{r.code ? `${r.code} — ` : ''}{r.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LBL}>Stop Name *</label>
                <input style={INP} value={modal.data.name} onChange={e => setModal(m => ({ ...m, data: { ...m.data, name: e.target.value } }))} placeholder="e.g. Hatmoida" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LBL}>Landmark</label>
                <input style={INP} value={modal.data.landmark} onChange={e => setModal(m => ({ ...m, data: { ...m.data, landmark: e.target.value } }))} placeholder="Near temple, main road…" />
              </div>
              <div>
                <label style={LBL}>Sequence</label>
                <input type="number" style={INP} value={modal.data.sequence} onChange={e => setModal(m => ({ ...m, data: { ...m.data, sequence: e.target.value } }))} />
              </div>
              <div />
              <div>
                <label style={LBL}>Morning Arrival *</label>
                <input type="time" style={INP} value={modal.data.morningArrivalTime} onChange={e => setModal(m => ({ ...m, data: { ...m.data, morningArrivalTime: e.target.value } }))} />
              </div>
              <div>
                <label style={LBL}>Evening Arrival</label>
                <input type="time" style={INP} value={modal.data.eveningArrivalTime} onChange={e => setModal(m => ({ ...m, data: { ...m.data, eveningArrivalTime: e.target.value } }))} />
              </div>
              <div>
                <label style={LBL}>Latitude (optional)</label>
                <input style={INP} value={modal.data.location.lat} onChange={e => setModal(m => ({ ...m, data: { ...m.data, location: { ...m.data.location, lat: e.target.value } } }))} />
              </div>
              <div>
                <label style={LBL}>Longitude (optional)</label>
                <input style={INP} value={modal.data.location.lng} onChange={e => setModal(m => ({ ...m, data: { ...m.data, location: { ...m.data.location, lng: e.target.value } } }))} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button onClick={() => setModal(null)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button onClick={save} disabled={saving} style={{ padding: '10px 24px', borderRadius: 10, background: '#0B1F4A', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? '⏳ Saving…' : (modal.mode === 'edit' ? '💾 Update' : '+ Save Stop')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}