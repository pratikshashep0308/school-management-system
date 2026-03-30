// frontend/src/pages/Transport.js
// Complete Transport Module — Routes, Vehicles, Live Tracking, Transport Fees
// All in ONE page with tabs. Does NOT break existing routes feature.
import React, { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { transportAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState, StatCard } from '../components/ui';
import api from '../utils/api';

const vehicleAPI = {
  getAll: () => api.get('/transport/vehicles'),
  create: (d) => api.post('/transport/vehicles', d),
  update: (id, d) => api.put('/transport/vehicles/' + id, d),
  delete: (id) => api.delete('/transport/vehicles/' + id),
};
const transFeeAPI = {
  getAll: (p) => api.get('/transport/fees', { params: p }),
  create: (d) => api.post('/transport/fees', d),
  pay: (id, d) => api.put('/transport/fees/' + id + '/pay', d),
};

const TABS = [
  { id: 'routes', label: 'Routes', icon: '🗺️' },
  { id: 'vehicles', label: 'Vehicles', icon: '🚌' },
  { id: 'tracking', label: 'Live Tracking', icon: '📍' },
  { id: 'fees', label: 'Transport Fees', icon: '💰' },
];

export default function Transport() {
  const { can } = useAuth();
  const [tab, setTab] = useState('routes');
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);
  const canManage = can(['superAdmin', 'schoolAdmin', 'transportManager']);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r, v, f] = await Promise.allSettled([
        transportAPI.getAll(),
        vehicleAPI.getAll(),
        transFeeAPI.getAll(),
      ]);
      if (r.status === 'fulfilled') setRoutes(r.value.data.data || []);
      if (v.status === 'fulfilled') setVehicles(v.value.data.data || []);
      if (f.status === 'fulfilled') setFees(f.value.data.data || []);
    } catch { toast.error('Failed to load transport data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const activeVehicles = vehicles.filter(v => v.status === 'active').length;
  const totalStudents = routes.reduce((s, r) => s + (r.students?.length || 0), 0);
  const feeCollected = fees.filter(f => f.status === 'paid').reduce((s, f) => s + (f.amount || 0), 0);
  const feePending = fees.filter(f => f.status === 'pending').reduce((s, f) => s + (f.amount || 0), 0);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink dark:text-white">Transport Management</h2>
          <p className="text-sm text-muted mt-0.5">{routes.length} routes · {vehicles.length} vehicles</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="🗺️" value={routes.length} label="Active Routes" color="accent" />
        <StatCard icon="🚌" value={activeVehicles} label="Active Vehicles" color="blue" />
        <StatCard icon="👨‍🎓" value={totalStudents} label="Students Using Transport" color="sage" />
        <StatCard icon="💰" value={'₹' + feeCollected.toLocaleString('en-IN')} label="Fees Collected" color="gold" />
      </div>

      <div className="flex gap-1 p-1 rounded-2xl border border-border bg-warm dark:bg-gray-800 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ' + (tab === t.id ? 'bg-white dark:bg-gray-700 shadow-sm text-accent' : 'text-muted hover:text-ink dark:hover:text-white')}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingState /> : (
        <>
          {tab === 'routes' && <RoutesTab routes={routes} canManage={canManage} reload={loadAll} />}
          {tab === 'vehicles' && <VehiclesTab vehicles={vehicles} routes={routes} canManage={canManage} reload={loadAll} />}
          {tab === 'tracking' && <TrackingTab routes={routes} vehicles={vehicles} />}
          {tab === 'fees' && <FeesTab fees={fees} routes={routes} canManage={canManage} reload={loadAll} feeCollected={feeCollected} feePending={feePending} />}
        </>
      )}
    </div>
  );
}

// ── ROUTES TAB ────────────────────────────────────────────────────────────────
function RoutesTab({ routes, canManage, reload }) {
  const [modal, setModal] = useState({ open: false, data: null });
  // Use separate formData state so Save button always reads latest typed values
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  const openAdd  = () => { setFormData({}); setModal({ open: true, data: null }); };
  const openEdit = (r) => { setFormData({ ...r }); setModal({ open: true, data: r }); };

  const handleSave = async () => {
    if (!formData.routeName?.trim()) return toast.error('Route name is required');
    setSaving(true);
    try {
      if (formData._id) { await transportAPI.update(formData._id, formData); toast.success('Route updated'); }
      else { await transportAPI.create(formData); toast.success('Route added'); }
      setModal({ open: false, data: null }); setFormData({}); reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving route'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this route?')) return;
    try { await transportAPI.delete(id); toast.success('Route deleted'); reload(); }
    catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={openAdd}>+ Add Route</button>
        </div>
      )}
      {!routes.length ? <EmptyState icon="🗺️" title="No routes configured" desc="Add your first transport route to get started" /> : (
        <div className="flex flex-col gap-3">
          {routes.map((r, i) => {
            const colors = ['#d4522a', '#4a7c59', '#7c6af5', '#2d9cdb', '#c9a84c'];
            const c = colors[i % colors.length];
            return (
              <div key={r._id} className="card px-6 py-5 flex items-center gap-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: c + '18' }}>🚌</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-ink dark:text-white">{r.routeName}</span>
                    {r.routeNumber && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-warm dark:bg-gray-700 text-slate">{r.routeNumber}</span>}
                    <span className={'text-xs px-2 py-0.5 rounded-full font-semibold ' + (r.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {r.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="text-sm text-muted">
                    {r.vehicleNumber && <>Vehicle: <span className="text-slate font-medium">{r.vehicleNumber}</span></>}
                    {r.driver?.name && <> · Driver: <span className="text-slate font-medium">{r.driver.name}</span></>}
                    {r.driver?.phone && <> · 📞 {r.driver.phone}</>}
                  </div>
                  {r.stops?.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {r.stops.slice(0, 5).map((s, si) => (
                        <span key={si} className="text-[11px] px-2 py-0.5 rounded-full bg-warm dark:bg-gray-700 text-slate border border-border">
                          {s.time && s.time + ' · '}{s.name}
                        </span>
                      ))}
                      {r.stops.length > 5 && <span className="text-[11px] text-muted">+{r.stops.length - 5} more</span>}
                    </div>
                  )}
                </div>
                <div className="text-center hidden md:block flex-shrink-0">
                  <div className="font-display text-2xl text-ink dark:text-white">{r.stops?.length || 0}</div>
                  <div className="text-xs text-muted">Stops</div>
                </div>
                <div className="text-center hidden md:block flex-shrink-0">
                  <div className="font-display text-2xl text-ink dark:text-white">{r.students?.length || 0}</div>
                  <div className="text-xs text-muted">Students</div>
                </div>
                {canManage && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => openEdit(r)} className="w-8 h-8 rounded-lg border border-border text-slate hover:border-accent hover:text-accent transition-all flex items-center justify-center text-sm">✎</button>
                    <button onClick={() => handleDelete(r._id)} className="w-8 h-8 rounded-lg border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-all flex items-center justify-center text-sm">✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Modal isOpen={modal.open} onClose={() => { setModal({ open: false, data: null }); setFormData({}); }}
        title={formData._id ? 'Edit Route' : 'Add Transport Route'} size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => { setModal({ open: false, data: null }); setFormData({}); }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Route'}</button>
        </>}>
        {modal.open && <RouteForm data={formData} setData={setFormData} />}
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
      <FormGroup label="Route Name"><input className="form-input" value={d.routeName || ''} onChange={e => set('routeName', e.target.value)} placeholder="Route 1 — Kothrud" /></FormGroup>
      <FormGroup label="Route Number"><input className="form-input" value={d.routeNumber || ''} onChange={e => set('routeNumber', e.target.value)} placeholder="R01" /></FormGroup>
      <FormGroup label="Vehicle Number"><input className="form-input" value={d.vehicleNumber || ''} onChange={e => set('vehicleNumber', e.target.value)} placeholder="MH12 AB 1234" /></FormGroup>
      <FormGroup label="Vehicle Type">
        <select className="form-input" value={d.vehicleType || 'bus'} onChange={e => set('vehicleType', e.target.value)}>
          <option value="bus">Bus</option><option value="van">Van</option><option value="minibus">Mini Bus</option>
        </select>
      </FormGroup>
      <FormGroup label="Departure Time"><input className="form-input" value={d.departureTime || ''} onChange={e => set('departureTime', e.target.value)} placeholder="7:00 AM" /></FormGroup>
      <FormGroup label="Capacity"><input type="number" className="form-input" value={d.capacity || ''} onChange={e => set('capacity', e.target.value)} placeholder="40" /></FormGroup>
      <div className="col-span-2 border-t border-border pt-4 mt-1">
        <div className="text-sm font-semibold text-slate dark:text-gray-300 mb-3">Driver Details</div>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Driver Name"><input className="form-input" value={d.driver?.name || ''} onChange={e => setDriver('name', e.target.value)} placeholder="Prakash Yadav" /></FormGroup>
          <FormGroup label="Driver Phone"><input className="form-input" value={d.driver?.phone || ''} onChange={e => setDriver('phone', e.target.value)} placeholder="9876543210" /></FormGroup>
          <FormGroup label="License No"><input className="form-input" value={d.driver?.licenseNumber || ''} onChange={e => setDriver('licenseNumber', e.target.value)} placeholder="MH01-20100012345" /></FormGroup>
        </div>
      </div>
    </div>
  );
}

// ── VEHICLES TAB ──────────────────────────────────────────────────────────────
const VEHICLE_EMPTY = { registrationNo: '', type: 'bus', capacity: 40, driverName: '', driverPhone: '', assignedRoute: '', status: 'active' };

function VehiclesTab({ vehicles, routes, canManage, reload }) {
  const [modal, setModal] = useState({ open: false, data: null });
  const [form, setForm] = useState(VEHICLE_EMPTY);
  const [saving, setSaving] = useState(false);

  const openEdit = (v) => {
    setForm({ registrationNo: v.registrationNo, type: v.type, capacity: v.capacity, driverName: v.driverName || '', driverPhone: v.driverPhone || '', assignedRoute: v.assignedRoute || '', status: v.status });
    setModal({ open: true, data: v });
  };

  const handleSave = async () => {
    if (!form.registrationNo.trim()) return toast.error('Vehicle number is required');
    setSaving(true);
    try {
      if (modal.data?._id) { await vehicleAPI.update(modal.data._id, form); toast.success('Vehicle updated'); }
      else { await vehicleAPI.create(form); toast.success('Vehicle added'); }
      setModal({ open: false, data: null }); reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving vehicle'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this vehicle?')) return;
    try { await vehicleAPI.delete(id); toast.success('Vehicle removed'); reload(); }
    catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const statusColors = { active: 'bg-green-100 text-green-700', maintenance: 'bg-amber-100 text-amber-700', inactive: 'bg-gray-100 text-gray-500' };
  const typeIcons = { bus: '🚌', van: '🚐', minibus: '🚎', auto: '🛺' };

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => { setForm(VEHICLE_EMPTY); setModal({ open: true, data: null }); }}>+ Add Vehicle</button>
        </div>
      )}
      {!vehicles.length ? <EmptyState icon="🚌" title="No vehicles added" desc="Add your first vehicle to get started" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vehicles.map(v => (
            <div key={v._id} className="card p-5 space-y-3 hover:-translate-y-0.5 transition-transform">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-2xl">{typeIcons[v.type] || '🚌'}</div>
                  <div>
                    <p className="font-bold text-ink dark:text-white font-mono">{v.registrationNo}</p>
                    <p className="text-xs text-muted capitalize">{v.type} · {v.capacity} seats</p>
                  </div>
                </div>
                <span className={'text-xs font-semibold px-2.5 py-1 rounded-full ' + (statusColors[v.status] || statusColors.inactive)}>{v.status}</span>
              </div>
              <div className="space-y-1 text-sm">
                {v.driverName && <p className="text-muted">👨‍✈️ <span className="text-ink dark:text-white font-medium">{v.driverName}</span></p>}
                {v.driverPhone && <p className="text-muted">📞 {v.driverPhone}</p>}
                {v.assignedRoute && <p className="text-muted">🗺️ <span className="text-ink dark:text-white font-medium">{routes.find(r => r._id === v.assignedRoute)?.routeName || 'Route assigned'}</span></p>}
              </div>
              {canManage && (
                <div className="flex gap-2 pt-1 border-t border-border dark:border-gray-700">
                  <button onClick={() => openEdit(v)} className="flex-1 text-xs border border-border rounded-lg py-1.5 text-slate hover:border-accent hover:text-accent transition-all">✎ Edit</button>
                  <button onClick={() => handleDelete(v._id)} className="flex-1 text-xs border border-red-200 rounded-lg py-1.5 text-red-400 hover:border-red-400 hover:text-red-600 transition-all">✕ Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, data: null })}
        title={modal.data ? 'Edit Vehicle' : 'Add Vehicle'} size="md"
        footer={<><button className="btn-secondary" onClick={() => setModal({ open: false, data: null })}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Vehicle'}</button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Registration No *" className="col-span-2">
            <input className="form-input" value={form.registrationNo} onChange={e => setForm(f => ({ ...f, registrationNo: e.target.value }))} placeholder="MH12 AB 1234" />
          </FormGroup>
          <FormGroup label="Type">
            <select className="form-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {['bus', 'van', 'minibus', 'auto'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Capacity">
            <input type="number" className="form-input" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: +e.target.value }))} placeholder="40" />
          </FormGroup>
          <FormGroup label="Driver Name">
            <input className="form-input" value={form.driverName} onChange={e => setForm(f => ({ ...f, driverName: e.target.value }))} placeholder="Ramesh Kumar" />
          </FormGroup>
          <FormGroup label="Driver Phone">
            <input className="form-input" value={form.driverPhone} onChange={e => setForm(f => ({ ...f, driverPhone: e.target.value }))} placeholder="9876543210" />
          </FormGroup>
          <FormGroup label="Assign Route">
            <select className="form-input" value={form.assignedRoute} onChange={e => setForm(f => ({ ...f, assignedRoute: e.target.value }))}>
              <option value="">— No route —</option>
              {routes.map(r => <option key={r._id} value={r._id}>{r.routeName}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Status">
            <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {['active', 'maintenance', 'inactive'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </FormGroup>
        </div>
      </Modal>
    </div>
  );
}

// ── LIVE TRACKING TAB ─────────────────────────────────────────────────────────
function generateSimPath(stops) {
  if (!stops?.length) return [{ lat: 18.52, lng: 73.85, name: 'School' }];
  return stops.map((s, i) => ({ lat: 18.48 + i * 0.015 + (Math.random() * 0.004), lng: 73.82 + i * 0.012 + (Math.random() * 0.004), name: s.name }));
}

function TrackingTab({ routes, vehicles }) {
  const [selectedRoute, setSelectedRoute] = useState(routes[0]?._id || '');
  const [positions, setPositions] = useState({});
  const [simRunning, setSimRunning] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const intervalRef = useRef(null);
  const pathsRef = useRef({});

  useEffect(() => {
    vehicles.forEach(v => {
      const route = routes.find(r => r._id === (v.assignedRoute || routes[0]?._id));
      pathsRef.current[v._id] = generateSimPath(route?.stops || []);
      setPositions(p => ({ ...p, [v._id]: { ...pathsRef.current[v._id][0], stopIdx: 0 } }));
    });
  }, [vehicles, routes]);

  const toggleSim = () => {
    if (simRunning) {
      clearInterval(intervalRef.current);
      setSimRunning(false);
      return;
    }
    setSimRunning(true);
    intervalRef.current = setInterval(() => {
      setPositions(prev => {
        const next = { ...prev };
        vehicles.forEach(v => {
          const path = pathsRef.current[v._id] || [];
          if (!path.length) return;
          const current = prev[v._id] || { stopIdx: 0 };
          const nextIdx = (current.stopIdx + 1) % path.length;
          next[v._id] = { ...path[nextIdx], stopIdx: nextIdx };
          if (nextIdx === 0) setAlerts(a => [{ msg: v.registrationNo + ' completed route loop', time: new Date().toLocaleTimeString('en-IN') }, ...a].slice(0, 5));
        });
        return next;
      });
    }, 2500);
  };

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const activeVehicles = vehicles.filter(v => v.status === 'active');
  const route = routes.find(r => r._id === selectedRoute);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <select className="form-input w-56" value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)}>
          {routes.map(r => <option key={r._id} value={r._id}>{r.routeName}</option>)}
        </select>
        <button onClick={toggleSim}
          className={'px-5 py-2.5 rounded-xl text-sm font-bold transition-all ' + (simRunning ? 'bg-red-100 text-red-600 border border-red-200 hover:bg-red-200' : 'bg-accent text-white hover:bg-accent/90')}>
          {simRunning ? '⏹ Stop Simulation' : '▶ Start GPS Simulation'}
        </button>
        {simRunning && (
          <div className="flex items-center gap-2 text-sm text-green-600 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />LIVE — updating every 2.5s
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-5 py-3 border-b border-border dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-ink dark:text-white">🗺️ {route?.routeName || 'Route Map'}</h3>
            <span className="text-xs text-muted">Simulated GPS</span>
          </div>
          <div className="relative bg-slate-100 dark:bg-gray-800" style={{ height: 360 }}>
            <svg width="100%" height="100%" viewBox="0 0 600 360">
              {[60, 120, 180, 240, 300, 360].map(y => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#e2e8f0" strokeWidth="1" />)}
              {[100, 200, 300, 400, 500].map(x => <line key={x} x1={x} y1="0" x2={x} y2="360" stroke="#e2e8f0" strokeWidth="1" />)}
              {route?.stops?.length > 1 && (() => {
                const pts = route.stops.map((s, i) => (60 + (i / (route.stops.length - 1)) * 480) + ',' + (80 + (i % 3) * 80)).join(' ');
                return <polyline points={pts} fill="none" stroke="#d4522a" strokeWidth="3" strokeDasharray="8,4" opacity="0.6" />;
              })()}
              {route?.stops?.map((s, i) => {
                const x = 60 + (i / Math.max(route.stops.length - 1, 1)) * 480;
                const y = 80 + (i % 3) * 80;
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r="8" fill="white" stroke="#d4522a" strokeWidth="2" />
                    <text x={x} y={y + 20} textAnchor="middle" fontSize="10" fill="#64748b">{(s.name || '').slice(0, 10)}</text>
                  </g>
                );
              })}
              {activeVehicles.map((v, vi) => {
                const pos = positions[v._id];
                const path = pathsRef.current[v._id] || [];
                if (!pos || !path.length) return null;
                const idx = pos.stopIdx || 0;
                const x = 60 + (idx / Math.max(path.length - 1, 1)) * 480;
                const y = 80 + (idx % 3) * 80;
                const colors = ['#d4522a', '#4a7c59', '#7c6af5', '#2d9cdb'];
                const color = colors[vi % colors.length];
                return (
                  <g key={v._id}>
                    {simRunning && <circle cx={x} cy={y} r="18" fill={color} opacity="0.15"><animate attributeName="r" values="14;22;14" dur="2s" repeatCount="indefinite" /></circle>}
                    <circle cx={x} cy={y} r="14" fill={color} />
                    <text x={x} y={y + 5} textAnchor="middle" fontSize="13">🚌</text>
                    <text x={x} y={y - 20} textAnchor="middle" fontSize="9" fill={color} fontWeight="bold">{(v.registrationNo || '').slice(-6)}</text>
                  </g>
                );
              })}
            </svg>
            {!simRunning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/5">
                <div className="text-center">
                  <div className="text-4xl mb-2">🗺️</div>
                  <p className="text-sm text-muted font-medium">Click "Start GPS Simulation" to see vehicles move</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold text-ink dark:text-white text-sm uppercase tracking-wide">Vehicle Status</h3>
          {activeVehicles.length === 0 && <p className="text-sm text-muted">No active vehicles</p>}
          {activeVehicles.map((v, vi) => {
            const pos = positions[v._id];
            const path = pathsRef.current[v._id] || [];
            const stop = pos ? path[pos.stopIdx] : null;
            const nextStop = pos && pos.stopIdx < path.length - 1 ? path[pos.stopIdx + 1] : null;
            const colors = ['#d4522a', '#4a7c59', '#7c6af5', '#2d9cdb'];
            return (
              <div key={v._id} className="card p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm" style={{ background: colors[vi % colors.length] }}>🚌</div>
                  <div>
                    <p className="font-bold text-ink dark:text-white text-sm">{v.registrationNo}</p>
                    <p className="text-xs text-muted">{v.driverName || 'No driver'}</p>
                  </div>
                  {simRunning && <span className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                </div>
                {stop && <p className="text-xs text-muted">📍 At: <span className="text-ink dark:text-white font-medium">{stop.name || 'En route'}</span></p>}
                {nextStop && <p className="text-xs text-muted">➡️ Next: <span className="text-ink dark:text-white font-medium">{nextStop.name}</span> (~8 min)</p>}
              </div>
            );
          })}
          {alerts.length > 0 && (
            <div className="card p-4 space-y-2">
              <p className="text-xs font-bold text-muted uppercase">Activity Log</p>
              {alerts.map((a, i) => (
                <div key={i} className="text-xs text-muted border-l-2 border-accent pl-2">
                  <p className="text-ink dark:text-white">{a.msg}</p>
                  <p>{a.time}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── FEES TAB ──────────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FEE_EMPTY = { studentName: '', routeId: '', amount: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), status: 'pending' };

function FeesTab({ fees, routes, canManage, reload, feeCollected, feePending }) {
  const [modal, setModal] = useState({ open: false, data: null });
  const [form, setForm] = useState(FEE_EMPTY);
  const [payId, setPayId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? fees : fees.filter(f => f.status === filter);

  const handleSave = async () => {
    if (!form.studentName || !form.amount) return toast.error('Fill required fields');
    setSaving(true);
    try {
      await transFeeAPI.create({ ...form, amount: +form.amount });
      toast.success('Fee record created'); setModal({ open: false, data: null }); reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
    finally { setSaving(false); }
  };

  const handlePay = async (id) => {
    try { await transFeeAPI.pay(id, { status: 'paid', paidDate: new Date() }); toast.success('Marked as paid ✅'); setPayId(null); reload(); }
    catch { toast.error('Error updating payment'); }
  };

  const statusColors = { paid: 'bg-green-100 text-green-700', pending: 'bg-amber-100 text-amber-700', partial: 'bg-blue-100 text-blue-700' };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5 text-center">
          <div className="text-2xl font-display text-green-600">₹{feeCollected.toLocaleString('en-IN')}</div>
          <div className="text-xs text-muted mt-1">✅ Collected</div>
        </div>
        <div className="card p-5 text-center">
          <div className="text-2xl font-display text-amber-500">₹{feePending.toLocaleString('en-IN')}</div>
          <div className="text-xs text-muted mt-1">⏳ Pending</div>
        </div>
        <div className="card p-5 text-center">
          <div className="text-2xl font-display text-ink dark:text-white">{fees.length}</div>
          <div className="text-xs text-muted mt-1">📋 Total Records</div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl bg-warm dark:bg-gray-800 border border-border">
          {['all', 'pending', 'paid'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ' + (filter === f ? 'bg-white dark:bg-gray-700 shadow text-accent' : 'text-muted hover:text-ink dark:hover:text-white')}>
              {f}
            </button>
          ))}
        </div>
        {canManage && <button className="btn-primary ml-auto" onClick={() => { setForm(FEE_EMPTY); setModal({ open: true, data: null }); }}>+ Add Fee Record</button>}
      </div>

      {!filtered.length ? <EmptyState icon="💰" title="No fee records" desc={canManage ? 'Add fee records for students using transport' : 'No transport fees found'} /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-warm dark:bg-gray-800 border-b border-border dark:border-gray-700">
                <tr>
                  {['Student', 'Route', 'Month', 'Amount', 'Status', 'Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-gray-700">
                {filtered.map(f => (
                  <tr key={f._id} className="hover:bg-warm/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink dark:text-white">{f.studentName || '—'}</td>
                    <td className="px-4 py-3 text-muted">{routes.find(r => r._id === f.routeId)?.routeName || '—'}</td>
                    <td className="px-4 py-3 text-muted">{MONTHS[(f.month || 1) - 1]} {f.year}</td>
                    <td className="px-4 py-3 font-bold text-ink dark:text-white">₹{(f.amount || 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3">
                      <span className={'text-xs font-semibold px-2.5 py-1 rounded-full ' + (statusColors[f.status] || statusColors.pending)}>{f.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {f.status === 'pending' && canManage ? (
                        payId === f._id ? (
                          <div className="flex gap-2">
                            <button onClick={() => handlePay(f._id)} className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg font-semibold hover:bg-green-700">Confirm</button>
                            <button onClick={() => setPayId(null)} className="text-xs text-muted hover:text-ink">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setPayId(f._id)} className="text-xs border border-green-300 text-green-700 px-3 py-1 rounded-lg font-semibold hover:bg-green-50">💳 Mark Paid</button>
                        )
                      ) : (
                        <span className="text-xs text-muted">{f.paidDate ? 'Paid ' + new Date(f.paidDate).toLocaleDateString('en-IN') : '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, data: null })}
        title="Add Transport Fee Record" size="md"
        footer={<><button className="btn-secondary" onClick={() => setModal({ open: false, data: null })}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Add Record'}</button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Student Name *" className="col-span-2">
            <input className="form-input" value={form.studentName} onChange={e => setForm(f => ({ ...f, studentName: e.target.value }))} placeholder="Student full name" />
          </FormGroup>
          <FormGroup label="Route">
            <select className="form-input" value={form.routeId} onChange={e => setForm(f => ({ ...f, routeId: e.target.value }))}>
              <option value="">— Select route —</option>
              {routes.map(r => <option key={r._id} value={r._id}>{r.routeName}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Amount (₹) *">
            <input type="number" className="form-input" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="1200" />
          </FormGroup>
          <FormGroup label="Month">
            <select className="form-input" value={form.month} onChange={e => setForm(f => ({ ...f, month: +e.target.value }))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Year">
            <input type="number" className="form-input" value={form.year} onChange={e => setForm(f => ({ ...f, year: +e.target.value }))} />
          </FormGroup>
          <FormGroup label="Status" className="col-span-2">
            <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="pending">Pending</option><option value="paid">Paid</option><option value="partial">Partial</option>
            </select>
          </FormGroup>
        </div>
      </Modal>
    </div>
  );
}