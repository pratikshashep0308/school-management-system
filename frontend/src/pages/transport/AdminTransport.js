// frontend/src/pages/transport/AdminTransport.js
// ✅ FIXED & UPGRADED — Admin Transport Management
// Key fixes:
//   1. assignStudent now sends pickupStopId/dropStopId (not just names)
//   2. Stop dropdowns show Stop._id for correct backend mapping
//   3. Route delete uses routeId correctly
//   4. Added live GPS status indicator on bus cards
//   5. Assignments table shows routeId/busId populated fields

/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback } from 'react';
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
      <div style={{ padding:32, textAlign:"center", color:"#9CA3AF" }}>⏳ Loading transport data...</div>
    );
  }

  return (
    <div style={{ padding:"0", display:"flex", flexDirection:"column", gap:20 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:700, color:"#111827" }}>🚌 Transport Management</h1>
          <p style={{ fontSize:13, color:"#6B7280", marginTop:4 }}>
            {buses.length} buses · {routes.length} routes · {assignments.length} students assigned
          </p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {tab === 'Buses'       && <ActionBtn onClick={() => openBusModal()}>+ Add Bus</ActionBtn>}
          {tab === 'Routes'      && <ActionBtn onClick={() => openRouteModal()}>+ Add Route</ActionBtn>}
          {tab === 'Assignments' && <ActionBtn onClick={() => setShowAssignModal(true)}>+ Assign Student</ActionBtn>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:12, padding:4, width:'fit-content' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:'8px 20px', borderRadius:9, fontSize:13, fontWeight:700, border:'none', cursor:'pointer', transition:'all 0.15s',
              background: tab===t ? '#fff' : 'transparent',
              color:      tab===t ? '#1D4ED8' : '#6B7280',
              boxShadow:  tab===t ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── BUSES ─────────────────────────────────────────────────────────── */}
      {tab === 'Buses' && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:16 }}>
          {buses.map((bus) => {
            const lastUpdate = bus.currentLocation?.updatedAt;
            const secAgo = lastUpdate ? (Date.now() - new Date(lastUpdate)) / 1000 : Infinity;
            const isLive = secAgo < 120;
            return (
              <div key={bus._id} onClick={() => openBusModal(bus)} style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:16, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", cursor:"pointer", transition:"box-shadow 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.12)"}
                onMouseLeave={e => e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.06)"}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:44, height:44, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:20, background: bus.color || '#3B82F6' }}>🚌</div>
                    <div>
                      <p style={{ fontWeight:700, color:"#111827", margin:0 }}>{bus.busNumber}</p>
                      <p style={{ fontSize:11, color:"#6B7280", fontFamily:"monospace", margin:0 }}>{bus.registrationNo}</p>
                    </div>
                  </div>
                  <StatusBadge status={bus.status} />
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:13, color:"#4B5563" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span>👨‍✈️</span><span style={{ fontWeight:500 }}>{bus.driver?.name || "—"}</span>
                    {bus.driver?.phone && <span style={{ color:"#9CA3AF", fontSize:11 }}>· {bus.driver.phone}</span>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span>🛣️</span><span>{bus.assignedRoute?.name || 'No route assigned'}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span>💺</span><span>Cap: {bus.capacity} · {bus.type}</span>
                  </div>
                </div>

                {/* GPS badge */}
                <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:12, fontSize:11, fontWeight:500, padding:"5px 10px", borderRadius:8, width:"fit-content", background:isLive?"#F0FDF4":"#F3F4F6", color:isLive?"#15803D":"#6B7280" }}>
                  <span style={{ width:8, height:8, borderRadius:"50%", display:"inline-block", background:isLive?"#22C55E":"#9CA3AF" }} />
                  {isLive
                    ? `GPS Live · ${Math.round(bus.currentLocation.speed || 0)} km/h`
                    : lastUpdate ? `GPS: ${timeSince(lastUpdate)}` : 'GPS: No data'}
                </div>

                <div style={{ display:"flex", gap:8, marginTop:16 }}>
                  <button onClick={(e) => { e.stopPropagation(); openBusModal(bus); }}
                    style={{ flex:1, fontSize:12, padding:"6px", borderRadius:8, background:"#EFF6FF", color:"#1D4ED8", border:"none", cursor:"pointer", fontWeight:600 }}>
                    Edit
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteBus(bus._id); }}
                    style={{ fontSize:12, padding:"6px 12px", borderRadius:8, background:"#FEF2F2", color:"#EF4444", border:"none", cursor:"pointer", fontWeight:600 }}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          {buses.length === 0 && (
            <div style={{ gridColumn:"1/-1", textAlign:"center", padding:"64px 16px", color:"#9CA3AF", background:"#fff", borderRadius:16, border:"2px dashed #E5E7EB" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🚌</div>
              <p style={{ fontWeight:500 }}>No buses yet. Add your first bus.</p>
            </div>
          )}
        </div>
      )}

      {/* ── ROUTES ────────────────────────────────────────────────────────── */}
      {tab === 'Routes' && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {routes.map((route) => (
            <div key={route._id} onClick={() => openRouteModal(route)} style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:16, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", cursor:"pointer" }}
              onMouseEnter={e => e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.12)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.06)"}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:6, height:56, borderRadius:3, flexShrink:0, background: route.color || "#3B82F6" }} />
                  <div>
                    <p style={{ fontWeight:700, color:"#111827", fontSize:16, margin:0 }}>{route.name}</p>
                    <p style={{ fontSize:13, color:"#6B7280", margin:"4px 0 0" }}>
                      Code: <span style={{ fontFamily:"monospace", fontWeight:600 }}>{route.code}</span>
                      &nbsp;·&nbsp;{route.stops?.length || 0} stops
                      &nbsp;·&nbsp;<span style={{ fontWeight:600, color:"#1D4ED8" }}>{route.totalStudents || 0} students</span>
                    </p>
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={(e) => { e.stopPropagation(); openRouteModal(route); }}
                    style={{ fontSize:12, padding:"6px 12px", borderRadius:8, background:"#EFF6FF", color:"#1D4ED8", border:"none", cursor:"pointer", fontWeight:600 }}>Edit</button>
                  <button onClick={(e) => { e.stopPropagation(); deleteRoute(route._id); }}
                    style={{ fontSize:12, padding:"6px 12px", borderRadius:8, background:"#FEF2F2", color:"#EF4444", border:"none", cursor:"pointer", fontWeight:600 }}>Delete</button>
                </div>
              </div>

              {/* Stop timeline */}
              <div style={{ marginTop:16, display:"flex", alignItems:"center", gap:6, overflowX:"auto", paddingBottom:8 }}>
                {(route.stops || []).map((stop, i) => (
                  <React.Fragment key={i}>
                    <div style={{ flexShrink:0, textAlign:"center", minWidth:72 }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:11, fontWeight:700, margin:"0 auto", background: route.color || '#3B82F6' }}>
                        {stop.sequence || i + 1}
                      </div>
                      <p style={{ fontSize:11, color:"#374151", marginTop:4, maxWidth:72, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:500, margin:"4px 0 0" }}>{stop.name}</p>
                      <p style={{ fontSize:10, color:"#9CA3AF", margin:"2px 0 0" }}>{stop.morningTime}</p>
                      {stop.studentCount > 0 && (
                        <span style={{ fontSize:10, background:"#DBEAFE", color:"#1D4ED8", padding:"1px 6px", borderRadius:4, fontWeight:600 }}>
                          {stop.studentCount}👦
                        </span>
                      )}
                    </div>
                    {i < route.stops.length - 1 && (
                      <div style={{ height:2, flex:1, minWidth:16, borderRadius:2, background: route.color || "#3B82F6", opacity:0.35 }} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              {route.assignedBus && (
                <div style={{ marginTop:12, padding:"8px 12px", background:"#F9FAFB", borderRadius:10, fontSize:13, display:"flex", alignItems:"center", gap:12 }}>
                  <span>🚌</span>
                  <span style={{ fontWeight:600 }}>{route.assignedBus.busNumber}</span>
                  <span style={{ color:"#6B7280" }}>{route.assignedBus.driver?.name}</span>
                  <span style={{ color:"#9CA3AF" }}>·</span>
                  <span style={{ color:"#6B7280" }}>📞 {route.assignedBus.driver?.phone}</span>
                </div>
              )}
            </div>
          ))}
          {routes.length === 0 && (
            <div style={{ textAlign:"center", padding:"64px 16px", color:"#9CA3AF", background:"#fff", borderRadius:16, border:"2px dashed #E5E7EB" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🛣️</div>
              <p style={{ fontWeight:500 }}>No routes yet. Create your first route.</p>
            </div>
          )}
        </div>
      )}

      {/* ── ASSIGNMENTS ───────────────────────────────────────────────────── */}
      {tab === 'Assignments' && (
        <div style={{ background:"#fff", borderRadius:16, border:"1px solid #E5E7EB", overflow:"hidden" }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead style={{ background:"#0B1F4A" }}>
                <tr>
                  {['Student','Route','Bus','Pickup Stop','Drop Stop','Fee/Month','Pass','Actions'].map((h) => (
                    <th key={h} style={{ textAlign:"left", padding:"11px 16px", fontSize:10, fontWeight:700, color:"#E2E8F0", textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  // ✅ FIX: use routeId/busId populated fields
                  const route = a.routeId || a.route;
                  const bus   = a.busId   || a.bus;
                  return (
                    <tr key={a._id}
                      onClick={() => {
                        const route = a.routeId || a.route;
                        const bus   = a.busId   || a.bus;
                        setAssignForm({
                          studentId:    a.student?._id || '',
                          routeId:      route?._id     || '',
                          busId:        bus?._id       || '',
                          pickupStopId: a.pickupStopId?._id || '',
                          dropStopId:   a.dropStopId?._id   || '',
                          monthlyFee:   a.monthlyFee  || 1200,
                          passType:     a.passType    || 'both',
                        });
                        setShowAssignModal(true);
                      }}
                      style={{ borderBottom:"0.5px solid #F3F4F6", cursor:"pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background="#F9FAFB"}
                      onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                      <td style={{ padding:"10px 16px", fontWeight:600, color:"#111827" }}>{a.student?.user?.name || a.student?.name || "—"}</td>
                      <td style={{ padding:"10px 16px" }}>
                        {route && (
                          <span style={{ padding:"2px 8px", borderRadius:6, fontSize:11, fontWeight:700, color:"#fff", background: route.color || '#3B82F6' }}>
                            {route.code}
                          </span>
                        )}
                        <span style={{ marginLeft:8, color:"#4B5563" }}>{route?.name || "—"}</span>
                      </td>
                      <td style={{ padding:"10px 16px", fontFamily:"monospace", fontSize:12 }}>{bus?.busNumber || "—"}</td>
                      <td style={{ padding:"10px 16px" }}>
                        <span style={{ color:"#374151" }}>{a.pickupStopId?.name || a.pickupStop?.name || "—"}</span>
                        {(a.pickupStopId?.morningArrivalTime || a.pickupStop?.time) && <span style={{ color:"#9CA3AF", fontSize:11, marginLeft:4 }}>({a.pickupStopId?.morningArrivalTime || a.pickupStop?.time})</span>}
                      </td>
                      <td style={{ padding:"10px 16px" }}>
                        <span style={{ color:"#374151" }}>{a.dropStopId?.name || a.dropStop?.name || "—"}</span>
                        {(a.dropStopId?.eveningArrivalTime || a.dropStop?.time) && <span style={{ color:"#9CA3AF", fontSize:11, marginLeft:4 }}>({a.dropStopId?.eveningArrivalTime || a.dropStop?.time})</span>}
                      </td>
                      <td style={{ padding:"10px 16px", fontWeight:600 }}>₹{a.monthlyFee?.toLocaleString("en-IN")}</td>
                      <td style={{ padding:"10px 16px" }}>
                        <span style={{ fontSize:11, padding:"2px 8px", borderRadius:6, fontWeight:700, background: a.passType==='both'?'#DBEAFE':a.passType==='morning'?'#FEF3C7':'#EDE9FE', color: a.passType==='both'?'#1D4ED8':a.passType==='morning'?'#92400E':'#5B21B6' }}>
                          {a.passType || 'both'}
                        </span>
                      </td>
                      <td style={{ padding:"10px 16px" }}>
                        <button onClick={(e) => { e.stopPropagation(); removeAssignment(a._id); }}
                          style={{ fontSize:12, padding:"4px 10px", borderRadius:7, background:"#FEF2F2", color:"#EF4444", border:"none", cursor:"pointer", fontWeight:600 }}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {assignments.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign:"center", padding:"48px 16px", color:"#9CA3AF" }}>
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
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
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
          <div style={{ marginTop:16 }}>
            <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", display:"block", marginBottom:8 }}>Bus Color</label>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {BUS_COLORS.map((c) => (
                <button key={c} onClick={() => setBusForm({...busForm, color: c})}
                  style={{ width:32, height:32, borderRadius:"50%", border:"2px solid transparent", cursor:"pointer", background: c, borderColor: busForm.color === c ? '#111' : 'transparent', transform: busForm.color === c ? 'scale(1.15)' : 'scale(1)' }} />
              ))}
            </div>
          </div>
          <ModalFooter onCancel={() => setShowBusModal(false)} onSave={saveBus} saveLabel={saving ? 'Saving…' : editingBus ? 'Update Bus' : 'Add Bus'} />
        </Modal>
      )}

      {/* ─── ROUTE MODAL ─────────────────────────────────────────────────── */}
      {showRouteModal && (
        <Modal title={editingRoute ? 'Edit Route' : 'Create Route'} onClose={() => setShowRouteModal(false)} wide>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <Field label="Route Name *" value={routeForm.name} onChange={(v) => setRouteForm({...routeForm, name: v})} placeholder="Route A — Hinjewadi" />
            <Field label="Route Code *" value={routeForm.code} onChange={(v) => setRouteForm({...routeForm, code: v})} placeholder="RT-A" />
            <Field label="Morning Departure" type="time" value={routeForm.morningDepartureTime} onChange={(v) => setRouteForm({...routeForm, morningDepartureTime: v})} />
            <Field label="Evening Departure" type="time" value={routeForm.eveningDepartureTime} onChange={(v) => setRouteForm({...routeForm, eveningDepartureTime: v})} />
            <div style={{ gridColumn:"1/-1" }}>
              <Field label="Assign Bus" type="select" value={routeForm.assignedBus || ''}
                options={[{label:'— No bus —',value:''}, ...buses.map((b) => ({label:`${b.busNumber} — ${b.driver?.name||'No driver'}`, value: b._id}))]}
                onChange={(v) => setRouteForm({...routeForm, assignedBus: v})} />
            </div>
          </div>

          <div style={{ marginTop:16 }}>
            <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", display:"block", marginBottom:8 }}>Route Color</label>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {BUS_COLORS.map((c) => (
                <button key={c} onClick={() => setRouteForm({...routeForm, color: c})}
                  style={{ width:32, height:32, borderRadius:"50%", border:"2px solid transparent", cursor:"pointer", background: c, borderColor: routeForm.color === c ? '#111' : 'transparent' }} />
              ))}
            </div>
          </div>

          <div style={{ marginTop:20 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase" }}>Stops ({routeForm.stops.length})</label>
              <button onClick={addStop} style={{ fontSize:12, padding:"4px 12px", background:"#EFF6FF", color:"#1D4ED8", borderRadius:8, border:"none", cursor:"pointer", fontWeight:600 }}>+ Add Stop</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:288, overflowY:"auto" }}>
              {routeForm.stops.map((stop, idx) => (
                <div key={idx} style={{ background:"#F9FAFB", borderRadius:10, padding:12, display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr auto", gap:8, alignItems:"end" }}>
                  <div style={{ gridColumn:"1/-1" }}>
                    <label style={{ fontSize:11, color:"#6B7280", display:"block", marginBottom:4 }}>Stop Name *</label>
                    <input value={stop.name} onChange={(e) => updateStop(idx, 'name', e.target.value)}
                      style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:7, padding:"5px 8px", fontSize:12, outline:"none", boxSizing:"border-box" }}
                      placeholder="e.g. Hinjewadi Phase 1" />
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:"#6B7280", display:"block", marginBottom:4 }}>Morning</label>
                    <input type="time" value={stop.morningArrivalTime} onChange={(e) => updateStop(idx, 'morningArrivalTime', e.target.value)}
                      style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:7, padding:"5px 8px", fontSize:12, outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:"#6B7280", display:"block", marginBottom:4 }}>Evening</label>
                    <input type="time" value={stop.eveningArrivalTime} onChange={(e) => updateStop(idx, 'eveningArrivalTime', e.target.value)}
                      style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:7, padding:"5px 8px", fontSize:12, outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <button onClick={() => removeStop(idx)} disabled={routeForm.stops.length === 1}
                    style={{ padding:"6px 10px", border:"1px solid #FECACA", color:"#EF4444", background:"#FEF2F2", borderRadius:7, fontSize:12, cursor:"pointer" }}>✕</button>
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
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Student */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", display:"block", marginBottom:4 }}>Student *</label>
              {students.length === 0 ? (
                <div style={{ padding:12, background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:10, fontSize:13, color:"#92400E" }}>
                  ⚠️ No students loaded. Check permissions or add students first.
                </div>
              ) : (
                <select value={assignForm.studentId} onChange={(e) => setAssignForm({...assignForm, studentId: e.target.value})}
                  style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:9, padding:"8px 12px", fontSize:13, outline:"none", boxSizing:"border-box" }}>
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
              <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", display:"block", marginBottom:4 }}>Route *</label>
              <select value={assignForm.routeId}
                onChange={(e) => {
                  const r = routes.find((rt) => rt._id === e.target.value);
                  setAssignForm({ ...assignForm, routeId: e.target.value, busId: r?.assignedBus?._id || '', pickupStopId: '', dropStopId: '' });
                }}
                style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:9, padding:"8px 12px", fontSize:13, outline:"none", boxSizing:"border-box" }}>
                <option value="">— Select route —</option>
                {routes.map((r) => (
                  <option key={r._id} value={r._id}>{r.name} ({r.code}) · {r.stops?.length || 0} stops</option>
                ))}
              </select>
            </div>

            {/* Bus (auto-filled, can override) */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", display:"block", marginBottom:4 }}>
                Bus * {assignForm.busId && <span style={{ color:"#16A34A", fontWeight:400 }}>(auto-filled from route)</span>}
              </label>
              <select value={assignForm.busId} onChange={(e) => setAssignForm({...assignForm, busId: e.target.value})}
                style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:9, padding:"8px 12px", fontSize:13, outline:"none", boxSizing:"border-box" }}>
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
                  <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", display:"block", marginBottom:4 }}>Pickup Stop *</label>
                  <select value={assignForm.pickupStopId} onChange={(e) => setAssignForm({...assignForm, pickupStopId: e.target.value})}
                    style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:9, padding:"8px 12px", fontSize:13, outline:"none", boxSizing:"border-box" }}>
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
                  <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", display:"block", marginBottom:4 }}>Drop Stop *</label>
                  <select value={assignForm.dropStopId} onChange={(e) => setAssignForm({...assignForm, dropStopId: e.target.value})}
                    style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:9, padding:"8px 12px", fontSize:13, outline:"none", boxSizing:"border-box" }}>
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
              <div style={{ padding:12, background:"#FFF7ED", border:"1px solid #FED7AA", borderRadius:10, fontSize:13, color:"#9A3412" }}>
                ⚠️ This route has no stops. Please edit the route and add stops first.
              </div>
            ) : null}

            {/* Pass type & fee */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", display:"block", marginBottom:4 }}>Pass Type</label>
                <select value={assignForm.passType} onChange={(e) => setAssignForm({...assignForm, passType: e.target.value})}
                  style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:9, padding:"8px 12px", fontSize:13, outline:"none", boxSizing:"border-box" }}>
                  <option value="both">Both (Morning + Evening)</option>
                  <option value="morning">Morning Only</option>
                  <option value="evening">Evening Only</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", display:"block", marginBottom:4 }}>Monthly Fee (₹) *</label>
                <input type="number" value={assignForm.monthlyFee} min="0"
                  onChange={(e) => setAssignForm({...assignForm, monthlyFee: e.target.value})}
                  style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:9, padding:"8px 12px", fontSize:13, outline:"none", boxSizing:"border-box" }}
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
    <button onClick={onClick} style={{ padding:"8px 18px", fontSize:13, background:"#1D4ED8", color:"#fff", borderRadius:10, fontWeight:700, border:"none", cursor:"pointer" }}>
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
  return <span style={{ background: s.bg, color: s.text, fontSize:11, padding:"2px 8px", borderRadius:6, fontWeight:700 }}>{s.label}</span>;
}

function Field({ label, value, onChange, type = 'text', options, placeholder }) {
  const INP = { width:"100%", border:"1.5px solid #E5E7EB", borderRadius:9, padding:"8px 12px", fontSize:13, outline:"none", boxSizing:"border-box", background:"#fff" };
  return (
    <div>
      <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", display:"block", marginBottom:4 }}>{label}</label>
      {type === 'select' ? (
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={INP}>
          {options?.map((o) => typeof o === 'string'
            ? <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
          )}
        </select>
      ) : (
        <input type={type} value={value ?? ''} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} style={INP} />
      )}
    </div>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:500, padding:16 }}>
      <div style={{ background:"#fff", borderRadius:18, boxShadow:"0 20px 60px rgba(0,0,0,0.2)", width:"100%", maxWidth:wide?780:520, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", borderBottom:"1px solid #E5E7EB", position:"sticky", top:0, background:"#fff", zIndex:10, borderRadius:"18px 18px 0 0" }}>
          <h2 style={{ fontSize:17, fontWeight:700, color:"#111827", margin:0 }}>{title}</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, color:"#9CA3AF", cursor:"pointer", lineHeight:1 }}>✕</button>
        </div>
        <div style={{ padding:24 }}>{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onCancel, onSave, saveLabel, saveColor = 'blue' }) {
  const bg = saveColor === 'green' ? '#16A34A' : '#1D4ED8';
  return (
    <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:24, paddingTop:16, borderTop:"1px solid #F3F4F6" }}>
      <button onClick={onCancel} style={{ padding:"8px 18px", fontSize:13, color:"#6B7280", background:"#F3F4F6", border:"none", borderRadius:10, cursor:"pointer" }}>Cancel</button>
      <button onClick={onSave} style={{ padding:"8px 22px", fontSize:13, color:"#fff", background:bg, border:"none", borderRadius:10, fontWeight:700, cursor:"pointer" }}>{saveLabel}</button>
    </div>
  );
}

function timeSince(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}