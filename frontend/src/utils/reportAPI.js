// frontend/src/utils/reportAPI.js
import api from './api';

const reportAPI = {
  // Dashboard summary
  getDashboard:  ()       => api.get('/reports/dashboard'),

  // Metadata (available fields per module)
  getMeta:       ()       => api.get('/reports/meta'),

  // Predefined starter reports
  getPredefined: ()       => api.get('/reports/predefined'),

  // Saved templates
  getTemplates:  ()       => api.get('/reports/templates'),

  // CRUD
  list:          ()       => api.get('/reports'),
  get:           (id)     => api.get(`/reports/${id}`),
  create:        (data)   => api.post('/reports', data),
  update:        (id, d)  => api.put(`/reports/${id}`, d),
  delete:        (id)     => api.delete(`/reports/${id}`),

  // Run report — returns JSON data rows
  run: (payload) => api.post('/reports/run', payload),

  // Export — triggers file download
  export: async ({ format, reportId, module, fields, filters, groupBy, sortBy, reportName }) => {
    const response = await api.post(
      '/reports/export',
      { format, reportId, module, fields, filters, groupBy, sortBy },
      { responseType: 'blob' }
    );
    const ext      = format;
    const mime     = {
      pdf:  'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv:  'text/csv',
    }[format];
    const url  = window.URL.createObjectURL(new Blob([response.data], { type: mime }));
    const link = document.createElement('a');
    link.href  = url;
    link.setAttribute('download', `${reportName || 'report'}-${new Date().toISOString().split('T')[0]}.${ext}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default reportAPI;