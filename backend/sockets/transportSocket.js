// backend/sockets/transportSocket.js
// Real-time transport: GPS updates, trip alerts, GPS simulator
// Socket rooms:
//   school_{schoolId}   — all school staff & admins
//   parent_{parentId}   — individual parent notifications
//   vehicle_{busId}     — driver's own channel

const mongoose = require('mongoose');

// In-memory GPS simulators: busId → setInterval handle
const activeSimulators = new Map();

// Pune city bounds for realistic simulation
const PUNE_BOUNDS = {
  minLat: 18.45, maxLat: 18.60,
  minLng: 73.75, maxLng: 73.95,
};

// ─── Move position slightly in a realistic direction ──────────────────────────
function nextPosition(current, heading) {
  const speed   = 20 + Math.random() * 40; // 20–60 km/h
  const radians = ((heading ?? Math.random() * 360) * Math.PI) / 180;
  const dist    = (speed / 3600) * 3 * 0.01; // 3 second tick, rough degrees

  let lat = (current.lat ?? 18.52) + Math.cos(radians) * dist;
  let lng = (current.lng ?? 73.85) + Math.sin(radians) * dist;

  // Clamp to city bounds
  lat = Math.max(PUNE_BOUNDS.minLat, Math.min(PUNE_BOUNDS.maxLat, lat));
  lng = Math.max(PUNE_BOUNDS.minLng, Math.min(PUNE_BOUNDS.maxLng, lng));

  return {
    lat,
    lng,
    speed:     Math.round(speed),
    heading:   (heading + (Math.random() - 0.5) * 20 + 360) % 360,
    updatedAt: new Date(),
  };
}

// ─── Persist location to DB ───────────────────────────────────────────────────
async function persistLocation(busId, location) {
  try {
    const Bus    = mongoose.models.Bus;
    const GpsLog = mongoose.models.GpsLog;

    if (Bus) {
      await Bus.findByIdAndUpdate(busId, {
        $set: { currentLocation: location },
      });
    }
    if (GpsLog) {
      await GpsLog.create({
        bus:       busId,
        lat:       location.lat,
        lng:       location.lng,
        speed:     location.speed,
        heading:   location.heading,
        timestamp: location.updatedAt,
      });
    }
  } catch (err) {
    // Non-fatal — log and continue
    console.error('GPS persist error:', err.message);
  }
}

module.exports = (io) => {
  if (!io) return;

  io.on('connection', (socket) => {
    // ── Room joins ─────────────────────────────────────────────────────────────

    // Admin/staff joins school room
    socket.on('join:school', ({ schoolId }) => {
      socket.join(`school_${schoolId}`);
      socket.schoolId = schoolId;
    });

    // Parent joins their personal room + school room
    socket.on('join:parent', ({ parentId, schoolId }) => {
      socket.join(`parent_${parentId}`);
      socket.join(`school_${schoolId}`);
      socket.schoolId = schoolId;
    });

    // Student joins school room (read-only, no driver events)
    socket.on('join:student', ({ schoolId }) => {
      socket.join(`school_${schoolId}`);
      socket.schoolId = schoolId;
    });

    // Driver connects to their vehicle channel
    socket.on('driver:connect', ({ busId, schoolId }) => {
      socket.join(`vehicle_${busId}`);
      socket.join(`school_${schoolId}`);
      socket.busId    = busId;
      socket.schoolId = schoolId;

      // Notify school that driver is online
      io.to(`school_${schoolId}`).emit('driver:online', {
        busId,
        onlineAt: new Date(),
      });
    });

    // ── Real GPS update (from driver device / hardware GPS) ────────────────────
    socket.on('gps:update', async ({ busId, lat, lng, speed = 0, heading = 0, schoolId }) => {
      const location = { lat, lng, speed, heading, updatedAt: new Date() };

      await persistLocation(busId, location);

      // Broadcast to everyone watching this school
      io.to(`school_${schoolId || socket.schoolId}`).emit('vehicle:location', {
        vehicleId: busId,
        busId,
        ...location,
        timestamp: new Date(),
      });
    });

    // ── GPS Simulator ──────────────────────────────────────────────────────────
    socket.on('sim:start', async ({ busId, schoolId, routeId }) => {
      if (activeSimulators.has(busId)) {
        socket.emit('sim:error', { message: 'Simulator already running for this bus' });
        return;
      }

      // Seed starting position from DB if available
      let pos = { lat: 18.52, lng: 73.85, speed: 0, heading: 45 };
      try {
        const Bus = mongoose.models.Bus;
        if (Bus) {
          const bus = await Bus.findById(busId);
          if (bus?.currentLocation?.lat) {
            pos = { ...bus.currentLocation, heading: bus.currentLocation.heading ?? 45 };
          }
        }
      } catch (_) { /* use default */ }

      const interval = setInterval(async () => {
        pos = nextPosition(pos, pos.heading);

        await persistLocation(busId, pos);

        io.to(`school_${schoolId}`).emit('vehicle:location', {
          vehicleId: busId,
          busId,
          routeId,
          ...pos,
          simulated: true,
          timestamp: new Date(),
        });
      }, 3000); // Update every 3 seconds

      activeSimulators.set(busId, interval);
      socket.emit('sim:started', { busId });

      // Auto-stop after 4 hours to prevent runaway timers
      setTimeout(() => {
        const handle = activeSimulators.get(busId);
        if (handle) { clearInterval(handle); activeSimulators.delete(busId); }
      }, 4 * 60 * 60 * 1000);
    });

    socket.on('sim:stop', ({ busId }) => {
      const interval = activeSimulators.get(busId);
      if (interval) {
        clearInterval(interval);
        activeSimulators.delete(busId);
      }
      socket.emit('sim:stopped', { busId });
    });

    // ── Request all active vehicle locations ────────────────────────────────────
    socket.on('vehicles:requestAll', async ({ schoolId }) => {
      try {
        const Bus = mongoose.models.Bus;
        const buses = Bus
          ? await Bus.find({ school: schoolId, status: 'active', isActive: true })
              .select('busNumber registrationNo currentLocation assignedRoute driver')
              .populate('assignedRoute', 'name code')
          : [];

        socket.emit('vehicles:all', buses);
      } catch (err) {
        socket.emit('vehicles:all', []);
      }
    });

    // ── Driver panic button ─────────────────────────────────────────────────────
    socket.on('driver:panic', ({ busId, schoolId, message }) => {
      io.to(`school_${schoolId || socket.schoolId}`).emit('trip:alert', {
        busId:     busId || socket.busId,
        type:      'emergency',
        message:   message || '🚨 EMERGENCY — Driver pressed panic button!',
        timestamp: new Date(),
      });
    });

    // ── Trip stop reached notification ─────────────────────────────────────────
    socket.on('trip:stopReached', ({ tripId, stopName, schoolId }) => {
      io.to(`school_${schoolId || socket.schoolId}`).emit('trip:stopReached', {
        tripId,
        stopName,
        time: new Date(),
      });
    });

    // ── Check simulator status ─────────────────────────────────────────────────
    socket.on('sim:status', ({ busId }) => {
      socket.emit('sim:status:reply', {
        busId,
        running: activeSimulators.has(busId),
      });
    });

    // ── Disconnect cleanup ─────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (socket.busId) {
        io.to(`school_${socket.schoolId}`).emit('driver:offline', {
          busId:     socket.busId,
          offlineAt: new Date(),
        });
      }
    });
  });

  console.log('✅ Transport socket handlers registered');
};
