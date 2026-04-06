// frontend/src/pages/transport/StudentTransportView.js
// Student & Parent portal: shows only their own transport assignment, live map, fees
// Role-gated: students see their own, parents see their child's

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { myTransportAPI } from '../../utils/transportAPI';
import { useTransportSocket } from '../../utils/useTransportSocket';
import { useAuth } from '../../context/AuthContext';
import LiveMap from '../../components/transport/LiveMap';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const STATUS_CONFIG = {
  arriving:  { label: '🚨 Bus Arriving!',     bg: '#FEF2F2', text: '#991B1B', pulse: true  },
  nearby:    { label: '⚡ Bus is nearby',      bg: '#FFF7ED', text: '#92400E', pulse: true  },
  en_route:  { label: '🚌 Bus en route',       bg: '#EFF6FF', text: '#1D4ED8', pulse: false },
  tracking:  { label: '📡 Tracking bus…',      bg: '#F0FDF4', text: '#065F46', pulse: false },
  offline:   { label: '⭕ Bus GPS offline',    bg: '#F9FAFB', text: '#6B7280', pulse: false },
};

export default function StudentTransportView() {
  const { user } = useAuth();
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [busLocation, setBusLocation] = useState({});
  const [alerts,      setAlerts]      = useState([]);
  const [activeTab,   setActiveTab]   = useState('map');

  const load = useCallback(async () => {
    try {
      const res = await myTransportAPI.get();
      setData(res.data.data);

      // Seed initial bus position
      if (res.data.data?.bus?.currentLocation) {
        const loc = res.data.data.bus.currentLocation;
        if (loc.lat) {
          setBusLocation({ [res.data.data.bus._id]: { ...loc, vehicleId: res.data.data.bus._id } });
        }
      }
    } catch {
      toast.error('Failed to load transport info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Real-time GPS updates ──────────────────────────────────────────────────
  const onLocationUpdate = useCallback((payload) => {
    if (!data?.bus?._id) return;
    if (payload.vehicleId === data.bus._id || payload.busId === data.bus._id) {
      setBusLocation({ [data.bus._id]: payload });
    }
  }, [data?.bus?._id]);

  const onTripAlert = useCallback((alert) => {
    setAlerts((prev) => [{ ...alert, id: Date.now() }, ...prev].slice(0, 5));
    toast(`📢 ${alert.message}`, { duration: 6000 });
  }, []);

  const onStopReached = useCallback((evt) => {
    if (data?.assignment?.pickupStop?.name === evt.stopName) {
      toast.success(`🚌 Bus reached ${evt.stopName}! Get ready!`, { duration: 8000 });
    }
  }, [data?.assignment?.pickupStop?.name]);

  useTransportSocket({
    schoolId: user?.school,
    parentId: user?._id,
    role:     user?.role === 'parent' ? 'parent' : 'student',
    onLocationUpdate,
    onTripAlert,
    onStopReached,
  });

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 rounded-2xl" />
          <div className="h-64 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center">
        <div className="bg-white rounded-2xl border border-gray-200 p-12">
          <div className="text-6xl mb-4">🚌</div>
          <h3 className="text-xl font-bold text-gray-700 mb-2">No Transport Assigned</h3>
          <p className="text-gray-500">You have not been assigned to any bus route yet. Contact the school admin.</p>
        </div>
      </div>
    );
  }

  const { assignment, route, bus, currentFee, feeHistory, eta, status } = data;
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.offline;
  const liveLocation = bus?._id ? busLocation[bus._id] : null;

  // Build route data for map (only student's route)
  const routeForMap = route ? [{
    ...route,
    stops: route.stops?.map((s) => ({
      name:        s.name,
      sequence:    s.sequence,
      morningTime: s.morningTime,
      eveningTime: s.eveningTime,
      lat:         s.lat,
      lng:         s.lng,
    })) || [],
  }] : [];

  const liveLocationsForMap = liveLocation
    ? { [bus._id]: { ...liveLocation, busNumber: bus.busNumber, color: route?.color } }
    : {};

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      {/* ── Header card ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {user?.role === 'parent' ? '👨‍👧 My Child\'s Transport' : '🚌 My Transport'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{data.student?.name}</p>
          </div>

          {/* Live status badge */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: statusCfg.bg, color: statusCfg.text }}>
            {statusCfg.pulse && (
              <span className="w-2 h-2 rounded-full bg-current animate-pulse inline-block" />
            )}
            {statusCfg.label}
            {eta !== null && eta <= 15 && (
              <span className="ml-2 bg-white/50 px-2 py-0.5 rounded-lg text-xs">
                ~{eta} min
              </span>
            )}
          </div>
        </div>

        {/* Route + Bus info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          <InfoCard
            icon="🛣️"
            label="Route"
            value={route?.name}
            sub={`Code: ${route?.code}`}
            color={route?.color}
          />
          <InfoCard
            icon="🚌"
            label="Bus Number"
            value={bus?.busNumber}
            sub={bus?.registrationNo}
          />
          <InfoCard
            icon="📍"
            label="Pickup Stop"
            value={assignment?.pickupStop?.name}
            sub={`⏰ ${assignment?.pickupStop?.time}`}
          />
          <InfoCard
            icon="🏫"
            label="Drop Stop"
            value={assignment?.dropStop?.name}
            sub={`⏰ ${assignment?.dropStop?.time}`}
          />
        </div>
      </div>

      {/* ── Alert feed ─────────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id}
              className="flex items-start gap-3 p-4 rounded-xl text-sm border"
              style={{
                background: a.type === 'emergency' ? '#FEF2F2' : '#FFFBEB',
                borderColor: a.type === 'emergency' ? '#FECACA' : '#FDE68A',
              }}>
              <span className="text-xl">{a.type === 'emergency' ? '🚨' : a.type === 'delay' ? '⏰' : '📢'}</span>
              <div className="flex-1">
                <p className="font-medium">{a.message}</p>
                <p className="text-xs opacity-60 mt-0.5">{new Date(a.sentAt).toLocaleTimeString('en-IN')}</p>
              </div>
              <button onClick={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))}
                className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {['map', 'driver', 'fees'].map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
              activeTab === t ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'
            }`}>
            {t === 'map' ? '🗺️ Live Map' : t === 'driver' ? '👨‍✈️ Driver' : '💰 Fees'}
          </button>
        ))}
      </div>

      {/* ── Live Map ───────────────────────────────────────────────────────── */}
      {activeTab === 'map' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Live Tracking</h3>
            <div className="flex items-center gap-2 text-sm text-green-600">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
              Real-time GPS
            </div>
          </div>
          <LiveMap
            liveLocations={liveLocationsForMap}
            routes={routeForMap}
            height="400px"
            center={
              assignment?.pickupStop?.lat
                ? [assignment.pickupStop.lat, assignment.pickupStop.lng]
                : undefined
            }
            zoom={13}
            myPickupStop={assignment?.pickupStop?.lat ? {
              lat:  assignment.pickupStop.lat,
              lng:  assignment.pickupStop.lng,
              name: assignment.pickupStop.name,
            } : null}
            myDropStop={assignment?.dropStop?.lat ? {
              lat:  assignment.dropStop.lat,
              lng:  assignment.dropStop.lng,
              name: assignment.dropStop.name,
            } : null}
          />

          {/* ETA status bar */}
          {eta !== null && (
            <div className="p-4 bg-blue-50 border-t flex items-center gap-3">
              <span className="text-2xl">🕐</span>
              <div>
                <p className="font-semibold text-blue-900">
                  {eta <= 1 ? 'Bus is arriving now!' :
                   eta <= 5 ? `Bus arriving in ~${eta} minutes` :
                   `Bus is ~${eta} minutes away`}
                </p>
                <p className="text-sm text-blue-600">From your pickup stop: {assignment?.pickupStop?.name}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Driver Info ─────────────────────────────────────────────────────── */}
      {activeTab === 'driver' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-bold text-gray-900 mb-5">Driver & Vehicle Details</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Driver */}
            <div className="bg-blue-50 rounded-xl p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-2xl">👨‍✈️</div>
                <div>
                  <p className="font-bold text-gray-900 text-lg">{bus?.driver?.name || 'Not assigned'}</p>
                  <p className="text-sm text-gray-500">Bus Driver</p>
                </div>
              </div>
              <a href={`tel:${bus?.driver?.phone}`}
                className="flex items-center gap-2 bg-white rounded-xl p-3 hover:bg-blue-100 transition-colors">
                <span className="text-xl">📞</span>
                <span className="font-semibold text-blue-600">{bus?.driver?.phone || 'N/A'}</span>
              </a>
            </div>

            {/* Helper */}
            {bus?.helper?.name && (
              <div className="bg-green-50 rounded-xl p-5">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center text-2xl">🙋‍♂️</div>
                  <div>
                    <p className="font-bold text-gray-900 text-lg">{bus.helper.name}</p>
                    <p className="text-sm text-gray-500">Bus Helper</p>
                  </div>
                </div>
                {bus.helper.phone && (
                  <a href={`tel:${bus.helper.phone}`}
                    className="flex items-center gap-2 bg-white rounded-xl p-3 hover:bg-green-100 transition-colors">
                    <span className="text-xl">📞</span>
                    <span className="font-semibold text-green-600">{bus.helper.phone}</span>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Bus details */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Bus Number',  value: bus?.busNumber },
              { label: 'Reg Number',  value: bus?.registrationNo },
              { label: 'Bus Type',    value: bus?.type?.charAt(0).toUpperCase() + bus?.type?.slice(1) },
              { label: 'Capacity',    value: `${bus?.capacity} seats` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase font-semibold">{label}</p>
                <p className="font-bold text-gray-900 mt-1">{value || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Fees ──────────────────────────────────────────────────────────── */}
      {activeTab === 'fees' && (
        <div className="space-y-4">
          {/* Current month */}
          {currentFee ? (
            <div className={`rounded-2xl border p-5 ${
              currentFee.status === 'paid'    ? 'bg-green-50 border-green-200' :
              currentFee.status === 'partial' ? 'bg-yellow-50 border-yellow-200' :
              'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-500 uppercase">
                    {MONTHS[currentFee.month - 1]} {currentFee.year} — Transport Fee
                  </p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">₹{currentFee.totalDue}</p>
                  {currentFee.status !== 'paid' && (
                    <p className="text-sm text-gray-500 mt-1">
                      Due: {new Date(currentFee.dueDate).toLocaleDateString('en-IN')}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`px-3 py-1.5 rounded-xl text-sm font-bold uppercase ${
                    currentFee.status === 'paid'    ? 'bg-green-200 text-green-800' :
                    currentFee.status === 'partial' ? 'bg-yellow-200 text-yellow-800' :
                    'bg-red-200 text-red-800'
                  }`}>
                    {currentFee.status === 'paid' ? '✅ Paid' :
                     currentFee.status === 'partial' ? '⚠️ Partial' : '❌ Pending'}
                  </span>
                  {currentFee.status !== 'paid' && (
                    <p className="text-sm text-red-600 font-semibold mt-2">
                      Balance: ₹{currentFee.totalDue - (currentFee.paidAmount || 0)}
                    </p>
                  )}
                  {currentFee.receiptNo && (
                    <p className="text-xs text-gray-400 mt-1">Receipt: {currentFee.receiptNo}</p>
                  )}
                </div>
              </div>

              {/* Fee breakdown */}
              <div className="mt-4 pt-4 border-t border-current/10 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-gray-500">Base Amount</p>
                  <p className="font-semibold">₹{currentFee.amount}</p>
                </div>
                {currentFee.lateFee > 0 && (
                  <div>
                    <p className="text-gray-500">Late Fee</p>
                    <p className="font-semibold text-red-600">+₹{currentFee.lateFee}</p>
                  </div>
                )}
                {currentFee.paidAmount > 0 && (
                  <div>
                    <p className="text-gray-500">Paid</p>
                    <p className="font-semibold text-green-600">₹{currentFee.paidAmount}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 text-center text-gray-400">
              No fee record for this month yet
            </div>
          )}

          {/* Fee history */}
          {feeHistory?.length > 1 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b">
                <h3 className="font-bold text-gray-900">Payment History</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {feeHistory.map((fee) => (
                  <div key={fee._id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                    <div>
                      <p className="font-medium text-gray-800">
                        {MONTHS[fee.month - 1]} {fee.year}
                      </p>
                      {fee.paidDate && (
                        <p className="text-xs text-gray-400">
                          Paid: {new Date(fee.paidDate).toLocaleDateString('en-IN')}
                          {fee.paymentMethod && ` · ${fee.paymentMethod}`}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold">₹{fee.totalDue}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${
                        fee.status === 'paid'    ? 'bg-green-100 text-green-700' :
                        fee.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-600'
                      }`}>
                        {fee.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoCard({ icon, label, value, sub, color }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-gray-500 uppercase font-semibold">{label}</span>
      </div>
      <p className="font-bold text-gray-900 truncate">
        {color && <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: color }} />}
        {value || '—'}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}
