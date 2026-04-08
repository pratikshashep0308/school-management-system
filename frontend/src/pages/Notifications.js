// frontend/src/pages/Notifications.js
// Complete Real-time Notification System
import React, { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { notificationAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState } from '../components/ui';

const TYPE_META = {
  announcement: { icon: '📢', bg: 'bg-blue-50 dark:bg-blue-900/20',   color: 'text-blue-600',   border: 'border-blue-200',   label: 'Announcement' },
  reminder:     { icon: '🔔', bg: 'bg-amber-50 dark:bg-amber-900/20', color: 'text-amber-600',  border: 'border-amber-200',  label: 'Reminder'      },
  alert:        { icon: '⚠️',  bg: 'bg-red-50 dark:bg-red-900/20',    color: 'text-red-600',    border: 'border-red-200',    label: 'Alert'         },
  event:        { icon: '🏅',  bg: 'bg-purple-50 dark:bg-purple-900/20', color: 'text-purple-600', border: 'border-purple-200', label: 'Event'       },
};

const PRIORITY_COLORS = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  high:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  normal: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

const AUDIENCE_ICONS = { all: '🌐', students: '👨‍🎓', teachers: '🎓', parents: '👨‍👩‍👧', staff: '👔' };

const TABS = [
  { id: 'all',          label: 'All',           icon: '🔔' },
  { id: 'announcement', label: 'Announcements', icon: '📢' },
  { id: 'alert',        label: 'Alerts',        icon: '⚠️'  },
  { id: 'reminder',     label: 'Reminders',     icon: '🔔' },
  { id: 'event',        label: 'Events',        icon: '🏅' },
];

const FORM_DEFAULT = { title: '', message: '', type: 'announcement', priority: 'normal', audience: 'all' };

export default function Notifications() {
  const { can, user } = useAuth();
  const [notifs,    setNotifs]   = useState([]);
  const [loading,   setLoading]  = useState(true);
  const [tab,       setTab]      = useState('all');
  const [modal,     setModal]    = useState(false);
  const [form,      setForm]     = useState(FORM_DEFAULT);
  const [sending,   setSending]  = useState(false);
  const [preview,   setPreview]  = useState(null);
  const [search,    setSearch]   = useState('');
  // Real-time: track new unread count
  const [unread,    setUnread]   = useState(0);
  const pollRef = useRef(null);

  const canSend = can(['superAdmin', 'schoolAdmin', 'teacher']);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await notificationAPI.getAll();
      const data = r.data.data || [];
      setNotifs(prev => {
        // Count new ones since last fetch for real-time badge
        if (prev.length > 0 && data.length > prev.length) {
          const newCount = data.length - prev.length;
          setUnread(u => u + newCount);
          data.slice(0, newCount).forEach(n => {
            toast(TYPE_META[n.type]?.icon + ' ' + n.title, { duration: 4000 });
          });
        }
        return data;
      });
    } catch { if (!silent) toast.error('Failed to load notifications'); }
    finally { if (!silent) setLoading(false); }
  }, []);

  // Initial load + polling every 30s for real-time feel
  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), 30000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  const handleSend = async () => {
    if (!form.title.trim() || !form.message.trim()) return toast.error('Title and message are required');
    setSending(true);
    try {
      await notificationAPI.create(form);
      toast.success('Notification sent to ' + form.audience + ' ✅');
      setModal(false); setForm(FORM_DEFAULT); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error sending'); }
    finally { setSending(false); }
  };

  const handleDelete = async (id) => {
    try { await notificationAPI.delete(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const handleMarkRead = async (id) => {
    try { await notificationAPI.markRead(id); setUnread(u => Math.max(0, u - 1)); }
    catch {}
  };

  // Filtered list
  const filtered = notifs.filter(n => {
    const matchTab    = tab === 'all' || n.type === tab;
    const matchSearch = !search || n.title?.toLowerCase().includes(search.toLowerCase()) || n.message?.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  // Stats
  const urgentCount = notifs.filter(n => n.priority === 'urgent').length;
  const todayCount  = notifs.filter(n => new Date(n.createdAt).toDateString() === new Date().toDateString()).length;

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink dark:text-white">
            Notifications
            {unread > 0 && <span className="ml-2 text-sm font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">{unread} new</span>}
          </h2>
          <p className="text-sm text-muted">{notifs.length} total · {todayCount} today</p>
        </div>
        {canSend && (
          <button className="btn-primary" onClick={() => { setForm(FORM_DEFAULT); setModal(true); setUnread(0); }}>
            + Send Notification
          </button>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total',         value: notifs.length,                                          icon: '🔔', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600',   tab: 'all'          },
          { label: "Today's",       value: todayCount,                                             icon: '📅', color: 'bg-green-50 dark:bg-green-900/20 text-green-600', tab: 'all'          },
          { label: 'Urgent',        value: urgentCount,                                            icon: '🚨', color: 'bg-red-50 dark:bg-red-900/20 text-red-600',       tab: 'alert'        },
          { label: 'Announcements', value: notifs.filter(n => n.type === 'announcement').length,   icon: '📢', color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600', tab: 'announcement' },
        ].map(s => (
          <div
            key={s.label}
            onClick={() => setTab(s.tab)}
            style={{ cursor: 'pointer', transition: 'all 0.18s', userSelect: 'none' }}
            className="card p-4 flex items-center gap-3 hover:-translate-y-1 hover:shadow-lg active:scale-95"
          >
            <div className={'w-10 h-10 rounded-xl flex items-center justify-center text-xl ' + s.color}>{s.icon}</div>
            <div style={{ flex: 1 }}>
              <div className="text-2xl font-display text-ink dark:text-white">{s.value}</div>
              <div className="text-xs text-muted">{s.label}</div>
            </div>
            <span style={{ fontSize: 10, opacity: 0.3, fontWeight: 800 }}>→</span>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-1 p-1 rounded-2xl border border-border bg-warm dark:bg-gray-800">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={'flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ' +
                (tab === t.id ? 'bg-white dark:bg-gray-700 shadow-sm text-accent' : 'text-muted hover:text-ink dark:hover:text-white')}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">🔍</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search notifications…"
            className="form-input pl-9 w-56 text-sm py-2" />
        </div>
      </div>

      {/* Notifications list */}
      {loading ? <LoadingState /> : !filtered.length ? (
        <EmptyState icon="🔔" title={tab === 'all' ? 'No notifications yet' : 'No ' + tab + 's found'} />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(n => {
            const meta = TYPE_META[n.type] || TYPE_META.announcement;
            const t    = new Date(n.createdAt);
            const timeStr = t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' · ' + t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            const isNew = (new Date() - t) < 5 * 60 * 1000; // less than 5 min old

            return (
              <div key={n._id}
                onClick={() => { setPreview(n); handleMarkRead(n._id); }}
                className={'card px-5 py-4 flex gap-4 items-start cursor-pointer hover:shadow-md transition-all border ' + meta.border + (isNew ? ' ring-2 ring-accent/30' : '')}>
                <div className={'w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ' + meta.bg}>{meta.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {isNew && <span className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" />}
                    <span className="font-semibold text-ink dark:text-white">{n.title}</span>
                    <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + PRIORITY_COLORS[n.priority]}>{n.priority}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warm dark:bg-gray-700 text-slate dark:text-gray-300">
                      {AUDIENCE_ICONS[n.audience]} {n.audience}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warm dark:bg-gray-700 text-slate dark:text-gray-300 capitalize">{n.type}</span>
                  </div>
                  <p className="text-sm text-slate dark:text-gray-300 leading-relaxed line-clamp-2">{n.message}</p>
                  <div className="flex items-center gap-3 text-xs text-muted mt-2">
                    <span>🕒 {timeStr}</span>
                    {n.sentBy?.name && <span>By: <span className="font-medium text-slate dark:text-gray-300">{n.sentBy.name}</span></span>}
                  </div>
                </div>
                {can(['superAdmin', 'schoolAdmin']) && (
                  <button onClick={e => { e.stopPropagation(); handleDelete(n._id); }}
                    className="w-8 h-8 rounded-lg border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-all flex items-center justify-center text-sm flex-shrink-0">✕</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── SEND MODAL ── */}
      <Modal isOpen={modal} onClose={() => setModal(false)} title="Send Notification" size="md"
        footer={<>
          <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleSend} disabled={sending}>{sending ? 'Sending…' : '🚀 Send Now'}</button>
        </>}>
        <div className="space-y-4">
          <FormGroup label="Title *">
            <input className="form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. School Closed Tomorrow" />
          </FormGroup>
          <FormGroup label="Message *">
            <textarea className="form-input" rows={4} value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} placeholder="Write your message here…" style={{ resize: 'vertical' }} />
          </FormGroup>
          <div className="grid grid-cols-3 gap-3">
            <FormGroup label="Type">
              <select className="form-input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Priority">
              <select className="form-input" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="normal">🟢 Normal</option>
                <option value="high">🟡 High</option>
                <option value="urgent">🔴 Urgent</option>
              </select>
            </FormGroup>
            <FormGroup label="Audience">
              <select className="form-input" value={form.audience} onChange={e => setForm(p => ({ ...p, audience: e.target.value }))}>
                {Object.entries(AUDIENCE_ICONS).map(([k, icon]) => <option key={k} value={k}>{icon} {k.charAt(0).toUpperCase()+k.slice(1)}</option>)}
              </select>
            </FormGroup>
          </div>

          {/* Preview card */}
          {form.title && (
            <div className={'p-4 rounded-xl border ' + (TYPE_META[form.type]?.border || 'border-border')}>
              <p className="text-xs text-muted mb-2 font-semibold uppercase">Preview</p>
              <div className="flex gap-3">
                <span className="text-2xl">{TYPE_META[form.type]?.icon}</span>
                <div>
                  <p className="font-semibold text-ink dark:text-white text-sm">{form.title}</p>
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">{form.message}</p>
                  <div className="flex gap-1.5 mt-1.5">
                    <span className={'text-[10px] px-1.5 py-0.5 rounded-full font-bold ' + PRIORITY_COLORS[form.priority]}>{form.priority}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warm dark:bg-gray-700 text-slate">{AUDIENCE_ICONS[form.audience]} {form.audience}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── DETAIL PREVIEW MODAL ── */}
      <Modal isOpen={!!preview} onClose={() => setPreview(null)} title="Notification Detail" size="md"
        footer={<button className="btn-secondary" onClick={() => setPreview(null)}>Close</button>}>
        {preview && (
          <div className="space-y-4">
            <div className={'flex gap-4 p-4 rounded-2xl border ' + (TYPE_META[preview.type]?.border || '') + ' ' + (TYPE_META[preview.type]?.bg || '')}>
              <span className="text-4xl">{TYPE_META[preview.type]?.icon}</span>
              <div>
                <h3 className="font-bold text-ink dark:text-white text-lg">{preview.title}</h3>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className={'text-xs font-bold px-2 py-0.5 rounded-full ' + PRIORITY_COLORS[preview.priority]}>{preview.priority}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/50 text-slate capitalize">{preview.type}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/50 text-slate">{AUDIENCE_ICONS[preview.audience]} {preview.audience}</span>
                </div>
              </div>
            </div>
            <p className="text-slate dark:text-gray-300 leading-relaxed text-sm whitespace-pre-wrap">{preview.message}</p>
            <div className="text-xs text-muted border-t border-border pt-3 flex justify-between">
              <span>🕒 {new Date(preview.createdAt).toLocaleString('en-IN')}</span>
              {preview.sentBy?.name && <span>By: {preview.sentBy.name}</span>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}