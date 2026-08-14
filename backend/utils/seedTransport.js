// backend/utils/seedTransport.js
// Run: node backend/utils/seedTransport.js
// Seeds example buses, routes, stops, assignments, and fees
// Requires a school to exist in DB (set SCHOOL_ID in env or first arg)

require('dotenv').config();
const mongoose = require('mongoose');

const {
  Bus, Stop, BusRoute,
  TransportAssignment, TransportFee,
} = require('../models/transportModels');

const Student = require('../models/Student');

const SCHOOL_ID = process.argv[2] || process.env.SEED_SCHOOL_ID;

if (!SCHOOL_ID) {
  console.error('Usage: node seedTransport.js <SCHOOL_OBJECT_ID>');
  process.exit(1);
}

const ROUTE_DATA = [
  {
    name:        'Route A — Hinjewadi',
    code:        'RT-A',
    color:       '#E87722',
    morningDepartureTime: '07:00',
    eveningDepartureTime: '14:00',
    bus: {
      busNumber: 'BUS-01',
      registrationNo: 'MH12AB1234',
      type: 'bus',
      capacity: 45,
      color: '#E87722',
      driver: { name: 'Rajesh Patil', phone: '9876543210', license: 'MH1234567' },
      helper: { name: 'Suresh Kumar', phone: '9876543211' },
      currentLocation: { lat: 18.5896, lng: 73.7388, speed: 0, heading: 0 },
    },
    stops: [
      { name: 'Hinjewadi Phase 1',   sequence: 1, morningArrivalTime: '07:05', eveningArrivalTime: '14:10', location: { lat: 18.5921, lng: 73.7357 }, landmark: 'Near Infosys Gate 1' },
      { name: 'Hinjewadi Phase 2',   sequence: 2, morningArrivalTime: '07:12', eveningArrivalTime: '14:17', location: { lat: 18.5896, lng: 73.7388 } },
      { name: 'Wakad Bridge',        sequence: 3, morningArrivalTime: '07:20', eveningArrivalTime: '14:25', location: { lat: 18.5988, lng: 73.7619 }, landmark: 'Near Wakad McDonald\'s' },
      { name: 'Baner Road',          sequence: 4, morningArrivalTime: '07:28', eveningArrivalTime: '14:33', location: { lat: 18.5601, lng: 73.7884 } },
      { name: 'Aundh',               sequence: 5, morningArrivalTime: '07:35', eveningArrivalTime: '14:40', location: { lat: 18.5579, lng: 73.8072 }, landmark: 'Near D-Mart Aundh' },
      { name: 'School Gate',         sequence: 6, morningArrivalTime: '07:45', eveningArrivalTime: '13:30', location: { lat: 18.5204, lng: 73.8567 } },
    ],
  },
  {
    name:        'Route B — Kothrud',
    code:        'RT-B',
    color:       '#4A7C59',
    morningDepartureTime: '07:10',
    eveningDepartureTime: '14:00',
    bus: {
      busNumber: 'BUS-02',
      registrationNo: 'MH12CD5678',
      type: 'bus',
      capacity: 40,
      color: '#4A7C59',
      driver: { name: 'Anil Sharma', phone: '9812345678', license: 'MH7654321' },
      helper: { name: 'Priya Devi', phone: '9812345679' },
      currentLocation: { lat: 18.5074, lng: 73.8077, speed: 0, heading: 0 },
    },
    stops: [
      { name: 'Kothrud Depot',       sequence: 1, morningArrivalTime: '07:15', eveningArrivalTime: '14:05', location: { lat: 18.5074, lng: 73.8077 }, landmark: 'Near Kothrud Bus Depot' },
      { name: 'Karve Nagar',         sequence: 2, morningArrivalTime: '07:22', eveningArrivalTime: '14:12', location: { lat: 18.5050, lng: 73.8145 } },
      { name: 'Erandwane',           sequence: 3, morningArrivalTime: '07:30', eveningArrivalTime: '14:20', location: { lat: 18.5113, lng: 73.8289 }, landmark: 'Near Abhimanshree Society' },
      { name: 'Deccan Gymkhana',     sequence: 4, morningArrivalTime: '07:37', eveningArrivalTime: '14:27', location: { lat: 18.5162, lng: 73.8402 }, landmark: 'Near Cafe Goodluck' },
      { name: 'School Gate',         sequence: 5, morningArrivalTime: '07:45', eveningArrivalTime: '13:30', location: { lat: 18.5204, lng: 73.8567 } },
    ],
  },
  {
    name:        'Route C — Hadapsar',
    code:        'RT-C',
    color:       '#7C6AF5',
    morningDepartureTime: '06:55',
    eveningDepartureTime: '14:00',
    bus: {
      busNumber: 'VAN-01',
      registrationNo: 'MH12EF9012',
      type: 'van',
      capacity: 14,
      color: '#7C6AF5',
      driver: { name: 'Mahesh Jadhav', phone: '9823456789', license: 'MH1122334' },
      currentLocation: { lat: 18.5077, lng: 73.9304, speed: 0, heading: 0 },
    },
    stops: [
      { name: 'Hadapsar Gadital',    sequence: 1, morningArrivalTime: '07:00', eveningArrivalTime: '14:10', location: { lat: 18.5022, lng: 73.9401 } },
      { name: 'Magarpatta City',     sequence: 2, morningArrivalTime: '07:10', eveningArrivalTime: '14:20', location: { lat: 18.5146, lng: 73.9302 }, landmark: 'Near Magarpatta Entrance' },
      { name: 'Wanowrie',            sequence: 3, morningArrivalTime: '07:20', eveningArrivalTime: '14:30', location: { lat: 18.5011, lng: 73.9003 } },
      { name: 'Salisbury Park',      sequence: 4, morningArrivalTime: '07:28', eveningArrivalTime: '14:38', location: { lat: 18.5069, lng: 73.8807 } },
      { name: 'School Gate',         sequence: 5, morningArrivalTime: '07:40', eveningArrivalTime: '13:30', location: { lat: 18.5204, lng: 73.8567 } },
    ],
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/school_mgmt');
  console.log('✅ MongoDB connected');

  // Clear existing transport data for this school
  await Promise.all([
    Bus.deleteMany({ school: SCHOOL_ID }),
    BusRoute.deleteMany({ school: SCHOOL_ID }),
    Stop.deleteMany({ school: SCHOOL_ID }),
    TransportAssignment.deleteMany({ school: SCHOOL_ID }),
    TransportFee.deleteMany({ school: SCHOOL_ID }),
  ]);
  console.log('🗑️  Cleared existing transport data');

  for (const routeData of ROUTE_DATA) {
    const { bus: busData, stops: stopData, ...routeMeta } = routeData;

    // Create bus
    const bus = await Bus.create({ ...busData, school: SCHOOL_ID });
    console.log(`🚌 Created bus: ${bus.busNumber}`);

    // Create route
    const route = await BusRoute.create({
      ...routeMeta,
      school: SCHOOL_ID,
      assignedBus: bus._id,
    });

    // Create stops
    const stopDocs = await Stop.insertMany(
      stopData.map((s) => ({
        ...s,
        school: SCHOOL_ID,
        route:  route._id,
      }))
    );

    // Embed stop summaries in route
    route.stops = stopDocs.map((s) => ({
      stop:        s._id,
      name:        s.name,
      sequence:    s.sequence,
      morningTime: s.morningArrivalTime,
      eveningTime: s.eveningArrivalTime,
      lat:         s.location?.lat,
      lng:         s.location?.lng,
    }));
    await route.save();

    // Link bus → route
    bus.assignedRoute = route._id;
    await bus.save();

    console.log(`🛣️  Created route: ${route.name} with ${stopDocs.length} stops`);
  }

  // Assign some students if any exist
  const students = await Student.find({ school: SCHOOL_ID }).limit(15);
  const routes   = await BusRoute.find({ school: SCHOOL_ID });
  const buses    = await Bus.find({ school: SCHOOL_ID });

  if (students.length > 0 && routes.length > 0) {
    for (let i = 0; i < students.length; i++) {
      const route  = routes[i % routes.length];
      const bus    = buses.find((b) => b.assignedRoute?.toString() === route._id.toString());
      if (!bus || route.stops.length < 2) continue;

      const pickupIdx = i % (route.stops.length - 1);
      const pickupStop = route.stops[pickupIdx];
      const dropStop   = route.stops[route.stops.length - 1]; // School gate

      await TransportAssignment.create({
        school:  SCHOOL_ID,
        student: students[i]._id,
        route:   route._id,
        bus:     bus._id,
        pickupStop: {
          stopId:   pickupStop.stop,
          name:     pickupStop.name,
          time:     pickupStop.morningTime,
          sequence: pickupStop.sequence,
          lat:      pickupStop.lat,
          lng:      pickupStop.lng,
        },
        dropStop: {
          stopId:   dropStop.stop,
          name:     dropStop.name,
          time:     dropStop.morningTime,
          sequence: dropStop.sequence,
          lat:      dropStop.lat,
          lng:      dropStop.lng,
        },
        monthlyFee: 1200 + Math.floor(Math.random() * 300),
        passType:   'both',
      });
    }
    console.log(`👦 Assigned ${students.length} students to routes`);

    // Generate current month's fees
    const currentMonth = new Date().getMonth() + 1;
    const currentYear  = new Date().getFullYear();
    const assignments  = await TransportAssignment.find({ school: SCHOOL_ID, isActive: true });

    for (const assignment of assignments) {
      await TransportFee.create({
        school:     SCHOOL_ID,
        student:    assignment.student,
        assignment: assignment._id,
        month:      currentMonth,
        year:       currentYear,
        amount:     assignment.monthlyFee,
        lateFee:    0,
        totalDue:   assignment.monthlyFee,
        status:     Math.random() > 0.5 ? 'paid' : 'pending',
        paidAmount: Math.random() > 0.5 ? assignment.monthlyFee : 0,
        dueDate:    new Date(currentYear, currentMonth - 1, 10),
      });
    }
    console.log(`💰 Generated fee records for ${assignments.length} students`);
  }

  console.log('\n✅ Transport seed complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
