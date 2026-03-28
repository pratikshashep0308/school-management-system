// frontend/src/components/transport/LiveMap.js
// Uses Leaflet + OpenStreetMap — completely FREE, no API key needed
// npm install leaflet react-leaflet
import React, { useEffect, useRef } from 'react';

// Dynamic import to avoid SSR issues
let L;
if (typeof window !== 'undefined') {
  L = require('leaflet');
  require('leaflet/dist/leaflet.css');
}

// Custom bus icon
const busIcon = (color = '#3B82F6') => L?.divIcon({
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  html: `
    <div style="
      width:40px;height:40px;border-radius:50%;
      background:${color};border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      font-size:18px;
    ">🚌</div>
  `,
});

export default function LiveMap({ liveLocations = {}, selectedId, height = '400px', routes = [] }) {
  const mapRef    = useRef(null);
  const mapInst   = useRef(null);
  const markersRef = useRef({});

  // Initialize map once
  useEffect(() => {
    if (!L || !mapRef.current || mapInst.current) return;

    // Center on Pune, India
    mapInst.current = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true })
      .setView([18.5204, 73.8567], 12);

    // OpenStreetMap tiles — free, no API key
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapInst.current);

    return () => {
      mapInst.current?.remove();
      mapInst.current = null;
    };
  }, []);

  // Update markers when locations change
  useEffect(() => {
    if (!L || !mapInst.current) return;

    Object.entries(liveLocations).forEach(([vehicleId, loc]) => {
      if (!loc?.lat || !loc?.lng) return;
      const pos = [loc.lat, loc.lng];
      const isSelected = selectedId === vehicleId;

      if (markersRef.current[vehicleId]) {
        // Smooth move existing marker
        markersRef.current[vehicleId].setLatLng(pos);
      } else {
        // Create new marker
        const marker = L.marker(pos, {
          icon: busIcon(isSelected ? '#EF4444' : '#3B82F6'),
          zIndexOffset: isSelected ? 1000 : 0,
        }).addTo(mapInst.current);

        marker.bindPopup(`
          <div style="min-width:140px">
            <b>Vehicle: ${vehicleId.slice(-6)}</b><br/>
            Speed: ${loc.speed || 0} km/h<br/>
            Last updated: ${new Date(loc.updatedAt || Date.now()).toLocaleTimeString('en-IN')}
          </div>
        `);

        markersRef.current[vehicleId] = marker;
      }

      // Update popup
      markersRef.current[vehicleId].setPopupContent(`
        <div style="min-width:140px">
          <b>Vehicle: ${vehicleId.slice(-6)}</b><br/>
          Speed: ${loc.speed || 0} km/h<br/>
          Last updated: ${new Date(loc.updatedAt || Date.now()).toLocaleTimeString('en-IN')}
        </div>
      `);
    });
  }, [liveLocations, selectedId]);

  // Pan to selected vehicle
  useEffect(() => {
    if (!L || !mapInst.current || !selectedId) return;
    const loc = liveLocations[selectedId];
    if (loc?.lat && loc?.lng) {
      mapInst.current.panTo([loc.lat, loc.lng], { animate: true, duration: 0.5 });
      markersRef.current[selectedId]?.openPopup();
    }
  }, [selectedId]);

  return (
    <div style={{ height, width: '100%', position: 'relative' }}>
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 1000,
        background: 'white', borderRadius: 12, padding: '8px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#3B82F6', display: 'inline-block' }} />
          Active Vehicle
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
          Selected
        </div>
      </div>
    </div>
  );
}