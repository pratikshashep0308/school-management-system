// frontend/src/components/admissions/InterviewModal.js
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { admissionAPI } from '../../pages/Admissions';

export default function InterviewModal({ application, onClose, onSuccess }) {
  const existing = application?.interview || {};
  const [form, setForm] = useState({
    date:      existing.date ? new Date(existing.date).toISOString().split('T')[0] : '',
    time:      existing.time      || '',
    mode:      existing.mode      || 'in_person',
    venue:     existing.venue     || '',
    score:     existing.score     ?? '',
    remarks:   existing.remarks   || '',
    completed: existing.completed || false
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.date) return toast.error('Please select a date');
    setSaving(true);
    try {
      await admissionAPI.updateInterview(application._id, {
        ...form,
        score: form.score !== '' ? Number(form.score) : undefined
      });
      toast.success(form.completed ? 'Interview marked complete' : 'Interview scheduled');
      onSuccess();
    } catch { toast.error('Failed to save interview'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">
              {existing.scheduled ? 'Update Interview' : 'Schedule Interview'}
            </h2>
            <p className="text-sm text-indigo-600 mt-0.5">{application?.studentName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl px-2">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Date *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={cls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Time</label>
              <input type="time" value={form.time} onChange={e => set('time', e.target.value)} className={cls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {[['in_person', '🏫 In Person'], ['online', '💻 Online'], ['phone', '📞 Phone']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => set('mode', v)}
                  className={`py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                    form.mode === v ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Venue / Link</label>
            <input type="text" value={form.venue} onChange={e => set('venue', e.target.value)}
              placeholder="Room 201 / Zoom link / Phone number"
              className={cls} />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="flex items-center gap-3 cursor-pointer mb-4">
              <input type="checkbox" checked={form.completed} onChange={e => set('completed', e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-sm font-semibold text-slate-700">Mark interview as completed</span>
            </label>

            {form.completed && (
              <div className="space-y-3 animate-fade-in">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Score (out of 100)</label>
                  <input type="number" min="0" max="100" value={form.score}
                    onChange={e => set('score', e.target.value)}
                    placeholder="e.g. 78"
                    className={cls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Remarks</label>
                  <textarea rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)}
                    placeholder="Interview feedback..."
                    className={`${cls} resize-none`} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
            {saving ? 'Saving...' : form.completed ? '✅ Mark Complete' : '📅 Schedule Interview'}
          </button>
        </div>
      </div>
    </div>
  );
}

const cls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400";
