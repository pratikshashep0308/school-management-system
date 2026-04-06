// frontend/src/pages/transport/LiveTracking.js
// Admin live tracking: all buses on map, GPS simulation, trip management, alerts

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { busAPI, tripAPI, routeAPI } from '../../utils/transportAPI';
import { useTransportSocket } from '../../utils/useTransportSocket';
import { useAuth } from '../../context/AuthContext';
import LiveMap from '../../components/transport/LiveMap';

export default function LiveTracking() {
  const { user } = useAuth();
  const [buses,         setBuses]         = useState([]);
  const [routes,        setRoutes]        = useState([]);
  const [trips,         setTrips]         = useState([]);
  const [liveLocations, setLive]          = useState({});
  const [selectedId,    setSelectedId]    = useState(null);
  const [simulating,    setSimulating]    = useState({});
  const [alerts,        setAlerts]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showTripModal, setShowTripModal] = useState(false);
  const [tripForm,      setTripForm]      = useState({ routeId: '', busId: '', tripType: 'morning' });

  const load = useCallback(async () => {
    try {
      const [bRes, rRes, tRes] = await Promise.all([
        busAPI.getAll(),
        routeAPI.getAll(),
        tripAPI.today(),
      ]);
      const activeBuses = bRes.data.data?.filter((b) => b.status === 'active') || [];
      setBuses(activeBuses);
      setRoutes(rRes.data.data || []);
      setTrips(tRes.data.data || []);

      // Seed current positions from DB
      const positions = {};
      activeBuses.forEach((b) => {
        if (b.currentLocation?.lat) {
          positions[b._id] = {
            ...b.currentLocation,
            vehicleId: b._id,
            busNumber: b.busNumber,
            color:     b.color || b.assignedRoute?.color,
          };
        }
      });
      setLive(positions);
    } catch {
      toast.error('Failed to load tracking data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Socket callbacks ───────────────────────────────────────────────────────
  const onLocationUpdate = useCallback((payload) => {
    setLive((prev) => ({
      ...prev,
      [payload.vehicleId || payload.busId]: {
        ...payload,
        vehicleId: payload.vehicleId || payload.busId,
      },
    }));
  }, []);

  const onTripAlert = useCallback((alert) => {
    setAlerts((prev) => [{ ...alert, id: Date.now() }, ...prev].slice(0, 10));
    const icons = { emergency: '🚨', delay: '⏰', breakdown: '🔧', route_change: '🔀' };
    toast(`${icons[alert.type] || '📢'} ${alert.message}`, {
      duration: alert.type === 'emergency' ? 10000 : 5000,
    });
  }, []);

  const onDriverOnline  = useCallback((d) => toast.success(`🟢 Driver online: Bus ${d.busId?.slice(-5)}`), []);
  const onDriverOffline = useCallback((d) => toast(`⭕ Driver offline: Bus ${d.busId?.slice(-5)}`), []);

  const { startSimulation, stopSimulation, isConnected } = useTransportSocket({
    schoolId: user?.school,
    onLocationUpdate,
    onTripAlert,
    onDriverOnline,
    onDriverOffline,
  });

  const toggleSim = (busId, routeId) => {
    if (simulating[busId]) {
      stopSimulation(busId);
      setSimulating((s) => ({ ...s, [busId]: false }));
      toast('⏹ Simulation stopped');
    } else {
      startSimulation(busId, routeId);
      setSimulating((s) => ({ ...s, [busId]: true }));
      toast.success('▶ GPS simulation started');
    }
  };

  const startTrip = async () => {
    try {
      await tripAPI.start(tripForm);
      toast.success('Trip started!');
      setShowTripModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start trip');
    }
  };

  const endTrip = async (id) => {
    try {
      await tripAPI.end(id);
      toast.success('Trip ended');
      load();
    } catch {
      toast.error('Failed to end trip');
    }
  };

  const sendAlert = async (tripId, type) => {
    const messages = {
      delay:        'Bus is running 10 minutes late',
      breakdown:    '🔧 Vehicle breakdown — sending replacement',
      route_change: '🔀 Route changed due to traffic',
      emergency:    '🚨 Emergency! Please contact school immediately',
    };
    try {
      await tripAPI.sendAlert(tripId, { type, message: messages[type] });
      toast.success('Alert sent to all parents');
    } catch {
      toast.error('Failed to send alert');
    }
  };

  const selected        = buses.find((b) => b._id === selectedId);
  const selectedLoc     = selectedId ? liveLocations[selectedId] : null;
  const tripForSelected = trips.find((t) =>
    t.bus?._id === selectedId || t.bus === selectedId
  );

  // Build routes for map (with stop coords)
  const routesForMap = routes.map((r) => ({
    ...r,
    stops: r.stops?.filter((s) => s.lat && s.lng) || [],
  }));

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🗺️ Live Tracking</h1>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1.5 text-sm">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className={isConnected ? 'text-green-600' : 'text-gray-500'}>
                {isConnected ? 'Socket connected' : 'Connecting…'}
              </span>
            </div>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">
              {Object.keys(liveLocations).length} active buses
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="text-sm px-3 py-2 border border-gray-200 rounded-xl hover:bg-gray-50">
            ↻ Refresh
          </button>
          <button onClick={() => setShowTripModal(true)}
            className="text-sm px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
            + Start Trip
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* ── Bus sidebar ────────────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Active Fleet ({buses.length})
          </p>

          {buses.map((bus) => {
            const loc       = liveLocations[bus._id];
            const isSim     = simulating[bus._id];
            const isSelected = selectedId === bus._id;
            const trip      = trips.find((t) => t.bus?._id === bus._id || t.bus === bus._id);

            return (
              <div key={bus._id}
                onClick={() => setSelectedId(isSelected ? null : bus._id)}
                className={`rounded-xl border p-4 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-blue-200 hover:shadow-sm'
                }`}>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: bus.color || bus.assignedRoute?.color || '#3B82F6' }}>
                      🚌
                    </div>
                    <span className="font-mono font-bold text-sm text-gray-800">{bus.busNumber}</span>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full transition-all ${
                    isSim ? 'bg-green-500 animate-pulse' :
                    loc   ? 'bg-blue-500' : 'bg-gray-300'
                  }`} />
                </div>

                <p className="text-xs text-gray-500 mt-1 truncate">
                  {bus.driver?.name} · {bus.assignedRoute?.name || 'No route'}
                </p>

                {loc && (
                  <div className="flex items-center gap-3 mt-2 text-xs">
                    <span className="text-blue-600 font-semibold">🚀 {loc.speed || 0} km/h</span>
                    {loc.simulated && <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">SIM</span>}
                  </div>
                )}

                {trip && (
                  <div className="mt-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg font-semibold">
                    🟢 Active trip
                  </div>
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); toggleSim(bus._id, bus.assignedRoute?._id); }}
                  className={`w-full mt-2.5 text-xs py-1.5 rounded-lg font-semibold transition-all ${
                    isSim
                      ? 'bg-red-100 text-red-600 hover:bg-red-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-green-100 hover:text-green-700'
                  }`}>
                  {isSim ? '⏹ Stop Sim' : '▶ Simulate GPS'}
                </button>
              </div>
            );
          })}

          {buses.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-400 text-sm">
              No active buses found
            </div>
          )}
        </div>

        {/* ── Main map + details ─────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-gray-200 overflow-hidden">
            <LiveMap
              liveLocations={liveLocations}
              selectedBusId={selectedId}
              routes={routesForMap}
              height="480px"
              onBusClick={(id) => setSelectedId((prev) => prev === id ? null : id)}
            />
          </div>

          {/* Selected bus details panel */}
          {selected && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">
                    🚌 {selected.busNumber}
                    <span className="ml-2 text-sm font-normal text-gray-500">{selected.registrationNo}</span>
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selected.assignedRoute?.name || 'No route'} · {selected.driver?.name}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Speed</p>
                    <p className="font-bold text-blue-600 text-2xl">{selectedLoc?.speed || 0}</p>
                    <p className="text-xs text-gray-400">km/h</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Heading</p>
                    <p className="font-bold text-gray-700 text-2xl">{Math.round(selectedLoc?.heading || 0)}°</p>
                  </div>
                  {selectedLoc?.updatedAt && (
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Updated</p>
                      <p className="text-xs font-medium text-gray-700">
                        {new Date(selectedLoc.updatedAt).toLocaleTimeString('en-IN')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Trip controls */}
              {tripForSelected ? (
                <div>
                  <div className="bg-green-50 rounded-xl p-3 mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-green-800">
                        🟢 Active Trip — {tripForSelected.tripType}
                      </p>
                      <p className="text-xs text-green-600">
                        Started: {new Date(tripForSelected.startTime).toLocaleTimeString('en-IN')}
                      </p>
                    </div>
                    <button onClick={() => endTrip(tripForSelected._id)}
                      className="text-xs px-3 py-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 font-semibold">
                      End Trip
                    </button>
                  </div>

                  {/* Alert buttons */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Send Alert to Parents</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { type: 'delay',        icon: '⏰', label: 'Delay' },
                        { type: 'breakdown',    icon: '🔧', label: 'Breakdown' },
                        { type: 'route_change', icon: '🔀', label: 'Route Change' },
                        { type: 'emergency',    icon: '🚨', label: 'Emergency' },
                      ].map((a) => (
                        <button key={a.type}
                          onClick={() => sendAlert(tripForSelected._id, a.type)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all ${
                            a.type === 'emergency'
                              ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                              : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                          }`}>
                          {a.icon} {a.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Stop progress */}
                  {tripForSelected.stopProgress?.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Stop Progress</p>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {tripForSelected.stopProgress.map((sp, i) => (
                          <React.Fragment key={i}>
                            <div className={`flex-shrink-0 text-center px-2 py-1 rounded-lg text-xs font-semibold ${
                              sp.status === 'reached'  ? 'bg-green-100 text-green-700' :
                              sp.status === 'skipped'  ? 'bg-gray-100 text-gray-500 line-through' :
                              'bg-blue-50 text-blue-600'
                            }`}>
                              {sp.stopName}
                            </div>
                            {i < tripForSelected.stopProgress.length - 1 && (
                              <span className="text-gray-300 flex-shrink-0">›</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">
                  No active trip for this bus today.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Today's Trips ─────────────────────────────────────────────────── */}
      {trips.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-4">Today's Trips</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {trips.map((trip) => (
              <div key={trip._id} className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-sm">{trip.route?.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${
                    trip.status === 'in_progress' ? 'bg-green-100 text-green-700' :
                    trip.status === 'completed'   ? 'bg-gray-200 text-gray-600' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {trip.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-gray-500">🚌 {trip.bus?.busNumber} · {trip.tripType}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Started: {trip.startTime ? new Date(trip.startTime).toLocaleTimeString('en-IN') : '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Alert feed ────────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Live Alerts</h3>
            <button onClick={() => setAlerts([])} className="text-xs text-gray-400 hover:text-gray-600">
              Clear all
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {alerts.map((a) => (
              <div key={a.id}
                className={`flex items-start gap-3 p-3 rounded-xl text-sm ${
                  a.type === 'emergency' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-gray-50 text-gray-700'
                }`}>
                <span className="text-lg">
                  {a.type === 'emergency' ? '🚨' : a.type === 'delay' ? '⏰' : a.type === 'breakdown' ? '🔧' : '📢'}
                </span>
                <div className="flex-1">
                  <p className="font-medium">{a.message}</p>
                  <p className="text-xs opacity-60 mt-0.5">{new Date(a.sentAt || Date.now()).toLocaleTimeString('en-IN')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Start Trip Modal ──────────────────────────────────────────────── */}
      {showTripModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold">Start New Trip</h2>
              <button onClick={() => setShowTripModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Route</label>
                <select value={tripForm.routeId}
                  onChange={(e) => {
                    const r = routes.find((rt) => rt._id === e.target.value);
                    setTripForm({ ...tripForm, routeId: e.target.value, busId: r?.assignedBus?._id || '' });
                  }}
                  className="w-full border rounded-xl px-3 py-2 text-sm">
                  <option value="">Select route</option>
                  {routes.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Bus</label>
                <select value={tripForm.busId}
                  onChange={(e) => setTripForm({ ...tripForm, busId: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm">
                  <option value="">Select bus</option>
                  {buses.map((b) => <option key={b._id} value={b._id}>{b.busNumber} — {b.driver?.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Trip Type</label>
                <div className="flex gap-2">
                  {['morning', 'evening'].map((t) => (
                    <button key={t} onClick={() => setTripForm({ ...tripForm, tripType: t })}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all capitalize ${
                        tripForm.tripType === t
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                      }`}>
                      {t === 'morning' ? '🌅 Morning' : '🌆 Evening'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 pt-0">
              <button onClick={() => setShowTripModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={startTrip}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
                🟢 Start Trip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
