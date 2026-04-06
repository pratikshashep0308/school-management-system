// frontend/src/utils/transportAPI.js
// All transport API helpers — import these in transport components

import api from './api';

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const transportDashboardAPI = {
  get: () => api.get('/transport/dashboard'),
};

// ─── Buses ────────────────────────────────────────────────────────────────────
export const busAPI = {
  getAll:       ()         => api.get('/transport/buses'),
  getOne:       (id)       => api.get(`/transport/buses/${id}`),
  create:       (data)     => api.post('/transport/buses', data),
  update:       (id, data) => api.put(`/transport/buses/${id}`, data),
  delete:       (id)       => api.delete(`/transport/buses/${id}`),
  updateLocation: (id, loc) => api.post(`/transport/buses/${id}/location`, loc),
  gpsHistory:   (id)       => api.get(`/transport/buses/${id}/gps-history`),
};

// ─── Routes ───────────────────────────────────────────────────────────────────
export const routeAPI = {
  getAll:  ()         => api.get('/transport/routes'),
  getOne:  (id)       => api.get(`/transport/routes/${id}`),
  create:  (data)     => api.post('/transport/routes', data),
  update:  (id, data) => api.put(`/transport/routes/${id}`, data),
  delete:  (id)       => api.delete(`/transport/routes/${id}`),
};

// ─── Stops ────────────────────────────────────────────────────────────────────
export const stopAPI = {
  getByRoute: (routeId) => api.get(`/transport/stops?route=${routeId}`),
  create:     (data)    => api.post('/transport/stops', data),
  update:     (id, data)=> api.put(`/transport/stops/${id}`, data),
  delete:     (id)      => api.delete(`/transport/stops/${id}`),
};

// ─── Assignments ──────────────────────────────────────────────────────────────
export const assignmentAPI = {
  getAll:  (params) => api.get('/transport/assignments', { params }),
  assign:  (data)   => api.post('/transport/assignments', data),
  remove:  (id)     => api.delete(`/transport/assignments/${id}`),
};

// ─── Trips ────────────────────────────────────────────────────────────────────
export const tripAPI = {
  today:       ()         => api.get('/transport/trips/today'),
  start:       (data)     => api.post('/transport/trips', data),
  updateStop:  (id, data) => api.put(`/transport/trips/${id}/stop`, data),
  end:         (id)       => api.put(`/transport/trips/${id}/end`),
  sendAlert:   (id, data) => api.post(`/transport/trips/${id}/alert`, data),
};

// ─── Fees ─────────────────────────────────────────────────────────────────────
export const transportFeeAPI = {
  getAll:    (params)   => api.get('/transport/fees', { params }),
  summary:   (params)   => api.get('/transport/fees/summary', { params }),
  generate:  (data)     => api.post('/transport/fees/generate', data),
  pay:       (id, data) => api.post(`/transport/fees/${id}/payment`, data),
};

// ─── Student/Parent portal ────────────────────────────────────────────────────
export const myTransportAPI = {
  get: () => api.get('/transport/my-transport'),
};
