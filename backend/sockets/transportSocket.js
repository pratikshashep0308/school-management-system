// backend/sockets/transportSocket.js
// Real-time Transport Socket Handler + GPS Simulator
// NO React imports — this is a pure Node.js backend file
const { Vehicle } = require('../models/transportModels');

const gpsSimulators = new Map();

const PUNE_BOUNDS = { minLat: 18.45, maxLat: 18.60, minLng: 73.75, maxLng: 73.95 };

function nextPosition(current) {
  return {
    lat:       Math.max(PUNE_BOUNDS.minLat, Math.min(PUNE_BOUNDS.maxLat, current.lat + (Math.random() - 0.5) * 0.002)),
    lng:       Math.max(PUNE_BOUNDS.minLng, Math.min(PUNE_BOUNDS.maxLng, current.lng + (Math.random() - 0.5) * 0.002)),
    speed:     Math.floor(20 + Math.random() * 40),
    heading:   Math.floor(Math.random() * 360),
    updatedAt: new Date(),
  };
}

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Join school room
    socket.on('join:school', (schoolId) => {
      socket.join(`school_${schoolId}`);
      console.log(`📚 Socket ${socket.id} joined school: ${schoolId}`);
    });

    // Parent joins their own room
    socket.on('join:parent', ({ parentId, schoolId }) => {
      socket.join(`parent_${parentId}`);
      socket.join(`school_${schoolId}`);
    });

    // Driver connects from mobile
    socket.on('driver:connect', ({ vehicleId, schoolId }) => {
      socket.join(`vehicle_${vehicleId}`);
      socket.join(`school_${schoolId}`);
      socket.vehicleId = vehicleId;
      socket.schoolId  = schoolId;
      io.to(`school_${schoolId}`).emit('driver:online', { vehicleId, onlineAt: new Date() });
    });

    // Live GPS from real device
    socket.on('gps:update', async ({ vehicleId, lat, lng, speed, heading, schoolId }) => {
      try {
        await Vehicle.findByIdAndUpdate(vehicleId, {
          $set: { currentLocation: { lat, lng, speed: speed || 0, heading: heading || 0, updatedAt: new Date() } }
        });
        io.to(`school_${schoolId}`).emit('vehicle:location', { vehicleId, lat, lng, speed, heading, timestamp: new Date() });
      } catch (err) {
        console.error('GPS update error:', err.message);
      }
    });

    // Panic button from driver
    socket.on('driver:panic', ({ vehicleId, schoolId, location, message }) => {
      io.to(`school_${schoolId}`).emit('trip:alert', {
        vehicleId, type: 'emergency',
        message: message || '🚨 EMERGENCY! Driver pressed panic button',
        location, timestamp: new Date(),
      });
    });

    // Start GPS simulation for a vehicle
    socket.on('sim:start', async ({ vehicleId, schoolId, routeId }) => {
      if (gpsSimulators.has(vehicleId)) return;
      try {
        const vehicle = await Vehicle.findById(vehicleId);
        if (!vehicle) return;
        let pos = { ...vehicle.currentLocation };

        const interval = setInterval(async () => {
          pos = nextPosition(pos);
          await Vehicle.findByIdAndUpdate(vehicleId, { $set: { currentLocation: pos } });
          io.to(`school_${schoolId}`).emit('vehicle:location', {
            vehicleId, routeId,
            lat: pos.lat, lng: pos.lng,
            speed: pos.speed, heading: pos.heading,
            timestamp: new Date(),
          });
        }, 3000);

        gpsSimulators.set(vehicleId, interval);
        socket.emit('sim:started', { vehicleId });
        console.log(`🗺️ GPS simulation started: ${vehicleId}`);
      } catch (err) {
        console.error('Sim error:', err.message);
      }
    });

    // Stop GPS simulation
    socket.on('sim:stop', ({ vehicleId }) => {
      const interval = gpsSimulators.get(vehicleId);
      if (interval) { clearInterval(interval); gpsSimulators.delete(vehicleId); }
      socket.emit('sim:stopped', { vehicleId });
      console.log(`⏹ GPS simulation stopped: ${vehicleId}`);
    });

    // Request all vehicle locations at once
    socket.on('vehicles:requestAll', async ({ schoolId }) => {
      const vehicles = await Vehicle.find({ school: schoolId, status: 'active' })
        .select('registrationNo type currentLocation assignedRoute');
      socket.emit('vehicles:all', vehicles);
    });

    // Boarding mark from driver
    socket.on('boarding:mark', ({ tripId, studentId, action, stopName, schoolId }) => {
      io.to(`school_${schoolId}`).emit('boarding:update', { tripId, studentId, action, stopName, timestamp: new Date() });
    });

    // Trip alert from driver app
    socket.on('trip:driverAlert', ({ tripId, schoolId, type, message }) => {
      io.to(`school_${schoolId}`).emit('trip:alert', { tripId, type, message, sentAt: new Date() });
    });

    // Disconnect
    socket.on('disconnect', () => {
      if (socket.vehicleId) {
        io.to(`school_${socket.schoolId}`).emit('driver:offline', { vehicleId: socket.vehicleId, offlineAt: new Date() });
      }
      console.log(`❌ Socket disconnected: ${socket.id}`);
    });
  });

  console.log('✅ Transport socket handlers registered');
};