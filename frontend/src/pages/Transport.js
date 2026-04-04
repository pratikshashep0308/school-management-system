// frontend/src/pages/Transport.js
// Advanced Transport Management — Admin + Student/Parent portal views
import React, { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState, StatCard } from '../components/ui';

// ─── API helpers ─────────────────────────────────────────────────────────────
const routeAPI = {
  getAll:  ()         => api.get('/transport/routes'),
  create:  (d)        => api.post('/transport/routes', d),
  update:  (id, d)    => api.put('/transport/routes/' + id, d),
  delete:  (id)       => api.delete('/transport/routes/' + id),
};
const vehicleAPI = {
  getAll:  ()         => api.get('/transport/vehicles'),
  create:  (d)        => api.post('/transport/vehicles', d),
  update:  (id, d)    => api.put('/transport/vehicles/' + id, d),
  delete:  (id)       => api.delete('/transport/vehicles/' + id),
};
const allocationAPI = {
  getAll:  (p)        => api.get('/transport/allocations', { params: p }),
  assign:  (d)        => api.post('/transport/allocations', d),
  remove:  (id)       => api.delete('/transport/allocations/' + id),
};
const transFeeAPI = {
  getAll:  (p)        => api.get('/transport/fees', { params: p }),
  generate:(d)        => api.post('/transport/fees/generate', d),
  pay:     (id, d)    => api.post('/transport/fees/' + id + '/payment', d),
};
const studentAPI = {
  getAll:  ()         => api.get('/students'),
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ROUTE_COLORS = ['#e87722','#4a7c59','#7c6af5','#2d9cdb','#c9a84c','#d4522a','#0284c7'];

// ─── Main component ───────────────────────────────────────────────────────────
export default function Transport() {
  const { user, can } = useAuth();
  const isPortalUser  = user?.role === 'student' || user?.role === 'parent';
  const canManage     = can(['superAdmin', 'schoolAdmin', 'transportManager']);

  if (isPortalUser) return <StudentTransportView />;
  return <AdminTransportView canManage={canManage} />;
}

// ═════════════════════════════════════════════════════════════════════════════
// STUDENT / PARENT VIEW — shows only their own route
// ═════════════════════════════════════════════════════════════════════════════
function StudentTransportView() {
  const [transport, setTransport] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [simRunning, setSimRunning] = useState(false);
  const [busPosition, setBusPosition] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    api.get('/student-portal/dashboard')
      .then(r => setTransport(r.data.data?.transport || null))
      .catch(() => toast.error('Failed to load transport info'))
      .finally(() => setLoading(false));
  }, []);

  const toggleSim = () => {
    if (simRunning) {
      clearInterval(intervalRef.current);
      setSimRunning(false);
      return;
    }
    setSimRunning(true);
    setBusPosition(0);
    intervalRef.current = setInterval(() => {
      setBusPosition(p => {
        const stops = transport?.stops?.length || 5;
        if (p >= stops - 1) { clearInterval(intervalRef.current); setSimRunning(false); return 0; }
        return p + 1;
      });
    }, 3000);
  };

  useEffect(() => () => clearInterval(intervalRef.current), []);

  if (loading) return <LoadingState />;

  if (!transport) return (
    <div className="animate-fade-in space-y-5">
      <div className="page-header">
        <h2 className="font-display text-2xl text-ink dark:text-white">🚌 My Transport</h2>
      </div>
      <div className="card py-20 text-center">
        <div className="text-6xl mb-4">🚌</div>
        <div className="font-semibold text-lg text-ink dark:text-white mb-2">No Transport Assigned</div>
        <p className="text-sm text-muted max-w-sm mx-auto">
          You are not currently assigned to any transport route. Contact the school administration to get assigned.
        </p>
      </div>
    </div>
  );

  const stops = transport.stops || [];
  const currentStop = stops[busPosition];
  const nextStop    = stops[busPosition + 1];
  const progress    = stops.length > 1 ? Math.round((busPosition / (stops.length - 1)) * 100) : 0;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink dark:text-white">🚌 My Transport</h2>
          <p className="text-sm text-muted mt-0.5">Your assigned route and live tracking</p>
        </div>
        {simRunning && (
          <div className="flex items-center gap-2 text-sm text-green-600 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            LIVE TRACKING
          </div>
        )}
      </div>

      {/* Route Info Card */}
      <div className="card p-6">
        <div className="flex items-center gap-5 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center text-4xl flex-shrink-0">🚌</div>
          <div className="flex-1">
            <h3 className="font-bold text-xl text-ink dark:text-white">{transport.routeName}</h3>
            <p className="text-sm text-muted">
              {transport.routeNumber && `Route ${transport.routeNumber} · `}
              {transport.vehicleType && transport.vehicleType.charAt(0).toUpperCase() + transport.vehicleType.slice(1)}
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-green-100 text-green-700">Active</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          {[
            { icon: '🧑‍✈️', label: 'Driver',       value: transport.driverName },
            { icon: '📞', label: 'Driver Phone',  value: transport.driverPhone },
            { icon: '📍', label: 'My Stop',       value: transport.stopName },
            { icon: '🌅', label: 'Departure',     value: transport.departureTime },
            { icon: '🌆', label: 'Arrival',       value: transport.arrivalTime },
            { icon: '🚐', label: 'Vehicle No.',   value: transport.vehicleNumber },
            { icon: '💰', label: 'Monthly Fee',   value: transport.feePerMonth ? `₹${transport.feePerMonth.toLocaleString('en-IN')}` : null },
          ].filter(i => i.value).map(item => (
            <div key={item.label} className="bg-warm dark:bg-gray-800 rounded-xl p-4">
              <p className="text-xs text-muted mb-1">{item.icon} {item.label}</p>
              <p className="font-semibold text-sm text-ink dark:text-white">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Live Tracker */}
        {stops.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm text-ink dark:text-white">📍 Route Progress</h4>
              <button
                onClick={toggleSim}
                className={'text-xs font-bold px-4 py-1.5 rounded-lg transition-all ' +
                  (simRunning
                    ? 'bg-red-100 text-red-600 border border-red-200 hover:bg-red-200'
                    : 'bg-accent text-white hover:bg-accent/90')}
              >
                {simRunning ? '⏹ Stop' : '▶ Simulate Live'}
              </button>
            </div>

            {/* Progress bar */}
            <div className="relative mb-4">
              <div className="h-2 bg-warm dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted">{stops[0]?.name}</span>
                <span className="text-xs font-bold text-accent">{progress}%</span>
                <span className="text-xs text-muted">{stops[stops.length - 1]?.name}</span>
              </div>
            </div>

            {/* Stop timeline */}
            <div className="space-y-2">
              {stops.map((stop, idx) => {
                const isPast    = idx < busPosition;
                const isCurrent = idx === busPosition;
                const isMyStop  = stop.name === transport.stopName;
                return (
                  <div key={idx} className={'flex items-center gap-3 p-2.5 rounded-xl transition-all ' +
                    (isCurrent ? 'bg-accent/10 border border-accent/20' :
                     isMyStop  ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200' : '')}>
                    <div className={'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ' +
                      (isCurrent ? 'bg-accent text-white' :
                       isPast    ? 'bg-green-500 text-white' :
                       isMyStop  ? 'bg-purple-500 text-white' : 'bg-warm dark:bg-gray-700 text-muted')}>
                      {isCurrent ? '🚌' : isPast ? '✓' : idx + 1}
                    </div>
                    <div className="flex-1">
                      <span className={'text-sm font-semibold ' +
                        (isCurrent ? 'text-accent' : isPast ? 'text-muted line-through' : 'text-ink dark:text-white')}>
                        {stop.name}
                      </span>
                      {isMyStop && <span className="ml-2 text-[10px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full">MY STOP</span>}
                    </div>
                    {stop.time && <span className="text-xs text-muted flex-shrink-0">{stop.time}</span>}
                    {isCurrent && simRunning && <span className="text-xs text-accent font-bold animate-pulse">NOW</span>}
                  </div>
                );
              })}
            </div>

            {simRunning && currentStop && (
              <div className="mt-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200">
                <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                  🚌 Bus is at: {currentStop.name}
                </p>
                {nextStop && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                    Next stop: {nextStop.name} {nextStop.time ? `at ${nextStop.time}` : '(~3 min)'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Safety reminder */}
      <div className="card p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200">
        <p className="font-semibold text-amber-700 dark:text-amber-300 text-sm">🔔 Reminder</p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          Please be at your stop 5 minutes before departure time.
          Save the driver's number for emergencies: <strong>{transport.driverPhone || 'Contact school'}</strong>
        </p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN / STAFF VIEW — full management
// ═════════════════════════════════════════════════════════════════════════════
const ADMIN_TABS = [
  { id: 'routes',      label: 'Routes',      icon: '🗺️' },
  { id: 'vehicles',    label: 'Vehicles',    icon: '🚌' },
  { id: 'allocations', label: 'Allocations', icon: '👨‍🎓' },
  { id: 'tracking',    label: 'Live Track',  icon: '📍' },
  { id: 'fees',        label: 'Fees',        icon: '💰' },
];

function AdminTransportView({ canManage }) {
  const [tab, setTab]           = useState('routes');
  const [routes, setRoutes]     = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [fees, setFees]         = useState([]);
  const [loading, setLoading]   = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [r, v, a, f] = await Promise.allSettled([
      routeAPI.getAll(),
      vehicleAPI.getAll(),
      allocationAPI.getAll(),
      transFeeAPI.getAll(),
    ]);
    if (r.status === 'fulfilled') setRoutes(r.value.data.data || []);
    if (v.status === 'fulfilled') setVehicles(v.value.data.data || []);
    if (a.status === 'fulfilled') setAllocations(a.value.data.data || []);
    if (f.status === 'fulfilled') setFees(f.value.data.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const totalStudents  = allocations.length;
  const activeVehicles = vehicles.filter(v => v.status === 'active').length;
  const feePending     = fees.filter(f => f.status === 'pending').reduce((s, f) => s + (f.amount || 0), 0);
  const feeCollected   = fees.filter(f => f.status === 'paid').reduce((s, f) => s + (f.amount || 0), 0);

  return (
    <div className="animate-fade-in space-y-5">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink dark:text-white">Transport Management</h2>
          <p className="text-sm text-muted mt-0.5">{routes.length} routes · {vehicles.length} vehicles · {totalStudents} students</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="🗺️" value={routes.length}       label="Routes"           color="accent" />
        <StatCard icon="🚌" value={activeVehicles}       label="Active Vehicles"  color="blue" />
        <StatCard icon="👨‍🎓" value={totalStudents}       label="Students"         color="sage" />
        <StatCard icon="💰" value={`₹${feeCollected.toLocaleString('en-IN')}`} label="Fees Collected" color="gold" />
      </div>

      <div className="flex gap-1 p-1 rounded-2xl border border-border bg-warm dark:bg-gray-800 w-fit overflow-x-auto">
        {ADMIN_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ' +
              (tab === t.id ? 'bg-white dark:bg-gray-700 shadow-sm text-accent' : 'text-muted hover:text-ink dark:hover:text-white')}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingState /> : (
        <>
          {tab === 'routes'      && <RoutesTab      routes={routes} canManage={canManage} reload={loadAll} />}
          {tab === 'vehicles'    && <VehiclesTab    vehicles={vehicles} routes={routes} canManage={canManage} reload={loadAll} />}
          {tab === 'allocations' && <AllocationsTab allocations={allocations} routes={routes} vehicles={vehicles} canManage={canManage} reload={loadAll} />}
          {tab === 'tracking'    && <TrackingTab    routes={routes} vehicles={vehicles} allocations={allocations} />}
          {tab === 'fees'        && <FeesTab        fees={fees} routes={routes} allocations={allocations} canManage={canManage} reload={loadAll} feeCollected={feeCollected} feePending={feePending} />}
        </>
      )}
    </div>
  );
}

// ─── ROUTES TAB ───────────────────────────────────────────────────────────────
function RoutesTab({ routes, canManage, reload }) {
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState({});
  const [stops, setStops]   = useState([]);
  const [saving, setSaving] = useState(false);

  const openAdd  = () => { setForm({}); setStops([]); setModal(true); };
  const openEdit = (r) => {
    setForm({ ...r });
    setStops(r.stops ? r.stops.map(s => ({ ...s })) : []);
    setModal(true);
  };
  const closeModal = () => { setModal(false); setForm({}); setStops([]); };

  const addStop = () => setStops(s => [...s, { name: '', time: '', order: s.length + 1 }]);
  const removeStop = (i) => setStops(s => s.filter((_, idx) => idx !== i));
  const updateStop = (i, k, v) => setStops(s => s.map((stop, idx) => idx === i ? { ...stop, [k]: v } : stop));

  const handleSave = async () => {
    if (!form.routeName?.trim()) return toast.error('Route name is required');
    setSaving(true);
    try {
      const payload = { ...form, stops: stops.filter(s => s.name?.trim()) };
      if (form._id) { await routeAPI.update(form._id, payload); toast.success('Route updated'); }
      else          { await routeAPI.create(payload);            toast.success('Route added ✅'); }
      closeModal(); reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving route'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this route? Students assigned to it will lose their allocation.')) return;
    try { await routeAPI.delete(id); toast.success('Route deleted'); reload(); }
    catch (err) { toast.error(err.response?.data?.message || 'Cannot delete route'); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setDriver = (k, v) => setForm(f => ({ ...f, driver: { ...(f.driver || {}), [k]: v } }));

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={openAdd}>+ Add Route</button>
        </div>
      )}

      {!routes.length ? (
        <EmptyState icon="🗺️" title="No routes configured" subtitle="Add your first transport route to get started" />
      ) : (
        <div className="space-y-3">
          {routes.map((r, i) => {
            const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
            return (
              <div key={r._id} className="card px-6 py-5 flex items-start gap-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: color + '18', border: `2px solid ${color}30` }}>🚌</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-ink dark:text-white">{r.routeName}</span>
                    {r.routeNumber && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-warm dark:bg-gray-700 text-muted">{r.routeNumber}</span>}
                    <span className={'text-xs px-2 py-0.5 rounded-full font-semibold ' + (r.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {r.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="text-sm text-muted space-x-3">
                    {r.vehicleNumber && <span>🚌 {r.vehicleNumber}</span>}
                    {r.driver?.name  && <span>🧑‍✈️ {r.driver.name}</span>}
                    {r.driver?.phone && <span>📞 {r.driver.phone}</span>}
                    {r.departureTime && <span>🌅 {r.departureTime}</span>}
                    {r.capacity      && <span>💺 {r.capacity} seats</span>}
                  </div>
                  {r.stops?.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap items-center">
                      <span className="text-[10px] text-muted uppercase font-bold">Stops:</span>
                      {r.stops.slice(0, 6).map((s, si) => (
                        <span key={si} className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-warm dark:bg-gray-800 text-slate">
                          {s.time && <span className="text-muted">{s.time} · </span>}{s.name}
                        </span>
                      ))}
                      {r.stops.length > 6 && <span className="text-[11px] text-muted">+{r.stops.length - 6} more</span>}
                    </div>
                  )}
                </div>
                <div className="hidden md:flex flex-col items-center gap-3 flex-shrink-0">
                  <div className="text-center">
                    <div className="font-display text-xl text-ink dark:text-white">{r.stops?.length || 0}</div>
                    <div className="text-[10px] text-muted uppercase">Stops</div>
                  </div>
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

      <Modal isOpen={modal} onClose={closeModal} title={form._id ? 'Edit Route' : 'Add Transport Route'} size="lg"
        footer={<>
          <button className="btn-secondary" onClick={closeModal}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : form._id ? 'Update Route' : 'Create Route'}</button>
        </>}>
        <div className="space-y-5">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <FormGroup label="Route Name *" className="col-span-2">
              <input className="form-input" value={form.routeName || ''} onChange={e => set('routeName', e.target.value)} placeholder="Morning Route — Kothrud to School" />
            </FormGroup>
            <FormGroup label="Route Number">
              <input className="form-input" value={form.routeNumber || ''} onChange={e => set('routeNumber', e.target.value)} placeholder="R01" />
            </FormGroup>
            <FormGroup label="Vehicle Number">
              <input className="form-input" value={form.vehicleNumber || ''} onChange={e => set('vehicleNumber', e.target.value)} placeholder="MH12 AB 1234" />
            </FormGroup>
            <FormGroup label="Vehicle Type">
              <select className="form-input" value={form.vehicleType || 'bus'} onChange={e => set('vehicleType', e.target.value)}>
                <option value="bus">Bus</option>
                <option value="van">Van</option>
                <option value="minibus">Mini Bus</option>
              </select>
            </FormGroup>
            <FormGroup label="Capacity">
              <input type="number" className="form-input" value={form.capacity || ''} onChange={e => set('capacity', +e.target.value)} placeholder="40" />
            </FormGroup>
            <FormGroup label="Departure Time">
              <input className="form-input" value={form.departureTime || ''} onChange={e => set('departureTime', e.target.value)} placeholder="7:00 AM" />
            </FormGroup>
            <FormGroup label="Arrival Time">
              <input className="form-input" value={form.arrivalTime || ''} onChange={e => set('arrivalTime', e.target.value)} placeholder="3:30 PM" />
            </FormGroup>
          </div>

          {/* Driver */}
          <div className="border-t border-border dark:border-gray-700 pt-4">
            <p className="text-sm font-bold text-slate dark:text-gray-300 mb-3">🧑‍✈️ Driver Details</p>
            <div className="grid grid-cols-3 gap-4">
              <FormGroup label="Driver Name">
                <input className="form-input" value={form.driver?.name || ''} onChange={e => setDriver('name', e.target.value)} placeholder="Ramesh Kumar" />
              </FormGroup>
              <FormGroup label="Driver Phone">
                <input className="form-input" value={form.driver?.phone || ''} onChange={e => setDriver('phone', e.target.value)} placeholder="9876543210" />
              </FormGroup>
              <FormGroup label="License No.">
                <input className="form-input" value={form.driver?.licenseNumber || ''} onChange={e => setDriver('licenseNumber', e.target.value)} placeholder="MH01-20100012345" />
              </FormGroup>
            </div>
          </div>

          {/* Stops */}
          <div className="border-t border-border dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate dark:text-gray-300">📍 Stops ({stops.length})</p>
              <button type="button" onClick={addStop} className="text-xs font-bold text-accent hover:underline">+ Add Stop</button>
            </div>
            {stops.length === 0 && (
              <p className="text-xs text-muted italic">No stops added yet. Click "+ Add Stop" to add pickup/drop points.</p>
            )}
            <div className="space-y-2">
              {stops.map((stop, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                  <input className="form-input flex-1" value={stop.name} onChange={e => updateStop(idx, 'name', e.target.value)} placeholder={`Stop ${idx + 1} name`} />
                  <input className="form-input w-24" value={stop.time} onChange={e => updateStop(idx, 'time', e.target.value)} placeholder="7:15 AM" />
                  <button type="button" onClick={() => removeStop(idx)} className="text-red-400 hover:text-red-600 text-lg leading-none flex-shrink-0">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── VEHICLES TAB ─────────────────────────────────────────────────────────────
const VEHICLE_EMPTY = { registrationNo: '', type: 'bus', capacity: 40, driverName: '', driverPhone: '', assignedRoute: '', status: 'active' };

function VehiclesTab({ vehicles, routes, canManage, reload }) {
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(VEHICLE_EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const openEdit = (v) => {
    setForm({ registrationNo: v.registrationNo, type: v.type, capacity: v.capacity, driverName: v.driverName || '', driverPhone: v.driverPhone || '', assignedRoute: v.assignedRoute || '', status: v.status });
    setEditId(v._id); setModal(true);
  };

  const handleSave = async () => {
    if (!form.registrationNo.trim()) return toast.error('Vehicle registration number is required');
    setSaving(true);
    try {
      if (editId) { await vehicleAPI.update(editId, form); toast.success('Vehicle updated'); }
      else        { await vehicleAPI.create(form);         toast.success('Vehicle added'); }
      setModal(false); setEditId(null); setForm(VEHICLE_EMPTY); reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving vehicle'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this vehicle?')) return;
    try { await vehicleAPI.delete(id); toast.success('Vehicle removed'); reload(); }
    catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const statusColors = { active: 'bg-green-100 text-green-700', maintenance: 'bg-amber-100 text-amber-700', inactive: 'bg-gray-100 text-gray-500' };
  const typeIcons    = { bus: '🚌', van: '🚐', minibus: '🚎', auto: '🛺' };

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => { setForm(VEHICLE_EMPTY); setEditId(null); setModal(true); }}>+ Add Vehicle</button>
        </div>
      )}
      {!vehicles.length ? <EmptyState icon="🚌" title="No vehicles added" subtitle="Add vehicles to assign to routes" /> : (
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
                {v.driverName  && <p className="text-muted">🧑‍✈️ <span className="text-ink dark:text-white font-medium">{v.driverName}</span></p>}
                {v.driverPhone && <p className="text-muted">📞 {v.driverPhone}</p>}
                {v.assignedRoute && <p className="text-muted">🗺️ <span className="text-ink dark:text-white font-medium">{routes.find(r => r._id === (v.assignedRoute?._id || v.assignedRoute))?.routeName || 'Assigned'}</span></p>}
              </div>
              {canManage && (
                <div className="flex gap-2 pt-1 border-t border-border dark:border-gray-700">
                  <button onClick={() => openEdit(v)} className="flex-1 text-xs border border-border rounded-lg py-1.5 text-slate hover:border-accent hover:text-accent transition-all">✎ Edit</button>
                  <button onClick={() => handleDelete(v._id)} className="flex-1 text-xs border border-red-200 rounded-lg py-1.5 text-red-400 hover:border-red-400 hover:text-red-600 transition-all">✕ Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modal} onClose={() => { setModal(false); setEditId(null); }} title={editId ? 'Edit Vehicle' : 'Add Vehicle'} size="md"
        footer={<><button className="btn-secondary" onClick={() => { setModal(false); setEditId(null); }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Vehicle'}</button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Registration No. *" className="col-span-2">
            <input className="form-input" value={form.registrationNo} onChange={e => setForm(f => ({ ...f, registrationNo: e.target.value }))} placeholder="MH12 AB 1234" />
          </FormGroup>
          <FormGroup label="Type">
            <select className="form-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {['bus','van','minibus','auto'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Capacity (seats)">
            <input type="number" className="form-input" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: +e.target.value }))} />
          </FormGroup>
          <FormGroup label="Driver Name">
            <input className="form-input" value={form.driverName} onChange={e => setForm(f => ({ ...f, driverName: e.target.value }))} placeholder="Ramesh Kumar" />
          </FormGroup>
          <FormGroup label="Driver Phone">
            <input className="form-input" value={form.driverPhone} onChange={e => setForm(f => ({ ...f, driverPhone: e.target.value }))} placeholder="9876543210" />
          </FormGroup>
          <FormGroup label="Assign to Route">
            <select className="form-input" value={form.assignedRoute} onChange={e => setForm(f => ({ ...f, assignedRoute: e.target.value }))}>
              <option value="">— No route —</option>
              {routes.map(r => <option key={r._id} value={r._id}>{r.routeName}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Status">
            <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {['active','maintenance','inactive'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </FormGroup>
        </div>
      </Modal>
    </div>
  );
}

// ─── ALLOCATIONS TAB ──────────────────────────────────────────────────────────
function AllocationsTab({ allocations, routes, vehicles, canManage, reload }) {
  const [modal, setModal]     = useState(false);
  const [students, setStudents] = useState([]);
  const [form, setForm]       = useState({ student: '', route: '', vehicle: '', stopName: '', feePerMonth: '' });
  const [saving, setSaving]   = useState(false);
  const [filterRoute, setFilterRoute] = useState('');

  useEffect(() => {
    if (modal) studentAPI.getAll().then(r => setStudents(r.data.data || [])).catch(() => {});
  }, [modal]);

  const handleAssign = async () => {
    if (!form.student || !form.route) return toast.error('Student and route are required');
    setSaving(true);
    try {
      await allocationAPI.assign({ ...form, feePerMonth: form.feePerMonth ? +form.feePerMonth : undefined });
      toast.success('Student assigned to route ✅');
      setModal(false);
      setForm({ student: '', route: '', vehicle: '', stopName: '', feePerMonth: '' });
      reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Error assigning student'); }
    finally { setSaving(false); }
  };

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this student from their route?')) return;
    try { await allocationAPI.remove(id); toast.success('Removed'); reload(); }
    catch { toast.error('Error removing allocation'); }
  };

  const filtered = filterRoute ? allocations.filter(a => (a.route?._id || a.route) === filterRoute) : allocations;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select className="form-input w-48" value={filterRoute} onChange={e => setFilterRoute(e.target.value)}>
          <option value="">All Routes</option>
          {routes.map(r => <option key={r._id} value={r._id}>{r.routeName}</option>)}
        </select>
        <span className="text-sm text-muted">{filtered.length} students assigned</span>
        {canManage && (
          <button className="btn-primary ml-auto" onClick={() => setModal(true)}>+ Assign Student</button>
        )}
      </div>

      {!filtered.length ? (
        <EmptyState icon="👨‍🎓" title="No allocations" subtitle={filterRoute ? 'No students on this route' : 'Assign students to routes to get started'} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-warm dark:bg-gray-800 border-b border-border dark:border-gray-700">
              <tr>
                {['Student', 'Class', 'Route', 'Stop', 'Vehicle', 'Fee/Month', 'Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-gray-700">
              {filtered.map(a => {
                const studentName = a.student?.user?.name || a.student?.name || '—';
                const className   = a.student?.class?.name ? `${a.student.class.name} ${a.student.class.section || ''}` : '—';
                const routeName   = a.route?.routeName || routes.find(r => r._id === a.route)?.routeName || '—';
                const vehicleName = a.vehicle?.registrationNo || '—';
                return (
                  <tr key={a._id} className="hover:bg-warm/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink dark:text-white">{studentName}</td>
                    <td className="px-4 py-3 text-muted">{className}</td>
                    <td className="px-4 py-3 text-muted">{routeName}</td>
                    <td className="px-4 py-3 text-muted">{a.stopName || '—'}</td>
                    <td className="px-4 py-3 text-muted font-mono text-xs">{vehicleName}</td>
                    <td className="px-4 py-3 font-semibold text-ink dark:text-white">
                      {a.feePerMonth ? `₹${a.feePerMonth.toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {canManage && (
                        <button onClick={() => handleRemove(a._id)} className="text-xs border border-red-200 text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">Remove</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Assign Student to Route" size="md"
        footer={<><button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleAssign} disabled={saving}>{saving ? 'Assigning…' : 'Assign'}</button></>}>
        <div className="space-y-4">
          <FormGroup label="Student *">
            <select className="form-input" value={form.student} onChange={e => setForm(f => ({ ...f, student: e.target.value }))}>
              <option value="">— Select student —</option>
              {students.map(s => <option key={s._id} value={s._id}>{s.user?.name} — {s.class?.name} {s.class?.section}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Route *">
            <select className="form-input" value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))}>
              <option value="">— Select route —</option>
              {routes.map(r => <option key={r._id} value={r._id}>{r.routeName}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Vehicle">
            <select className="form-input" value={form.vehicle} onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))}>
              <option value="">— Select vehicle —</option>
              {vehicles.map(v => <option key={v._id} value={v._id}>{v.registrationNo} ({v.type})</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Student's Stop Name">
            <input className="form-input" value={form.stopName} onChange={e => setForm(f => ({ ...f, stopName: e.target.value }))} placeholder="e.g. Kothrud Corner" />
          </FormGroup>
          <FormGroup label="Monthly Fee (₹)">
            <input type="number" className="form-input" value={form.feePerMonth} onChange={e => setForm(f => ({ ...f, feePerMonth: e.target.value }))} placeholder="1200" />
          </FormGroup>
        </div>
      </Modal>
    </div>
  );
}

// ─── LIVE TRACKING TAB ────────────────────────────────────────────────────────
function TrackingTab({ routes, vehicles, allocations }) {
  const [selectedRoute, setSelectedRoute] = useState(routes[0]?._id || '');
  const [busPos, setBusPos]               = useState(0);
  const [simRunning, setSimRunning]       = useState(false);
  const [alerts, setAlerts]               = useState([]);
  const intervalRef = useRef(null);

  const route         = routes.find(r => r._id === selectedRoute);
  const stops         = route?.stops || [];
  const routeVehicles = vehicles.filter(v => {
    const rid = v.assignedRoute?._id || v.assignedRoute;
    return rid === selectedRoute;
  });
  const routeStudents = allocations.filter(a => (a.route?._id || a.route) === selectedRoute);
  const progress      = stops.length > 1 ? Math.round((busPos / (stops.length - 1)) * 100) : 0;

  const toggleSim = () => {
    if (simRunning) { clearInterval(intervalRef.current); setSimRunning(false); return; }
    setSimRunning(true); setBusPos(0);
    intervalRef.current = setInterval(() => {
      setBusPos(p => {
        const next = p + 1;
        if (next >= stops.length) {
          clearInterval(intervalRef.current);
          setSimRunning(false);
          setAlerts(a => [{ msg: `${route?.routeName} completed the route`, time: new Date().toLocaleTimeString('en-IN') }, ...a].slice(0, 8));
          return 0;
        }
        setAlerts(a => [{ msg: `Arrived at ${stops[next]?.name}`, time: new Date().toLocaleTimeString('en-IN') }, ...a].slice(0, 8));
        return next;
      });
    }, 3000);
  };

  useEffect(() => () => clearInterval(intervalRef.current), []);

  useEffect(() => {
    setBusPos(0);
    clearInterval(intervalRef.current);
    setSimRunning(false);
    setAlerts([]);
  }, [selectedRoute]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <select className="form-input w-60" value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)}>
          <option value="">— Select route —</option>
          {routes.map(r => <option key={r._id} value={r._id}>{r.routeName}</option>)}
        </select>
        <button onClick={toggleSim} disabled={!selectedRoute || stops.length === 0}
          className={'px-5 py-2.5 rounded-xl text-sm font-bold transition-all ' +
            (simRunning ? 'bg-red-100 text-red-600 border border-red-200 hover:bg-red-200' : 'bg-accent text-white hover:bg-accent/90 disabled:opacity-40')}>
          {simRunning ? '⏹ Stop Simulation' : '▶ Start GPS Simulation'}
        </button>
        {simRunning && (
          <div className="flex items-center gap-2 text-sm text-green-600 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            LIVE — updating every 3s
          </div>
        )}
      </div>

      {!selectedRoute ? (
        <EmptyState icon="📍" title="Select a route" subtitle="Choose a route above to see live tracking" />
      ) : (
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Map panel */}
          <div className="lg:col-span-2 card overflow-hidden">
            <div className="px-5 py-3 border-b border-border dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-ink dark:text-white">🗺️ {route?.routeName}</h3>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>{stops.length} stops</span>
                <span>·</span>
                <span>{routeStudents.length} students</span>
              </div>
            </div>

            {/* Progress bar */}
            {stops.length > 0 && (
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-center justify-between text-xs text-muted mb-1.5">
                  <span>{stops[0]?.name}</span>
                  <span className="font-bold text-accent">{progress}% complete</span>
                  <span>{stops[stops.length - 1]?.name}</span>
                </div>
                <div className="h-3 bg-warm dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {/* SVG map */}
            <div className="relative bg-slate-50 dark:bg-gray-900/50 mx-5 mb-5 mt-2 rounded-xl overflow-hidden" style={{ height: 280 }}>
              <svg width="100%" height="100%" viewBox="0 0 600 280">
                {/* Grid */}
                {[56,112,168,224].map(y => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#e2e8f0" strokeWidth="0.5" />)}
                {[120,240,360,480].map(x => <line key={x} x1={x} y1="0" x2={x} y2="280" stroke="#e2e8f0" strokeWidth="0.5" />)}

                {/* Route path */}
                {stops.length > 1 && (() => {
                  const pts = stops.map((_, i) => `${50 + (i / (stops.length - 1)) * 500},${80 + Math.sin(i * 0.8) * 60}`).join(' ');
                  return <polyline points={pts} fill="none" stroke="#e87722" strokeWidth="3" strokeDasharray="10,5" opacity="0.5" />;
                })()}

                {/* Stops */}
                {stops.map((s, i) => {
                  const x = 50 + (i / Math.max(stops.length - 1, 1)) * 500;
                  const y = 80 + Math.sin(i * 0.8) * 60;
                  const isPast = i < busPos;
                  const isCurrent = i === busPos;
                  return (
                    <g key={i}>
                      <circle cx={x} cy={y} r={isCurrent ? 10 : 7} fill={isCurrent ? '#e87722' : isPast ? '#4a7c59' : 'white'} stroke={isCurrent ? '#e87722' : '#94a3b8'} strokeWidth="2" />
                      {isPast && <text x={x} y={y + 5} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">✓</text>}
                      <text x={x} y={y + 22} textAnchor="middle" fontSize="9" fill="#64748b">{(s.name || '').slice(0, 12)}</text>
                      {s.time && <text x={x} y={y + 33} textAnchor="middle" fontSize="8" fill="#94a3b8">{s.time}</text>}
                    </g>
                  );
                })}

                {/* Bus icon */}
                {simRunning && stops.length > 0 && (() => {
                  const i = busPos;
                  const x = 50 + (i / Math.max(stops.length - 1, 1)) * 500;
                  const y = 80 + Math.sin(i * 0.8) * 60;
                  return (
                    <g>
                      <circle cx={x} cy={y} r="20" fill="#e87722" opacity="0.2">
                        <animate attributeName="r" values="16;24;16" dur="2s" repeatCount="indefinite" />
                      </circle>
                      <circle cx={x} cy={y} r="16" fill="#e87722" />
                      <text x={x} y={y + 6} textAnchor="middle" fontSize="16">🚌</text>
                    </g>
                  );
                })()}

                {!simRunning && (
                  <text x="300" y="240" textAnchor="middle" fontSize="12" fill="#94a3b8">
                    Click "Start GPS Simulation" to track the bus
                  </text>
                )}
              </svg>
            </div>
          </div>

          {/* Side panel */}
          <div className="space-y-4">
            {/* Vehicle status */}
            {routeVehicles.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-bold text-muted uppercase mb-3">🚌 Assigned Vehicles</p>
                {routeVehicles.map(v => (
                  <div key={v._id} className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-sm">🚌</div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-ink dark:text-white">{v.registrationNo}</p>
                      <p className="text-xs text-muted">{v.driverName || 'No driver'}</p>
                    </div>
                    {simRunning && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                  </div>
                ))}
              </div>
            )}

            {/* Current stop info */}
            {simRunning && stops[busPos] && (
              <div className="card p-4 border-accent/30 bg-accent/5 dark:bg-accent/10">
                <p className="text-xs font-bold text-muted uppercase mb-1">Current Stop</p>
                <p className="font-bold text-ink dark:text-white">{stops[busPos].name}</p>
                {stops[busPos + 1] && <p className="text-xs text-muted mt-1">Next: {stops[busPos + 1].name}</p>}
                <div className="mt-2 h-1 bg-warm dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {/* Activity log */}
            {alerts.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-bold text-muted uppercase mb-2">Activity Log</p>
                <div className="space-y-2">
                  {alerts.map((a, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <span className="text-muted flex-shrink-0">{a.time}</span>
                      <span className="text-ink dark:text-white border-l border-border pl-2">{a.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Students on route */}
            {routeStudents.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-bold text-muted uppercase mb-2">👨‍🎓 {routeStudents.length} Students</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {routeStudents.map(a => (
                    <div key={a._id} className="flex items-center gap-2 text-sm">
                      <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">
                        {(a.student?.user?.name || '?')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-ink dark:text-white truncate font-medium">{a.student?.user?.name || '—'}</p>
                        {a.stopName && <p className="text-muted text-xs">📍 {a.stopName}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FEES TAB ─────────────────────────────────────────────────────────────────
function FeesTab({ fees, routes, allocations, canManage, reload, feeCollected, feePending }) {
  const [filter, setFilter]       = useState('all');
  const [genModal, setGenModal]   = useState(false);
  const [genForm, setGenForm]     = useState({ routeId: '', month: new Date().getMonth() + 1, year: new Date().getFullYear() });
  const [saving, setSaving]       = useState(false);

  const filtered = filter === 'all' ? fees : fees.filter(f => f.status === filter);

  const handleGenerate = async () => {
    setSaving(true);
    try {
      await transFeeAPI.generate(genForm);
      toast.success('Fees generated for route ✅');
      setGenModal(false); reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Error generating fees'); }
    finally { setSaving(false); }
  };

  const handlePay = async (id) => {
    try {
      await transFeeAPI.pay(id, { amount: fees.find(f => f._id === id)?.amount, method: 'cash' });
      toast.success('Payment recorded ✅'); reload();
    } catch { toast.error('Error recording payment'); }
  };

  const statusColors = { paid: 'bg-green-100 text-green-700', pending: 'bg-amber-100 text-amber-700', partial: 'bg-blue-100 text-blue-700', overdue: 'bg-red-100 text-red-600' };

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
          <div className="text-xs text-muted mt-1">📋 Records</div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl bg-warm dark:bg-gray-800 border border-border">
          {['all','pending','paid','overdue'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ' +
                (filter === f ? 'bg-white dark:bg-gray-700 shadow text-accent' : 'text-muted hover:text-ink dark:hover:text-white')}>
              {f}
            </button>
          ))}
        </div>
        {canManage && (
          <button className="btn-primary ml-auto" onClick={() => setGenModal(true)}>⚡ Generate Monthly Fees</button>
        )}
      </div>

      {!filtered.length ? (
        <EmptyState icon="💰" title="No fee records" subtitle={canManage ? 'Generate monthly fees for a route to get started' : 'No transport fees found'} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-warm dark:bg-gray-800 border-b border-border dark:border-gray-700">
                <tr>
                  {['Student','Route','Month','Amount','Status','Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-gray-700">
                {filtered.map(f => (
                  <tr key={f._id} className="hover:bg-warm/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink dark:text-white">{f.student?.user?.name || f.studentName || '—'}</td>
                    <td className="px-4 py-3 text-muted">{f.route?.routeName || routes.find(r => r._id === f.route)?.routeName || '—'}</td>
                    <td className="px-4 py-3 text-muted">{MONTHS[(f.month || 1) - 1]} {f.year}</td>
                    <td className="px-4 py-3 font-bold text-ink dark:text-white">₹{(f.amount || 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3">
                      <span className={'text-xs font-semibold px-2.5 py-1 rounded-full ' + (statusColors[f.status] || statusColors.pending)}>{f.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {f.status === 'pending' && canManage ? (
                        <button onClick={() => handlePay(f._id)} className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg font-semibold hover:bg-green-700 transition-colors">
                          💳 Mark Paid
                        </button>
                      ) : (
                        <span className="text-xs text-muted">{f.paidDate ? new Date(f.paidDate).toLocaleDateString('en-IN') : '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={genModal} onClose={() => setGenModal(false)} title="⚡ Generate Monthly Transport Fees" size="sm"
        footer={<><button className="btn-secondary" onClick={() => setGenModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleGenerate} disabled={saving}>{saving ? 'Generating…' : 'Generate Fees'}</button></>}>
        <div className="space-y-4">
          <p className="text-sm text-muted">This will auto-create fee records for all students assigned to the selected route for the selected month.</p>
          <FormGroup label="Route *">
            <select className="form-input" value={genForm.routeId} onChange={e => setGenForm(f => ({ ...f, routeId: e.target.value }))}>
              <option value="">— Select route —</option>
              {routes.map(r => <option key={r._id} value={r._id}>{r.routeName}</option>)}
            </select>
          </FormGroup>
          <div className="grid grid-cols-2 gap-4">
            <FormGroup label="Month">
              <select className="form-input" value={genForm.month} onChange={e => setGenForm(f => ({ ...f, month: +e.target.value }))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Year">
              <input type="number" className="form-input" value={genForm.year} onChange={e => setGenForm(f => ({ ...f, year: +e.target.value }))} />
            </FormGroup>
          </div>
        </div>
      </Modal>
    </div>
  );
}