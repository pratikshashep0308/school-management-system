// frontend/src/utils/transportAPI.js
// All transport API calls — import this in any component
import api from './api';

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
export const dashboardAPI = {
  get: () => api.get('/transport/dashboard'),
};

// ─── DRIVERS ─────────────────────────────────────────────────────────────────
export const driverAPI = {
  getAll:    ()         => api.get('/transport/drivers'),
  create:    (data)     => api.post('/transport/drivers', data),
  update:    (id, data) => api.put(`/transport/drivers/${id}`, data),
  delete:    (id)       => api.delete(`/transport/drivers/${id}`),
  expiring:  ()         => api.get('/transport/drivers/expiring-licenses'),
};

// ─── VEHICLES ────────────────────────────────────────────────────────────────
export const vehicleAPI = {
  getAll:         ()         => api.get('/transport/vehicles'),
  getOne:         (id)       => api.get(`/transport/vehicles/${id}`),
  create:         (data)     => api.post('/transport/vehicles', data),
  update:         (id, data) => api.put(`/transport/vehicles/${id}`, data),
  delete:         (id)       => api.delete(`/transport/vehicles/${id}`),
  addMaintenance: (id, data) => api.post(`/transport/vehicles/${id}/maintenance`, data),
  addFuel:        (id, data) => api.post(`/transport/vehicles/${id}/fuel`, data),
  expiringDocs:   ()         => api.get('/transport/vehicles/expiring-docs'),
};

// ─── ROUTES ──────────────────────────────────────────────────────────────────
export const routeAPI = {
  getAll:  ()         => api.get('/transport/routes'),
  getOne:  (id)       => api.get(`/transport/routes/${id}`),
  create:  (data)     => api.post('/transport/routes', data),
  update:  (id, data) => api.put(`/transport/routes/${id}`, data),
  delete:  (id)       => api.delete(`/transport/routes/${id}`),
};

// ─── ALLOCATIONS ─────────────────────────────────────────────────────────────
export const allocationAPI = {
  getAll:  (params) => api.get('/transport/allocations', { params }),
  assign:  (data)   => api.post('/transport/allocations', data),
  remove:  (id)     => api.delete(`/transport/allocations/${id}`),
};

// ─── TRIPS ───────────────────────────────────────────────────────────────────
export const tripAPI = {
  today:       ()         => api.get('/transport/trips/today'),
  start:       (data)     => api.post('/transport/trips', data),
  updateStop:  (id, data) => api.put(`/transport/trips/${id}/stop`, data),
  end:         (id)       => api.put(`/transport/trips/${id}/end`),
  sendAlert:   (id, data) => api.post(`/transport/trips/${id}/alert`, data),
};

// ─── BOARDING ────────────────────────────────────────────────────────────────
export const boardingAPI = {
  mark:     (data)   => api.post('/transport/boarding', data),
  getByTrip:(tripId) => api.get(`/transport/boarding/${tripId}`),
};

// ─── FEES ────────────────────────────────────────────────────────────────────
export const transportFeeAPI = {
  getAll:    (params)   => api.get('/transport/fees', { params }),
  generate:  (data)     => api.post('/transport/fees/generate', data),
  pay:       (id, data) => api.post(`/transport/fees/${id}/payment`, data),
};