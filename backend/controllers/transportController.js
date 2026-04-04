// backend/controllers/transportController.js
const {
  Driver, Vehicle, TransportRoute, TransportAllocation,
  Trip, BoardingLog, TransportFee, TransportNotification,
} = require('../models/transportModels');

// ─── Helper: generate receipt number ────────────────────────────────────────
const genReceipt = () => `TRP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// ─── Helper: generate transport card number ──────────────────────────────────
const genCardNo = () => `TC-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

// =============================================================================
// DRIVER CONTROLLERS
// =============================================================================
exports.getDrivers = async (req, res) => {
  const drivers = await Driver.find({ school: req.user.school })
    .populate('assignedVehicle', 'registrationNo type')
    .sort({ name: 1 });
  res.json({ success: true, count: drivers.length, data: drivers });
};

exports.createDriver = async (req, res) => {
  const driver = await Driver.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: driver });
};

exports.updateDriver = async (req, res) => {
  const driver = await Driver.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    req.body, { new: true, runValidators: true }
  );
  if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });
  res.json({ success: true, data: driver });
};

exports.deleteDriver = async (req, res) => {
  // Check if assigned to a vehicle
  const inUse = await Vehicle.exists({ driver: req.params.id, school: req.user.school, status: 'active' });
  if (inUse) return res.status(400).json({ success: false, message: 'Driver is assigned to an active vehicle' });
  await Driver.findOneAndDelete({ _id: req.params.id, school: req.user.school });
  res.json({ success: true, message: 'Driver removed' });
};

// Check expiring licenses (within 30 days)
exports.getExpiringLicenses = async (req, res) => {
  const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const drivers = await Driver.find({
    school: req.user.school,
    'license.expiry': { $lte: thirtyDaysLater, $gte: new Date() },
  });
  res.json({ success: true, data: drivers });
};

// =============================================================================
// VEHICLE CONTROLLERS
// =============================================================================
exports.getVehicles = async (req, res) => {
  const vehicles = await Vehicle.find({ school: req.user.school })
    .populate('driver', 'name phone')
    .populate('helper', 'name phone')
    .populate('assignedRoute', 'name code')
    .sort({ registrationNo: 1 });
  res.json({ success: true, count: vehicles.length, data: vehicles });
};

exports.getVehicle = async (req, res) => {
  const vehicle = await Vehicle.findOne({ _id: req.params.id, school: req.user.school })
    .populate('driver', 'name phone license')
    .populate('helper', 'name phone')
    .populate('assignedRoute', 'name code stops');
  if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
  res.json({ success: true, data: vehicle });
};

exports.createVehicle = async (req, res) => {
  const existing = await Vehicle.findOne({ registrationNo: req.body.registrationNo.toUpperCase(), school: req.user.school });
  if (existing) return res.status(400).json({ success: false, message: 'Vehicle already registered' });
  const vehicle = await Vehicle.create({ ...req.body, school: req.user.school });

  // If driver assigned, update driver record
  if (req.body.driver) await Driver.findByIdAndUpdate(req.body.driver, { assignedVehicle: vehicle._id });

  res.status(201).json({ success: true, data: vehicle });
};

exports.updateVehicle = async (req, res) => {
  const vehicle = await Vehicle.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    req.body, { new: true, runValidators: true }
  ).populate('driver', 'name phone').populate('assignedRoute', 'name');
  if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
  res.json({ success: true, data: vehicle });
};

exports.deleteVehicle = async (req, res) => {
  const inUse = await TransportAllocation.exists({ vehicle: req.params.id, isActive: true });
  if (inUse) return res.status(400).json({ success: false, message: 'Vehicle has active student allocations' });
  await Vehicle.findOneAndDelete({ _id: req.params.id, school: req.user.school });
  res.json({ success: true, message: 'Vehicle removed' });
};

// Add maintenance log
exports.addMaintenance = async (req, res) => {
  const vehicle = await Vehicle.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { $push: { maintenance: req.body }, $set: { status: 'maintenance' } },
    { new: true }
  );
  res.json({ success: true, data: vehicle });
};

// Add fuel log
exports.addFuelLog = async (req, res) => {
  const vehicle = await Vehicle.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { $push: { fuelLogs: { ...req.body, date: new Date() } } },
    { new: true }
  );
  res.json({ success: true, data: vehicle });
};

// Update live GPS location — called by GPS device or simulator
exports.updateLocation = async (req, res) => {
  const { lat, lng, speed, heading } = req.body;
  const vehicle = await Vehicle.findOneAndUpdate(
    { _id: req.params.id },
    { $set: { currentLocation: { lat, lng, speed: speed || 0, heading: heading || 0, updatedAt: new Date() } } },
    { new: true }
  );
  if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

  // Emit to all connected clients via Socket.io (attached to req.app)
  const io = req.app.get('io');
  if (io) {
    io.to(`school_${vehicle.school}`).emit('vehicle:location', {
      vehicleId: vehicle._id,
      registrationNo: vehicle.registrationNo,
      location: vehicle.currentLocation,
      routeId: vehicle.assignedRoute,
    });
  }

  res.json({ success: true, data: vehicle.currentLocation });
};

// Get expiring documents (insurance, fitness, PUC)
exports.getExpiringDocuments = async (req, res) => {
  const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const vehicles = await Vehicle.find({
    school: req.user.school,
    $or: [
      { 'insurance.expiry': { $lte: thirtyDays } },
      { 'fitness.expiry':   { $lte: thirtyDays } },
      { 'puc.expiry':       { $lte: thirtyDays } },
    ],
  }).select('registrationNo type insurance fitness puc');
  res.json({ success: true, data: vehicles });
};

// =============================================================================
// ROUTE CONTROLLERS
// =============================================================================
exports.getRoutes = async (req, res) => {
  const routes = await TransportRoute.find({ school: req.user.school })
    .populate('vehicle', 'registrationNo type capacity currentLocation')
    .populate('driver', 'name phone')
    .sort({ code: 1 });
  res.json({ success: true, count: routes.length, data: routes });
};

exports.getRoute = async (req, res) => {
  const route = await TransportRoute.findOne({ _id: req.params.id, school: req.user.school })
    .populate('vehicle', 'registrationNo type capacity currentLocation status')
    .populate('driver', 'name phone photo');
  if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

  // Attach student count
  const studentCount = await TransportAllocation.countDocuments({ route: route._id, isActive: true });
  res.json({ success: true, data: { ...route.toObject(), studentCount } });
};

exports.createRoute = async (req, res) => {
  try {
    // Only check code uniqueness if a code was provided
    if (req.body.code) {
      const existing = await TransportRoute.findOne({ code: req.body.code, school: req.user.school });
      if (existing) return res.status(400).json({ success: false, message: 'Route code already exists' });
    }
    const route = await TransportRoute.create({ ...req.body, school: req.user.school });
    res.status(201).json({ success: true, data: route });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateRoute = async (req, res) => {
  const route = await TransportRoute.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    req.body, { new: true }
  );
  if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
  res.json({ success: true, data: route });
};

exports.deleteRoute = async (req, res) => {
  const inUse = await TransportAllocation.exists({ route: req.params.id, isActive: true });
  if (inUse) return res.status(400).json({ success: false, message: 'Route has active student allocations' });
  await TransportRoute.findOneAndDelete({ _id: req.params.id, school: req.user.school });
  res.json({ success: true, message: 'Route deleted' });
};

// =============================================================================
// ALLOCATION CONTROLLERS
// =============================================================================
exports.getAllocations = async (req, res) => {
  const filter = { school: req.user.school, isActive: true };
  if (req.query.route)   filter.route   = req.query.route;
  if (req.query.vehicle) filter.vehicle = req.query.vehicle;

  const allocations = await TransportAllocation.find(filter)
    .populate('student', 'name rollNumber class')
    .populate('route',   'name code')
    .populate('vehicle', 'registrationNo type')
    .sort({ createdAt: -1 });
  res.json({ success: true, count: allocations.length, data: allocations });
};

exports.assignStudent = async (req, res) => {
  const existing = await TransportAllocation.findOne({ student: req.body.student, school: req.user.school, isActive: true });
  if (existing) return res.status(400).json({ success: false, message: 'Student already assigned to a route' });

  // Check vehicle capacity
  const [vehicle, currentCount] = await Promise.all([
    Vehicle.findById(req.body.vehicle),
    TransportAllocation.countDocuments({ vehicle: req.body.vehicle, isActive: true }),
  ]);
  if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
  if (currentCount >= vehicle.capacity) return res.status(400).json({ success: false, message: `Vehicle is full (${vehicle.capacity} seats)` });

  const allocation = await TransportAllocation.create({
    ...req.body,
    school: req.user.school,
    transportCardNo: genCardNo(),
  });
  res.status(201).json({ success: true, data: allocation });
};

exports.removeAllocation = async (req, res) => {
  const allocation = await TransportAllocation.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { isActive: false, endDate: new Date() },
    { new: true }
  );
  if (!allocation) return res.status(404).json({ success: false, message: 'Allocation not found' });
  res.json({ success: true, message: 'Student removed from transport' });
};

// =============================================================================
// TRIP CONTROLLERS
// =============================================================================
exports.startTrip = async (req, res) => {
  const { routeId, vehicleId, tripType } = req.body;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Avoid duplicate trips
  const existing = await Trip.findOne({ route: routeId, date: today, tripType, status: { $in: ['scheduled', 'in_progress'] } });
  if (existing) return res.status(400).json({ success: false, message: 'Trip already started for this route today' });

  const route = await TransportRoute.findById(routeId);
  const stopProgress = route.stops.map(s => ({
    stopId: s._id, stopName: s.name, status: 'pending',
  }));

  const trip = await Trip.create({
    school: req.user.school,
    route: routeId, vehicle: vehicleId,
    driver: req.body.driverId,
    date: today, tripType,
    status: 'in_progress',
    startTime: new Date(),
    stopProgress,
  });

  // Notify via socket
  const io = req.app.get('io');
  if (io) io.to(`school_${req.user.school}`).emit('trip:started', { tripId: trip._id, routeId, tripType });

  res.status(201).json({ success: true, data: trip });
};

exports.updateTripStop = async (req, res) => {
  const { stopId, status } = req.body;
  const trip = await Trip.findOneAndUpdate(
    { _id: req.params.id, 'stopProgress.stopId': stopId },
    {
      $set: {
        'stopProgress.$.status': status,
        [`stopProgress.$.${status === 'arrived' ? 'arrivedAt' : 'departedAt'}`]: new Date(),
      }
    },
    { new: true }
  );
  const io = req.app.get('io');
  if (io) io.to(`school_${trip.school}`).emit('trip:stopUpdate', { tripId: trip._id, stopId, status });
  res.json({ success: true, data: trip });
};

exports.endTrip = async (req, res) => {
  const trip = await Trip.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { status: 'completed', endTime: new Date() },
    { new: true }
  );
  res.json({ success: true, data: trip });
};

exports.getTodayTrips = async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const trips = await Trip.find({
    school: req.user.school,
    date: { $gte: today, $lt: tomorrow },
  }).populate('route', 'name code').populate('vehicle', 'registrationNo currentLocation').populate('driver', 'name phone');
  res.json({ success: true, data: trips });
};

// Send alert for a trip
exports.sendTripAlert = async (req, res) => {
  const { type, message } = req.body;
  const trip = await Trip.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { $push: { alerts: { type, message, sentAt: new Date() } } },
    { new: true }
  );
  // Socket broadcast
  const io = req.app.get('io');
  if (io) io.to(`school_${req.user.school}`).emit('trip:alert', { tripId: trip._id, type, message, sentAt: new Date() });
  res.json({ success: true, message: 'Alert sent' });
};

// =============================================================================
// BOARDING LOG CONTROLLERS
// =============================================================================
exports.markBoarding = async (req, res) => {
  const { tripId, studentId, action, stopName, method } = req.body;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  let log = await BoardingLog.findOne({ trip: tripId, student: studentId });

  if (action === 'board') {
    log = await BoardingLog.findOneAndUpdate(
      { trip: tripId, student: studentId },
      {
        $setOnInsert: { school: req.user.school, trip: tripId, student: studentId, date: today },
        $set: { boardedAt: new Date(), boardedStop: stopName, boardingMethod: method || 'manual', status: 'boarded' },
      },
      { upsert: true, new: true }
    );
  } else {
    log = await BoardingLog.findOneAndUpdate(
      { trip: tripId, student: studentId },
      { $set: { alightedAt: new Date(), alightedStop: stopName, status: 'alighted' } },
      { new: true }
    );
  }

  // Populate student for notification
  await log.populate('student', 'name');

  // Socket notification to parents
  const io = req.app.get('io');
  if (io) {
    io.to(`school_${req.user.school}`).emit('boarding:update', {
      studentId, action, stopName,
      studentName: log.student?.name,
      time: new Date(),
      tripId,
    });
  }

  res.json({ success: true, data: log });
};

exports.getTripBoarding = async (req, res) => {
  const logs = await BoardingLog.find({ trip: req.params.tripId })
    .populate('student', 'name rollNumber class profileImage');
  res.json({ success: true, data: logs });
};

// =============================================================================
// TRANSPORT FEE CONTROLLERS
// =============================================================================
exports.generateMonthlyFees = async (req, res) => {
  const { month, year } = req.body;
  const allocations = await TransportAllocation.find({ school: req.user.school, isActive: true });

  let created = 0;
  for (const alloc of allocations) {
    const exists = await TransportFee.findOne({ student: alloc.student, month, year, school: req.user.school });
    if (exists) continue;

    const dueDate = new Date(year, month - 1, 10); // 10th of each month
    const isLate  = new Date() > dueDate;
    const lateFee = isLate ? Math.round(alloc.feePerMonth * 0.05) : 0; // 5% late fee

    await TransportFee.create({
      school: req.user.school,
      student: alloc.student,
      allocation: alloc._id,
      month, year,
      amount: alloc.feePerMonth,
      lateFee,
      totalDue: alloc.feePerMonth + lateFee,
      dueDate,
    });
    created++;
  }

  res.json({ success: true, message: `Generated ${created} fee records` });
};

exports.getFees = async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.month)   filter.month   = parseInt(req.query.month);
  if (req.query.year)    filter.year    = parseInt(req.query.year);
  if (req.query.status)  filter.status  = req.query.status;
  if (req.query.student) filter.student = req.query.student;

  const fees = await TransportFee.find(filter)
    .populate('student', 'name rollNumber class')
    .sort({ dueDate: 1 });
  res.json({ success: true, count: fees.length, data: fees });
};

exports.recordPayment = async (req, res) => {
  const { amount, paymentMethod, transactionId, remarks } = req.body;
  const fee = await TransportFee.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    {
      $set: {
        paidAmount: amount,
        paidDate: new Date(),
        status: amount >= req.body.totalDue ? 'paid' : 'partial',
        paymentMethod,
        transactionId,
        remarks,
        receiptNo: genReceipt(),
      }
    },
    { new: true }
  ).populate('student', 'name rollNumber');
  res.json({ success: true, data: fee });
};

// =============================================================================
// DASHBOARD SUMMARY
// =============================================================================
exports.getDashboard = async (req, res) => {
  const school = req.user.school;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const thisMonth = today.getMonth() + 1;
  const thisYear  = today.getFullYear();

  const [
    totalVehicles, activeVehicles, totalRoutes, totalStudents,
    todayTrips, feeSummary, recentAlerts,
  ] = await Promise.all([
    Vehicle.countDocuments({ school }),
    Vehicle.countDocuments({ school, status: 'active' }),
    TransportRoute.countDocuments({ school, isActive: true }),
    TransportAllocation.countDocuments({ school, isActive: true }),
    Trip.find({ school, date: { $gte: today } }).populate('route', 'name code').populate('vehicle', 'registrationNo currentLocation'),
    TransportFee.aggregate([
      { $match: { school: new (require('mongoose').Types.ObjectId)(school), month: thisMonth, year: thisYear } },
      { $group: { _id: '$status', total: { $sum: '$totalDue' }, count: { $sum: 1 } } },
    ]),
    TransportNotification.find({ school }).sort({ sentAt: -1 }).limit(5),
  ]);

  const feeMap = {};
  feeSummary.forEach(f => { feeMap[f._id] = { total: f.total, count: f.count }; });

  res.json({
    success: true,
    data: {
      vehicles: { total: totalVehicles, active: activeVehicles, maintenance: totalVehicles - activeVehicles },
      routes: totalRoutes,
      students: totalStudents,
      todayTrips,
      fees: {
        collected: feeMap.paid?.total || 0,
        pending:   (feeMap.pending?.total || 0) + (feeMap.partial?.total || 0),
        collectedCount: feeMap.paid?.count || 0,
        pendingCount:   (feeMap.pending?.count || 0) + (feeMap.partial?.count || 0),
      },
      recentAlerts,
    },
  });
};