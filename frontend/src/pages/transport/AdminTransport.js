// frontend/src/pages/transport/AdminTransport.js
// Admin Transport Management: buses, routes, stops, student assignments

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { busAPI, routeAPI, assignmentAPI } from '../../utils/transportAPI';

const TABS = ['Buses', 'Routes', 'Assignments'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const emptyBus = () => ({
  busNumber: '', registrationNo: '', type: 'bus', capacity: 40,
  driver: { name: '', phone: '', license: '' },
  helper: { name: '', phone: '' },
  status: 'active',
});

const emptyRoute = () => ({
  name: '', code: '', color: '#3B82F6', description: '',
  morningDepartureTime: '07:00', eveningDepartureTime: '14:00',
  stops: [{ name: '', sequence: 1, morningArrivalTime: '', eveningArrivalTime: '', landmark: '' }],
});

const BUS_COLORS = ['#3B82F6', '#E87722', '#4A7C59', '#7C6AF5', '#EF4444', '#F59E0B', '#0284C7'];

export default function AdminTransport() {
  const [tab,         setTab]         = useState('Buses');
  const [buses,       setBuses]       = useState([]);
  const [routes,      setRoutes]      = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [students,    setStudents]    = useState([]);
  const [loading,     setLoading]     = useState(true);

  // Modal state
  const [showBusModal,    setShowBusModal]    = useState(false);
  const [showRouteModal,  setShowRouteModal]  = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingBus,      setEditingBus]      = useState(null);
  const [editingRoute,    setEditingRoute]    = useState(null);

  // Form state
  const [busForm,    setBusForm]    = useState(emptyBus());
  const [routeForm,  setRouteForm]  = useState(emptyRoute());
  const [assignForm, setAssignForm] = useState({ studentId: '', routeId: '', busId: '', pickupStopName: '', dropStopName: '', monthlyFee: 1200 });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [b, r, a] = await Promise.all([
        busAPI.getAll(),
        routeAPI.getAll(),
        assignmentAPI.getAll(),
      ]);
      setBuses(b.data.data || []);
      setRoutes(r.data.data || []);
      setAssignments(a.data.data || []);

      // Load students for assignment dropdown
      const { default: api } = await import('../../utils/api');
      const sRes = await api.get('/students');
      setStudents(sRes.data.data || []);
    } catch {
      toast.error('Failed to load transport data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Bus CRUD ────────────────────────────────────────────────────────────────
  const openBusModal = (bus = null) => {
    setEditingBus(bus);
    setBusForm(bus ? {
      busNumber: bus.busNumber, registrationNo: bus.registrationNo,
      type: bus.type, capacity: bus.capacity, color: bus.color || '#3B82F6',
      driver: { ...bus.driver }, helper: { ...bus.helper }, status: bus.status,
      assignedRoute: bus.assignedRoute?._id || '',
    } : emptyBus());
    setShowBusModal(true);
  };

  const saveBus = async () => {
    try {
      if (editingBus) {
        await busAPI.update(editingBus._id, busForm);
        toast.success('Bus updated');
      } else {
        await busAPI.create(busForm);
        toast.success('Bus added');
      }
      setShowBusModal(false);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save bus');
    }
  };

  const deleteBus = async (id) => {
    if (!window.confirm('Deactivate this bus?')) return;
    try {
      await busAPI.delete(id);
      toast.success('Bus deactivated');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cannot delete bus');
    }
  };

  // ── Route CRUD ──────────────────────────────────────────────────────────────
  const openRouteModal = (route = null) => {
    setEditingRoute(route);
    if (route) {
      setRouteForm({
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
              landmark: s.landmark || '', lat: s.lat || '', lng: s.lng || '',
            }))
          : emptyRoute().stops,
      });
    } else {
      setRouteForm(emptyRoute());
    }
    setShowRouteModal(true);
  };

  const addStop = () => {
    setRouteForm((f) => ({
      ...f,
      stops: [...f.stops, { name: '', sequence: f.stops.length + 1, morningArrivalTime: '', eveningArrivalTime: '', landmark: '' }],
    }));
  };

  const removeStop = (idx) => {
    setRouteForm((f) => ({
      ...f,
      stops: f.stops.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sequence: i + 1 })),
    }));
  };

  const updateStop = (idx, field, value) => {
    setRouteForm((f) => ({
      ...f,
      stops: f.stops.map((s, i) => i === idx ? { ...s, [field]: value } : s),
    }));
  };

  const saveRoute = async () => {
    try {
      if (editingRoute) {
        await routeAPI.update(editingRoute._id, routeForm);
        toast.success('Route updated');
      } else {
        await routeAPI.create(routeForm);
        toast.success('Route created');
      }
      setShowRouteModal(false);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save route');
    }
  };

  const deleteRoute = async (id) => {
    if (!window.confirm('Deactivate this route?')) return;
    try {
      await routeAPI.delete(id);
      toast.success('Route deactivated');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cannot delete route');
    }
  };

  // ── Assignments ─────────────────────────────────────────────────────────────
  const selectedRoute = routes.find((r) => r._id === assignForm.routeId);
  const stopsForRoute = selectedRoute?.stops || [];

  const assignStudent = async () => {
    try {
      const pickupStop = stopsForRoute.find((s) => s.name === assignForm.pickupStopName);
      const dropStop   = stopsForRoute.find((s) => s.name === assignForm.dropStopName);
      if (!pickupStop || !dropStop) {
        return toast.error('Please select valid pickup and drop stops');
      }

      await assignmentAPI.assign({
        studentId: assignForm.studentId,
        routeId:   assignForm.routeId,
        busId:     assignForm.busId,
        monthlyFee: assignForm.monthlyFee,
        pickupStop: {
          stopId:   pickupStop.stop,
          name:     pickupStop.name,
          time:     pickupStop.morningTime,
          sequence: pickupStop.sequence,
          lat:      pickupStop.lat,
          lng:      pickupStop.lng,
        },
        dropStop: {
          stopId:   dropStop.stop,
          name:     dropStop.name,
          time:     dropStop.morningTime,
          sequence: dropStop.sequence,
          lat:      dropStop.lat,
          lng:      dropStop.lng,
        },
      });
      toast.success('Student assigned to transport');
      setShowAssignModal(false);
      setAssignForm({ studentId: '', routeId: '', busId: '', pickupStopName: '', dropStopName: '', monthlyFee: 1200 });
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Assignment failed');
    }
  };

  const removeAssignment = async (id) => {
    if (!window.confirm('Remove this student from transport?')) return;
    try {
      await assignmentAPI.remove(id);
      toast.success('Assignment removed');
      loadAll();
    } catch {
      toast.error('Failed to remove assignment');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading transport data…</div>;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🚌 Transport Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            {buses.length} buses · {routes.length} routes · {assignments.length} students
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'Buses'       && <Btn onClick={() => openBusModal()}>+ Add Bus</Btn>}
          {tab === 'Routes'      && <Btn onClick={() => openRouteModal()}>+ Add Route</Btn>}
          {tab === 'Assignments' && <Btn onClick={() => setShowAssignModal(true)}>+ Assign Student</Btn>}
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

      {/* ── BUSES TAB ────────────────────────────────────────────────────────── */}
      {tab === 'Buses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buses.map((bus) => (
            <div key={bus._id} className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xl"
                    style={{ background: bus.color || '#3B82F6' }}>🚌</div>
                  <div>
                    <p className="font-bold text-gray-900">{bus.busNumber}</p>
                    <p className="text-xs text-gray-500">{bus.registrationNo}</p>
                  </div>
                </div>
                <StatusBadge status={bus.status} />
              </div>

              <div className="space-y-1.5 text-sm">
                <InfoRow icon="👨‍✈️" label={bus.driver?.name} sub={bus.driver?.phone} />
                <InfoRow icon="🛣️" label={bus.assignedRoute?.name || 'No route'} />
                <InfoRow icon="👥" label={`Capacity: ${bus.capacity}`} sub={bus.type} />
              </div>

              {/* Live location dot */}
              {bus.currentLocation?.updatedAt && (
                <div className="flex items-center gap-1.5 mt-3 text-xs text-green-600">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
                  GPS: {bus.currentLocation.speed || 0} km/h
                  · Updated {timeSince(bus.currentLocation.updatedAt)}
                </div>
              )}

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
          ))}

          {buses.length === 0 && (
            <div className="col-span-3 text-center py-16 text-gray-400">
              <div className="text-5xl mb-3">🚌</div>
              <p className="font-medium">No buses yet. Add your first bus.</p>
            </div>
          )}
        </div>
      )}

      {/* ── ROUTES TAB ───────────────────────────────────────────────────────── */}
      {tab === 'Routes' && (
        <div className="space-y-4">
          {routes.map((route) => (
            <div key={route._id} className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-12 rounded-full" style={{ background: route.color || '#3B82F6' }} />
                  <div>
                    <p className="font-bold text-gray-900 text-lg">{route.name}</p>
                    <p className="text-sm text-gray-500">
                      Code: <span className="font-mono font-semibold">{route.code}</span>
                      &nbsp;·&nbsp;{route.stops?.length || 0} stops
                      &nbsp;·&nbsp;{route.totalStudents || 0} students
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openRouteModal(route)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold">
                    Edit
                  </button>
                  <button onClick={() => deleteRoute(route._id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 font-semibold">
                    Delete
                  </button>
                </div>
              </div>

              {/* Stop timeline */}
              <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2">
                {(route.stops || []).map((stop, i) => (
                  <React.Fragment key={i}>
                    <div className="flex-shrink-0 text-center">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold mx-auto"
                        style={{ background: route.color || '#3B82F6' }}>
                        {stop.sequence || i + 1}
                      </div>
                      <p className="text-xs text-gray-700 mt-1 max-w-[80px] truncate">{stop.name}</p>
                      <p className="text-xs text-gray-400">{stop.morningTime}</p>
                      {stop.studentCount > 0 && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded">
                          {stop.studentCount}👦
                        </span>
                      )}
                    </div>
                    {i < route.stops.length - 1 && (
                      <div className="h-0.5 flex-1 min-w-[20px]" style={{ background: route.color || '#3B82F6', opacity: 0.4 }} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Bus assigned */}
              {route.assignedBus && (
                <div className="mt-3 p-3 bg-gray-50 rounded-xl text-sm flex items-center gap-3">
                  <span>🚌</span>
                  <span className="font-semibold">{route.assignedBus.busNumber}</span>
                  <span className="text-gray-500">{route.assignedBus.driver?.name}</span>
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-500">📞 {route.assignedBus.driver?.phone}</span>
                </div>
              )}
            </div>
          ))}

          {routes.length === 0 && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-200">
              <div className="text-5xl mb-3">🛣️</div>
              <p className="font-medium">No routes yet. Create your first route.</p>
            </div>
          )}
        </div>
      )}

      {/* ── ASSIGNMENTS TAB ──────────────────────────────────────────────────── */}
      {tab === 'Assignments' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Student', 'Route', 'Bus', 'Pickup Stop', 'Drop Stop', 'Fee/Month', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.map((a) => (
                <tr key={a._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{a.student?.name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-lg text-xs font-semibold text-white"
                      style={{ background: a.route?.color || '#3B82F6' }}>
                      {a.route?.code}
                    </span>
                    <span className="ml-2 text-gray-500">{a.route?.name}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{a.bus?.busNumber}</td>
                  <td className="px-4 py-3">
                    <span className="text-gray-700">{a.pickupStop?.name}</span>
                    <span className="text-gray-400 text-xs ml-1">({a.pickupStop?.time})</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-gray-700">{a.dropStop?.name}</span>
                    <span className="text-gray-400 text-xs ml-1">({a.dropStop?.time})</span>
                  </td>
                  <td className="px-4 py-3 font-semibold">₹{a.monthlyFee}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => removeAssignment(a._id)}
                      className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 font-semibold">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">No assignments yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── BUS MODAL ───────────────────────────────────────────────────────── */}
      {showBusModal && (
        <Modal title={editingBus ? 'Edit Bus' : 'Add Bus'} onClose={() => setShowBusModal(false)}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bus Number" value={busForm.busNumber}
              onChange={(v) => setBusForm({ ...busForm, busNumber: v })} placeholder="BUS-01" />
            <Field label="Registration No" value={busForm.registrationNo}
              onChange={(v) => setBusForm({ ...busForm, registrationNo: v })} placeholder="MH12AB1234" />
            <Field label="Type" type="select" value={busForm.type}
              options={['bus', 'van', 'minibus', 'auto']}
              onChange={(v) => setBusForm({ ...busForm, type: v })} />
            <Field label="Capacity" type="number" value={busForm.capacity}
              onChange={(v) => setBusForm({ ...busForm, capacity: v })} />
            <Field label="Driver Name" value={busForm.driver?.name}
              onChange={(v) => setBusForm({ ...busForm, driver: { ...busForm.driver, name: v } })} />
            <Field label="Driver Phone" value={busForm.driver?.phone}
              onChange={(v) => setBusForm({ ...busForm, driver: { ...busForm.driver, phone: v } })} />
            <Field label="License No" value={busForm.driver?.license}
              onChange={(v) => setBusForm({ ...busForm, driver: { ...busForm.driver, license: v } })} />
            <Field label="Helper Name" value={busForm.helper?.name}
              onChange={(v) => setBusForm({ ...busForm, helper: { ...busForm.helper, name: v } })} />
            <Field label="Assign Route" type="select" value={busForm.assignedRoute || ''}
              options={[{ label: 'None', value: '' }, ...routes.map((r) => ({ label: r.name, value: r._id }))]}
              onChange={(v) => setBusForm({ ...busForm, assignedRoute: v })} />
            <Field label="Status" type="select" value={busForm.status}
              options={['active', 'maintenance', 'inactive']}
              onChange={(v) => setBusForm({ ...busForm, status: v })} />
          </div>
          {/* Color picker */}
          <div className="mt-4">
            <label className="text-xs font-semibold text-gray-600 uppercase block mb-2">Bus Color</label>
            <div className="flex gap-2">
              {BUS_COLORS.map((c) => (
                <button key={c} onClick={() => setBusForm({ ...busForm, color: c })}
                  className="w-8 h-8 rounded-full border-2 transition-all"
                  style={{ background: c, borderColor: busForm.color === c ? '#111' : 'transparent' }} />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowBusModal(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={saveBus}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
              {editingBus ? 'Update' : 'Add Bus'}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── ROUTE MODAL ─────────────────────────────────────────────────────── */}
      {showRouteModal && (
        <Modal title={editingRoute ? 'Edit Route' : 'Create Route'} onClose={() => setShowRouteModal(false)} wide>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Route Name" value={routeForm.name}
              onChange={(v) => setRouteForm({ ...routeForm, name: v })} placeholder="Route A — Hinjewadi" />
            <Field label="Route Code" value={routeForm.code}
              onChange={(v) => setRouteForm({ ...routeForm, code: v })} placeholder="RT-A" />
            <Field label="Morning Departure" type="time" value={routeForm.morningDepartureTime}
              onChange={(v) => setRouteForm({ ...routeForm, morningDepartureTime: v })} />
            <Field label="Evening Departure" type="time" value={routeForm.eveningDepartureTime}
              onChange={(v) => setRouteForm({ ...routeForm, eveningDepartureTime: v })} />
            <Field label="Assign Bus" type="select" value={routeForm.assignedBus || ''}
              options={[{ label: 'None', value: '' }, ...buses.map((b) => ({ label: `${b.busNumber} — ${b.driver?.name}`, value: b._id }))]}
              onChange={(v) => setRouteForm({ ...routeForm, assignedBus: v })} />
          </div>

          {/* Color picker */}
          <div className="mt-4">
            <label className="text-xs font-semibold text-gray-600 uppercase block mb-2">Route Color</label>
            <div className="flex gap-2">
              {BUS_COLORS.map((c) => (
                <button key={c} onClick={() => setRouteForm({ ...routeForm, color: c })}
                  className="w-8 h-8 rounded-full border-2 transition-all"
                  style={{ background: c, borderColor: routeForm.color === c ? '#111' : 'transparent' }} />
              ))}
            </div>
          </div>

          {/* Stops editor */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-gray-600 uppercase">Stops</label>
              <button onClick={addStop} className="text-xs px-3 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-semibold">
                + Add Stop
              </button>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {routeForm.stops.map((stop, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-3 grid grid-cols-5 gap-2 items-end">
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">Stop Name</label>
                    <input value={stop.name}
                      onChange={(e) => updateStop(idx, 'name', e.target.value)}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm" placeholder="Stop name" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Morning</label>
                    <input type="time" value={stop.morningArrivalTime}
                      onChange={(e) => updateStop(idx, 'morningArrivalTime', e.target.value)}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Evening</label>
                    <input type="time" value={stop.eveningArrivalTime}
                      onChange={(e) => updateStop(idx, 'eveningArrivalTime', e.target.value)}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <button onClick={() => removeStop(idx)}
                    className="text-red-400 hover:text-red-600 text-xs py-1.5 border border-red-200 rounded-lg">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowRouteModal(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={saveRoute}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
              {editingRoute ? 'Update Route' : 'Create Route'}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── ASSIGN STUDENT MODAL ────────────────────────────────────────────── */}
      {showAssignModal && (
        <Modal title="Assign Student to Transport" onClose={() => setShowAssignModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Student</label>
              <select value={assignForm.studentId}
                onChange={(e) => setAssignForm({ ...assignForm, studentId: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s._id} value={s._id}>{s.name} — {s.rollNumber}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Route</label>
              <select value={assignForm.routeId}
                onChange={(e) => {
                  const r = routes.find((rt) => rt._id === e.target.value);
                  setAssignForm({ ...assignForm, routeId: e.target.value, busId: r?.assignedBus?._id || '' });
                }}
                className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="">Select route</option>
                {routes.map((r) => (
                  <option key={r._id} value={r._id}>{r.name} ({r.code})</option>
                ))}
              </select>
            </div>
            {stopsForRoute.length > 0 && (
              <>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Pickup Stop</label>
                  <select value={assignForm.pickupStopName}
                    onChange={(e) => setAssignForm({ ...assignForm, pickupStopName: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm">
                    <option value="">Select pickup stop</option>
                    {stopsForRoute.filter((s) => s.name !== 'School Gate').map((s, i) => (
                      <option key={i} value={s.name}>{s.name} ({s.morningTime})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Drop Stop</label>
                  <select value={assignForm.dropStopName}
                    onChange={(e) => setAssignForm({ ...assignForm, dropStopName: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm">
                    <option value="">Select drop stop</option>
                    {stopsForRoute.map((s, i) => (
                      <option key={i} value={s.name}>{s.name} ({s.morningTime})</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <Field label="Monthly Fee (₹)" type="number" value={assignForm.monthlyFee}
              onChange={(v) => setAssignForm({ ...assignForm, monthlyFee: v })} />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowAssignModal(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={assignStudent}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
              Assign Student
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Btn({ children, onClick, color = 'blue' }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm bg-${color}-600 text-white rounded-xl font-semibold hover:bg-${color}-700`}>
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
  return (
    <span style={{ background: s.bg, color: s.text }}
      className="text-xs px-2 py-0.5 rounded-lg font-semibold">
      {s.label}
    </span>
  );
}

function InfoRow({ icon, label, sub }) {
  return (
    <div className="flex items-center gap-2 text-gray-600">
      <span>{icon}</span>
      <span>{label}</span>
      {sub && <span className="text-gray-400 text-xs">· {sub}</span>}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', options, placeholder }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">{label}</label>
      {type === 'select' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full border rounded-xl px-3 py-2 text-sm">
          {options?.map((o) =>
            typeof o === 'string'
              ? <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
              : <option key={o.value} value={o.value}>{o.label}</option>
          )}
        </select>
      ) : (
        <input type={type} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border rounded-xl px-3 py-2 text-sm" />
      )}
    </div>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function timeSince(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}
