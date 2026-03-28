// frontend/src/pages/transport/LiveTracking.js
// Real-time vehicle tracking with GPS simulation
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { vehicleAPI, tripAPI } from '../../utils/transportAPI';
import { useTransportSocket } from '../../utils/useTransportSocket';
import { useAuth } from '../../context/AuthContext';
import LiveMap from '../../components/transport/LiveMap';

export default function LiveTracking() {
  const { user } = useAuth();
  const [vehicles,      setVehicles]     = useState([]);
  const [trips,         setTrips]        = useState([]);
  const [liveLocations, setLive]         = useState({});
  const [selectedId,    setSelectedId]   = useState(null);
  const [simulating,    setSimulating]   = useState({});  // vehicleId → bool
  const [alerts,        setAlerts]       = useState([]);

  // Load vehicles and today's trips
  const load = async () => {
    try {
      const [v, t] = await Promise.all([vehicleAPI.getAll(), tripAPI.today()]);
      setVehicles(v.data.data.filter(x => x.status === 'active'));
      setTrips(t.data.data);
      // Seed initial positions from DB
      const positions = {};
      v.data.data.forEach(vh => { positions[vh._id] = { ...vh.currentLocation, vehicleId: vh._id }; });
      setLive(positions);
    } catch { toast.error('Failed to load tracking data'); }
  };

  // Socket callbacks
  const onLocationUpdate = useCallback((payload) => {
    setLive(prev => ({ ...prev, [payload.vehicleId]: payload }));
  }, []);

  const onTripAlert = useCallback((alert) => {
    setAlerts(prev => [{ ...alert, id: Date.now() }, ...prev].slice(0, 10));
    const icons = { emergency: '🚨', delay: '⏰', breakdown: '🔧', route_change: '🔀' };
    toast(`${icons[alert.type] || '📢'} ${alert.message}`, {
      duration: alert.type === 'emergency' ? 10000 : 4000,
    });
  }, []);

  const { startSimulation, stopSimulation } = useTransportSocket({
    schoolId: user?.school,
    onLocationUpdate,
    onTripAlert,
  });

  useEffect(() => { load(); }, []);

  const toggleSim = (vehicleId, routeId) => {
    if (simulating[vehicleId]) {
      stopSimulation(vehicleId);
      setSimulating(s => ({ ...s, [vehicleId]: false }));
      toast('⏹ Simulation stopped');
    } else {
      startSimulation(vehicleId, routeId);
      setSimulating(s => ({ ...s, [vehicleId]: true }));
      toast.success('▶ GPS simulation started');
    }
  };

  const sendAlert = async (tripId, type) => {
    const messages = {
      delay: 'Bus is running 10 minutes late',
      breakdown: 'Vehicle breakdown — sending replacement',
      route_change: 'Route changed due to traffic',
      emergency: '🚨 Emergency! Please contact school immediately',
    };
    try {
      await tripAPI.sendAlert(tripId, { type, message: messages[type] });
      toast.success('Alert sent to all parents');
    } catch { toast.error('Failed to send alert'); }
  };

  const selected = vehicles.find(v => v._id === selectedId);
  const selectedLoc = selectedId ? liveLocations[selectedId] : null;
  const tripForSelected = trips.find(t => t.vehicle?._id === selectedId || t.vehicle === selectedId);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">🗺️ Live Tracking</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-green-600 font-medium">Real-time GPS</span>
          </div>
        </div>
        <button onClick={load} className="text-sm text-blue-600 hover:underline">↻ Refresh</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

        {/* Vehicle list sidebar */}
        <div className="lg:col-span-1 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase">Active Vehicles</p>
          {vehicles.map(v => {
            const loc    = liveLocations[v._id];
            const isSim  = simulating[v._id];
            const isSelected = selectedId === v._id;
            return (
              <div key={v._id}
                onClick={() => setSelectedId(v._id)}
                className={`rounded-xl border p-4 cursor-pointer transition-all ${isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-200'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-gray-800">{v.registrationNo}</span>
                  <span className={`w-2.5 h-2.5 rounded-full ${isSim ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{v.driver?.name || 'No driver'}</p>
                {loc && <p className="text-xs text-blue-600 mt-1">🚀 {loc.speed || 0} km/h</p>}

                <button
                  onClick={e => { e.stopPropagation(); toggleSim(v._id, v.assignedRoute?._id); }}
                  className={`w-full mt-2 text-xs py-1.5 rounded-lg font-semibold transition-all ${
                    isSim ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}>
                  {isSim ? '⏹ Stop Sim' : '▶ Simulate GPS'}
                </button>
              </div>
            );
          })}
          {vehicles.length === 0 && <p className="text-center text-gray-400 text-sm py-6">No active vehicles</p>}
        </div>

        {/* Main map */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <LiveMap
              liveLocations={liveLocations}
              selectedId={selectedId}
              height="460px"
            />
          </div>

          {/* Selected vehicle details */}
          {selected && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900">{selected.registrationNo} — {selected.type}</h3>
                  <p className="text-sm text-gray-500">{selected.assignedRoute?.name || 'No route assigned'}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-gray-500">Speed</p>
                  <p className="font-bold text-blue-600 text-xl">{selectedLoc?.speed || 0} km/h</p>
                </div>
              </div>

              {/* Send alerts for the trip */}
              {tripForSelected && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Send Alert to Parents</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { type: 'delay',        label: '⏰ Delay' },
                      { type: 'breakdown',    label: '🔧 Breakdown' },
                      { type: 'route_change', label: '🔀 Route Change' },
                      { type: 'emergency',    label: '🚨 Emergency' },
                    ].map(a => (
                      <button key={a.type}
                        onClick={() => sendAlert(tripForSelected._id, a.type)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold border ${
                          a.type === 'emergency'
                            ? 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100'
                            : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                        }`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Alert feed */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Alert Feed</h3>
            <button onClick={() => setAlerts([])} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {alerts.map(a => (
              <div key={a.id} className={`flex items-start gap-3 p-3 rounded-xl text-sm ${
                a.type === 'emergency' ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-700'
              }`}>
                <span>{a.type === 'emergency' ? '🚨' : a.type === 'delay' ? '⏰' : '📢'}</span>
                <div className="flex-1">
                  <p>{a.message}</p>
                  <p className="text-xs opacity-60 mt-0.5">{new Date(a.sentAt).toLocaleTimeString('en-IN')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}