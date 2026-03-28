// frontend/src/utils/useTransportSocket.js
// Custom React hook — wraps all transport Socket.io events
import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';  // npm install socket.io-client

const SOCKET_URL = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';

// Singleton socket — shared across all hook instances
let _socket = null;

function getSocket() {
  if (!_socket) {
    _socket = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
    });
  }
  return _socket;
}

export function useTransportSocket({ schoolId, onLocationUpdate, onBoardingUpdate, onTripAlert, onDriverStatus }) {
  const socket = useRef(getSocket());

  useEffect(() => {
    const s = socket.current;

    // Join school room to receive school-specific broadcasts
    if (schoolId) s.emit('join:school', schoolId);

    // ── Event listeners ────────────────────────────────────────────────────
    if (onLocationUpdate) s.on('vehicle:location',   onLocationUpdate);
    if (onBoardingUpdate) s.on('boarding:update',    onBoardingUpdate);
    if (onTripAlert)      s.on('trip:alert',         onTripAlert);
    if (onDriverStatus) {
      s.on('driver:online',  (d) => onDriverStatus({ ...d, online: true  }));
      s.on('driver:offline', (d) => onDriverStatus({ ...d, online: false }));
    }

    s.on('connect',    () => console.log('🔌 Transport socket connected'));
    s.on('disconnect', () => console.log('❌ Transport socket disconnected'));

    return () => {
      if (onLocationUpdate) s.off('vehicle:location',   onLocationUpdate);
      if (onBoardingUpdate) s.off('boarding:update',    onBoardingUpdate);
      if (onTripAlert)      s.off('trip:alert',         onTripAlert);
      s.off('driver:online');
      s.off('driver:offline');
    };
  }, [schoolId]);

  // ── Emitter helpers ────────────────────────────────────────────────────────
  const startSimulation = useCallback((vehicleId, routeId) => {
    socket.current.emit('sim:start', { vehicleId, schoolId, routeId });
  }, [schoolId]);

  const stopSimulation = useCallback((vehicleId) => {
    socket.current.emit('sim:stop', { vehicleId });
  }, []);

  const requestAllLocations = useCallback(() => {
    socket.current.emit('vehicles:requestAll', { schoolId });
  }, [schoolId]);

  const sendDriverAlert = useCallback((tripId, type, message) => {
    socket.current.emit('trip:driverAlert', { tripId, schoolId, type, message });
  }, [schoolId]);

  return { startSimulation, stopSimulation, requestAllLocations, sendDriverAlert, socket: socket.current };
}