import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000, // 15 second timeout
});

// Request interceptor — attach token from localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url    = error.config?.url || '';

    // Only force logout if the session-check endpoint returns 401
    // (means the token is genuinely invalid/expired)
    // Don't logout on 401/403 from other routes — that's just a permissions issue
    if (status === 401 && url.includes('/auth/me')) {
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// ── AUTH ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  login:           (data)          => api.post('/auth/login', data),
  getMe:           ()              => api.get('/auth/me'),
  logout:          ()              => api.post('/auth/logout'),
  changePassword:  (data)          => api.put('/auth/change-password', data),
  forgotPassword:  (email)         => api.post('/auth/forgot-password', { email }),
  resetPassword:   (token, password) => api.put(`/auth/reset-password/${token}`, { password }),
  updateProfile:   (data)          => api.put('/auth/update-profile', data),
};

// ── STUDENTS ──────────────────────────────────────────────────────────────────
export const studentAPI = {
  getAll:      (params) => api.get('/students', { params }),
  getById:     (id)     => api.get(`/students/${id}`),
  getMyProfile:()       => api.get('/students/my-profile'),
  create:      (data)   => api.post('/students', data),
  update:      (id, data) => api.put(`/students/${id}`, data),
  delete:      (id)     => api.delete(`/students/${id}`),
};

// ── TEACHERS ──────────────────────────────────────────────────────────────────
export const teacherAPI = {
  getAll:      (params) => api.get('/teachers', { params }),
  getById:     (id)     => api.get(`/teachers/${id}`),
  getMyProfile:()       => api.get('/teachers/my-profile'),
  create:      (data)   => api.post('/teachers', data),
  update:      (id, data) => api.put(`/teachers/${id}`, data),
  delete:      (id)     => api.delete(`/teachers/${id}`),
};

// ── CLASSES ───────────────────────────────────────────────────────────────────
export const classAPI = {
  getAll:  ()           => api.get('/classes'),
  getById: (id)         => api.get(`/classes/${id}`),
  create:  (data)       => api.post('/classes', data),
  update:  (id, data)   => api.put(`/classes/${id}`, data),
  delete:  (id)         => api.delete(`/classes/${id}`),
};

// ── SUBJECTS ──────────────────────────────────────────────────────────────────
export const subjectAPI = {
  getAll:  ()           => api.get('/subjects'),
  create:  (data)       => api.post('/subjects', data),
  update:  (id, data)   => api.put(`/subjects/${id}`, data),
  delete:  (id)         => api.delete(`/subjects/${id}`),
};

// ── ATTENDANCE ────────────────────────────────────────────────────────────────
export const attendanceAPI = {
  mark:            (data)                     => api.post('/attendance', data),
  getByClass:      (classId, date)            => api.get('/attendance/class', { params: { classId, date } }),
  getByStudent:    (studentId, params)        => api.get(`/attendance/student/${studentId}`, { params }),
  getMonthlyReport:(classId, month, year)     => api.get('/attendance/monthly-report', { params: { classId, month, year } }),
};

// ── EXAMS ─────────────────────────────────────────────────────────────────────
export const examAPI = {
  getAll:       (params)      => api.get('/exams', { params }),
  getById:      (id)          => api.get(`/exams/${id}`),
  create:       (data)        => api.post('/exams', data),
  update:       (id, data)    => api.put(`/exams/${id}`, data),
  delete:       (id)          => api.delete(`/exams/${id}`),
  enterResults: (id, results) => api.post(`/exams/${id}/results`, { results }),
  getResults:   (id)          => api.get(`/exams/${id}/results`),
};

// ── FEES ──────────────────────────────────────────────────────────────────────
export const feeAPI = {
  getStructures:   ()     => api.get('/fees/structures'),
  createStructure: (data) => api.post('/fees/structures', data),
  getPayments:     (params) => api.get('/fees/payments', { params }),
  recordPayment:   (data) => api.post('/fees/payments', data),
  getSummary:      ()     => api.get('/fees/summary'),
};

// ── TIMETABLE ─────────────────────────────────────────────────────────────────
export const timetableAPI = {
  get:    (classId) => api.get('/timetable', { params: { classId } }),
  save:   (data)    => api.post('/timetable', data),
  delete: (id)      => api.delete(`/timetable/${id}`),
};

// ── ASSIGNMENTS ───────────────────────────────────────────────────────────────
export const assignmentAPI = {
  getAll:   (params)             => api.get('/assignments', { params }),
  getById:  (id)                 => api.get(`/assignments/${id}`),
  create:   (data)               => api.post('/assignments', data),
  update:   (id, data)           => api.put(`/assignments/${id}`, data),
  delete:   (id)                 => api.delete(`/assignments/${id}`),
  submit:   (id, data)           => api.post(`/assignments/${id}/submit`, data),
  grade:    (id, studentId, data) => api.put(`/assignments/${id}/grade/${studentId}`, data),
};

// ── LIBRARY ───────────────────────────────────────────────────────────────────
export const libraryAPI = {
  getBooks:   (params) => api.get('/library/books', { params }),
  addBook:    (data)   => api.post('/library/books', data),
  updateBook: (id, d)  => api.put(`/library/books/${id}`, d),
  deleteBook: (id)     => api.delete(`/library/books/${id}`),
  getIssues:  (params) => api.get('/library/issues', { params }),
  issueBook:  (data)   => api.post('/library/issue', data),
  returnBook: (id)     => api.put(`/library/return/${id}`),
  getStats:   ()       => api.get('/library/stats'),
};

// ── TRANSPORT ─────────────────────────────────────────────────────────────────
export const transportAPI = {
  getAll:        ()           => api.get('/transport'),
  getById:       (id)         => api.get(`/transport/${id}`),
  create:        (data)       => api.post('/transport', data),
  update:        (id, data)   => api.put(`/transport/${id}`, data),
  delete:        (id)         => api.delete(`/transport/${id}`),
  assignStudent: (routeId, studentId) => api.post(`/transport/${routeId}/assign-student`, { studentId }),
};

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
export const notificationAPI = {
  getAll:   (params) => api.get('/notifications', { params }),
  create:   (data)   => api.post('/notifications', data),
  markRead: (id)     => api.put(`/notifications/${id}/read`),
  delete:   (id)     => api.delete(`/notifications/${id}`),
};

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
};

// ── ADMISSIONS ────────────────────────────────────────────────────────────────
export const admissionAPI = {
  getAll:       (params)              => api.get('/admissions', { params }),
  getById:      (id)                  => api.get(`/admissions/${id}`),
  getStats:     ()                    => api.get('/admissions/stats'),
  create:       (data)                => api.post('/admissions', data),
  publicSubmit: (data)                => api.post('/admissions/public', data),
  update:       (id, data)            => api.put(`/admissions/${id}`, data),
  updateStatus: (id, status, notes)   => api.put(`/admissions/${id}/status`, { status, notes }),
  delete:       (id)                  => api.delete(`/admissions/${id}`),
};

export default api;