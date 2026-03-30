// backend/sockets/transportSocket.js
// Safe version — uses mongoose.models to avoid OverwriteModelError
const mongoose = require('mongoose');

const gpsSimulators = new Map();
const PUNE_BOUNDS = { minLat: 18.45, maxLat: 18.60, minLng: 73.75, maxLng: 73.95 };

function nextPosition(current) {
  return {
    lat:       Math.max(PUNE_BOUNDS.minLat, Math.min(PUNE_BOUNDS.maxLat, (current.lat || 18.52) + (Math.random() - 0.5) * 0.002)),
    lng:       Math.max(PUNE_BOUNDS.minLng, Math.min(PUNE_BOUNDS.maxLng, (current.lng || 73.85) + (Math.random() - 0.5) * 0.002)),
    speed:     Math.floor(20 + Math.random() * 40),
    heading:   Math.floor(Math.random() * 360),
    updatedAt: new Date(),
  };
}

module.exports = (io) => {
  if (!io) return;

  io.on('connection', (socket) => {
    socket.on('join:school', (schoolId) => socket.join('school_' + schoolId));
    socket.on('join:parent', ({ parentId, schoolId }) => { socket.join('parent_' + parentId); socket.join('school_' + schoolId); });

    socket.on('driver:connect', ({ vehicleId, schoolId }) => {
      socket.join('vehicle_' + vehicleId);
      socket.join('school_' + schoolId);
      socket.vehicleId = vehicleId; socket.schoolId = schoolId;
      io.to('school_' + schoolId).emit('driver:online', { vehicleId, onlineAt: new Date() });
    });

    socket.on('gps:update', async ({ vehicleId, lat, lng, speed, heading, schoolId }) => {
      try {
        const Vehicle = mongoose.models.Vehicle;
        if (Vehicle) await Vehicle.findByIdAndUpdate(vehicleId, { $set: { currentLocation: { lat, lng, speed: speed || 0, heading: heading || 0, updatedAt: new Date() } } });
        io.to('school_' + schoolId).emit('vehicle:location', { vehicleId, lat, lng, speed, heading, timestamp: new Date() });
      } catch (err) { console.error('GPS update error:', err.message); }
    });

    socket.on('driver:panic', ({ vehicleId, schoolId, message }) => {
      io.to('school_' + schoolId).emit('trip:alert', { vehicleId, type: 'emergency', message: message || '🚨 EMERGENCY! Driver pressed panic button', timestamp: new Date() });
    });

    socket.on('sim:start', async ({ vehicleId, schoolId, routeId }) => {
      if (gpsSimulators.has(vehicleId)) return;
      let pos = { lat: 18.52, lng: 73.85 };
      try {
        const Vehicle = mongoose.models.Vehicle;
        if (Vehicle) { const v = await Vehicle.findById(vehicleId); if (v?.currentLocation) pos = v.currentLocation; }
      } catch (e) { /* ignore */ }

      const interval = setInterval(async () => {
        pos = nextPosition(pos);
        try { const Vehicle = mongoose.models.Vehicle; if (Vehicle) await Vehicle.findByIdAndUpdate(vehicleId, { $set: { currentLocation: pos } }); } catch(e) {}
        io.to('school_' + schoolId).emit('vehicle:location', { vehicleId, routeId, lat: pos.lat, lng: pos.lng, speed: pos.speed, heading: pos.heading, timestamp: new Date() });
      }, 3000);

      gpsSimulators.set(vehicleId, interval);
      socket.emit('sim:started', { vehicleId });
    });

    socket.on('sim:stop', ({ vehicleId }) => {
      const interval = gpsSimulators.get(vehicleId);
      if (interval) { clearInterval(interval); gpsSimulators.delete(vehicleId); }
      socket.emit('sim:stopped', { vehicleId });
    });

    socket.on('vehicles:requestAll', async ({ schoolId }) => {
      try {
        const Vehicle = mongoose.models.Vehicle;
        const vehicles = Vehicle ? await Vehicle.find({ school: schoolId, status: 'active' }).select('registrationNo type currentLocation assignedRoute') : [];
        socket.emit('vehicles:all', vehicles);
      } catch(e) { socket.emit('vehicles:all', []); }
    });

    socket.on('trip:driverAlert', ({ tripId, schoolId, type, message }) => {
      io.to('school_' + schoolId).emit('trip:alert', { tripId, type, message, sentAt: new Date() });
    });

    socket.on('disconnect', () => {
      if (socket.vehicleId) io.to('school_' + socket.schoolId).emit('driver:offline', { vehicleId: socket.vehicleId, offlineAt: new Date() });
    });
  });

  console.log('✅ Transport socket handlers registered');
};