// frontend/src/utils/studentPortalAPI.js
import api from './api';

const BASE = '/student-portal';

export const studentPortalAPI = {
  getDashboard:     ()              => api.get(`${BASE}/dashboard`),
  getProfile:       ()              => api.get(`${BASE}/profile`),
  getAttendance:    (month, year)   => api.get(`${BASE}/attendance`, { params: { month, year } }),
  getResults:       ()              => api.get(`${BASE}/results`),
  getFees:          ()              => api.get(`${BASE}/fees`),
  getTimetable:     ()              => api.get(`${BASE}/timetable`),
  getAssignments:   ()              => api.get(`${BASE}/assignments`),
  getNotifications: ()              => api.get(`${BASE}/notifications`),
};