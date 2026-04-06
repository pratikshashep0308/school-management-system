// frontend/src/pages/transport/AdminTransport.js
// ✅ FIXED & UPGRADED — Admin Transport Management
// Key fixes:
//   1. assignStudent now sends pickupStopId/dropStopId (not just names)
//   2. Stop dropdowns show Stop._id for correct backend mapping
//   3. Route delete uses routeId correctly
//   4. Added live GPS status indicator on bus cards
//   5. Assignments table shows routeId/busId populated fields

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { busAPI, routeAPI, assignmentAPI, stopAPI } from '../../utils/transportAPI';
import api from '../../utils/api';

const TABS = ['Buses', 'Routes', 'Assignments'];
const BUS_COLORS = ['#3B82F6','#E87722','#4A7C59','#7C6AF5','#EF4444','#F59E0B','#0284C7','#DB2777'];

const emptyBus = () => ({
  busNumber: '', registrationNo: '', type: 'bus', capacity: 40,
  driver: { name: '', phone: '', license: '' },
  helper: { name: '', phone: '' },
  status: 'active', color: '#3B82F6',
});

const emptyRoute = () => ({
  name: '', code: '', color: '#3B82F6', description: '',
  morningDepartureTime: '07:00', eveningDepartureTime: '14:00',
  stops: [{ name: '', sequence: 1, morningArrivalTime: '', eveningArrivalTime: '', landmark: '' }],
});

const emptyAssign = () => ({
  studentId: '', routeId: '', busId: '',
  pickupStopId: '', dropStopId: '', monthlyFee: 1200, passType: 'both',
});

export default function AdminTransport() {
  const [tab,         setTab]         = useState('Buses');
  const [buses,       setBuses]       = useState([]);
  const [routes,      setRoutes]      = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [students,    setStudents]    = useState([]);
  const [routeStops,  setRouteStops]  = useState([]); // stops for currently-selected route
  const [loading,     setLoading]     = useState(true);

  const [showBusModal,    setShowBusModal]    = useState(false);
  const [showRouteModal,  setShowRouteModal]  = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingBus,      setEditingBus]      = useState(null);
  const [editingRoute,    setEditingRoute]    = useState(null);
  const [saving,          setSaving]          = useState(false);

  const [busForm,    setBusForm]    = useState(emptyBus());
  const [routeForm,  setRouteForm]  = useState(emptyRoute());
  const [assignForm, setAssignForm] = useState(emptyAssign());

  // ── Load all data ────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, rRes, aRes] = await Promise.all([
        busAPI.getAll(),
        routeAPI.getAll(),
        assignmentAPI.getAll(),
      ]);
      setBuses(bRes.data.data || []);
      setRoutes(rRes.data.data || []);
      setAssignments(aRes.data.data || []);

      // Load student list via transport-scoped endpoint
      try {
        const sRes = await api.get('/transport/students');
        setStudents(sRes.data.data || []);
      } catch {
        try {
          const sRes = await api.get('/students');
          setStudents(sRes.data.data || []);
        } catch { setStudents([]); }
      }
    } catch {
      toast.error('Failed to load transport data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Load stops when route changes in assign modal ──────────────────────────
  useEffect(() => {
    if (!assignForm.routeId) { setRouteStops([]); return; }
    stopAPI.getByRoute(assignForm.routeId)
      .then((r) => setRouteStops(r.data.data || []))
      .catch(() => {
        // Fallback: use stops embedded in route
        const r = routes.find((rt) => rt._id === assignForm.routeId);
        setRouteStops(r?.stops || []);
      });
  }, [assignForm.routeId, routes]);

  // ── BUS CRUD ────────────────────────────────────────────────────────────────
  const openBusModal = (bus = null) => {
    setEditingBus(bus);
    setBusForm(bus ? {
      busNumber: bus.busNumber, registrationNo: bus.registrationNo,
      type: bus.type, capacity: bus.capacity, color: bus.color || '#3B82F6',
      driver: { ...bus.driver }, helper: { ...(bus.helper || {}) },
      status: bus.status, assignedRoute: bus.assignedRoute?._id || '',
    } : emptyBus());
    setShowBusModal(true);
  };

  const saveBus = async () => {
    setSaving(true);
    try {
      if (editingBus) { await busAPI.update(editingBus._id, busForm); toast.success('Bus updated'); }
      else            { await busAPI.create(busForm);                  toast.success('Bus added'); }
      setShowBusModal(false);
      loadAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save bus'); }
    finally { setSaving(false); }
  };

  const deleteBus = async (id) => {
    if (!window.confirm('Deactivate this bus?')) return;
    try { await busAPI.delete(id); toast.success('Bus deactivated'); loadAll(); }
    catch (err) { toast.error(err.response?.data?.message || 'Cannot remove — active assignments exist'); }
  };

  // ── ROUTE CRUD ──────────────────────────────────────────────────────────────
  const openRouteModal = (route = null) => {
    setEditingRoute(route);
    setRouteForm(route ? {
      name: route.name, code: route.code, color: route.color || '#3B82F6',
      description: route.description || '',
      morningDepartureTime: route.morningDepartureTime,
      eveningDepartureTime: route.eveningDepartureTime,
      assignedBus: route.assignedBus?._id || '',
      stops: route.stops?.length > 0
        ? route.stops.map((s) => ({
            name: s.name, sequence: s.sequence,
            morningArrivalTime: s.morningTime || s.morningArrivalTime || '',
            eveningArrivalTime: s.eveningTime || s.eveningArrivalTime || '',
            landmark: s.landmark || '',
          }))
        : emptyRoute().stops,
    } : emptyRoute());
    setShowRouteModal(true);
  };

  const addStop = () => setRouteForm((f) => ({
    ...f, stops: [...f.stops, { name: '', sequence: f.stops.length + 1, morningArrivalTime: '', eveningArrivalTime: '', landmark: '' }],
  }));
  const removeStop = (i) => setRouteForm((f) => ({ ...f, stops: f.stops.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, sequence: idx + 1 })) }));
  const updateStop = (i, key, val) => setRouteForm((f) => ({ ...f, stops: f.stops.map((s, idx) => idx === i ? { ...s, [key]: val } : s) }));

  const saveRoute = async () => {
    setSaving(true);
    try {
      const payload = { ...routeForm, stops: routeForm.stops.filter((s) => s.name.trim()) };
      if (editingRoute) { await routeAPI.update(editingRoute._id, payload); toast.success('Route updated'); }
      else              { await routeAPI.create(payload);                   toast.success('Route created'); }
      setShowRouteModal(false);
      loadAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save route'); }
    finally { setSaving(false); }
  };

  const deleteRoute = async (id) => {
    if (!window.confirm('Deactivate this route? Students must be reassigned first.')) return;
    try { await routeAPI.delete(id); toast.success('Route deactivated'); loadAll(); }
    catch (err) { toast.error(err.response?.data?.message || 'Cannot remove — active assignments exist'); }
  };

  // ── ASSIGNMENT ──────────────────────────────────────────────────────────────
  // ✅ FIX: send pickupStopId/dropStopId (not just stop names)
  const assignStudent = async () => {
    const { studentId, routeId, busId, pickupStopId, dropStopId, monthlyFee, passType } = assignForm;
    if (!studentId || !routeId || !busId || !pickupStopId || !dropStopId) {
      return toast.error('Please fill all required fields including pickup and drop stops');
    }
    setSaving(true);
    try {
      await assignmentAPI.assign({ studentId, routeId, busId, pickupStopId, dropStopId, monthlyFee: Number(monthlyFee), passType });
      toast.success('Student assigned to transport');
      setShowAssignModal(false);
      setAssignForm(emptyAssign());
      loadAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Assignment failed'); }
    finally { setSaving(false); }
  };

  const removeAssignment = async (id) => {
    if (!window.confirm('Remove this student from transport?')) return;
    try { await assignmentAPI.remove(id); toast.success('Assignment removed'); loadAll(); }
    catch { toast.error('Failed to remove assignment'); }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded-xl w-1/3" />
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3].map((i) => <div key={i} className="h-40 bg-gray-200 rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🚌 Transport Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {buses.length} buses · {routes.length} routes · {assignments.length} students assigned
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'Buses'       && <ActionBtn onClick={() => openBusModal()}>+ Add Bus</ActionBtn>}
          {tab === 'Routes'      && <ActionBtn onClick={() => openRouteModal()}>+ Add Route</ActionBtn>}
          {tab === 'Assignments' && <ActionBtn onClick={() => setShowAssignModal(true)}>+ Assign Student</ActionBtn>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── BUSES ─────────────────────────────────────────────────────────── */}
      {tab === 'Buses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buses.map((bus) => {
            const lastUpdate = bus.currentLocation?.updatedAt;
            const secAgo = lastUpdate ? (Date.now() - new Date(lastUpdate)) / 1000 : Infinity;
            const isLive = secAgo < 120;
            return (
              <div key={bus._id} className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-xl"
                      style={{ background: bus.color || '#3B82F6' }}>🚌</div>
                    <div>
                      <p className="font-bold text-gray-900">{bus.busNumber}</p>
                      <p className="text-xs text-gray-500 font-mono">{bus.registrationNo}</p>
                    </div>
                  </div>
                  <StatusBadge status={bus.status} />
                </div>

                <div className="space-y-1.5 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <span>👨‍✈️</span><span className="font-medium">{bus.driver?.name || '—'}</span>
                    {bus.driver?.phone && <span className="text-gray-400 text-xs">· {bus.driver.phone}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🛣️</span><span>{bus.assignedRoute?.name || 'No route assigned'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>💺</span><span>Cap: {bus.capacity} · {bus.type}</span>
                  </div>
                </div>

                {/* GPS badge */}
                <div className={`flex items-center gap-1.5 mt-3 text-xs font-medium px-2.5 py-1.5 rounded-lg w-fit ${
                  isLive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  <span className={`w-2 h-2 rounded-full inline-block ${isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  {isLive
                    ? `GPS Live · ${Math.round(bus.currentLocation.speed || 0)} km/h`
                    : lastUpdate ? `GPS: ${timeSince(lastUpdate)}` : 'GPS: No data'}
                </div>

                <div className="flex gap-2 mt-4">
                  <button onClick={() => openBusModal(bus)}
                    className="flex-1 text-xs py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold">
                    Edit
                  </button>
                  <button onClick={() => deleteBus(bus._id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 font-semibold">
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          {buses.length === 0 && (
            <div className="col-span-3 text-center py-16 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-300">
              <div className="text-5xl mb-3">🚌</div>
              <p className="font-medium">No buses yet. Add your first bus.</p>
            </div>
          )}
        </div>
      )}

      {/* ── ROUTES ────────────────────────────────────────────────────────── */}
      {tab === 'Routes' && (
        <div className="space-y-4">
          {routes.map((route) => (
            <div key={route._id} className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-14 rounded-full flex-shrink-0" style={{ background: route.color || '#3B82F6' }} />
                  <div>
                    <p className="font-bold text-gray-900 text-lg">{route.name}</p>
                    <p className="text-sm text-gray-500">
                      Code: <span className="font-mono font-semibold">{route.code}</span>
                      &nbsp;·&nbsp;{route.stops?.length || 0} stops
                      &nbsp;·&nbsp;<span className="font-semibold text-blue-600">{route.totalStudents || 0} students</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openRouteModal(route)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold">Edit</button>
                  <button onClick={() => deleteRoute(route._id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 font-semibold">Delete</button>
                </div>
              </div>

              {/* Stop timeline */}
              <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-2 pt-1">
                {(route.stops || []).map((stop, i) => (
                  <React.Fragment key={i}>
                    <div className="flex-shrink-0 text-center min-w-[72px]">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold mx-auto shadow-sm"
                        style={{ background: route.color || '#3B82F6' }}>
                        {stop.sequence || i + 1}
                      </div>
                      <p className="text-xs text-gray-700 mt-1 max-w-[72px] truncate font-medium">{stop.name}</p>
                      <p className="text-xs text-gray-400">{stop.morningTime}</p>
                      {stop.studentCount > 0 && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 rounded-md font-semibold">
                          {stop.studentCount}👦
                        </span>
                      )}
                    </div>
                    {i < route.stops.length - 1 && (
                      <div className="h-0.5 flex-1 min-w-[16px] rounded-full" style={{ background: route.color || '#3B82F6', opacity: 0.35 }} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              {route.assignedBus && (
                <div className="mt-3 px-3 py-2 bg-gray-50 rounded-xl text-sm flex items-center gap-3">
                  <span>🚌</span>
                  <span className="font-semibold">{route.assignedBus.busNumber}</span>
                  <span className="text-gray-500">{route.assignedBus.driver?.name}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500">📞 {route.assignedBus.driver?.phone}</span>
                </div>
              )}
            </div>
          ))}
          {routes.length === 0 && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-300">
              <div className="text-5xl mb-3">🛣️</div>
              <p className="font-medium">No routes yet. Create your first route.</p>
            </div>
          )}
        </div>
      )}

      {/* ── ASSIGNMENTS ───────────────────────────────────────────────────── */}
      {tab === 'Assignments' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Student','Route','Bus','Pickup Stop','Drop Stop','Fee/Month','Pass','Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assignments.map((a) => {
                  // ✅ FIX: use routeId/busId populated fields
                  const route = a.routeId || a.route;
                  const bus   = a.busId   || a.bus;
                  return (
                    <tr key={a._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{a.student?.name || '—'}</td>
                      <td className="px-4 py-3">
                        {route && (
                          <span className="px-2 py-0.5 rounded-lg text-xs font-semibold text-white"
                            style={{ background: route.color || '#3B82F6' }}>
                            {route.code}
                          </span>
                        )}
                        <span className="ml-2 text-gray-600">{route?.name || '—'}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{bus?.busNumber || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-gray-700">{a.pickupStop?.name || '—'}</span>
                        {a.pickupStop?.time && <span className="text-gray-400 text-xs ml-1">({a.pickupStop.time})</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-700">{a.dropStop?.name || '—'}</span>
                        {a.dropStop?.time && <span className="text-gray-400 text-xs ml-1">({a.dropStop.time})</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold">₹{a.monthlyFee?.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${
                          a.passType === 'both'    ? 'bg-blue-100 text-blue-700' :
                          a.passType === 'morning' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {a.passType || 'both'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => removeAssignment(a._id)}
                          className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 font-semibold">
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {assignments.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">
                    No assignments yet. Click &quot;+ Assign Student&quot; to get started.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── BUS MODAL ───────────────────────────────────────────────────── */}
      {showBusModal && (
        <Modal title={editingBus ? 'Edit Bus' : 'Add Bus'} onClose={() => setShowBusModal(false)}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bus Number *"      value={busForm.busNumber}      onChange={(v) => setBusForm({...busForm, busNumber: v})}      placeholder="BUS-01" />
            <Field label="Registration No *" value={busForm.registrationNo} onChange={(v) => setBusForm({...busForm, registrationNo: v})} placeholder="MH12AB1234" />
            <Field label="Type" type="select" value={busForm.type} options={['bus','van','minibus','auto']} onChange={(v) => setBusForm({...busForm, type: v})} />
            <Field label="Capacity" type="number" value={busForm.capacity} onChange={(v) => setBusForm({...busForm, capacity: v})} />
            <Field label="Driver Name *"  value={busForm.driver?.name}    onChange={(v) => setBusForm({...busForm, driver: {...busForm.driver, name: v}})} />
            <Field label="Driver Phone *" value={busForm.driver?.phone}   onChange={(v) => setBusForm({...busForm, driver: {...busForm.driver, phone: v}})} />
            <Field label="License No"     value={busForm.driver?.license} onChange={(v) => setBusForm({...busForm, driver: {...busForm.driver, license: v}})} />
            <Field label="Helper Name"    value={busForm.helper?.name}    onChange={(v) => setBusForm({...busForm, helper: {...busForm.helper, name: v}})} />
            <Field label="Helper Phone"   value={busForm.helper?.phone}   onChange={(v) => setBusForm({...busForm, helper: {...busForm.helper, phone: v}})} />
            <Field label="Assign Route" type="select" value={busForm.assignedRoute || ''}
              options={[{label:'— No route —',value:''}, ...routes.map((r) => ({label:`${r.name} (${r.code})`, value: r._id}))]}
              onChange={(v) => setBusForm({...busForm, assignedRoute: v})} />
            <Field label="Status" type="select" value={busForm.status} options={['active','maintenance','inactive','breakdown']}
              onChange={(v) => setBusForm({...busForm, status: v})} />
          </div>
          <div className="mt-4">
            <label className="text-xs font-semibold text-gray-600 uppercase block mb-2">Bus Color</label>
            <div className="flex gap-2 flex-wrap">
              {BUS_COLORS.map((c) => (
                <button key={c} onClick={() => setBusForm({...busForm, color: c})}
                  className="w-8 h-8 rounded-full border-2 transition-all"
                  style={{ background: c, borderColor: busForm.color === c ? '#111' : 'transparent', transform: busForm.color === c ? 'scale(1.15)' : 'scale(1)' }} />
              ))}
            </div>
          </div>
          <ModalFooter onCancel={() => setShowBusModal(false)} onSave={saveBus} saveLabel={saving ? 'Saving…' : editingBus ? 'Update Bus' : 'Add Bus'} />
        </Modal>
      )}

      {/* ─── ROUTE MODAL ─────────────────────────────────────────────────── */}
      {showRouteModal && (
        <Modal title={editingRoute ? 'Edit Route' : 'Create Route'} onClose={() => setShowRouteModal(false)} wide>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Route Name *" value={routeForm.name} onChange={(v) => setRouteForm({...routeForm, name: v})} placeholder="Route A — Hinjewadi" />
            <Field label="Route Code *" value={routeForm.code} onChange={(v) => setRouteForm({...routeForm, code: v})} placeholder="RT-A" />
            <Field label="Morning Departure" type="time" value={routeForm.morningDepartureTime} onChange={(v) => setRouteForm({...routeForm, morningDepartureTime: v})} />
            <Field label="Evening Departure" type="time" value={routeForm.eveningDepartureTime} onChange={(v) => setRouteForm({...routeForm, eveningDepartureTime: v})} />
            <div className="col-span-2">
              <Field label="Assign Bus" type="select" value={routeForm.assignedBus || ''}
                options={[{label:'— No bus —',value:''}, ...buses.map((b) => ({label:`${b.busNumber} — ${b.driver?.name||'No driver'}`, value: b._id}))]}
                onChange={(v) => setRouteForm({...routeForm, assignedBus: v})} />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-semibold text-gray-600 uppercase block mb-2">Route Color</label>
            <div className="flex gap-2 flex-wrap">
              {BUS_COLORS.map((c) => (
                <button key={c} onClick={() => setRouteForm({...routeForm, color: c})}
                  className="w-8 h-8 rounded-full border-2 transition-all"
                  style={{ background: c, borderColor: routeForm.color === c ? '#111' : 'transparent' }} />
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-gray-600 uppercase">Stops ({routeForm.stops.length})</label>
              <button onClick={addStop} className="text-xs px-3 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-semibold">+ Add Stop</button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {routeForm.stops.map((stop, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-3 grid grid-cols-5 gap-2 items-end">
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">Stop Name *</label>
                    <input value={stop.name} onChange={(e) => updateStop(idx, 'name', e.target.value)}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="e.g. Hinjewadi Phase 1" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Morning</label>
                    <input type="time" value={stop.morningArrivalTime} onChange={(e) => updateStop(idx, 'morningArrivalTime', e.target.value)}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Evening</label>
                    <input type="time" value={stop.eveningArrivalTime} onChange={(e) => updateStop(idx, 'eveningArrivalTime', e.target.value)}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </div>
                  <button onClick={() => removeStop(idx)} disabled={routeForm.stops.length === 1}
                    className="py-1.5 border border-red-200 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-xs disabled:opacity-30">✕</button>
                </div>
              ))}
            </div>
          </div>

          <ModalFooter onCancel={() => setShowRouteModal(false)} onSave={saveRoute} saveLabel={saving ? 'Saving…' : editingRoute ? 'Update Route' : 'Create Route'} />
        </Modal>
      )}

      {/* ─── ASSIGN STUDENT MODAL ─────────────────────────────────────────── */}
      {showAssignModal && (
        <Modal title="Assign Student to Transport" onClose={() => { setShowAssignModal(false); setAssignForm(emptyAssign()); }}>
          <div className="space-y-4">
            {/* Student */}
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Student *</label>
              {students.length === 0 ? (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700">
                  ⚠️ No students loaded. Check permissions or add students first.
                </div>
              ) : (
                <select value={assignForm.studentId} onChange={(e) => setAssignForm({...assignForm, studentId: e.target.value})}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— Select student —</option>
                  {students.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name || s.user?.name} {s.rollNumber ? `· Roll ${s.rollNumber}` : ''} {s.class?.name ? `(${s.class.name})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Route — auto-fills bus */}
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Route *</label>
              <select value={assignForm.routeId}
                onChange={(e) => {
                  const r = routes.find((rt) => rt._id === e.target.value);
                  setAssignForm({ ...assignForm, routeId: e.target.value, busId: r?.assignedBus?._id || '', pickupStopId: '', dropStopId: '' });
                }}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">— Select route —</option>
                {routes.map((r) => (
                  <option key={r._id} value={r._id}>{r.name} ({r.code}) · {r.stops?.length || 0} stops</option>
                ))}
              </select>
            </div>

            {/* Bus (auto-filled, can override) */}
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">
                Bus * {assignForm.busId && <span className="text-green-600 font-normal">(auto-filled from route)</span>}
              </label>
              <select value={assignForm.busId} onChange={(e) => setAssignForm({...assignForm, busId: e.target.value})}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">— Select bus —</option>
                {buses.map((b) => (
                  <option key={b._id} value={b._id}>{b.busNumber} — {b.driver?.name || 'No driver'} ({b.type})</option>
                ))}
              </select>
            </div>

            {/* ✅ FIX: Stop dropdowns now send _id not name */}
            {routeStops.length > 0 ? (
              <>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Pickup Stop *</label>
                  <select value={assignForm.pickupStopId} onChange={(e) => setAssignForm({...assignForm, pickupStopId: e.target.value})}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">— Select pickup stop —</option>
                    {routeStops.map((s) => (
                      <option key={s._id || s.stop} value={s._id || s.stop}>
                        {s.sequence}. {s.name} {s.morningArrivalTime || s.morningTime ? `(${s.morningArrivalTime || s.morningTime})` : ''}
                        {s.studentCount > 0 ? ` · ${s.studentCount} students` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Drop Stop *</label>
                  <select value={assignForm.dropStopId} onChange={(e) => setAssignForm({...assignForm, dropStopId: e.target.value})}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">— Select drop stop —</option>
                    {routeStops.map((s) => (
                      <option key={s._id || s.stop} value={s._id || s.stop}>
                        {s.sequence}. {s.name} {s.eveningArrivalTime || s.eveningTime ? `(${s.eveningArrivalTime || s.eveningTime})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : assignForm.routeId ? (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-700">
                ⚠️ This route has no stops. Please edit the route and add stops first.
              </div>
            ) : null}

            {/* Pass type & fee */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Pass Type</label>
                <select value={assignForm.passType} onChange={(e) => setAssignForm({...assignForm, passType: e.target.value})}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="both">Both (Morning + Evening)</option>
                  <option value="morning">Morning Only</option>
                  <option value="evening">Evening Only</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Monthly Fee (₹) *</label>
                <input type="number" value={assignForm.monthlyFee} min="0"
                  onChange={(e) => setAssignForm({...assignForm, monthlyFee: e.target.value})}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="1200" />
              </div>
            </div>
          </div>

          <ModalFooter onCancel={() => { setShowAssignModal(false); setAssignForm(emptyAssign()); }}
            onSave={assignStudent} saveLabel={saving ? 'Assigning…' : 'Assign Student'} saveColor="green" />
        </Modal>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ActionBtn({ children, onClick }) {
  return (
    <button onClick={onClick} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors">
      {children}
    </button>
  );
}

function StatusBadge({ status }) {
  const map = {
    active:      { bg: '#D1FAE5', text: '#065F46', label: 'Active' },
    maintenance: { bg: '#FEF3C7', text: '#92400E', label: 'Maintenance' },
    inactive:    { bg: '#F3F4F6', text: '#6B7280', label: 'Inactive' },
    breakdown:   { bg: '#FEE2E2', text: '#991B1B', label: 'Breakdown' },
  };
  const s = map[status] || map.inactive;
  return <span style={{ background: s.bg, color: s.text }} className="text-xs px-2 py-0.5 rounded-lg font-semibold">{s.label}</span>;
}

function Field({ label, value, onChange, type = 'text', options, placeholder }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">{label}</label>
      {type === 'select' ? (
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}
          className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400">
          {options?.map((o) => typeof o === 'string'
            ? <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
          )}
        </select>
      ) : (
        <input type={type} value={value ?? ''} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
      )}
    </div>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onCancel, onSave, saveLabel, saveColor = 'blue' }) {
  const colors = { blue: 'bg-blue-600 hover:bg-blue-700', green: 'bg-green-600 hover:bg-green-700' };
  return (
    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
      <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
      <button onClick={onSave} className={`px-5 py-2 text-sm text-white rounded-xl font-semibold transition-colors ${colors[saveColor]}`}>{saveLabel}</button>
    </div>
  );
}

function timeSince(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}