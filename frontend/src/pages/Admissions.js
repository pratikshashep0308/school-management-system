import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import AdmissionDetailModal from '../components/admissions/AdmissionDetailModal';
import AdmissionFormModal   from '../components/admissions/AdmissionFormModal';
import InterviewModal       from '../components/admissions/InterviewModal';
import StatsCards           from '../components/admissions/StatsCards';

// Re-export from central utils so any file that already imports
// these from here continues to work without changes.
export { admissionAPI, STATUS_CONFIG, PRIORITY_CONFIG, StatusBadge } from '../utils/admissionUtils';
import { admissionAPI, STATUS_CONFIG, PRIORITY_CONFIG, StatusBadge } from '../utils/admissionUtils';

// ── MAIN PAGE ────────────────────────────────────────────────────
export default function Admissions() {
  const { isAdmin } = useAuth();

  const [applications, setApplications] = useState([]);
  const [stats, setStats]               = useState(null);
  const [loading, setLoading]           = useState(true);
  const [total, setTotal]               = useState(0);

  // Filters
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatus]       = useState('');
  const [classFilter, setClass]         = useState('');
  const [priorityFilter, setPriority]   = useState('');
  const [page, setPage]                 = useState(1);

  // Modals
  const [detailId, setDetailId]         = useState(null);
  const [formModal, setFormModal]       = useState({ open: false, data: null });
  const [interviewModal, setInterview]  = useState({ open: false, data: null });

  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (search)        params.search = search;
      if (statusFilter)  params.status = statusFilter;
      if (classFilter)   params.applyingForClass = classFilter;
      if (priorityFilter) params.priority = priorityFilter;

      const [res, statsRes] = await Promise.all([
        admissionAPI.getAll(params),
        admissionAPI.getStats()
      ]);
      setApplications(res.data.data);
      setTotal(res.data.total);
      setStats(statsRes.data.data);
    } catch (e) {
      toast.error('Failed to load admissions');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, classFilter, priorityFilter, page]);

  useEffect(() => { load(); }, [load]);

  // Debounce search
  useEffect(() => { setPage(1); }, [search, statusFilter, classFilter, priorityFilter]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete application for ${name}?`)) return;
    try {
      await admissionAPI.delete(id);
      toast.success('Application deleted');
      load();
    } catch { toast.error('Delete failed'); }
  };

  const statusCounts = stats?.status || {};

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Admissions</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total} applications · {statusCounts.enrolled || 0} enrolled · {((statusCounts.conversionRate) || 0)}% conversion
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setFormModal({ open: true, data: null })}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-sm transition-colors"
          >
            + New Application
          </button>
        )}
      </div>

      {/* ── STATS CARDS ── */}
      {stats && <StatsCards stats={stats} />}

      {/* ── STATUS FILTER TABS ── */}
      <div className="flex gap-2 flex-wrap mb-4 mt-5">
        {[
          { key: '', label: 'All', count: statusCounts.total },
          ...Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label, count: statusCounts[key] || 0 }))
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setStatus(s.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              statusFilter === s.key
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
            }`}
          >
            {s.label} {s.count > 0 && <span className="ml-1 opacity-70">{s.count}</span>}
          </button>
        ))}
      </div>

      {/* ── FILTERS ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Search</label>
            <input
              type="text"
              placeholder="Name, App#, parent, phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Class</label>
            <select value={classFilter} onChange={e => setClass(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">All Classes</option>
              {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>Grade {i+1}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Priority</label>
            <select value={priorityFilter} onChange={e => setPriority(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">All Priority</option>
              <option value="urgent">🔴 Urgent</option>
              <option value="high">🟠 High</option>
              <option value="normal">⚪ Normal</option>
            </select>
          </div>
          <button onClick={() => { setSearch(''); setStatus(''); setClass(''); setPriority(''); }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-slate-500 text-sm hover:bg-slate-100">
            Reset
          </button>
        </div>
      </div>

      {/* ── TABLE ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 animate-pulse">Loading applications...</div>
        ) : applications.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-slate-500 font-medium">No applications found</p>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="px-5 py-3 text-left font-semibold">Applicant</th>
                  <th className="px-4 py-3 text-left font-semibold">Class</th>
                  <th className="px-4 py-3 text-left font-semibold">Parent / Contact</th>
                  <th className="px-4 py-3 text-left font-semibold">Interview</th>
                  <th className="px-4 py-3 text-left font-semibold">Applied</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map(app => (
                  <tr key={app._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {app.studentName?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                            {app.studentName}
                            {app.priority === 'urgent' && <span className="text-red-500 text-xs">🔴</span>}
                            {app.priority === 'high'   && <span className="text-orange-400 text-xs">🟠</span>}
                          </div>
                          <div className="text-xs text-slate-400 font-mono">{app.applicationNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-semibold text-slate-700">Grade {app.applyingForClass}</span>
                      {app.applyingForSection && <span className="text-slate-400"> – {app.applyingForSection}</span>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-700">{app.parentName}</div>
                      <div className="text-xs text-slate-400">{app.parentPhone}</div>
                    </td>
                    <td className="px-4 py-4">
                      {app.interview?.scheduled ? (
                        <div>
                          <div className="text-xs font-semibold text-violet-600">
                            {app.interview.completed ? '✅ Done' : '📅 Scheduled'}
                          </div>
                          {app.interview.date && (
                            <div className="text-xs text-slate-400">
                              {new Date(app.interview.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                              {app.interview.time && ` · ${app.interview.time}`}
                            </div>
                          )}
                          {app.interview.score !== undefined && (
                            <div className="text-xs text-emerald-600 font-semibold">Score: {app.interview.score}/100</div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => setInterview({ open: true, data: app })}
                          className="text-xs text-indigo-500 hover:underline"
                        >
                          + Schedule
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-400">
                      {app.createdAt ? new Date(app.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1.5 justify-center">
                        <button
                          onClick={() => setDetailId(app._id)}
                          title="View Details"
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200"
                        >
                          👁 View
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => setFormModal({ open: true, data: app })}
                              title="Edit"
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-100"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => handleDelete(app._id, app.studentName)}
                              title="Delete"
                              className="px-2.5 py-1.5 rounded-lg border border-red-100 text-red-400 text-xs hover:bg-red-50"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-100">← Prev</button>
              <button disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-100">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}
      {detailId && (
        <AdmissionDetailModal
          id={detailId}
          onClose={() => { setDetailId(null); load(); }}
          onScheduleInterview={(app) => { setDetailId(null); setInterview({ open: true, data: app }); }}
        />
      )}

      {formModal.open && (
        <AdmissionFormModal
          initial={formModal.data}
          onClose={() => setFormModal({ open: false, data: null })}
          onSuccess={() => { setFormModal({ open: false, data: null }); load(); }}
        />
      )}

      {interviewModal.open && (
        <InterviewModal
          application={interviewModal.data}
          onClose={() => setInterview({ open: false, data: null })}
          onSuccess={() => { setInterview({ open: false, data: null }); load(); }}
        />
      )}
    </div>
  );
}