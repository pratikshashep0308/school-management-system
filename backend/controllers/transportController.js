// backend/controllers/transportController.js
// Transport Management — Full controller with role-based access
// Roles: superAdmin, schoolAdmin, transportManager → full access
//        student, parent → read-only, filtered to own data

const mongoose = require('mongoose');
const {
  Bus, Stop, BusRoute,
  TransportAssignment, TransportFee,
  Trip, GpsLog,
} = require('../models/transportModels');

const Student = require('../models/Student');

// ─── Receipt generator ────────────────────────────────────────────────────────
const genReceipt = () =>
  `TRP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

// ─── Role helpers ─────────────────────────────────────────────────────────────
const ADMIN_ROLES = ['superAdmin', 'schoolAdmin', 'transportManager'];
const isAdmin = (user) => ADMIN_ROLES.includes(user.role);


// =============================================================================
// BUS CONTROLLERS
// =============================================================================

exports.getBuses = async (req, res) => {
  const buses = await Bus.find({ school: req.user.school, isActive: true })
    .populate('assignedRoute', 'name code color')
    .sort({ busNumber: 1 });
  res.json({ success: true, count: buses.length, data: buses });
};

exports.getBus = async (req, res) => {
  const bus = await Bus.findOne({ _id: req.params.id, school: req.user.school })
    .populate('assignedRoute', 'name code stops');
  if (!bus) return res.status(404).json({ success: false, message: 'Bus not found' });
  res.json({ success: true, data: bus });
};

exports.createBus = async (req, res) => {
  const existing = await Bus.findOne({
    $or: [
      { busNumber: req.body.busNumber?.toUpperCase(), school: req.user.school },
      { registrationNo: req.body.registrationNo?.toUpperCase(), school: req.user.school },
    ],
  });
  if (existing) {
    return res.status(400).json({
      success: false,
      message: 'Bus number or registration already exists',
    });
  }

  const bus = await Bus.create({ ...req.body, school: req.user.school });

  // If route assigned, link back
  if (req.body.assignedRoute) {
    await BusRoute.findByIdAndUpdate(req.body.assignedRoute, { assignedBus: bus._id });
  }

  res.status(201).json({ success: true, data: bus });
};

exports.updateBus = async (req, res) => {
  const bus = await Bus.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    req.body,
    { new: true, runValidators: true }
  ).populate('assignedRoute', 'name code');

  if (!bus) return res.status(404).json({ success: false, message: 'Bus not found' });
  res.json({ success: true, data: bus });
};

exports.deleteBus = async (req, res) => {
  const hasActiveAssignments = await TransportAssignment.exists({
    bus: req.params.id, isActive: true,
  });
  if (hasActiveAssignments) {
    return res.status(400).json({
      success: false,
      message: 'Bus has active student assignments. Please reassign students first.',
    });
  }

  await Bus.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { isActive: false }
  );
  res.json({ success: true, message: 'Bus deactivated' });
};

// Update GPS location (called by GPS device or simulator)
exports.updateBusLocation = async (req, res) => {
  const { lat, lng, speed = 0, heading = 0 } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({ success: false, message: 'lat and lng required' });
  }

  const locationData = {
    lat, lng, speed, heading, updatedAt: new Date(),
  };

  const bus = await Bus.findOneAndUpdate(
    { _id: req.params.id },
    { $set: { currentLocation: locationData } },
    { new: true }
  );

  if (!bus) return res.status(404).json({ success: false, message: 'Bus not found' });

  // Save to GPS log
  await GpsLog.create({
    school: bus.school, bus: bus._id, lat, lng, speed, heading,
  });

  // Broadcast via Socket.IO to all school watchers
  const io = req.app.get('io');
  if (io) {
    io.to(`school_${bus.school}`).emit('vehicle:location', {
      vehicleId: bus._id.toString(),
      busNumber: bus.busNumber,
      lat, lng, speed, heading,
      timestamp: new Date(),
    });
  }

  res.json({ success: true, data: { lat, lng, speed, heading } });
};


// =============================================================================
// ROUTE CONTROLLERS
// =============================================================================

exports.getRoutes = async (req, res) => {
  const routes = await BusRoute.find({ school: req.user.school, isActive: true })
    .populate('assignedBus', 'busNumber registrationNo driver currentLocation status')
    .sort({ code: 1 });

  // Attach student counts per stop
  for (const route of routes) {
    const assignments = await TransportAssignment.find({
      school: req.user.school,
      route: route._id,
      isActive: true,
    }).select('pickupStop');

    // Count students per stop
    const stopCounts = {};
    assignments.forEach((a) => {
      const name = a.pickupStop?.name;
      if (name) stopCounts[name] = (stopCounts[name] || 0) + 1;
    });

    route.stops = route.stops.map((s) => ({
      ...s.toObject(),
      studentCount: stopCounts[s.name] || 0,
    }));
    route.totalStudents = assignments.length;
  }

  res.json({ success: true, count: routes.length, data: routes });
};

exports.getRoute = async (req, res) => {
  const route = await BusRoute.findOne({ _id: req.params.id, school: req.user.school })
    .populate('assignedBus', 'busNumber registrationNo driver currentLocation status color');

  if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

  // Get full stop details
  const stops = await Stop.find({ route: route._id, isActive: true }).sort({ sequence: 1 });

  // Get student count per stop
  const assignments = await TransportAssignment.find({
    school: req.user.school,
    route: route._id,
    isActive: true,
  }).populate('student', 'name rollNumber class profileImage').select('student pickupStop dropStop');

  const stopCounts = {};
  assignments.forEach((a) => {
    const sn = a.pickupStop?.name;
    if (sn) stopCounts[sn] = (stopCounts[sn] || 0) + 1;
  });

  const stopsWithCounts = stops.map((s) => ({
    ...s.toObject(),
    studentCount: stopCounts[s.name] || 0,
  }));

  res.json({
    success: true,
    data: {
      ...route.toObject(),
      stops: stopsWithCounts,
      assignments,
      totalStudents: assignments.length,
    },
  });
};

exports.createRoute = async (req, res) => {
  const { stops: stopData, ...routeData } = req.body;

  const existing = await BusRoute.findOne({
    code: routeData.code?.toUpperCase(),
    school: req.user.school,
  });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Route code already exists' });
  }

  const route = await BusRoute.create({ ...routeData, school: req.user.school });

  // Create Stop documents and embed summaries in route
  if (stopData && stopData.length > 0) {
    const stopDocs = await Stop.insertMany(
      stopData.map((s, i) => ({
        school: req.user.school,
        route: route._id,
        name: s.name,
        sequence: s.sequence ?? i + 1,
        morningArrivalTime: s.morningArrivalTime || s.time,
        eveningArrivalTime: s.eveningArrivalTime,
        location: s.location,
        landmark: s.landmark,
      }))
    );

    route.stops = stopDocs.map((s) => ({
      stop: s._id,
      name: s.name,
      sequence: s.sequence,
      morningTime: s.morningArrivalTime,
      eveningTime: s.eveningArrivalTime,
      lat: s.location?.lat,
      lng: s.location?.lng,
    }));

    await route.save();
  }

  res.status(201).json({ success: true, data: route });
};

exports.updateRoute = async (req, res) => {
  const { stops: stopData, ...routeData } = req.body;

  const route = await BusRoute.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    routeData,
    { new: true, runValidators: true }
  );

  if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

  // Sync stops if provided
  if (stopData) {
    await Stop.deleteMany({ route: route._id });

    const stopDocs = await Stop.insertMany(
      stopData.map((s, i) => ({
        school: req.user.school,
        route: route._id,
        name: s.name,
        sequence: s.sequence ?? i + 1,
        morningArrivalTime: s.morningArrivalTime || s.time,
        eveningArrivalTime: s.eveningArrivalTime,
        location: s.location,
        landmark: s.landmark,
      }))
    );

    route.stops = stopDocs.map((s) => ({
      stop: s._id,
      name: s.name,
      sequence: s.sequence,
      morningTime: s.morningArrivalTime,
      eveningTime: s.eveningArrivalTime,
      lat: s.location?.lat,
      lng: s.location?.lng,
    }));

    await route.save();
  }

  res.json({ success: true, data: route });
};

exports.deleteRoute = async (req, res) => {
  const hasStudents = await TransportAssignment.exists({
    route: req.params.id, isActive: true,
  });
  if (hasStudents) {
    return res.status(400).json({
      success: false,
      message: 'Route has active student assignments',
    });
  }

  await BusRoute.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { isActive: false }
  );
  res.json({ success: true, message: 'Route deactivated' });
};


// =============================================================================
// STOP CONTROLLERS (standalone stop management)
// =============================================================================

exports.getStops = async (req, res) => {
  const filter = { school: req.user.school, isActive: true };
  if (req.query.route) filter.route = req.query.route;

  const stops = await Stop.find(filter).sort({ sequence: 1 });

  // Enrich with student counts
  const stopIds = stops.map((s) => s._id.toString());
  const assignments = await TransportAssignment.find({
    school: req.user.school,
    isActive: true,
    'pickupStop.stopId': { $in: stops.map((s) => s._id) },
  }).select('pickupStop');

  const counts = {};
  assignments.forEach((a) => {
    const id = a.pickupStop?.stopId?.toString();
    if (id) counts[id] = (counts[id] || 0) + 1;
  });

  const enriched = stops.map((s) => ({
    ...s.toObject(),
    studentCount: counts[s._id.toString()] || 0,
  }));

  res.json({ success: true, data: enriched });
};

exports.createStop = async (req, res) => {
  const stop = await Stop.create({ ...req.body, school: req.user.school });

  // Update embedded copy in route
  await BusRoute.findByIdAndUpdate(req.body.route, {
    $push: {
      stops: {
        stop: stop._id,
        name: stop.name,
        sequence: stop.sequence,
        morningTime: stop.morningArrivalTime,
        eveningTime: stop.eveningArrivalTime,
        lat: stop.location?.lat,
        lng: stop.location?.lng,
      },
    },
  });

  res.status(201).json({ success: true, data: stop });
};

exports.updateStop = async (req, res) => {
  const stop = await Stop.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    req.body,
    { new: true }
  );
  if (!stop) return res.status(404).json({ success: false, message: 'Stop not found' });

  // Sync in route embedded array
  await BusRoute.updateOne(
    { _id: stop.route, 'stops.stop': stop._id },
    {
      $set: {
        'stops.$.name':        stop.name,
        'stops.$.sequence':    stop.sequence,
        'stops.$.morningTime': stop.morningArrivalTime,
        'stops.$.eveningTime': stop.eveningArrivalTime,
        'stops.$.lat':         stop.location?.lat,
        'stops.$.lng':         stop.location?.lng,
      },
    }
  );

  res.json({ success: true, data: stop });
};

exports.deleteStop = async (req, res) => {
  await Stop.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { isActive: false }
  );
  res.json({ success: true, message: 'Stop removed' });
};


// =============================================================================
// ASSIGNMENT CONTROLLERS
// =============================================================================

exports.getAssignments = async (req, res) => {
  const filter = { school: req.user.school, isActive: true };
  if (req.query.route) filter.route = req.query.route;
  if (req.query.bus)   filter.bus   = req.query.bus;
  if (req.query.student) filter.student = req.query.student;

  const assignments = await TransportAssignment.find(filter)
    .populate('student', 'name rollNumber class profileImage')
    .populate('route',   'name code color')
    .populate('bus',     'busNumber registrationNo driver')
    .sort({ createdAt: -1 });

  res.json({ success: true, count: assignments.length, data: assignments });
};

exports.assignStudent = async (req, res) => {
  const { studentId, routeId, busId, pickupStop, dropStop, monthlyFee, passType } = req.body;

  // Deactivate any existing assignment for this student
  await TransportAssignment.updateMany(
    { student: studentId, school: req.user.school, isActive: true },
    { isActive: false }
  );

  const assignment = await TransportAssignment.create({
    school:     req.user.school,
    student:    studentId,
    route:      routeId,
    bus:        busId,
    pickupStop,
    dropStop,
    monthlyFee: monthlyFee || 0,
    passType:   passType || 'both',
  });

  await assignment.populate([
    { path: 'student', select: 'name rollNumber class' },
    { path: 'route',   select: 'name code' },
    { path: 'bus',     select: 'busNumber driver' },
  ]);

  // Update student count on route stops
  await _refreshRouteStudentCounts(routeId, req.user.school);

  res.status(201).json({ success: true, data: assignment });
};

exports.removeAssignment = async (req, res) => {
  const assignment = await TransportAssignment.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { isActive: false },
    { new: true }
  );
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

  await _refreshRouteStudentCounts(assignment.route, req.user.school);
  res.json({ success: true, message: 'Assignment removed' });
};

// ── Helper: refresh student counts on route stops ────────────────────────────
async function _refreshRouteStudentCounts(routeId, school) {
  const assignments = await TransportAssignment.find({
    school, route: routeId, isActive: true,
  }).select('pickupStop');

  const counts = {};
  assignments.forEach((a) => {
    const n = a.pickupStop?.name;
    if (n) counts[n] = (counts[n] || 0) + 1;
  });

  const route = await BusRoute.findById(routeId);
  if (!route) return;

  route.stops = route.stops.map((s) => ({
    ...s.toObject(),
    studentCount: counts[s.name] || 0,
  }));
  route.totalStudents = assignments.length;
  await route.save();
}


// =============================================================================
// STUDENT / PARENT VIEW — filtered to own data
// =============================================================================

exports.getMyTransport = async (req, res) => {
  // Determine student from JWT role
  let studentDoc;
  if (req.user.role === 'student') {
    studentDoc = await Student.findOne({ user: req.user._id });
  } else if (req.user.role === 'parent') {
    studentDoc = await Student.findOne({ parent: req.user._id });
  }

  if (!studentDoc) {
    return res.status(404).json({ success: false, message: 'Student record not found' });
  }

  const assignment = await TransportAssignment.findOne({
    student: studentDoc._id,
    school:  req.user.school,
    isActive: true,
  })
    .populate('route', 'name code color stops morningDepartureTime eveningDepartureTime')
    .populate('bus',   'busNumber registrationNo type driver helper currentLocation status');

  if (!assignment) {
    return res.json({ success: true, data: null, message: 'No transport assignment found' });
  }

  // Get fee summary for this student
  const currentMonth = new Date().getMonth() + 1;
  const currentYear  = new Date().getFullYear();

  const feeRecords = await TransportFee.find({
    student: studentDoc._id,
    school:  req.user.school,
  })
    .sort({ year: -1, month: -1 })
    .limit(6);

  const currentFee = feeRecords.find(
    (f) => f.month === currentMonth && f.year === currentYear
  );

  // Calculate ETA for next stop (simple estimate based on speed)
  const busLocation = assignment.bus?.currentLocation;
  const etaMinutes  = busLocation ? _estimateETA(busLocation, assignment.pickupStop) : null;

  res.json({
    success: true,
    data: {
      student: {
        id:   studentDoc._id,
        name: studentDoc.name,
      },
      assignment: {
        _id:      assignment._id,
        passType: assignment.passType,
        pickupStop: assignment.pickupStop,
        dropStop:   assignment.dropStop,
      },
      route: assignment.route,
      bus: {
        ...assignment.bus?.toObject?.(),
        // Only expose driver name/phone, not sensitive fields
        driver: {
          name:  assignment.bus?.driver?.name,
          phone: assignment.bus?.driver?.phone,
        },
      },
      currentFee: currentFee || null,
      feeHistory: feeRecords,
      eta: etaMinutes,
      status: _getBusStatus(busLocation, assignment.pickupStop, etaMinutes),
    },
  });
};

// Simple ETA estimator (replace with real routing API if needed)
function _estimateETA(busLocation, pickupStop) {
  if (!busLocation?.lat || !pickupStop?.lat) return null;
  const d = _haversineKm(
    busLocation.lat, busLocation.lng,
    pickupStop.lat,  pickupStop.lng
  );
  const speed = busLocation.speed > 5 ? busLocation.speed : 30; // assume 30 km/h min
  return Math.round((d / speed) * 60); // minutes
}

function _getBusStatus(loc, stop, etaMin) {
  if (!loc || !loc.lat) return 'offline';
  if (etaMin === null)  return 'tracking';
  if (etaMin <= 2)      return 'arriving';
  if (etaMin <= 5)      return 'nearby';
  return 'en_route';
}

function _haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// =============================================================================
// TRANSPORT FEE CONTROLLERS
// =============================================================================

exports.getFees = async (req, res) => {
  const filter = { school: req.user.school };

  // Students/parents can only see their own fees
  if (!isAdmin(req.user)) {
    let studentDoc;
    if (req.user.role === 'student') {
      studentDoc = await Student.findOne({ user: req.user._id });
    } else if (req.user.role === 'parent') {
      studentDoc = await Student.findOne({ parent: req.user._id });
    }
    if (!studentDoc) return res.json({ success: true, data: [] });
    filter.student = studentDoc._id;
  }

  if (req.query.month)   filter.month   = parseInt(req.query.month);
  if (req.query.year)    filter.year    = parseInt(req.query.year);
  if (req.query.status)  filter.status  = req.query.status;
  if (req.query.student && isAdmin(req.user)) filter.student = req.query.student;

  const fees = await TransportFee.find(filter)
    .populate('student', 'name rollNumber class')
    .sort({ year: -1, month: -1 });

  res.json({ success: true, count: fees.length, data: fees });
};

exports.generateMonthlyFees = async (req, res) => {
  const { month, year } = req.body;

  // Get all active assignments
  const assignments = await TransportAssignment.find({
    school: req.user.school, isActive: true,
  }).populate('student', 'name');

  let created = 0;
  const dueDate = new Date(year, month - 1, 10); // 10th of the month

  for (const assignment of assignments) {
    const exists = await TransportFee.findOne({
      student: assignment.student._id,
      month,
      year,
      school: req.user.school,
    });
    if (exists) continue;

    const isLate = new Date() > dueDate;
    const lateFee = isLate ? Math.round(assignment.monthlyFee * 0.05) : 0;

    await TransportFee.create({
      school:     req.user.school,
      student:    assignment.student._id,
      assignment: assignment._id,
      month,
      year,
      amount:     assignment.monthlyFee,
      lateFee,
      discount:   0,
      totalDue:   assignment.monthlyFee + lateFee,
      dueDate,
    });
    created++;
  }

  res.json({ success: true, message: `Generated ${created} fee records for ${month}/${year}` });
};

exports.recordPayment = async (req, res) => {
  const { amount, paymentMethod, transactionId, remarks } = req.body;

  const fee = await TransportFee.findOne({
    _id: req.params.id, school: req.user.school,
  });
  if (!fee) return res.status(404).json({ success: false, message: 'Fee record not found' });

  const newPaid = (fee.paidAmount || 0) + parseFloat(amount);
  const status  = newPaid >= fee.totalDue ? 'paid' : 'partial';

  fee.paidAmount    = newPaid;
  fee.status        = status;
  fee.paidDate      = new Date();
  fee.paymentMethod = paymentMethod;
  fee.transactionId = transactionId;
  fee.receiptNo     = fee.receiptNo || genReceipt();
  fee.remarks       = remarks;

  fee.paymentHistory.push({
    amount,
    date:          new Date(),
    method:        paymentMethod,
    transactionId,
    recordedBy:    req.user._id,
  });

  await fee.save();
  await fee.populate('student', 'name rollNumber');

  res.json({ success: true, data: fee });
};

exports.getFeeSummary = async (req, res) => {
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const year  = parseInt(req.query.year)  || new Date().getFullYear();

  const summary = await TransportFee.aggregate([
    {
      $match: {
        school: new mongoose.Types.ObjectId(req.user.school),
        month,
        year,
      },
    },
    {
      $group: {
        _id:      '$status',
        count:    { $sum: 1 },
        total:    { $sum: '$totalDue' },
        collected:{ $sum: '$paidAmount' },
      },
    },
  ]);

  const result = { paid: 0, pending: 0, partial: 0, totalExpected: 0, totalCollected: 0 };
  summary.forEach((s) => {
    result[s._id] = s.total;
    result.totalCollected += s.collected;
    result.totalExpected  += s.total;
  });

  res.json({ success: true, data: result });
};


// =============================================================================
// TRIP CONTROLLERS
// =============================================================================

exports.getTodayTrips = async (req, res) => {
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const trips = await Trip.find({
    school: req.user.school,
    date: { $gte: today, $lt: tomorrow },
  })
    .populate('route', 'name code color')
    .populate('bus',   'busNumber registrationNo driver currentLocation status');

  res.json({ success: true, data: trips });
};

exports.startTrip = async (req, res) => {
  const { routeId, busId, tripType } = req.body;

  const route = await BusRoute.findById(routeId);
  if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

  const trip = await Trip.create({
    school:    req.user.school,
    route:     routeId,
    bus:       busId,
    date:      new Date(),
    tripType,
    status:    'in_progress',
    startTime: new Date(),
    stopProgress: route.stops.map((s) => ({
      stopId:   s.stop || s._id,
      stopName: s.name,
      status:   'pending',
    })),
  });

  // Update bus status
  await Bus.findByIdAndUpdate(busId, { $set: { 'currentLocation.updatedAt': new Date() } });

  const io = req.app.get('io');
  if (io) {
    io.to(`school_${req.user.school}`).emit('trip:started', {
      tripId: trip._id,
      routeName: route.name,
      tripType,
    });
  }

  res.status(201).json({ success: true, data: trip });
};

exports.updateTripStop = async (req, res) => {
  const { stopId, status } = req.body;

  const trip = await Trip.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school, 'stopProgress.stopId': stopId },
    {
      $set: {
        'stopProgress.$.status':     status,
        'stopProgress.$.actualTime': new Date(),
      },
    },
    { new: true }
  );

  if (!trip) return res.status(404).json({ success: false, message: 'Trip/stop not found' });

  const io = req.app.get('io');
  if (io) {
    io.to(`school_${req.user.school}`).emit('trip:stopReached', {
      tripId:   trip._id.toString(),
      stopId,
      status,
      time:     new Date(),
    });
  }

  res.json({ success: true, data: trip });
};

exports.endTrip = async (req, res) => {
  const trip = await Trip.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { status: 'completed', endTime: new Date() },
    { new: true }
  );
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
  res.json({ success: true, data: trip });
};

exports.sendTripAlert = async (req, res) => {
  const { type, message } = req.body;

  const trip = await Trip.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { $push: { alerts: { type, message, sentAt: new Date() } } },
    { new: true }
  );
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

  const io = req.app.get('io');
  if (io) {
    io.to(`school_${req.user.school}`).emit('trip:alert', {
      tripId:  trip._id.toString(),
      type,
      message,
      sentAt:  new Date(),
    });
  }

  res.json({ success: true, message: 'Alert sent' });
};


// =============================================================================
// DASHBOARD SUMMARY (Admin)
// =============================================================================

exports.getTransportDashboard = async (req, res) => {
  const school      = new mongoose.Types.ObjectId(req.user.school);
  const today       = new Date(); today.setHours(0, 0, 0, 0);
  const thisMonth   = today.getMonth() + 1;
  const thisYear    = today.getFullYear();
  const tomorrow    = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    totalBuses, activeBuses,
    totalRoutes,
    totalAssignments,
    todayTrips,
    feeSummary,
    recentBuses,
  ] = await Promise.all([
    Bus.countDocuments({ school: req.user.school, isActive: true }),
    Bus.countDocuments({ school: req.user.school, status: 'active', isActive: true }),
    BusRoute.countDocuments({ school: req.user.school, isActive: true }),
    TransportAssignment.countDocuments({ school: req.user.school, isActive: true }),
    Trip.find({ school: req.user.school, date: { $gte: today, $lt: tomorrow } })
      .populate('route', 'name code')
      .populate('bus',   'busNumber driver'),
    TransportFee.aggregate([
      { $match: { school, month: thisMonth, year: thisYear } },
      { $group: { _id: '$status', total: { $sum: '$totalDue' }, collected: { $sum: '$paidAmount' }, count: { $sum: 1 } } },
    ]),
    Bus.find({ school: req.user.school, isActive: true })
      .populate('assignedRoute', 'name code')
      .select('busNumber registrationNo driver currentLocation status assignedRoute')
      .sort({ updatedAt: -1 })
      .limit(5),
  ]);

  const feeMap = {};
  feeSummary.forEach((f) => { feeMap[f._id] = f; });

  res.json({
    success: true,
    data: {
      buses:   { total: totalBuses, active: activeBuses, maintenance: totalBuses - activeBuses },
      routes:  totalRoutes,
      students: totalAssignments,
      todayTrips,
      fees: {
        collected: feeMap.paid?.collected || 0,
        pending:   (feeMap.pending?.total || 0) + (feeMap.partial?.total || 0),
        collectedCount: feeMap.paid?.count || 0,
        pendingCount:   (feeMap.pending?.count || 0) + (feeMap.partial?.count || 0),
      },
      recentBuses,
    },
  });
};


// =============================================================================
// GPS HISTORY
// =============================================================================

exports.getGpsHistory = async (req, res) => {
  const { busId } = req.params;
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000); // Last 2 hours

  const logs = await GpsLog.find({
    bus: busId,
    timestamp: { $gte: since },
  })
    .sort({ timestamp: 1 })
    .limit(200);

  res.json({ success: true, data: logs });
};
