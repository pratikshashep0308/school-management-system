// frontend/src/utils/useTransportSocket.js
// Custom hook that connects to Socket.IO for real-time GPS + trip alerts
// Usage: const { startSim, stopSim, isConnected } = useTransportSocket({ schoolId, onLocationUpdate, onTripAlert })

import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';

export function useTransportSocket({
  schoolId,
  parentId,
  onLocationUpdate,
  onTripAlert,
  onStopReached,
  onDriverOnline,
  onDriverOffline,
  role = 'admin', // 'admin' | 'parent' | 'student'
} = {}) {
  const socketRef    = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!schoolId) return;

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);

      // Join appropriate rooms by role
      if (role === 'parent' && parentId) {
        socket.emit('join:parent', { parentId, schoolId });
      } else if (role === 'student') {
        socket.emit('join:student', { schoolId });
      } else {
        socket.emit('join:school', { schoolId });
      }
    });

    socket.on('disconnect', () => setConnected(false));

    // Vehicle GPS location update
    if (onLocationUpdate) {
      socket.on('vehicle:location', onLocationUpdate);
    }

    // Trip alerts (delay, breakdown, emergency)
    if (onTripAlert) {
      socket.on('trip:alert', onTripAlert);
    }

    // Stop reached notification
    if (onStopReached) {
      socket.on('trip:stopReached', onStopReached);
    }

    // Driver online/offline
    if (onDriverOnline)  socket.on('driver:online',  onDriverOnline);
    if (onDriverOffline) socket.on('driver:offline', onDriverOffline);

    return () => {
      socket.disconnect();
      setConnected(false);
    };
  }, [schoolId, parentId, role]);

  // ── GPS Simulator controls ─────────────────────────────────────────────────
  const startSimulation = useCallback((busId, routeId) => {
    socketRef.current?.emit('sim:start', { busId, schoolId, routeId });
  }, [schoolId]);

  const stopSimulation = useCallback((busId) => {
    socketRef.current?.emit('sim:stop', { busId });
  }, []);

  // ── Request all current bus positions ──────────────────────────────────────
  const requestAllVehicles = useCallback(() => {
    socketRef.current?.emit('vehicles:requestAll', { schoolId });
  }, [schoolId]);

  // ── Emit raw GPS update (for driver app simulation) ────────────────────────
  const emitLocation = useCallback((busId, lat, lng, speed, heading) => {
    socketRef.current?.emit('gps:update', { busId, lat, lng, speed, heading, schoolId });
  }, [schoolId]);

  return {
    isConnected: connected,
    startSimulation,
    stopSimulation,
    requestAllVehicles,
    emitLocation,
    socket: socketRef.current,
  };
}
