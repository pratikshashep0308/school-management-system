// frontend/src/components/transport/LiveMap.js
// Real-time bus tracking map using Leaflet + OpenStreetMap (FREE, no API key!)
// Shows: live bus positions, route polyline, stop markers, ETAs
// npm install leaflet react-leaflet

import React, { useEffect, useRef, useCallback } from 'react';

// ── Lazy-load Leaflet (avoids SSR issues) ─────────────────────────────────────
let L;
if (typeof window !== 'undefined') {
  L = require('leaflet');
  require('leaflet/dist/leaflet.css');
  // Fix default marker icon path issue in CRA
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

// ── Custom icons ──────────────────────────────────────────────────────────────
const busIcon = (color = '#3B82F6', isSelected = false, isSimulated = false) =>
  L?.divIcon({
    className: '',
    iconSize:  [44, 44],
    iconAnchor:[22, 22],
    popupAnchor:[0, -22],
    html: `
      <div style="
        width:44px;height:44px;border-radius:50%;
        background:${color};
        border:3px solid ${isSelected ? '#FBBF24' : 'white'};
        box-shadow:0 3px 10px rgba(0,0,0,${isSelected ? '0.5' : '0.25'});
        display:flex;align-items:center;justify-content:center;
        font-size:20px;
        transform:scale(${isSelected ? 1.2 : 1});
        transition:transform 0.2s;
        ${isSimulated ? 'opacity:0.85;' : ''}
      ">🚌</div>
      ${isSimulated ? `<div style="
        position:absolute;top:-6px;right:-6px;
        background:#10B981;color:white;
        border-radius:8px;font-size:9px;
        padding:1px 4px;font-weight:700;
      ">SIM</div>` : ''}
    `,
  });

const stopIcon = (sequence, color = '#6366F1', isHighlighted = false) =>
  L?.divIcon({
    className: '',
    iconSize:  [28, 28],
    iconAnchor:[14, 14],
    popupAnchor:[0, -14],
    html: `
      <div style="
        width:28px;height:28px;border-radius:50%;
        background:${isHighlighted ? '#FBBF24' : color};
        border:2px solid white;
        box-shadow:0 2px 5px rgba(0,0,0,0.2);
        display:flex;align-items:center;justify-content:center;
        color:white;font-size:11px;font-weight:700;
      ">${sequence}</div>
    `,
  });

export default function LiveMap({
  liveLocations  = {},    // { busId: { lat, lng, speed, heading, simulated } }
  selectedBusId  = null,
  routes         = [],    // [{ name, color, stops: [{lat, lng, name, sequence, morningTime}] }]
  height         = '440px',
  center         = [18.5204, 73.8567], // Pune
  zoom           = 12,
  onBusClick,
  myPickupStop   = null,  // { lat, lng, name } — highlight student's own stop
  myDropStop     = null,
}) {
  const mapRef    = useRef(null);
  const mapInst   = useRef(null);
  const busMarkersRef  = useRef({});
  const stopMarkersRef = useRef({});
  const routeLayersRef = useRef({});

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!L || !mapRef.current || mapInst.current) return;

    mapInst.current = L.map(mapRef.current, {
      zoomControl:       true,
      scrollWheelZoom:   true,
      preferCanvas:      true,    // Better performance for many markers
    }).setView(center, zoom);

    // OpenStreetMap tiles — completely FREE
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom:     19,
    }).addTo(mapInst.current);

    return () => {
      mapInst.current?.remove();
      mapInst.current = null;
      busMarkersRef.current  = {};
      stopMarkersRef.current = {};
      routeLayersRef.current = {};
    };
  }, []);

  // ── Draw routes & stops ────────────────────────────────────────────────────
  useEffect(() => {
    if (!L || !mapInst.current) return;

    // Remove old route layers
    Object.values(routeLayersRef.current).forEach((layer) => {
      mapInst.current.removeLayer(layer);
    });
    routeLayersRef.current = {};

    // Remove old stop markers
    Object.values(stopMarkersRef.current).forEach((m) => {
      mapInst.current.removeLayer(m);
    });
    stopMarkersRef.current = {};

    routes.forEach((route) => {
      if (!route.stops || route.stops.length < 2) return;

      const validStops = route.stops.filter((s) => s.lat && s.lng);
      if (validStops.length < 2) return;

      // Route polyline
      const latlngs = validStops.map((s) => [s.lat, s.lng]);
      const polyline = L.polyline(latlngs, {
        color:     route.color || '#3B82F6',
        weight:    4,
        opacity:   0.7,
        dashArray: '8, 4',
      }).addTo(mapInst.current);

      routeLayersRef.current[`line_${route._id || route.name}`] = polyline;

      // Stop markers
      validStops.forEach((stop, i) => {
        const isMyPickup = myPickupStop && stop.name === myPickupStop.name;
        const isMyDrop   = myDropStop   && stop.name === myDropStop.name;
        const highlighted = isMyPickup || isMyDrop;

        const marker = L.marker([stop.lat, stop.lng], {
          icon: stopIcon(stop.sequence || i + 1, route.color || '#6366F1', highlighted),
          zIndexOffset: highlighted ? 500 : 0,
        }).addTo(mapInst.current);

        marker.bindPopup(`
          <div style="min-width:160px;font-family:sans-serif">
            <div style="font-weight:700;font-size:14px;margin-bottom:4px">
              ${highlighted ? (isMyPickup ? '📍 Your Pickup' : '🏫 Your Drop') : `Stop ${stop.sequence || i + 1}`}
            </div>
            <div style="color:#374151">${stop.name}</div>
            ${stop.morningTime ? `<div style="color:#6B7280;font-size:12px;margin-top:2px">🕐 Morning: ${stop.morningTime}</div>` : ''}
            ${stop.eveningTime ? `<div style="color:#6B7280;font-size:12px">🌆 Evening: ${stop.eveningTime}</div>` : ''}
            ${stop.landmark    ? `<div style="color:#9CA3AF;font-size:11px;margin-top:2px">📌 ${stop.landmark}</div>` : ''}
            ${stop.studentCount ? `<div style="color:#3B82F6;font-size:12px;margin-top:2px">👦 ${stop.studentCount} students</div>` : ''}
            ${highlighted ? `<div style="background:${isMyPickup ? '#DBEAFE' : '#D1FAE5'};color:${isMyPickup ? '#1D4ED8' : '#065F46'};padding:2px 6px;border-radius:4px;font-size:11px;margin-top:4px;font-weight:600">${isMyPickup ? '⬆️ Pickup Stop' : '⬇️ Drop Stop'}</div>` : ''}
          </div>
        `);

        // Open popup if this is student's pickup stop
        if (highlighted) marker.openPopup();

        stopMarkersRef.current[`${route._id}_${i}`] = marker;
      });
    });
  }, [routes, myPickupStop, myDropStop]);

  // ── Update live bus markers ────────────────────────────────────────────────
  useEffect(() => {
    if (!L || !mapInst.current) return;

    // Remove markers for buses no longer in liveLocations
    Object.keys(busMarkersRef.current).forEach((id) => {
      if (!liveLocations[id]) {
        mapInst.current.removeLayer(busMarkersRef.current[id]);
        delete busMarkersRef.current[id];
      }
    });

    Object.entries(liveLocations).forEach(([busId, loc]) => {
      if (!loc?.lat || !loc?.lng) return;

      const pos        = [loc.lat, loc.lng];
      const isSelected = selectedBusId === busId;
      const color      = loc.color || (isSelected ? '#EF4444' : '#3B82F6');

      if (busMarkersRef.current[busId]) {
        // Smooth move (Leaflet doesn't animate by default, but this queues smoothly)
        busMarkersRef.current[busId].setLatLng(pos);
        busMarkersRef.current[busId].setIcon(busIcon(color, isSelected, loc.simulated));
      } else {
        const marker = L.marker(pos, {
          icon:         busIcon(color, isSelected, loc.simulated),
          zIndexOffset: isSelected ? 1000 : 100,
        }).addTo(mapInst.current);

        if (onBusClick) {
          marker.on('click', () => onBusClick(busId));
        }

        busMarkersRef.current[busId] = marker;
      }

      // Update popup
      busMarkersRef.current[busId].unbindPopup();
      busMarkersRef.current[busId].bindPopup(`
        <div style="min-width:160px;font-family:sans-serif">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">
            🚌 ${loc.busNumber || busId.slice(-6)}
          </div>
          <div style="display:flex;gap:12px;font-size:12px">
            <div><span style="color:#6B7280">Speed</span><br/><b style="font-size:15px">${loc.speed || 0}</b> km/h</div>
            <div><span style="color:#6B7280">Heading</span><br/><b>${loc.heading ?? '—'}°</b></div>
          </div>
          ${loc.simulated ? '<div style="color:#10B981;font-size:11px;margin-top:4px">🟢 GPS Simulated</div>' : ''}
          <div style="color:#9CA3AF;font-size:10px;margin-top:4px">
            Updated: ${new Date(loc.updatedAt || loc.timestamp || Date.now()).toLocaleTimeString('en-IN')}
          </div>
        </div>
      `);
    });
  }, [liveLocations, selectedBusId, onBusClick]);

  // ── Pan to selected bus ────────────────────────────────────────────────────
  useEffect(() => {
    if (!L || !mapInst.current || !selectedBusId) return;
    const loc = liveLocations[selectedBusId];
    if (loc?.lat && loc?.lng) {
      mapInst.current.panTo([loc.lat, loc.lng], { animate: true, duration: 0.6 });
      busMarkersRef.current[selectedBusId]?.openPopup();
    }
  }, [selectedBusId, liveLocations]);

  // ── Pan to student's pickup stop ────────────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || !myPickupStop?.lat) return;
    mapInst.current.setView([myPickupStop.lat, myPickupStop.lng], 14, { animate: true });
  }, [myPickupStop]);

  return (
    <div style={{ height, width: '100%', position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />

      {/* Legend overlay */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 1000,
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)',
        borderRadius: 10, padding: '8px 12px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.12)', fontSize: 11,
      }}>
        {[
          { color: '#3B82F6', label: 'Bus (live)' },
          { color: '#EF4444', label: 'Selected bus' },
          { color: '#FBBF24', label: 'Your stop' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', border: '1px solid #e5e7eb' }} />
            {label}
          </div>
        ))}
      </div>

      {/* Live badge */}
      {Object.keys(liveLocations).length > 0 && (
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 1000,
          background: '#10B981', color: 'white',
          borderRadius: 20, padding: '4px 10px',
          fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', animation: 'pulse 1s infinite', display: 'inline-block' }} />
          {Object.keys(liveLocations).length} LIVE
        </div>
      )}
    </div>
  );
}
