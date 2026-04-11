// src/utils/admissionUtils.js
// Shared constants and helpers for admissions — imported by both
// Admissions.js and all admission sub-components to avoid circular imports.

import React from 'react';
import api from './api';

// ── API ───────────────────────────────────────────────────────────────────────
export const admissionAPI = {
  getAll:          (params) => api.get('/admissions', { params }),
  getById:         (id)     => api.get(`/admissions/${id}`),
  getStats:        ()       => api.get('/admissions/stats'),
  create:          (data)   => api.post('/admissions', data),
  update:          (id, d)  => api.put(`/admissions/${id}`, d),
  updateStatus:    (id, d)  => api.put(`/admissions/${id}/status`, d),
  updateInterview: (id, d)  => api.put(`/admissions/${id}/interview`, d),
  updateDocuments: (id, d)  => api.put(`/admissions/${id}/documents`, d),
  addNote:         (id, d)  => api.put(`/admissions/${id}/note`, d),
  delete:          (id)     => api.delete(`/admissions/${id}`),
  enroll:          (id, d)  => api.post(`/admissions/${id}/enroll`, d),
};

// ── Status config ─────────────────────────────────────────────────────────────
export const STATUS_CONFIG = {
  pending:             { label: 'Pending',      bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500',   border: 'border-amber-200'   },
  under_review:        { label: 'Under Review', bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500',    border: 'border-blue-200'    },
  interview_scheduled: { label: 'Interview',    bg: 'bg-violet-100',  text: 'text-violet-700',  dot: 'bg-violet-500',  border: 'border-violet-200'  },
  approved:            { label: 'Approved',     bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  rejected:            { label: 'Rejected',     bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',     border: 'border-red-200'     },
  enrolled:            { label: 'Enrolled',     bg: 'bg-teal-100',    text: 'text-teal-700',    dot: 'bg-teal-500',    border: 'border-teal-200'    },
  waitlisted:          { label: 'Waitlisted',   bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-500',  border: 'border-orange-200'  },
};

// ── Priority config ───────────────────────────────────────────────────────────
export const PRIORITY_CONFIG = {
  normal: { label: 'Normal', color: 'text-slate-500'  },
  high:   { label: 'High',   color: 'text-orange-500' },
  urgent: { label: 'Urgent', color: 'text-red-600'    },
};

// ── StatusBadge component ─────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}