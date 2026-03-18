import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { transportAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState } from '../components/ui';

export default function Transport() {
  const { isAdmin, can } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, data: null });

  const load = async () => {
    setLoading(true);
    try { const r = await transportAPI.getAll(); setRoutes(r.data.data); }
    catch { toast.error('Failed to load transport routes'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    try {
      if (form._id) { await transportAPI.update(form._id, form); toast.success('Route updated'); }
      else { await transportAPI.create(form); toast.success('Route added'); }
      setModal({ open: false, data: null }); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving route'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this route?')) return;
    try { await transportAPI.delete(id); toast.success('Route deleted'); load(); }
    catch { toast.error('Failed to delete route'); }
  };

  const canManage = can(['superAdmin','schoolAdmin','transportManager']);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Transport</h2>
          <p className="text-sm text-muted mt-0.5">{routes.length} routes operating</p>
        </div>
        {canManage && <button className="btn-primary" onClick={() => setModal({ open: true, data: null })}>+ Add Route</button>}
      </div>

      {loading ? <LoadingState /> : !routes.length ? <EmptyState icon="🚌" title="No routes configured" /> : (
        <div className="flex flex-col gap-4">
          {routes.map((r, i) => {
            const colors = ['#d4522a','#4a7c59','#7c6af5','#2d9cdb','#c9a84c'];
            const c = colors[i % colors.length];
            return (
              <div key={r._id} className="card px-6 py-5 flex items-center gap-6">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0" style={{ background: `${c}18` }}>🚌</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-ink text-lg">{r.routeName}</span>
                    {r.routeNumber && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-warm text-slate">{r.routeNumber}</span>}
                  </div>
                  <div className="text-sm text-muted">
                    Vehicle: <span className="text-slate font-medium">{r.vehicleNumber}</span>
                    {r.driver?.name && <> · Driver: <span className="text-slate font-medium">{r.driver.name}</span></>}
                    {r.driver?.phone && <> · 📞 {r.driver.phone}</>}
                  </div>
                  {r.stops?.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {r.stops.slice(0,5).map((s, si) => (
                        <span key={si} className="text-[11px] px-2 py-0.5 rounded-full bg-warm text-slate border border-border">
                          {s.time && `${s.time} · `}{s.name}
                        </span>
                      ))}
                      {r.stops.length > 5 && <span className="text-[11px] text-muted">+{r.stops.length - 5} more</span>}
                    </div>
                  )}
                </div>
                <div className="text-center hidden md:block">
                  <div className="font-display text-3xl text-ink">{r.stops?.length || 0}</div>
                  <div className="text-xs text-muted">Stops</div>
                </div>
                <div className="text-center hidden md:block">
                  <div className="font-display text-3xl text-ink">{r.students?.length || 0}</div>
                  <div className="text-xs text-muted">Students</div>
                </div>
                <div className="text-center hidden lg:block">
                  <div className="font-semibold text-ink">{r.departureTime || '—'}</div>
                  <div className="text-xs text-muted">Departure</div>
                </div>
                {canManage && (
                  <div className="flex gap-1.5">
                    <button onClick={() => setModal({ open: true, data: r })}
                      className="w-8 h-8 rounded-lg border border-border text-slate hover:border-accent hover:text-accent transition-all flex items-center justify-center text-sm">✎</button>
                    <button onClick={() => handleDelete(r._id)}
                      className="w-8 h-8 rounded-lg border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-all flex items-center justify-center text-sm">✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, data: null })}
        title={modal.data?._id ? 'Edit Route' : 'Add Transport Route'} size="lg"
        footer={<><button className="btn-secondary" onClick={() => setModal({ open: false, data: null })}>Cancel</button>
          <button className="btn-primary" onClick={() => handleSave(modal.data || {})}>Save Route</button></>}>
        {modal.open && <RouteForm data={modal.data} setData={d => setModal(p => ({ ...p, data: d }))} />}
      </Modal>
    </div>
  );
}

function RouteForm({ data, setData }) {
  const set = (k, v) => setData(p => ({ ...p, [k]: v }));
  const setDriver = (k, v) => setData(p => ({ ...p, driver: { ...(p.driver || {}), [k]: v } }));
  const d = data || {};
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormGroup label="Route Name"><input className="form-input" value={d.routeName || ''} onChange={e => set('routeName', e.target.value)} placeholder="Route 1 — Sector 45" /></FormGroup>
      <FormGroup label="Route Number"><input className="form-input" value={d.routeNumber || ''} onChange={e => set('routeNumber', e.target.value)} placeholder="R01" /></FormGroup>
      <FormGroup label="Vehicle Number"><input className="form-input" value={d.vehicleNumber || ''} onChange={e => set('vehicleNumber', e.target.value)} placeholder="HR26 AB 1234" /></FormGroup>
      <FormGroup label="Vehicle Type">
        <select className="form-input" value={d.vehicleType || 'bus'} onChange={e => set('vehicleType', e.target.value)}>
          <option value="bus">Bus</option><option value="van">Van</option><option value="minibus">Mini Bus</option>
        </select>
      </FormGroup>
      <FormGroup label="Departure Time"><input className="form-input" value={d.departureTime || ''} onChange={e => set('departureTime', e.target.value)} placeholder="7:00 AM" /></FormGroup>
      <FormGroup label="Capacity"><input type="number" className="form-input" value={d.capacity || ''} onChange={e => set('capacity', e.target.value)} placeholder="40" /></FormGroup>
      <div className="col-span-2 border-t border-border pt-4 mt-1">
        <div className="text-sm font-semibold text-slate mb-3">Driver Details</div>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Driver Name"><input className="form-input" value={d.driver?.name || ''} onChange={e => setDriver('name', e.target.value)} placeholder="Prakash Yadav" /></FormGroup>
          <FormGroup label="Driver Phone"><input className="form-input" value={d.driver?.phone || ''} onChange={e => setDriver('phone', e.target.value)} placeholder="9876543210" /></FormGroup>
          <FormGroup label="License Number"><input className="form-input" value={d.driver?.licenseNumber || ''} onChange={e => setDriver('licenseNumber', e.target.value)} placeholder="HR01-20100012345" /></FormGroup>
        </div>
      </div>
    </div>
  );
}
