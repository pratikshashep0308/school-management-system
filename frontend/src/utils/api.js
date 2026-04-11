// frontend/src/utils/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// ── Request interceptor: attach token ─────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: handle 401 / token expiry ──────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url    = error.config?.url || '';

    if (status === 401) {
      const msg = error.response?.data?.message || '';
      const isExpired = msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid');
      if (url.includes('/auth/me') || isExpired) {
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login?reason=session_expired';
        }
      }
    }

    return Promise.reject(error);
  }
);

// ── AUTH ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  login:          (data)           => api.post('/auth/login', data),
  getMe:          ()               => api.get('/auth/me'),
  logout:         ()               => api.post('/auth/logout'),
  changePassword: (data)           => api.put('/auth/change-password', data),
  forgotPassword: (email)          => api.post('/auth/forgot-password', { email }),
  resetPassword:  (token, password)=> api.put(`/auth/reset-password/${token}`, { password }),
  updateProfile:  (data)           => api.put('/auth/update-profile', data),
};

// ── STUDENTS ──────────────────────────────────────────────────────────────────
export const studentAPI = {
  getAll:       (params)     => api.get('/students', { params }),
  getById:      (id)         => api.get(`/students/${id}`),
  getMyProfile: ()           => api.get('/students/my-profile'),
  create:       (data)       => api.post('/students', data),
  update:       (id, data)   => api.put(`/students/${id}`, data),
  delete:       (id)         => api.delete(`/students/${id}?hard=true`),
};

// ── TEACHERS ──────────────────────────────────────────────────────────────────
export const teacherAPI = {
  getAll:       (params)     => api.get('/teachers', { params }),
  getById:      (id)         => api.get(`/teachers/${id}`),
  getMyProfile: ()           => api.get('/teachers/my-profile'),
  create:       (data)       => api.post('/teachers', data),
  update:       (id, data)   => api.put(`/teachers/${id}`, data),
  delete:       (id)         => api.delete(`/teachers/${id}`),
};

// ── CLASSES ───────────────────────────────────────────────────────────────────
export const classAPI = {
  getAll:  ()         => api.get('/classes'),
  getById: (id)       => api.get(`/classes/${id}`),
  create:  (data)     => api.post('/classes', data),
  update:  (id, data) => api.put(`/classes/${id}`, data),
  delete:  (id)       => api.delete(`/classes/${id}`),
};

// ── SUBJECTS ──────────────────────────────────────────────────────────────────
export const subjectAPI = {
  getAll:  ()         => api.get('/subjects'),
  create:  (data)     => api.post('/subjects', data),
  update:  (id, data) => api.put(`/subjects/${id}`, data),
  delete:  (id)       => api.delete(`/subjects/${id}`),
};

// ── ATTENDANCE ────────────────────────────────────────────────────────────────
export const attendanceAPI = {
  mark:             (data)              => api.post('/attendance', data),
  getByClass:       (classId, date)     => api.get('/attendance/class', { params: { classId, date } }),
  getByStudent:     (studentId, params) => api.get(`/attendance/student/${studentId}`, { params }),
  getMonthlyReport: (classId, month, year) => api.get('/attendance/monthly-report', { params: { classId, month, year } }),
};

// ── EXAMS ─────────────────────────────────────────────────────────────────────
export const examAPI = {
  getAll:       (params)       => api.get('/exams', { params }),
  getById:      (id)           => api.get(`/exams/${id}`),
  create:       (data)         => api.post('/exams', data),
  update:       (id, data)     => api.put(`/exams/${id}`, data),
  delete:       (id)           => api.delete(`/exams/${id}`),
  enterResults: (id, results)  => api.post(`/exams/${id}/results`, { results }),
  getResults:   (id)           => api.get(`/exams/${id}/results`),
};

// ── FEES ──────────────────────────────────────────────────────────────────────
export const feeAPI = {
  getStructures:   ()       => api.get('/fees/structures'),
  createStructure: (data)   => api.post('/fees/structures', data),
  getPayments:     (params) => api.get('/fees/payments', { params }),
  recordPayment:   (data)   => api.post('/fees/payments', data),
  getSummary:      ()       => api.get('/fees/summary'),
};

// ── TIMETABLE ─────────────────────────────────────────────────────────────────
export const timetableAPI = {
  // Get all timetables (filter by classId, version, isActive)
  getAll:      (params)    => api.get('/timetable', { params }),

  // Get single timetable by ID
  getById:     (id)        => api.get(`/timetable/${id}`),

  // Get the active timetable for a class
  getClass:    (classId)   => api.get(`/timetable/class/${classId}`),

  // Get a teacher's personal weekly schedule
  getTeacher:  (teacherId) => api.get(`/timetable/teacher/${teacherId}`),

  // Get a student's class timetable
  getStudent:  (studentId) => api.get(`/timetable/student/${studentId}`),

  // Get all saved versions for a class
  getVersions: (classId)   => api.get(`/timetable/versions/${classId}`),

  // Create a new timetable
  create:      (data)      => api.post('/timetable', data),

  // Update an existing timetable
  update:      (id, data)  => api.put(`/timetable/${id}`, data),

  // Delete a timetable
  delete:      (id)        => api.delete(`/timetable/${id}`),

  // Switch active version
  activate:    (id)        => api.put(`/timetable/${id}/activate`),

  // Assign substitute teacher to a period
  assignSubstitute: (id, data) => api.post(`/timetable/${id}/substitute`, data),

  // Remove substitute from a period
  removeSubstitute: (id, data) => api.delete(`/timetable/${id}/substitute`, { data }),

  // Auto-generate a full timetable
  autoGenerate: (data)     => api.post('/timetable/auto-generate', data),

  // Validate a draft schedule for conflicts (without saving)
  validate:    (data)      => api.post('/timetable/validate', data),

  // Export as PDF — returns blob
  export:      (id, format = 'pdf') => api.get(`/timetable/export/${id}`, {
    params: { format },
    responseType: 'blob',
  }),

  // Legacy aliases for backward compat
  get:  (classId) => api.get('/timetable', { params: { classId } }),
  save: (data)    => api.post('/timetable', data),
};

// ── ASSIGNMENTS ───────────────────────────────────────────────────────────────
export const assignmentAPI = {
  getAll:  (params)              => api.get('/assignments', { params }),
  getById: (id)                  => api.get(`/assignments/${id}`),
  create:  (data)                => api.post('/assignments', data),
  update:  (id, data)            => api.put(`/assignments/${id}`, data),
  delete:  (id)                  => api.delete(`/assignments/${id}`),
  submit:  (id, data)            => api.post(`/assignments/${id}/submit`, data),
  grade:   (id, studentId, data) => api.put(`/assignments/${id}/grade/${studentId}`, data),
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
  getAll:       (params)            => api.get('/admissions', { params }),
  getById:      (id)                => api.get(`/admissions/${id}`),
  getStats:     ()                  => api.get('/admissions/stats'),
  create:       (data)              => api.post('/admissions', data),
  publicSubmit: (data)              => api.post('/admissions/public', data),
  update:       (id, data)          => api.put(`/admissions/${id}`, data),
  updateStatus: (id, status, notes) => api.put(`/admissions/${id}/status`, { status, notes }),
  delete:       (id)                => api.delete(`/admissions/${id}`),
};

// ── REPORTS ───────────────────────────────────────────────────────────────────
export const reportAPI = {
  getMeta:       ()     => api.get('/reports/meta'),
  getDashboard:  ()     => api.get('/reports/dashboard'),
  getPredefined: ()     => api.get('/reports/predefined'),
  getTemplates:  ()     => api.get('/reports/templates'),
  getAll:        ()     => api.get('/reports'),
  getById:       (id)   => api.get(`/reports/${id}`),
  create:        (data) => api.post('/reports', data),
  update:        (id, data) => api.put(`/reports/${id}`, data),
  delete:        (id)   => api.delete(`/reports/${id}`),
  run:           (payload) => api.post('/reports/run', payload),
  smartSearch:   (query)   => api.post('/reports/smart-search', { query }),

  export: async ({ format, reportId, module, fields, filters, groupBy, sortBy, reportName }) => {
    const res = await api.post(
      '/reports/export',
      { format, reportId, module, fields, filters, groupBy, sortBy },
      { responseType: 'blob', timeout: 60000 }
    );
    const mimeTypes = {
      pdf:  'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv:  'text/csv',
    };
    const blob = new Blob([res.data], { type: mimeTypes[format] });
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${(reportName || 'report').replace(/\s+/g,'-')}-${new Date().toISOString().split('T')[0]}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};

// ── EXPENSES ─────────────────────────────────────────────────────────────────
export const expenseAPI = {
  // Categories
  getCategories:   ()              => api.get('/expenses/categories'),
  createCategory:  (data)          => api.post('/expenses/categories', data),
  updateCategory:  (id, data)      => api.put(`/expenses/categories/${id}`, data),
  deleteCategory:  (id)            => api.delete(`/expenses/categories/${id}`),

  // Expenses CRUD
  getAll:   (params)               => api.get('/expenses', { params }),
  getById:  (id)                   => api.get(`/expenses/${id}`),
  add:      (formData)             => api.post('/expenses', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update:   (id, formData)         => api.put(`/expenses/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete:   (id)                   => api.delete(`/expenses/${id}`),

  // Analytics
  getDashboard: ()                 => api.get('/expenses/dashboard'),
  getReport:    (month, year)      => api.get('/expenses/report', { params: { month, year } }),
  getFinance:   (params)           => api.get('/expenses/finance', { params }),
  getRecurring: ()                 => api.get('/expenses/recurring'),

  // Export (returns blob)
  export: (params)                 => api.get('/expenses/export', { params, responseType: 'blob' }),
};

export default api;