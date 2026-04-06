// backend/controllers/transportController.js
// ✅ FIXED & UPGRADED — Full transport controller
// Fixes applied:
//   1. assignStudent: populates routeId/busId/pickupStopId/dropStopId correctly
//   2. getMyTransport: separated /student and /parent endpoints + shared helper
//   3. getFees: strict role-based filtering (student/parent ONLY see own fees)
//   4. generateMonthlyFees: uses assignment.monthlyFee, sets dueDate, idempotent
//   5. updateBusLocation: also upserts BusLocation document
//   6. getStudentFeeSummary: new endpoint — paid + pending per student
//   7. getRoutes/getRoute: dynamic studentCount populated from assignments
//   8. All async errors bubble to express-async-errors

'use strict';
const mongoose = require('mongoose');
const {
  Bus, Stop, BusRoute,
  TransportAssignment, TransportFee,
  BusLocation, Trip, GpsLog,
} = require('../models/transportModels');
const Student = require('../models/Student');

const genReceipt = () => `TRP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

const ADMIN_ROLES = ['superAdmin', 'schoolAdmin', 'transportManager'];
const isAdmin = (user) => ADMIN_ROLES.includes(user.role);

// ─── Shared: resolve studentDoc from JWT (student or parent role) ──────────────
async function _resolveStudent(user) {
  if (user.role === 'student') return Student.findOne({ user: user._id, isActive: true });
  if (user.role === 'parent')  return Student.findOne({ parent: user._id, isActive: true });
  return null;
}

// ─── Shared: refresh route stop student counts ─────────────────────────────────
async function _refreshRouteStudentCounts(routeId, school) {
  const assignments = await TransportAssignment.find({
    school, routeId, isActive: true,
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

  // Also update Stop collection
  for (const stop of route.stops) {
    if (stop.stop) {
      await Stop.findByIdAndUpdate(stop.stop, {
        studentCount: counts[stop.name] || 0,
      });
    }
  }
}

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
  if (existing) return res.status(400).json({ success: false, message: 'Bus number or registration already exists' });

  const bus = await Bus.create({ ...req.body, school: req.user.school });
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
  const has = await TransportAssignment.exists({ busId: req.params.id, isActive: true });
  if (has) return res.status(400).json({ success: false, message: 'Bus has active student assignments. Reassign students first.' });
  await Bus.findOneAndUpdate({ _id: req.params.id, school: req.user.school }, { isActive: false });
  res.json({ success: true, message: 'Bus deactivated' });
};

// ✅ FIX: updateBusLocation also upserts BusLocation document
exports.updateBusLocation = async (req, res) => {
  const { lat, lng, latitude, longitude, speed = 0, heading = 0, accuracy = 0 } = req.body;
  const finalLat = lat ?? latitude;
  const finalLng = lng ?? longitude;

  if (!finalLat || !finalLng) {
    return res.status(400).json({ success: false, message: 'latitude and longitude are required' });
  }

  const locationData = { lat: finalLat, lng: finalLng, speed, heading, accuracy, updatedAt: new Date() };

  const bus = await Bus.findOneAndUpdate(
    { _id: req.params.id },
    { $set: { currentLocation: locationData } },
    { new: true }
  );
  if (!bus) return res.status(404).json({ success: false, message: 'Bus not found' });

  // ✅ Upsert BusLocation (one-doc-per-bus live snapshot)
  await BusLocation.findOneAndUpdate(
    { busId: bus._id },
    {
      busId: bus._id,
      school: bus.school,
      latitude: finalLat,
      longitude: finalLng,
      speed, heading, accuracy,
      updatedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  // GPS history log
  await GpsLog.create({ school: bus.school, bus: bus._id, lat: finalLat, lng: finalLng, speed, heading });

  // Broadcast via Socket.IO
  const io = req.app.get('io');
  if (io) {
    io.to(`school_${bus.school}`).emit('vehicle:location', {
      vehicleId: bus._id.toString(),
      busNumber: bus.busNumber,
      lat: finalLat, lng: finalLng, speed, heading,
      timestamp: new Date(),
    });
  }

  res.json({ success: true, data: { lat: finalLat, lng: finalLng, speed, heading } });
};

// ✅ NEW: GET /transport/buses/:busId/live-location — latest BusLocation snapshot
exports.getBusLiveLocation = async (req, res) => {
  const loc = await BusLocation.findOne({ busId: req.params.busId })
    .populate('busId', 'busNumber registrationNo driver status');
  if (!loc) return res.status(404).json({ success: false, message: 'No location data yet' });
  res.json({ success: true, data: loc });
};

exports.getGpsHistory = async (req, res) => {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const logs = await GpsLog.find({ bus: req.params.busId, timestamp: { $gte: since } })
    .sort({ timestamp: 1 }).limit(200);
  res.json({ success: true, data: logs });
};


// =============================================================================
// ROUTE CONTROLLERS
// =============================================================================
exports.getRoutes = async (req, res) => {
  const routes = await BusRoute.find({ school: req.user.school, isActive: true })
    .populate('assignedBus', 'busNumber registrationNo driver currentLocation status')
    .sort({ code: 1 });

  // ✅ FIX: dynamically count students per stop from assignments
  for (const route of routes) {
    const assignments = await TransportAssignment.find({
      school: req.user.school, routeId: route._id, isActive: true,
    }).select('pickupStop');

    const stopCounts = {};
    assignments.forEach((a) => {
      const n = a.pickupStop?.name;
      if (n) stopCounts[n] = (stopCounts[n] || 0) + 1;
    });

    route.stops = route.stops.map((s) => ({ ...s.toObject(), studentCount: stopCounts[s.name] || 0 }));
    route.totalStudents = assignments.length;
  }

  res.json({ success: true, count: routes.length, data: routes });
};

exports.getRoute = async (req, res) => {
  const route = await BusRoute.findOne({ _id: req.params.id, school: req.user.school })
    .populate('assignedBus', 'busNumber registrationNo driver currentLocation status color');
  if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

  const stops = await Stop.find({ route: route._id, isActive: true }).sort({ sequence: 1 });

  // ✅ FIX: use routeId field
  const assignments = await TransportAssignment.find({
    school: req.user.school, routeId: route._id, isActive: true,
  }).populate('student', 'name rollNumber class profileImage').select('student pickupStop dropStop');

  const stopCounts = {};
  assignments.forEach((a) => {
    const n = a.pickupStop?.name;
    if (n) stopCounts[n] = (stopCounts[n] || 0) + 1;
  });

  const stopsWithCounts = stops.map((s) => ({ ...s.toObject(), studentCount: stopCounts[s.name] || 0 }));

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
  const existing = await BusRoute.findOne({ code: routeData.code?.toUpperCase(), school: req.user.school });
  if (existing) return res.status(400).json({ success: false, message: 'Route code already exists' });

  const route = await BusRoute.create({ ...routeData, school: req.user.school });

  if (stopData?.length > 0) {
    const stopDocs = await Stop.insertMany(
      stopData.map((s, i) => ({
        school: req.user.school, route: route._id,
        name: s.name, sequence: s.sequence ?? i + 1,
        morningArrivalTime: s.morningArrivalTime || s.time,
        eveningArrivalTime: s.eveningArrivalTime,
        location: s.location, landmark: s.landmark,
      }))
    );
    route.stops = stopDocs.map((s) => ({
      stop: s._id, name: s.name, sequence: s.sequence,
      morningTime: s.morningArrivalTime, eveningTime: s.eveningArrivalTime,
      lat: s.location?.lat, lng: s.location?.lng,
    }));
    await route.save();
  }
  res.status(201).json({ success: true, data: route });
};

exports.updateRoute = async (req, res) => {
  const { stops: stopData, ...routeData } = req.body;
  const route = await BusRoute.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school }, routeData, { new: true, runValidators: true }
  );
  if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

  if (stopData) {
    await Stop.deleteMany({ route: route._id });
    const stopDocs = await Stop.insertMany(
      stopData.map((s, i) => ({
        school: req.user.school, route: route._id,
        name: s.name, sequence: s.sequence ?? i + 1,
        morningArrivalTime: s.morningArrivalTime || s.time,
        eveningArrivalTime: s.eveningArrivalTime,
        location: s.location, landmark: s.landmark,
      }))
    );
    route.stops = stopDocs.map((s) => ({
      stop: s._id, name: s.name, sequence: s.sequence,
      morningTime: s.morningArrivalTime, eveningTime: s.eveningArrivalTime,
      lat: s.location?.lat, lng: s.location?.lng,
    }));
    await route.save();
  }
  res.json({ success: true, data: route });
};

exports.deleteRoute = async (req, res) => {
  const has = await TransportAssignment.exists({ routeId: req.params.id, isActive: true });
  if (has) return res.status(400).json({ success: false, message: 'Route has active student assignments' });
  await BusRoute.findOneAndUpdate({ _id: req.params.id, school: req.user.school }, { isActive: false });
  res.json({ success: true, message: 'Route deactivated' });
};


// =============================================================================
// STOP CONTROLLERS
// =============================================================================
exports.getStops = async (req, res) => {
  const filter = { school: req.user.school, isActive: true };
  if (req.query.route) filter.route = req.query.route;

  const stops = await Stop.find(filter).sort({ sequence: 1 });

  // ✅ FIX: use pickupStopId for accurate counting
  const assignments = await TransportAssignment.find({
    school: req.user.school, isActive: true,
    pickupStopId: { $in: stops.map((s) => s._id) },
  }).select('pickupStopId');

  const counts = {};
  assignments.forEach((a) => {
    const id = a.pickupStopId?.toString();
    if (id) counts[id] = (counts[id] || 0) + 1;
  });

  const enriched = stops.map((s) => ({ ...s.toObject(), studentCount: counts[s._id.toString()] || 0 }));
  res.json({ success: true, data: enriched });
};

exports.createStop = async (req, res) => {
  const stop = await Stop.create({ ...req.body, school: req.user.school });
  await BusRoute.findByIdAndUpdate(req.body.route, {
    $push: {
      stops: {
        stop: stop._id, name: stop.name, sequence: stop.sequence,
        morningTime: stop.morningArrivalTime, eveningTime: stop.eveningArrivalTime,
        lat: stop.location?.lat, lng: stop.location?.lng,
      },
    },
  });
  res.status(201).json({ success: true, data: stop });
};

exports.updateStop = async (req, res) => {
  const stop = await Stop.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school }, req.body, { new: true }
  );
  if (!stop) return res.status(404).json({ success: false, message: 'Stop not found' });
  await BusRoute.updateOne(
    { _id: stop.route, 'stops.stop': stop._id },
    { $set: {
      'stops.$.name': stop.name, 'stops.$.sequence': stop.sequence,
      'stops.$.morningTime': stop.morningArrivalTime, 'stops.$.eveningTime': stop.eveningArrivalTime,
      'stops.$.lat': stop.location?.lat, 'stops.$.lng': stop.location?.lng,
    }}
  );
  res.json({ success: true, data: stop });
};

exports.deleteStop = async (req, res) => {
  await Stop.findOneAndUpdate({ _id: req.params.id, school: req.user.school }, { isActive: false });
  res.json({ success: true, message: 'Stop removed' });
};


// =============================================================================
// ASSIGNMENT CONTROLLERS  ✅ FIXED
// =============================================================================
exports.getAssignments = async (req, res) => {
  const filter = { school: req.user.school, isActive: true };
  if (req.query.route)   filter.routeId  = req.query.route;
  if (req.query.bus)     filter.busId    = req.query.bus;
  if (req.query.student) filter.student  = req.query.student;

  const assignments = await TransportAssignment.find(filter)
    .populate({ path: 'student', select: 'rollNumber class user', populate: { path: 'user', select: 'name email profileImage' } })
    .populate('routeId', 'name code color')
    .populate('busId',   'busNumber registrationNo driver')
    .populate('pickupStopId', 'name morningArrivalTime')
    .populate('dropStopId',   'name eveningArrivalTime')
    .sort({ createdAt: -1 });

  res.json({ success: true, count: assignments.length, data: assignments });
};

// ✅ FIX: assignStudent populates all 4 required fields
exports.assignStudent = async (req, res) => {
  const { studentId, routeId, busId, pickupStop, dropStop, monthlyFee, passType,
          pickupStopId, dropStopId } = req.body;

  // Resolve stop IDs from body (accept both formats)
  const resolvedPickupStopId = pickupStopId || pickupStop?.stopId;
  const resolvedDropStopId   = dropStopId   || dropStop?.stopId;

  if (!studentId || !routeId || !busId || !resolvedPickupStopId || !resolvedDropStopId) {
    return res.status(400).json({
      success: false,
      message: 'studentId, routeId, busId, pickupStopId and dropStopId are required',
    });
  }

  // Deactivate any existing assignment for this student
  await TransportAssignment.updateMany(
    { student: studentId, school: req.user.school, isActive: true },
    { isActive: false }
  );

  // Fetch stop documents to populate denormalized fields
  const [pStop, dStop] = await Promise.all([
    Stop.findById(resolvedPickupStopId),
    Stop.findById(resolvedDropStopId),
  ]);

  if (!pStop || !dStop) {
    return res.status(400).json({ success: false, message: 'Invalid stop ID(s)' });
  }

  const assignmentData = {
    school:       req.user.school,
    student:      studentId,
    routeId,
    busId,
    pickupStopId: pStop._id,
    dropStopId:   dStop._id,
    pickupStop: {
      stopId: pStop._id, name: pStop.name,
      time: pStop.morningArrivalTime,
      sequence: pStop.sequence,
      lat: pStop.location?.lat, lng: pStop.location?.lng,
    },
    dropStop: {
      stopId: dStop._id, name: dStop.name,
      time: dStop.eveningArrivalTime || dStop.morningArrivalTime,
      sequence: dStop.sequence,
      lat: dStop.location?.lat, lng: dStop.location?.lng,
    },
    monthlyFee:   monthlyFee || 0,
    passType:     passType   || 'both',
    isActive:     true,
    assignedDate: new Date(),
  };

  // Use findOneAndUpdate + upsert so a stale unique DB index can never cause
  // a duplicate-key error — overwrites any existing record for the same student
  // instead of inserting a second document.
  const assignment = await TransportAssignment.findOneAndUpdate(
    { student: studentId, school: req.user.school },
    { $set: assignmentData },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await assignment.populate([
    { path: 'student',      select: 'name rollNumber class' },
    { path: 'routeId',      select: 'name code' },
    { path: 'busId',        select: 'busNumber driver' },
    { path: 'pickupStopId', select: 'name morningArrivalTime' },
    { path: 'dropStopId',   select: 'name eveningArrivalTime' },
  ]);

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
  await _refreshRouteStudentCounts(assignment.routeId, req.user.school);
  res.json({ success: true, message: 'Assignment removed' });
};


// =============================================================================
// STUDENT PORTAL  ✅ FIX: GET /transport/student  (logged-in student only)
// =============================================================================
exports.getStudentTransport = async (req, res) => {
  // ✅ Only students
  if (req.user.role !== 'student') {
    return res.status(403).json({ success: false, message: 'This endpoint is for students only. Parents use /transport/parent' });
  }

  const studentDoc = req.studentDoc || await Student.findOne({ user: req.user._id, isActive: true });
  if (!studentDoc) return res.status(404).json({ success: false, message: 'Student record not found' });

  return _sendTransportDetail(req, res, studentDoc);
};

// =============================================================================
// PARENT PORTAL  ✅ FIX: GET /transport/parent  (logged-in parent sees child)
// =============================================================================
exports.getParentTransport = async (req, res) => {
  // ✅ Only parents
  if (req.user.role !== 'parent') {
    return res.status(403).json({ success: false, message: 'This endpoint is for parents only. Students use /transport/student' });
  }

  const studentDoc = req.studentDoc || await Student.findOne({ parent: req.user._id, isActive: true });
  if (!studentDoc) return res.status(404).json({ success: false, message: 'No linked child found' });

  return _sendTransportDetail(req, res, studentDoc);
};

// ── Shared: build transport detail response for student/parent ─────────────────
async function _sendTransportDetail(req, res, studentDoc) {
  // ✅ FIX: query by student ID, use routeId/busId refs
  const assignment = await TransportAssignment.findOne({
    student: studentDoc._id,
    isActive: true,
  })
    .populate('routeId', 'name code color stops morningDepartureTime eveningDepartureTime')
    .populate('busId',   'busNumber registrationNo type driver helper currentLocation status');

  if (!assignment) {
    return res.json({ success: true, data: null, message: 'No transport assignment found' });
  }

  const currentMonth = new Date().getMonth() + 1;
  const currentYear  = new Date().getFullYear();

  // ✅ FIX: student/parent can ONLY see their own fee records
  const feeRecords = await TransportFee.find({
    student: studentDoc._id,
    school:  req.user.school,
  }).sort({ year: -1, month: -1 }).limit(12);

  const currentFee = feeRecords.find((f) => f.month === currentMonth && f.year === currentYear);

  const busLocation = assignment.busId?.currentLocation;
  const etaMinutes  = busLocation ? _estimateETA(busLocation, assignment.pickupStop) : null;

  res.json({
    success: true,
    data: {
      student: { id: studentDoc._id, name: studentDoc.name || studentDoc.user?.name },
      assignment: {
        _id:        assignment._id,
        passType:   assignment.passType,
        pickupStop: assignment.pickupStop,
        dropStop:   assignment.dropStop,
        monthlyFee: assignment.monthlyFee,
      },
      route: assignment.routeId,
      bus: {
        _id:           assignment.busId?._id,
        busNumber:     assignment.busId?.busNumber,
        registrationNo:assignment.busId?.registrationNo,
        type:          assignment.busId?.type,
        status:        assignment.busId?.status,
        currentLocation: busLocation,
        // Expose only safe driver fields
        driver: {
          name:  assignment.busId?.driver?.name,
          phone: assignment.busId?.driver?.phone,
        },
        helper: assignment.busId?.helper,
      },
      currentFee: currentFee || null,
      feeHistory: feeRecords,
      eta:        etaMinutes,
      status:     _getBusStatus(busLocation, assignment.pickupStop, etaMinutes),
    },
  });
}

// Legacy /my-transport — delegates based on role
exports.getMyTransport = async (req, res) => {
  if (req.user.role === 'student') return exports.getStudentTransport(req, res);
  if (req.user.role === 'parent')  return exports.getParentTransport(req, res);

  // Admin calling /my-transport — just return dashboard summary
  return exports.getTransportDashboard(req, res);
};

function _estimateETA(busLocation, pickupStop) {
  if (!busLocation?.lat || !pickupStop?.lat) return null;
  const d = _haversineKm(busLocation.lat, busLocation.lng, pickupStop.lat, pickupStop.lng);
  const speed = busLocation.speed > 5 ? busLocation.speed : 30;
  return Math.round((d / speed) * 60);
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
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// =============================================================================
// TRANSPORT FEE CONTROLLERS  ✅ FIXED
// =============================================================================
exports.getFees = async (req, res) => {
  const filter = { school: req.user.school };

  // ✅ FIX: students and parents ONLY see their own records — no override possible
  if (!isAdmin(req.user)) {
    const studentDoc = await _resolveStudent(req.user);
    if (!studentDoc) return res.json({ success: true, data: [], count: 0 });
    filter.student = studentDoc._id;  // hard-coded — cannot be overridden by query params
  } else {
    // Admins can filter by student
    if (req.query.student) filter.student = req.query.student;
  }

  if (req.query.month)  filter.month  = parseInt(req.query.month);
  if (req.query.year)   filter.year   = parseInt(req.query.year);
  if (req.query.status) filter.status = req.query.status;

  const fees = await TransportFee.find(filter)
    .populate('student', 'name rollNumber class')
    .sort({ year: -1, month: -1 });

  res.json({ success: true, count: fees.length, data: fees });
};

// ✅ NEW: GET /transport/fees/my-summary — student/parent fee summary
exports.getStudentFeeSummary = async (req, res) => {
  const studentDoc = await _resolveStudent(req.user);
  if (!studentDoc) return res.status(404).json({ success: false, message: 'Student record not found' });

  const fees = await TransportFee.find({ student: studentDoc._id, school: req.user.school })
    .sort({ year: -1, month: -1 });

  const totalPaid    = fees.filter((f) => f.status === 'paid').reduce((s, f) => s + f.paidAmount, 0);
  const totalPending = fees.filter((f) => f.status !== 'paid' && f.status !== 'waived')
    .reduce((s, f) => s + (f.totalDue - f.paidAmount), 0);
  const paidCount   = fees.filter((f) => f.status === 'paid').length;
  const pendingCount = fees.filter((f) => f.status === 'pending').length;

  res.json({
    success: true,
    data: {
      student:      { id: studentDoc._id, name: studentDoc.name },
      totalPaid,
      totalPending,
      paidCount,
      pendingCount,
      totalRecords: fees.length,
      fees,
    },
  });
};

// ✅ FIX: generateMonthlyFees — idempotent, uses monthlyFee from assignment, sets dueDate
exports.generateMonthlyFees = async (req, res) => {
  const { month, year } = req.body;
  if (!month || !year) return res.status(400).json({ success: false, message: 'month and year are required' });

  const assignments = await TransportAssignment.find({
    school: req.user.school, isActive: true,
  }).populate('student', 'name');

  let created = 0;
  let skipped = 0;
  const dueDate = new Date(year, month - 1, 10); // 10th of the month

  for (const assignment of assignments) {
    if (!assignment.student) continue;

    const exists = await TransportFee.findOne({
      student: assignment.student._id,
      month, year,
      school: req.user.school,
    });
    if (exists) { skipped++; continue; }

    const now     = new Date();
    const isLate  = now > dueDate;
    const lateFee = isLate ? Math.round(assignment.monthlyFee * 0.05) : 0;

    await TransportFee.create({
      school:     req.user.school,
      student:    assignment.student._id,
      assignment: assignment._id,
      month,
      year,
      amount:   assignment.monthlyFee,
      lateFee,
      discount: 0,
      totalDue: assignment.monthlyFee + lateFee,
      dueDate,
      status:   'pending',
    });
    created++;
  }

  res.json({
    success: true,
    message: `Generated ${created} new fee records for ${month}/${year}. Skipped ${skipped} existing.`,
    data: { created, skipped, month, year },
  });
};

exports.recordPayment = async (req, res) => {
  const { amount, paymentMethod, transactionId, remarks } = req.body;

  const fee = await TransportFee.findOne({ _id: req.params.id, school: req.user.school });
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
    amount, date: new Date(), method: paymentMethod,
    transactionId, recordedBy: req.user._id,
  });

  await fee.save();
  await fee.populate('student', 'name rollNumber');

  res.json({ success: true, data: fee });
};

exports.getFeeSummary = async (req, res) => {
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const year  = parseInt(req.query.year)  || new Date().getFullYear();

  const summary = await TransportFee.aggregate([
    { $match: { school: new mongoose.Types.ObjectId(req.user.school), month, year } },
    { $group: {
      _id:       '$status',
      count:     { $sum: 1 },
      total:     { $sum: '$totalDue' },
      collected: { $sum: '$paidAmount' },
    }},
  ]);

  const result = { paid: 0, pending: 0, partial: 0, totalExpected: 0, totalCollected: 0, counts: {} };
  summary.forEach((s) => {
    result[s._id]            = s.total;
    result.counts[s._id]     = s.count;
    result.totalCollected   += s.collected;
    result.totalExpected    += s.total;
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
    school: req.user.school, route: routeId, bus: busId,
    date: new Date(), tripType, status: 'in_progress', startTime: new Date(),
    stopProgress: route.stops.map((s) => ({
      stopId: s.stop || s._id, stopName: s.name, status: 'pending',
    })),
  });

  const io = req.app.get('io');
  if (io) {
    io.to(`school_${req.user.school}`).emit('trip:started', {
      tripId: trip._id, routeName: route.name, tripType,
    });
  }
  res.status(201).json({ success: true, data: trip });
};

exports.updateTripStop = async (req, res) => {
  const { stopId, status } = req.body;
  const trip = await Trip.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school, 'stopProgress.stopId': stopId },
    { $set: { 'stopProgress.$.status': status, 'stopProgress.$.actualTime': new Date() } },
    { new: true }
  );
  if (!trip) return res.status(404).json({ success: false, message: 'Trip/stop not found' });
  const io = req.app.get('io');
  if (io) io.to(`school_${req.user.school}`).emit('trip:stopReached', { tripId: trip._id.toString(), stopId, status, time: new Date() });
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
  if (io) io.to(`school_${req.user.school}`).emit('trip:alert', { tripId: trip._id.toString(), type, message, sentAt: new Date() });
  res.json({ success: true, message: 'Alert sent' });
};


// =============================================================================
// DASHBOARD SUMMARY (Admin)
// =============================================================================
exports.getTransportDashboard = async (req, res) => {
  const school    = new mongoose.Types.ObjectId(req.user.school);
  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const thisMonth = today.getMonth() + 1;
  const thisYear  = today.getFullYear();
  const tomorrow  = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const [totalBuses, activeBuses, totalRoutes, totalAssignments, todayTrips, feeSummary, recentBuses] =
    await Promise.all([
      Bus.countDocuments({ school: req.user.school, isActive: true }),
      Bus.countDocuments({ school: req.user.school, status: 'active', isActive: true }),
      BusRoute.countDocuments({ school: req.user.school, isActive: true }),
      TransportAssignment.countDocuments({ school: req.user.school, isActive: true }),
      Trip.find({ school: req.user.school, date: { $gte: today, $lt: tomorrow } })
        .populate('route', 'name code').populate('bus', 'busNumber driver'),
      TransportFee.aggregate([
        { $match: { school, month: thisMonth, year: thisYear } },
        { $group: { _id: '$status', total: { $sum: '$totalDue' }, collected: { $sum: '$paidAmount' }, count: { $sum: 1 } } },
      ]),
      Bus.find({ school: req.user.school, isActive: true })
        .populate('assignedRoute', 'name code')
        .select('busNumber registrationNo driver currentLocation status assignedRoute')
        .sort({ updatedAt: -1 }).limit(5),
    ]);

  const feeMap = {};
  feeSummary.forEach((f) => { feeMap[f._id] = f; });

  res.json({
    success: true,
    data: {
      buses:    { total: totalBuses, active: activeBuses, maintenance: totalBuses - activeBuses },
      routes:   totalRoutes,
      students: totalAssignments,
      todayTrips,
      fees: {
        collected:      feeMap.paid?.collected     || 0,
        pending:        (feeMap.pending?.total || 0) + (feeMap.partial?.total || 0),
        collectedCount: feeMap.paid?.count         || 0,
        pendingCount:   (feeMap.pending?.count || 0) + (feeMap.partial?.count || 0),
      },
      recentBuses,
    },
  });
};