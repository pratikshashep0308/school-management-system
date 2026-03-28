// backend/utils/seedTransport.js
// Run: node utils/seedTransport.js
require('dotenv').config();
const mongoose = require('mongoose');
const { Driver, Vehicle, TransportRoute, TransportAllocation } = require('../models/transportModels');
const { default: Student } = require('../models/Student') || {};

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // You need a valid school ID from your DB
  // Get it from: db.schools.findOne()
  const SCHOOL_ID = process.env.SEED_SCHOOL_ID || '000000000000000000000001';

  // ── 1. Drivers ──────────────────────────────────────────────────────────────
  await Driver.deleteMany({ school: SCHOOL_ID });
  const drivers = await Driver.insertMany([
    {
      school: SCHOOL_ID, name: 'Ramesh Kumar', phone: '9876543210',
      role: 'driver', status: 'active',
      license: { number: 'MH12-2019-0012345', type: 'HMV', expiry: new Date('2026-06-30') },
      address: { city: 'Pune', state: 'Maharashtra', pincode: '411001' },
    },
    {
      school: SCHOOL_ID, name: 'Suresh Patil', phone: '9876543211',
      role: 'driver', status: 'active',
      license: { number: 'MH12-2020-0054321', type: 'HMV', expiry: new Date('2025-12-31') },
      address: { city: 'Pune', state: 'Maharashtra', pincode: '411014' },
    },
    {
      school: SCHOOL_ID, name: 'Mahesh Shinde', phone: '9876543212',
      role: 'helper', status: 'active',
      license: { number: 'MH12-2021-0099999', type: 'LMV', expiry: new Date('2027-03-15') },
      address: { city: 'Pune', state: 'Maharashtra', pincode: '411007' },
    },
  ]);
  console.log(`✅ Created ${drivers.length} drivers`);

  // ── 2. Vehicles ─────────────────────────────────────────────────────────────
  await Vehicle.deleteMany({ school: SCHOOL_ID });
  const vehicles = await Vehicle.insertMany([
    {
      school: SCHOOL_ID, registrationNo: 'MH12AB1234', type: 'bus',
      make: 'TATA', model: 'Starbus Ultra', year: 2021, capacity: 45,
      gpsDeviceId: 'GPS001', driver: drivers[0]._id,
      currentLocation: { lat: 18.5204, lng: 73.8567, speed: 0, heading: 0 },
      status: 'active',
      insurance: { provider: 'HDFC Ergo', policyNo: 'POL2024001', expiry: new Date('2025-03-31') },
      fitness:   { certificateNo: 'FIT2024001', expiry: new Date('2025-09-30') },
      puc:       { certificateNo: 'PUC2024001', expiry: new Date('2024-12-31') },
    },
    {
      school: SCHOOL_ID, registrationNo: 'MH12CD5678', type: 'bus',
      make: 'Ashok Leyland', model: 'Lynx', year: 2020, capacity: 40,
      gpsDeviceId: 'GPS002', driver: drivers[1]._id,
      currentLocation: { lat: 18.5304, lng: 73.8467, speed: 0, heading: 90 },
      status: 'active',
      insurance: { provider: 'New India', policyNo: 'POL2024002', expiry: new Date('2025-07-15') },
      fitness:   { certificateNo: 'FIT2024002', expiry: new Date('2025-12-31') },
    },
    {
      school: SCHOOL_ID, registrationNo: 'MH12EF9012', type: 'van',
      make: 'Force', model: 'Traveller', year: 2022, capacity: 12,
      currentLocation: { lat: 18.5104, lng: 73.8667, speed: 0, heading: 180 },
      status: 'maintenance',
    },
  ]);
  console.log(`✅ Created ${vehicles.length} vehicles`);

  // ── 3. Routes ────────────────────────────────────────────────────────────────
  await TransportRoute.deleteMany({ school: SCHOOL_ID });
  const routes = await TransportRoute.insertMany([
    {
      school: SCHOOL_ID, name: 'Route A – Kothrud', code: 'RT-A',
      vehicle: vehicles[0]._id, driver: drivers[0]._id,
      morningStart: '06:45', afternoonStart: '13:30',
      feePerMonth: 1200, isActive: true, color: '#3B82F6',
      stops: [
        { name: 'Chandni Chowk',  sequence: 1, lat: 18.5076, lng: 73.8140, pickupTime: '06:45', dropTime: '14:15' },
        { name: 'Paud Road',      sequence: 2, lat: 18.5098, lng: 73.8220, pickupTime: '06:52', dropTime: '14:08' },
        { name: 'Karve Nagar',    sequence: 3, lat: 18.5150, lng: 73.8300, pickupTime: '07:00', dropTime: '14:00' },
        { name: 'Dahanukar Colony', sequence: 4, lat: 18.5200, lng: 73.8380, pickupTime: '07:08', dropTime: '13:52' },
        { name: 'School Gate',    sequence: 5, lat: 18.5204, lng: 73.8567, pickupTime: '07:20', dropTime: '13:30' },
      ],
    },
    {
      school: SCHOOL_ID, name: 'Route B – Aundh', code: 'RT-B',
      vehicle: vehicles[1]._id, driver: drivers[1]._id,
      morningStart: '06:30', afternoonStart: '13:30',
      feePerMonth: 1500, isActive: true, color: '#10B981',
      stops: [
        { name: 'Aundh Depot',      sequence: 1, lat: 18.5587, lng: 73.8087, pickupTime: '06:30', dropTime: '14:30' },
        { name: 'Baner Road',       sequence: 2, lat: 18.5530, lng: 73.8200, pickupTime: '06:40', dropTime: '14:20' },
        { name: 'Sus Road',         sequence: 3, lat: 18.5450, lng: 73.8350, pickupTime: '06:50', dropTime: '14:10' },
        { name: 'Pashan Lake',      sequence: 4, lat: 18.5380, lng: 73.8300, pickupTime: '06:58', dropTime: '14:02' },
        { name: 'School Gate',      sequence: 5, lat: 18.5204, lng: 73.8567, pickupTime: '07:20', dropTime: '13:30' },
      ],
    },
  ]);

  // Update vehicles with routes
  await Vehicle.findByIdAndUpdate(vehicles[0]._id, { assignedRoute: routes[0]._id });
  await Vehicle.findByIdAndUpdate(vehicles[1]._id, { assignedRoute: routes[1]._id });
  await Driver.findByIdAndUpdate(drivers[0]._id, { assignedVehicle: vehicles[0]._id });
  await Driver.findByIdAndUpdate(drivers[1]._id, { assignedVehicle: vehicles[1]._id });

  console.log(`✅ Created ${routes.length} routes`);
  console.log('\n🎉 Transport seed complete!');
  console.log('\nTest credentials:');
  console.log('  School ID:', SCHOOL_ID);
  console.log('  Vehicles:', vehicles.map(v => v.registrationNo).join(', '));
  console.log('  Routes:', routes.map(r => r.code).join(', '));

  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });