import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { notificationAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState } from '../components/ui';

const TYPE_META = {
  announcement: { icon: '📢', bg: 'bg-blue-50', color: 'text-blue-600' },
  reminder:     { icon: '🔔', bg: 'bg-gold/15',  color: 'text-gold' },
  alert:        { icon: '⚠️',  bg: 'bg-accent/10', color: 'text-accent' },
  event:        { icon: '🏅',  bg: 'bg-purple-50', color: 'text-purple-600' },
};

const PRIORITY_BADGE = {
  urgent: 'bg-accent/10 text-accent',
  high:   'bg-gold/15 text-gold',
  normal: 'bg-sage/10 text-sage',
};

export default function Notifications() {
  const { isAdmin, isTeacher, can } = useAuth();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', type: 'announcement', priority: 'normal', audience: 'all' });

  const load = async () => {
    setLoading(true);
    try { const r = await notificationAPI.getAll(); setNotifs(r.data.data); }
    catch { toast.error('Failed to load notifications'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSend = async () => {
    if (!form.title || !form.message) { toast.error('Title and message are required'); return; }
    try {
      await notificationAPI.create(form);
      toast.success('Notification sent!');
      setModal(false);
      setForm({ title: '', message: '', type: 'announcement', priority: 'normal', audience: 'all' });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error sending notification'); }
  };

  const handleDelete = async (id) => {
    try { await notificationAPI.delete(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const canSend = can(['superAdmin','schoolAdmin','teacher']);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Notifications</h2>
          <p className="text-sm text-muted mt-0.5">{notifs.length} announcements</p>
        </div>
        {canSend && <button className="btn-primary" onClick={() => setModal(true)}>+ Send Notification</button>}
      </div>

      {loading ? <LoadingState /> : !notifs.length ? <EmptyState icon="🔔" title="No notifications yet" /> : (
        <div className="flex flex-col gap-3">
          {notifs.map(n => {
            const meta = TYPE_META[n.type] || TYPE_META.announcement;
            const t = new Date(n.createdAt);
            const timeStr = t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' · ' + t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={n._id} className="card px-6 py-5 flex gap-4 items-start hover:shadow-sm transition-shadow">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${meta.bg}`}>{meta.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-ink">{n.title}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_BADGE[n.priority]}`}>{n.priority}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-warm text-slate`}>{n.audience}</span>
                  </div>
                  <p className="text-sm text-slate leading-relaxed mb-3">{n.message}</p>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span>{timeStr}</span>
                    {n.sentBy?.name && <span>By: {n.sentBy.name}</span>}
                  </div>
                </div>
                {(isAdmin) && (
                  <button onClick={() => handleDelete(n._id)}
                    className="w-8 h-8 rounded-lg border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-all flex items-center justify-center text-sm flex-shrink-0">✕</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Send Notification" size="md"
        footer={<><button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleSend}>Send</button></>}>
        <div className="grid gap-4">
          <FormGroup label="Title">
            <input className="form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Notification title…" />
          </FormGroup>
          <FormGroup label="Message">
            <textarea className="form-input" rows={4} value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} placeholder="Write your message here…" style={{ resize: 'vertical' }} />
          </FormGroup>
          <div className="grid grid-cols-3 gap-3">
            <FormGroup label="Type">
              <select className="form-input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                {['announcement','reminder','alert','event'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Priority">
              <select className="form-input" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                {['normal','high','urgent'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Audience">
              <select className="form-input" value={form.audience} onChange={e => setForm(p => ({ ...p, audience: e.target.value }))}>
                {['all','students','teachers','parents','staff'].map(a => <option key={a} value={a}>{a.charAt(0).toUpperCase()+a.slice(1)}</option>)}
              </select>
            </FormGroup>
          </div>
        </div>
      </Modal>
    </div>
  );
}
