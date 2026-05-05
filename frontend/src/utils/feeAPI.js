// frontend/src/utils/feeAPI.js
import api from './api';

const feeAPI = {
  // ── Dashboard ───────────────────────────────────────────────────────────────
  getDashboard:    ()             => api.get('/fees/dashboard'),
  getRecentPayments:(limit=10)     => api.get('/fees/recent-payments', { params:{ limit } }),
  getAnalytics:    ()             => api.get('/fees/analytics'),
  getSummary:      ()             => api.get('/fees/summary'),
  getClassSummary: ()             => api.get('/fees/class-summary'),

  // ── Students & ledger ────────────────────────────────────────────────────────
  getStudents:     (params={})    => api.get('/fees/students', { params }),
  getStudentFee:   (studentId)    => api.get(`/fees/student/${studentId}`),
  setupLedger:     (data)         => api.post('/fees/setup-ledger', data),

  // ── Payments ────────────────────────────────────────────────────────────────
  recordPayment:   (data)         => api.post('/fees/pay', data),

  // ── Receipts ─────────────────────────────────────────────────────────────────
  getReceipt:      (receiptNo)    => api.get(`/fees/receipt/${receiptNo}`),
  deletePayment:   (receiptNo)    => api.delete(`/fees/payment/${receiptNo}`),
  deleteLedger:    (id)           => api.delete(`/fees/ledger/${id}`),
  bulkDeleteLedgers:(ids)         => api.post('/fees/ledger/bulk-delete', { ids }),
  // PDF download handled via fetch() with blob response in the component

  // ── Fee Structures (existing) ─────────────────────────────────────────────
  getStructures:   ()             => api.get('/fees/structures'),
  createStructure: (data)         => api.post('/fees/structures', data),
  updateStructure: (id, data)     => api.put(`/fees/structures/${id}`, data),

  // ── Fee Types (new) ───────────────────────────────────────────────────────
  getFeeTypes:     ()             => api.get('/fees/types'),
  createFeeType:   (data)         => api.post('/fees/types', data),
  updateFeeType:   (id, data)     => api.put(`/fees/types/${id}`, data),
  deleteFeeType:   (id)           => api.delete(`/fees/types/${id}`),

  // ── Fee Assignments (new) ─────────────────────────────────────────────────
  getAssignments:    (params={})  => api.get('/fees/assignments', { params }),
  createAssignment:  (data)       => api.post('/fees/assignments', data),
  updateAssignment:  (id, data)   => api.put(`/fees/assignments/${id}`, data),
  deleteAssignment:  (id)         => api.delete(`/fees/assignments/${id}`),
  payAssignment:     (id, data)   => api.post(`/fees/assignments/${id}/pay`, data),
  updateAssignment:  (id, data)   => api.put(`/fees/assignments/${id}`, data),
  getStudentsFees:   (params={})  => api.get('/fees/students', { params }),
  getStudentFee:     (studentId)  => api.get(`/fees/student/${studentId}`),

  // ── Export ────────────────────────────────────────────────────────────────
  export: (params={}) => api.get('/fees/export', { params, responseType: 'blob' }),

  // ── Class Fee Templates (default fees per class) ──────────────────────────
  getClassTemplates:        ()              => api.get('/class-fee-templates'),
  getClassTemplate:         (classId)       => api.get(`/class-fee-templates/${classId}`),
  saveClassTemplate:        (data)          => api.post('/class-fee-templates', data),
  deleteClassTemplate:      (classId)       => api.delete(`/class-fee-templates/${classId}`),
  applyClassTemplate:       (classId, data) => api.post(`/class-fee-templates/${classId}/apply`, data),
};

export default feeAPI;