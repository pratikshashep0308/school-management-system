// frontend/src/utils/feeAPI.js
// Drop this file into your existing project — it extends the api.js instance

import api from './api'; // your existing axios instance

// ── ANALYTICS ──────────────────────────────────────────────────
export const feeAPI = {
  // School-wide summary cards
  getSummary: () =>
    api.get('/fees/summary'),

  // Per-class breakdown table
  getClassSummary: () =>
    api.get('/fees/class-summary'),

  // All students with fee status
  // params: { classId, section, status, page, limit }
  getStudents: (params = {}) =>
    api.get('/fees/students', { params }),

  // Full ledger for one student
  getStudentFee: (studentId) =>
    api.get(`/fees/student/${studentId}`),

  // ── PAYMENT ──────────────────────────────────────────────────
  // body: { studentId, classId, section, totalFees, amount,
  //         method, transactionId, month, year, remarks, feeStructureId }
  recordPayment: (data) =>
    api.post('/fees/pay', data),

  // Setup ledger for entire class at once
  // body: { classId, totalFees }
  setupLedger: (data) =>
    api.post('/fees/setup-ledger', data),

  // ── RECEIPT ──────────────────────────────────────────────────
  getReceipt: (receiptNumber) =>
    api.get(`/fees/receipt/${receiptNumber}`),

  // ── FEE STRUCTURES ───────────────────────────────────────────
  getStructures: () =>
    api.get('/fees/structures'),

  createStructure: (data) =>
    api.post('/fees/structures', data),

  updateStructure: (id, data) =>
    api.put(`/fees/structures/${id}`, data),
};

export default feeAPI;
