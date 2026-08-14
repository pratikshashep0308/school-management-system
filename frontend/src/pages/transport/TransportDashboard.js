// frontend/src/pages/transport/TransportDashboard.js
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { dashboardAPI } from '../../utils/transportAPI';
import { useTransportSocket } from '../../utils/useTransportSocket';
import { useAuth } from '../../context/AuthContext';
import LiveMap from '../../components/transport/LiveMap';

export default function TransportDashboard() {
  const { user } = useAuth();
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [liveLocations, setLive]  = useState({});  // vehicleId → { lat, lng, speed }
  const [alerts, setAlerts]       = useState([]);

  // Load dashboard data
  const load = async () => {
    try {
      const res = await dashboardAPI.get();
      setData(res.data.data);
    } catch { toast.error('Failed to load dashboard'); }
    finally { setLoading(false); }
  };

  // Handle real-time location updates
  const onLocationUpdate = useCallback((payload) => {
    setLive(prev => ({ ...prev, [payload.vehicleId]: payload }));
  }, []);

  // Handle real-time alerts
  const onTripAlert = useCallback((alert) => {
    setAlerts(prev => [alert, ...prev].slice(0, 20));
    if (alert.type === 'emergency') toast.error(`🚨 ${alert.message}`, { duration: 10000 });
    else toast(`🔔 ${alert.message}`);
  }, []);

  useTransportSocket({
    schoolId: user?.school,
    onLocationUpdate,
    onTripAlert,
  });

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin text-4xl">🚌</div>
    </div>
  );

  const kpis = [
    { label: 'Total Vehicles', value: data?.vehicles?.total || 0,      icon: '🚌', sub: `${data?.vehicles?.active || 0} active`,      color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { label: 'Active Routes',  value: data?.routes || 0,                icon: '🗺️', sub: 'Operating today',                             color: 'bg-green-50 border-green-200 text-green-700' },
    { label: 'Students',       value: data?.students || 0,              icon: '👨‍🎓', sub: 'Using transport',                             color: 'bg-purple-50 border-purple-200 text-purple-700' },
    { label: 'Fee Collected',  value: `₹${(data?.fees?.collected || 0).toLocaleString('en-IN')}`, icon: '💰', sub: `₹${(data?.fees?.pending || 0).toLocaleString('en-IN')} pending`, color: 'bg-amber-50 border-amber-200 text-amber-700' },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transport Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Live overview — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button onClick={load} className="text-sm text-blue-600 hover:underline">↻ Refresh</button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-2xl border p-5 ${k.color}`}>
            <div className="text-3xl mb-2">{k.icon}</div>
            <div className="text-3xl font-bold">{k.value}</div>
            <div className="font-semibold mt-1">{k.label}</div>
            <div className="text-xs opacity-70 mt-0.5">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Live Map + Today's Trips */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Live Map */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">🗺️ Live Vehicle Tracking</h3>
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> LIVE
            </span>
          </div>
          <LiveMap liveLocations={liveLocations} routes={data?.todayTrips || []} height="380px" />
        </div>

        {/* Today's Trips */}
        <div className="bg-white rounded-2xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Today's Trips</h3>
          </div>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {data?.todayTrips?.length === 0 && (
              <div className="text-center text-gray-400 py-10 text-sm">No trips today</div>
            )}
            {data?.todayTrips?.map(trip => (
              <div key={trip._id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-gray-800">{trip.route?.name || '—'}</span>
                  <StatusPill status={trip.status} />
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{trip.vehicle?.registrationNo} · {trip.tripType}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">🔔 Live Alerts</h3>
          </div>
          <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {alerts.map((a, i) => (
              <div key={i} className="px-5 py-3 flex items-start gap-3">
                <span>{a.type === 'emergency' ? '🚨' : a.type === 'delay' ? '⏰' : '📢'}</span>
                <div>
                  <p className="text-sm text-gray-800">{a.message}</p>
                  <p className="text-xs text-gray-400">{new Date(a.sentAt).toLocaleTimeString('en-IN')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vehicle Status Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active',      count: data?.vehicles?.active || 0,      color: 'text-green-600 bg-green-50',  icon: '✅' },
          { label: 'Maintenance', count: data?.vehicles?.maintenance || 0,  color: 'text-amber-600 bg-amber-50',  icon: '🔧' },
          { label: 'Inactive',    count: (data?.vehicles?.total || 0) - (data?.vehicles?.active || 0) - (data?.vehicles?.maintenance || 0), color: 'text-gray-500 bg-gray-50', icon: '⭕' },
        ].map(v => (
          <div key={v.label} className={`rounded-xl p-4 ${v.color} text-center`}>
            <div className="text-2xl">{v.icon}</div>
            <div className="text-2xl font-bold mt-1">{v.count}</div>
            <div className="text-sm font-medium">{v.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    scheduled:   'bg-gray-100 text-gray-600',
    in_progress: 'bg-green-100 text-green-700',
    completed:   'bg-blue-100 text-blue-700',
    cancelled:   'bg-red-100 text-red-600',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}