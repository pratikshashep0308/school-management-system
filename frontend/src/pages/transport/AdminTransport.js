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
import StopMaster from '../../components/transport/StopMaster';
import api from '../../utils/api';

const TABS = ['Buses', 'Routes', 'Stop Master', 'Assignments', 'Summary', 'Report'];
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
  stops: [{ stopId: '', name: '', sequence: 1, morningArrivalTime: '', eveningArrivalTime: '', landmark: '' }],
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
  const [assignSearch, setAssignSearch] = useState('');
  const [fRoute,  setFRoute]  = useState('');   // filter by route
  const [fBus,    setFBus]    = useState('');   // filter by bus
  const [fStop,   setFStop]   = useState('');   // filter by stop (pickup OR drop)
  const [expanded, setExpanded] = useState(null);   // which summary row is expanded
  const [students,    setStudents]    = useState([]);
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
  const [allStops,   setAllStops]   = useState([]);   // every stop across all routes
  const [resolved,   setResolved]   = useState(null); // { route, bus } detected from pickup stop
  const [resolving,  setResolving]  = useState(false);

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
  // Load every stop, so pickup/drop can be chosen directly (no route needed first).
  useEffect(() => {
    stopAPI.getAll()
      .then(r => setAllStops(r.data?.data || []))
      .catch(() => setAllStops([]));
  }, []);

  // Choosing a PICKUP POINT auto-detects its route and that route's bus.
  useEffect(() => {
    const stopId = assignForm.pickupStopId;
    if (!stopId) { setResolved(null); return; }
    let active = true;
    setResolving(true);
    stopAPI.resolve(stopId)
      .then(r => {
        if (!active) return;
        const d = r.data?.data;
        setResolved(d || null);
        // Fill the route/bus ids the backend still requires
        setAssignForm(f => ({ ...f, routeId: d?.route?._id || '', busId: d?.bus?._id || '' }));
      })
      .catch(() => { if (active) { setResolved(null); toast.error('No route found for this stop'); } })
      .finally(() => { if (active) setResolving(false); });
    return () => { active = false; };
  }, [assignForm.pickupStopId]);

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
      _nameEdited: true,   // existing route already has a name — don't auto-overwrite it
      description: route.description || '',
      morningDepartureTime: route.morningDepartureTime,
      eveningDepartureTime: route.eveningDepartureTime,
      assignedBus: route.assignedBus?._id || '',
      stops: route.stops?.length > 0
        ? route.stops.map((s) => ({
            stopId: s.stop?._id || s.stop || '',
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
    ...f, stops: [...f.stops, { stopId: '', name: '', sequence: f.stops.length + 1, morningArrivalTime: '', eveningArrivalTime: '', landmark: '' }],
  }));
  const removeStop = (i) => setRouteForm((f) => {
    const stops = f.stops.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, sequence: idx + 1 }));
    return { ...f, stops, name: f._nameEdited ? f.name : suggestRouteName(stops) };
  });
  const updateStop = (i, key, val) => setRouteForm((f) => {
    const stops = f.stops.map((s, idx) => idx === i ? { ...s, [key]: val } : s);
    // Auto-suggest the route name (first → last stop) unless the user typed one.
    const name = f._nameEdited ? f.name : suggestRouteName(stops);
    return { ...f, stops, name };
  });

  // Build a friendly route name from the first and last named stops.
  const suggestRouteName = (stops) => {
    const named = (stops || []).map(s => (s.name || '').trim()).filter(Boolean);
    if (named.length === 0) return '';
    if (named.length === 1) return `${named[0]} route`;
    return `${named[0]} → ${named[named.length - 1]}`;
  };

  const saveRoute = async () => {
    setSaving(true);
    try {
      const { _nameEdited, _customName, ...routeData } = routeForm;
      const payload = { ...routeData, stops: routeForm.stops.filter((s) => s.name.trim()) };
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

  // ── Student counts, derived from the loaded assignments ────────────────────
  // How many students are assigned to each bus / route / stop.
  const idOf = (v) => (v && typeof v === 'object' ? v._id : v) || '';

  const countsByBus = {};
  const countsByRoute = {};
  const countsByStop = {};   // counts a student at BOTH their pickup and drop stop

  assignments.forEach((a) => {
    const busId   = idOf(a.busId   || a.bus);
    const routeId = idOf(a.routeId || a.route);
    const pickId  = idOf(a.pickupStopId || a.pickupStop);
    const dropId  = idOf(a.dropStopId   || a.dropStop);

    if (busId)   countsByBus[busId]     = (countsByBus[busId]   || 0) + 1;
    if (routeId) countsByRoute[routeId] = (countsByRoute[routeId] || 0) + 1;
    if (pickId)  countsByStop[pickId]   = (countsByStop[pickId]  || 0) + 1;
    // Only count the drop stop separately when it differs from the pickup
    if (dropId && dropId !== pickId) countsByStop[dropId] = (countsByStop[dropId] || 0) + 1;
  });

  // ── Search filter for assignments ──────────────────────────────────────────
  // Matches on: student name, route name/code, bus number, pickup stop, drop stop.
  // Helpers to read the populated refs consistently
  const aRoute  = (a) => a.routeId || a.route;
  const aBus    = (a) => a.busId   || a.bus;
  const aPickup = (a) => a.pickupStopId || a.pickupStop;
  const aDrop   = (a) => a.dropStopId   || a.dropStop;

  const q = assignSearch.trim().toLowerCase();
  const filteredAssignments = assignments.filter((a) => {
    // Dropdown filters
    if (fRoute && String(aRoute(a)?._id || '') !== fRoute) return false;
    if (fBus   && String(aBus(a)?._id   || '') !== fBus)   return false;
    if (fStop) {
      const pid = String(aPickup(a)?._id || '');
      const did = String(aDrop(a)?._id   || '');
      if (pid !== fStop && did !== fStop) return false;   // match pickup OR drop
    }
    if (!q) return true;
    return true;   // text search applied below
  }).filter((a) => {
    if (!q) return true;
    const route = a.routeId || a.route;
    const bus   = a.busId   || a.bus;
    const haystack = [
      a.student?.user?.name,
      a.student?.name,
      route?.name,
      route?.code,
      bus?.busNumber,
      bus?.registrationNo,
      a.pickupStopId?.name,
      a.pickupStop?.name,
      a.dropStopId?.name,
      a.dropStop?.name,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });



  // ── Transport report data sets ─────────────────────────────────────────────
  // Each returns { columns: [...], rows: [[...]] } used for PDF/CSV/print.
  const reportData = {
    students: () => ({
      title: 'Student Transport List',
      columns: ['#', 'Student', 'Class', 'Route', 'Bus', 'Pickup', 'Drop', 'Fee/Month', 'Status'],
      rows: assignments.map((a, i) => [
        i + 1,
        a.student?.user?.name || a.student?.name || '—',
        `${a.student?.class?.name || ''} ${a.student?.class?.section || ''}`.trim() || '—',
        `${aRoute(a)?.code ? aRoute(a).code + ' - ' : ''}${aRoute(a)?.name || '—'}`,
        aBus(a)?.busNumber || '—',
        aPickup(a)?.name || '—',
        aDrop(a)?.name || '—',
        `${Number(a.monthlyFee || 0).toLocaleString('en-IN')}`,
        a.isActive === false ? 'Inactive' : 'Active',
      ]),
    }),
    byBus: () => ({
      title: 'Bus-wise Student Count',
      columns: ['Bus', 'Registration', 'Capacity', 'Students Assigned'],
      rows: buses.map(b => [
        `Bus ${b.busNumber}`,
        b.registrationNo || '—',
        b.capacity ?? '—',
        countsByBus[b._id] || 0,
      ]),
    }),
    byRoute: () => ({
      title: 'Route-wise Student Count',
      columns: ['Route Code', 'Route Name', 'Students'],
      rows: routes.map(r => [ r.code || '—', r.name || '—', countsByRoute[r._id] || 0 ]),
    }),
    byStop: () => ({
      title: 'Stop-wise Student Count',
      columns: ['Stop', 'Students'],
      rows: allStops
        .map(st => [st.name, countsByStop[st._id] || 0])
        .sort((a, b) => b[1] - a[1]),
    }),
    fees: () => ({
      title: 'Transport Fee Summary',
      columns: ['Student', 'Route', 'Monthly Fee', 'Status'],
      rows: assignments.map(a => [
        a.student?.user?.name || a.student?.name || '—',
        aRoute(a)?.name || '—',
        `${Number(a.monthlyFee || 0).toLocaleString('en-IN')}`,
        a.isActive === false ? 'Inactive' : 'Active',
      ]),
    }),
  };

  const escCsv = (v) => {
    const str = String(v ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  // Excel-compatible CSV download (opens in Excel, no library needed)
  const exportCSV = (key) => {
    const d = reportData[key]();
    const lines = [d.columns.map(escCsv).join(','), ...d.rows.map(r => r.map(escCsv).join(','))];
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${d.title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Excel (CSV) downloaded');
  };

  // PDF (via print dialog → Save as PDF) and Print share the same renderer
  const exportPDF = (key, autoPrint = true) => {
    const d = reportData[key]();
    const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const html = `
      <html><head><title>${esc(d.title)}</title><style>
        body { font-family: system-ui, Arial, sans-serif; margin: 24px; color:#111827; }
        h1 { font-size:18px; color:#0B1F4A; margin:0 0 2px; }
        .sub { color:#6B7280; font-size:12px; margin-bottom:16px; }
        table { width:100%; border-collapse:collapse; font-size:11px; }
        th { background:#0B1F4A; color:#fff; text-align:left; padding:6px 8px; }
        td { padding:6px 8px; border-bottom:1px solid #F3F4F6; }
        tr:nth-child(even) td { background:#F9FAFB; }
        @media print { body { margin:12mm; } }
      </style></head><body>
        <h1>🚌 ${esc(d.title)}</h1>
        <div class="sub">The Future Step School · ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})} · ${d.rows.length} record(s)</div>
        <table>
          <thead><tr>${d.columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${d.rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Please allow pop-ups'); return; }
    w.document.write(html); w.document.close(); w.focus();
    if (autoPrint) setTimeout(() => w.print(), 400);
  };

  // ── Printable Transport Report ─────────────────────────────────────────────
  // Opens a clean, print-ready page: totals, students grouped by bus & route,
  // and per-stop counts. Uses window.print() so it can be saved as a PDF.
  const printTransportReport = () => {
    const esc = (v) => String(v ?? '—')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const rowsFor = (matchFn) => assignments.filter(matchFn);

    const section = (title, groups) => `
      <h2>${esc(title)}</h2>
      ${groups.map(g => `
        <div class="grp">
          <div class="grp-head">
            <span>${esc(g.label)}</span>
            <span class="count">${g.rows.length} student${g.rows.length === 1 ? '' : 's'}</span>
          </div>
          ${g.rows.length === 0 ? '<p class="empty">No students assigned.</p>' : `
            <table>
              <thead><tr><th>#</th><th>Student</th><th>Class</th><th>Pickup</th><th>Drop</th><th>Fee/Month</th></tr></thead>
              <tbody>
                ${g.rows.map((a, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${esc(a.student?.user?.name || a.student?.name)}</td>
                    <td>${esc(a.student?.class?.name || '')} ${esc(a.student?.class?.section || '')}</td>
                    <td>${esc(aPickup(a)?.name)}</td>
                    <td>${esc(aDrop(a)?.name)}</td>
                    <td>₹${Number(a.monthlyFee || 0).toLocaleString('en-IN')}</td>
                  </tr>`).join('')}
              </tbody>
            </table>`}
        </div>`).join('')}
    `;

    const byBus = buses.map(b => ({
      label: `Bus ${b.busNumber}${b.registrationNo ? ` (${b.registrationNo})` : ''}`,
      rows: rowsFor(a => idOf(aBus(a)) === b._id),
    }));
    const byRoute = routes.map(r => ({
      label: `${r.code ? r.code + ' — ' : ''}${r.name}`,
      rows: rowsFor(a => idOf(aRoute(a)) === r._id),
    }));

    const stopRows = allStops
      .map(st => ({ name: st.name, count: countsByStop[st._id] || 0 }))
      .sort((x, y) => y.count - x.count);

    const totalFee = assignments.reduce((sum, a) => sum + Number(a.monthlyFee || 0), 0);

    const html = `
      <html><head><title>Transport Report</title><style>
        * { box-sizing: border-box; }
        body { font-family: system-ui, Arial, sans-serif; margin: 24px; color: #111827; }
        h1 { font-size: 20px; margin: 0 0 2px; color: #0B1F4A; }
        .sub { color: #6B7280; font-size: 12px; margin-bottom: 18px; }
        h2 { font-size: 14px; margin: 22px 0 8px; color: #0B1F4A;
             border-bottom: 2px solid #0B1F4A; padding-bottom: 4px; }
        .tiles { display: flex; gap: 10px; margin-bottom: 8px; }
        .tile { flex: 1; border: 1px solid #E5E7EB; border-radius: 8px; padding: 10px; text-align: center; }
        .tile .n { font-size: 18px; font-weight: 800; color: #0B1F4A; }
        .tile .l { font-size: 10px; color: #6B7280; text-transform: uppercase; }
        .grp { margin-bottom: 12px; break-inside: avoid; }
        .grp-head { display: flex; justify-content: space-between; background: #F3F4F6;
                    padding: 6px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; }
        .count { color: #6B7280; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
        th { background: #0B1F4A; color: #fff; text-align: left; padding: 5px 8px; font-size: 10px; }
        td { padding: 5px 8px; border-bottom: 1px solid #F3F4F6; }
        .empty { font-size: 11px; color: #9CA3AF; padding: 6px 10px; margin: 0; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
        <h1>🚌 Transport Report</h1>
        <div class="sub">The Future Step School · Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>

        <div class="tiles">
          <div class="tile"><div class="n">${buses.length}</div><div class="l">Buses</div></div>
          <div class="tile"><div class="n">${routes.length}</div><div class="l">Routes</div></div>
          <div class="tile"><div class="n">${allStops.length}</div><div class="l">Stops</div></div>
          <div class="tile"><div class="n">${assignments.length}</div><div class="l">Students</div></div>
          <div class="tile"><div class="n">₹${totalFee.toLocaleString('en-IN')}</div><div class="l">Monthly Fees</div></div>
        </div>

        ${section('Students by Bus', byBus)}
        ${section('Students by Route', byRoute)}

        <h2>Students per Stop</h2>
        <table>
          <thead><tr><th>Stop</th><th>Students</th></tr></thead>
          <tbody>
            ${stopRows.map(r => `<tr><td>${esc(r.name)}</td><td>${r.count}</td></tr>`).join('')}
          </tbody>
        </table>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { toast.error('Please allow pop-ups to print the report'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
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
                    <span>💺</span>
                    <span>Cap: {bus.capacity} · {bus.type}</span>
                  </div>
                  {/* Students assigned to this bus, with a seats-filled indicator */}
                  {(() => {
                    const n   = countsByBus[bus._id] || 0;
                    const cap = Number(bus.capacity) || 0;
                    const pct = cap ? Math.min(100, Math.round((n / cap) * 100)) : 0;
                    const full = cap && n >= cap;
                    return (
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span>👥</span>
                        <span style={{ fontWeight:700, color: full ? '#B91C1C' : '#0B1F4A' }}>
                          {n} student{n === 1 ? '' : 's'}
                        </span>
                        {cap ? (
                          <>
                            <span style={{ flex:1, height:6, background:'#F3F4F6', borderRadius:20, overflow:'hidden', minWidth:50 }}>
                              <span style={{ display:'block', height:'100%', width:`${pct}%`, background: full ? '#DC2626' : pct > 75 ? '#F59E0B' : '#22C55E' }} />
                            </span>
                            <span style={{ fontSize:11, color:'#9CA3AF', whiteSpace:'nowrap' }}>{cap - n} free</span>
                          </>
                        ) : null}
                      </div>
                    );
                  })()}
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

      {/* ── STOP MASTER ───────────────────────────────────────────────────── */}
      {tab === 'Stop Master' && <StopMaster />}

      {/* ── ASSIGNMENTS ───────────────────────────────────────────────────── */}
      {tab === 'Assignments' && (
        <div style={{ background:"#fff", borderRadius:16, border:"1px solid #E5E7EB", overflow:"hidden" }}>
          {/* Search + filters */}
          <div style={{ padding:"14px 16px", borderBottom:"1px solid #F3F4F6", display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
              <div style={{ position:"relative", flex:1, minWidth:240 }}>
                <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", fontSize:14 }}>🔍</span>
                <input
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  placeholder="Search by student, route, bus no., pickup or drop stop…"
                  style={{ width:"100%", padding:"9px 12px 9px 34px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none", boxSizing:"border-box" }}
                />
              </div>
              <span style={{ fontSize:12, color:"#9CA3AF", fontWeight:600, whiteSpace:"nowrap" }}>
                {filteredAssignments.length} of {assignments.length}
              </span>
            </div>

            <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
              <select value={fRoute} onChange={(e) => setFRoute(e.target.value)}
                style={{ padding:"8px 10px", borderRadius:8, border:"1.5px solid #E5E7EB", fontSize:12, minWidth:150, cursor:"pointer" }}>
                <option value="">All Routes</option>
                {routes.map(r => (
                  <option key={r._id} value={r._id}>
                    {r.code ? `${r.code} — ` : ''}{r.name} ({countsByRoute[r._id] || 0})
                  </option>
                ))}
              </select>

              <select value={fBus} onChange={(e) => setFBus(e.target.value)}
                style={{ padding:"8px 10px", borderRadius:8, border:"1.5px solid #E5E7EB", fontSize:12, minWidth:150, cursor:"pointer" }}>
                <option value="">All Buses</option>
                {buses.map(b => (
                  <option key={b._id} value={b._id}>
                    Bus {b.busNumber} ({countsByBus[b._id] || 0})
                  </option>
                ))}
              </select>

              <select value={fStop} onChange={(e) => setFStop(e.target.value)}
                style={{ padding:"8px 10px", borderRadius:8, border:"1.5px solid #E5E7EB", fontSize:12, minWidth:150, cursor:"pointer" }}>
                <option value="">All Stops</option>
                {allStops.map(st => (
                  <option key={st._id} value={st._id}>
                    {st.name} ({countsByStop[st._id] || 0})
                  </option>
                ))}
              </select>

              {(fRoute || fBus || fStop || assignSearch) && (
                <button onClick={() => { setFRoute(''); setFBus(''); setFStop(''); setAssignSearch(''); }}
                  style={{ padding:"8px 14px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", color:"#374151", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Table (left) + Summary (right) side by side */}
          <div style={{ display:"flex", gap:0, alignItems:"stretch", flexWrap:"wrap" }}>

          {/* ── Summary rail — sits to the RIGHT of the assignments table ── */}
          {false && (
            <div style={{ order:2, width:300, flexShrink:0, padding:14, borderLeft:"1px solid #F3F4F6", background:"#F9FAFB", display:"flex", flexDirection:"column", gap:12, maxHeight:600, overflowY:"auto" }}>
              {[
                { key:'bus',   title:'🚌 Students per Bus',   rows: buses.map(b  => ({ id:b._id,  label:`Bus ${b.busNumber}`, count: countsByBus[b._id]  || 0, match: a => idOf(aBus(a))    === b._id  })) },
                { key:'route', title:'🛣️ Students per Route', rows: routes.map(r => ({ id:r._id,  label:`${r.code ? r.code+' — ' : ''}${r.name}`, count: countsByRoute[r._id] || 0, match: a => idOf(aRoute(a)) === r._id })) },
                { key:'stop',  title:'📍 Students per Stop',  rows: allStops.map(st => ({ id:st._id, label:st.name, count: countsByStop[st._id] || 0, match: a => idOf(aPickup(a)) === st._id || idOf(aDrop(a)) === st._id })) },
              ].map(group => (
                <div key={group.key} style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, overflow:"hidden" }}>
                  <div style={{ background:"#0B1F4A", padding:"9px 14px", color:"#fff", fontWeight:800, fontSize:12 }}>{group.title}</div>
                  <div style={{ maxHeight:260, overflowY:"auto" }}>
                    {group.rows.length === 0 ? (
                      <div style={{ padding:16, textAlign:"center", color:"#9CA3AF", fontSize:12 }}>None yet.</div>
                    ) : group.rows.map(row => {
                      const key = `${group.key}:${row.id}`;
                      const isOpen = expanded === key;
                      const members = assignments.filter(row.match);
                      return (
                        <div key={row.id} style={{ borderBottom:"1px solid #F3F4F6" }}>
                          <button onClick={() => setExpanded(isOpen ? null : key)}
                            style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 14px", background:"none", border:"none", cursor:"pointer", textAlign:"left" }}>
                            <span style={{ fontSize:12, fontWeight:700, color:"#0B1F4A" }}>
                              {isOpen ? '▾' : '▸'} {row.label}
                            </span>
                            <span style={{ fontSize:11, fontWeight:800, padding:"2px 9px", borderRadius:20, background: row.count ? '#DCFCE7' : '#F3F4F6', color: row.count ? '#166534' : '#9CA3AF' }}>
                              {row.count}
                            </span>
                          </button>
                          {isOpen && (
                            <div style={{ padding:"0 14px 10px 26px" }}>
                              {members.length === 0 ? (
                                <div style={{ fontSize:11, color:"#9CA3AF", padding:"4px 0" }}>No students assigned.</div>
                              ) : members.map(m => (
                                <div key={m._id} style={{ fontSize:12, color:"#374151", padding:"3px 0", display:"flex", justifyContent:"space-between", gap:8 }}>
                                  <span>{m.student?.user?.name || m.student?.name || 'Student'}</span>
                                  <span style={{ color:"#9CA3AF", fontSize:11, whiteSpace:"nowrap" }}>
                                    {aPickup(m)?.name || '—'} → {aDrop(m)?.name || '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ order:1, flex:1, minWidth:0, overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead style={{ background:"#0B1F4A" }}>
                <tr>
                  {['Student','Route','Bus','Pickup Stop','Drop Stop','Fee/Month','Pass','Actions'].map((h) => (
                    <th key={h} style={{ textAlign:"left", padding:"11px 16px", fontSize:10, fontWeight:700, color:"#E2E8F0", textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding:"32px 16px", textAlign:"center", color:"#9CA3AF", fontSize:13 }}>
                      {assignments.length === 0 ? 'No students assigned to transport yet.' : 'No matches found. Try a different search.'}
                    </td>
                  </tr>
                )}
                {filteredAssignments.map((a) => {
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

          </div>{/* /flex: table + summary */}
        </div>
      )}

      {/* ─── SUMMARY TAB ──────────────────────────────────────────────────── */}
      {tab === 'Summary' && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:16 }}>
          {[
            { key:'bus',   title:'🚌 Students per Bus',   rows: buses.map(b  => ({ id:b._id,  label:`Bus ${b.busNumber}`, count: countsByBus[b._id]  || 0, match: a => idOf(aBus(a))    === b._id  })) },
            { key:'route', title:'🛣️ Students per Route', rows: routes.map(r => ({ id:r._id,  label:`${r.code ? r.code+' — ' : ''}${r.name}`, count: countsByRoute[r._id] || 0, match: a => idOf(aRoute(a)) === r._id })) },
            { key:'stop',  title:'📍 Students per Stop',  rows: allStops.map(st => ({ id:st._id, label:st.name, count: countsByStop[st._id] || 0, match: a => idOf(aPickup(a)) === st._id || idOf(aDrop(a)) === st._id })) },
          ].map(group => (
            <div key={group.key} style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:14, overflow:"hidden" }}>
              <div style={{ background:"#0B1F4A", padding:"11px 16px", color:"#fff", fontWeight:800, fontSize:13 }}>{group.title}</div>
              <div style={{ maxHeight:420, overflowY:"auto" }}>
                {group.rows.length === 0 ? (
                  <div style={{ padding:20, textAlign:"center", color:"#9CA3AF", fontSize:13 }}>None yet.</div>
                ) : group.rows.map(row => {
                  const key = `${group.key}:${row.id}`;
                  const isOpen = expanded === key;
                  const members = assignments.filter(row.match);
                  return (
                    <div key={row.id} style={{ borderBottom:"1px solid #F3F4F6" }}>
                      <button onClick={() => setExpanded(isOpen ? null : key)}
                        style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 16px", background:"none", border:"none", cursor:"pointer", textAlign:"left" }}>
                        <span style={{ fontSize:13, fontWeight:700, color:"#0B1F4A" }}>{isOpen ? '▾' : '▸'} {row.label}</span>
                        <span style={{ fontSize:12, fontWeight:800, padding:"2px 10px", borderRadius:20, background: row.count ? '#DCFCE7' : '#F3F4F6', color: row.count ? '#166534' : '#9CA3AF' }}>{row.count}</span>
                      </button>
                      {isOpen && (
                        <div style={{ padding:"0 16px 12px 30px" }}>
                          {members.length === 0 ? (
                            <div style={{ fontSize:12, color:"#9CA3AF", padding:"4px 0" }}>No students assigned.</div>
                          ) : members.map(m => (
                            <div key={m._id} style={{ fontSize:13, color:"#374151", padding:"4px 0", display:"flex", justifyContent:"space-between", gap:8 }}>
                              <span>{m.student?.user?.name || m.student?.name || 'Student'}</span>
                              <span style={{ color:"#9CA3AF", fontSize:12, whiteSpace:"nowrap" }}>{aPickup(m)?.name || '—'} → {aDrop(m)?.name || '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── REPORTS TAB ──────────────────────────────────────────────────── */}
      {tab === 'Report' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:16 }}>
          {[
            { key:'students', icon:'👥', title:'Student Transport List', desc:'All students with route, bus, stops, fee & status.' },
            { key:'byBus',    icon:'🚌', title:'Bus-wise Report',        desc:'Student count per bus, with capacity.' },
            { key:'byRoute',  icon:'🛣️', title:'Route-wise Report',      desc:'Student count per route.' },
            { key:'byStop',   icon:'📍', title:'Stop-wise Report',       desc:'Student count per pickup/drop stop.' },
            { key:'fees',     icon:'💰', title:'Transport Fee Summary',  desc:'Monthly transport fee per student.' },
          ].map(rep => (
            <div key={rep.key} style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, padding:18, display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ fontSize:26 }}>{rep.icon}</div>
              <div>
                <div style={{ fontWeight:800, fontSize:15, color:'#0B1F4A' }}>{rep.title}</div>
                <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>{rep.desc}</div>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
                <button onClick={() => exportPDF(rep.key, true)}
                  style={{ flex:1, minWidth:80, padding:'8px 12px', borderRadius:8, border:'none', background:'#DC2626', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  📄 PDF
                </button>
                <button onClick={() => exportCSV(rep.key)}
                  style={{ flex:1, minWidth:80, padding:'8px 12px', borderRadius:8, border:'none', background:'#16A34A', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  📊 Excel
                </button>
                <button onClick={() => exportPDF(rep.key, true)}
                  style={{ flex:1, minWidth:80, padding:'8px 12px', borderRadius:8, border:'1.5px solid #0B1F4A', background:'#fff', color:'#0B1F4A', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  🖨️ Print
                </button>
              </div>
            </div>
          ))}

          {/* Full combined report */}
          <div style={{ background:'#0B1F4A', borderRadius:14, padding:18, display:'flex', flexDirection:'column', gap:10, justifyContent:'center' }}>
            <div style={{ fontSize:26 }}>📋</div>
            <div>
              <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>Full Transport Report</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:2 }}>Everything: totals, students grouped by bus & route, per-stop counts.</div>
            </div>
            <button onClick={printTransportReport}
              style={{ padding:'9px 16px', borderRadius:8, border:'none', background:'#fff', color:'#0B1F4A', fontSize:12, fontWeight:800, cursor:'pointer', marginTop:6 }}>
              🖨️ Generate Full Report (PDF)
            </button>
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
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", display:"block", marginBottom:6 }}>Route Name *</label>
              <select
                value={routeForm._customName ? '__custom__' : (allStops.some(s => s.name === routeForm.name) ? routeForm.name : (routeForm.name ? '__custom__' : ''))}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__custom__') { setRouteForm({ ...routeForm, name: '', _customName: true, _nameEdited: true }); }
                  else { setRouteForm({ ...routeForm, name: v, _customName: false, _nameEdited: true }); }
                }}
                style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box", background:"#fff" }}>
                <option value="">— Select a stop name —</option>
                {[...new Set(allStops.map(s => s.name).filter(Boolean))].sort().map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
                <option value="__custom__">+ Type a custom name…</option>
              </select>
              {/* Show the text box whenever custom mode is on, OR the saved name isn't a Stop Master name */}
              {(routeForm._customName || (!!routeForm.name && !allStops.some(s => s.name === routeForm.name))) && (
                <input value={routeForm.name} autoFocus
                  onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value, _customName: true, _nameEdited: true })}
                  placeholder="Type a custom route name (e.g. Koparli → TFSS)"
                  style={{ width:"100%", border:"1.5px solid #1D4ED8", borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box", marginTop:6 }} />
              )}
            </div>
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
                    <label style={{ fontSize:11, color:"#6B7280", display:"block", marginBottom:4 }}>Stop *</label>
                    <select
                      value={stop.stopId || ''}
                      onChange={(e) => {
                        const picked = allStops.find(s => s._id === e.target.value);
                        if (picked) {
                          // Fill name + times from the Stop Master entry
                          updateStop(idx, 'stopId', picked._id);
                          updateStop(idx, 'name', picked.name);
                          updateStop(idx, 'morningArrivalTime', picked.morningArrivalTime || '');
                          updateStop(idx, 'eveningArrivalTime', picked.eveningArrivalTime || '');
                        } else {
                          // "New stop" chosen — clear the ref so the typed name is used
                          updateStop(idx, 'stopId', '');
                        }
                      }}
                      style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:7, padding:"5px 8px", fontSize:12, outline:"none", boxSizing:"border-box", background:"#fff" }}>
                      <option value="">— Select from Stop Master —</option>
                      {allStops.map(s => (
                        <option key={s._id} value={s._id}>{s.name}</option>
                      ))}
                      <option value="__new__">+ Type a new stop name…</option>
                    </select>
                    {(stop.stopId === '' || stop.stopId === '__new__' || !stop.stopId) && (
                      <input value={stop.name} onChange={(e) => updateStop(idx, 'name', e.target.value)}
                        style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:7, padding:"5px 8px", fontSize:12, outline:"none", boxSizing:"border-box", marginTop:6 }}
                        placeholder="New stop name (added to Stop Master on save)" />
                    )}
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
        <Modal title="Assign Student to Transport" onClose={() => { setShowAssignModal(false); setAssignForm(emptyAssign()); setResolved(null); }}>
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

            {/* ── PICKUP POINT — choosing this auto-detects route & bus ── */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", display:"block", marginBottom:4 }}>Pickup Point *</label>
              <select value={assignForm.pickupStopId}
                onChange={(e) => setAssignForm({ ...assignForm, pickupStopId: e.target.value, dropStopId: '' })}
                style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:9, padding:"8px 12px", fontSize:13, outline:"none", boxSizing:"border-box" }}>
                <option value="">— Select pickup point —</option>
                {allStops.map((st) => (
                  <option key={st._id} value={st._id}>
                    {st.name}{st.morningArrivalTime ? ` \u00b7 ${st.morningArrivalTime}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* ── AUTO-DETECTED route & bus ── */}
            {resolving && (
              <div style={{ padding:12, background:"#F9FAFB", border:"1px solid #E5E7EB", borderRadius:10, fontSize:13, color:"#6B7280", textAlign:"center" }}>
                Finding route &amp; bus...
              </div>
            )}
            {!resolving && resolved && (
              <div style={{ padding:14, background:"#ECFDF5", border:"1px solid #A7F3D0", borderRadius:12 }}>
                <div style={{ fontSize:10, fontWeight:800, color:"#047857", textTransform:"uppercase", marginBottom:8 }}>
                  Auto-detected from pickup point
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  <div>
                    <div style={{ fontSize:10, color:"#059669", textTransform:"uppercase", fontWeight:700 }}>Route</div>
                    <div style={{ display:"flex", alignItems:"center", gap:7, marginTop:3 }}>
                      {resolved.route?.code && (
                        <span style={{ padding:"2px 8px", borderRadius:6, fontSize:11, fontWeight:700, color:"#fff", background: resolved.route.color || '#3B82F6' }}>
                          {resolved.route.code}
                        </span>
                      )}
                      <span style={{ fontSize:13, fontWeight:700, color:"#065F46" }}>{resolved.route?.name || '-'}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:"#059669", textTransform:"uppercase", fontWeight:700 }}>Bus</div>
                    {resolved.bus ? (
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:"#065F46", marginTop:3, fontFamily:"monospace" }}>
                          {resolved.bus.busNumber}
                        </div>
                        <div style={{ fontSize:11, color:"#059669" }}>
                          {resolved.bus.registrationNo}
                          {resolved.bus.driver?.name ? ` \u00b7 ${resolved.bus.driver.name}` : ''}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize:12, color:"#B45309", marginTop:3 }}>
                        No bus assigned to this route yet
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── DROP POINT — only stops on the detected route ── */}
            {resolved && (
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", display:"block", marginBottom:4 }}>Drop Point *</label>
                <select value={assignForm.dropStopId}
                  onChange={(e) => setAssignForm({ ...assignForm, dropStopId: e.target.value })}
                  style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:9, padding:"8px 12px", fontSize:13, outline:"none", boxSizing:"border-box" }}>
                  <option value="">— Select drop point —</option>
                  {allStops
                    .filter((st) => String(st.route) === String(resolved.route?._id))
                    .map((st) => (
                      <option key={st._id} value={st._id}>
                        {st.name}{st.eveningArrivalTime ? ` \u00b7 ${st.eveningArrivalTime}` : ''}
                      </option>
                    ))}
                </select>
                <div style={{ fontSize:11, color:"#9CA3AF", marginTop:4 }}>
                  Showing stops on {resolved.route?.name || 'this route'}.
                </div>
              </div>
            )}

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