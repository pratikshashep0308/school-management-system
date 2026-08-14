// frontend/src/pages/AcademicCalendar.js
//
// FP-060 · Academic Calendar management (§20).
//
// Consumes the FP-050 API contract exactly. All business rules — single active
// year, holiday recurrence, the outside-year guard — live in the backend; this
// screen surfaces them and their errors. Activating a year is consequential, so
// it requires explicit confirmation (per the LLD's destructive-op rule).

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { calendarAPI, apiErrorMessage } from '../utils/tfsAPI';
import { useAuth } from '../context/AuthContext';
import { LoadingState, EmptyState, Modal, FormGroup, Badge } from '../components/ui';

const ADMIN_ROLES = ['superAdmin', 'schoolAdmin'];

export default function AcademicCalendar() {
  const { user } = useAuth();
  const canManage = ADMIN_ROLES.includes(user?.role);

  const [years, setYears] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showYearModal, setShowYearModal] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState(null); // year pending activation

  const loadYears = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await calendarAPI.listYears();
      setYears(data.years || []);
      const active = (data.years || []).find((y) => y.isActive) || (data.years || [])[0] || null;
      setSelectedYear(active);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load academic years.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHolidays = useCallback(async (yearId) => {
    if (!yearId) { setHolidays([]); return; }
    try {
      const { data } = await calendarAPI.listHolidays(yearId);
      setHolidays(data.holidays || []);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load holidays.'));
    }
  }, []);

  useEffect(() => { loadYears(); }, [loadYears]);
  useEffect(() => { loadHolidays(selectedYear?._id); }, [selectedYear, loadHolidays]);

  const activateYear = async (year) => {
    try {
      await calendarAPI.activateYear(year._id);
      toast.success(`${year.name} is now the active year.`);
      setConfirmActivate(null);
      loadYears();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not activate the year.'));
    }
  };

  if (loading) return <LoadingState message="Loading academic calendar…" />;

  return (
    <div className="page academic-calendar">
      <header className="page-header">
        <h1>Academic Calendar</h1>
        {canManage && (
          <div className="actions">
            <button className="btn btn-primary" onClick={() => setShowYearModal(true)}>
              New academic year
            </button>
          </div>
        )}
      </header>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {/* ── Year selector ─────────────────────────────────────────────────── */}
      {years.length === 0 ? (
        <EmptyState
          icon="📅"
          title="No academic years yet"
          subtitle={canManage ? 'Create the first academic year to begin.' : 'Ask an administrator to set up the calendar.'}
        />
      ) : (
        <>
          <div className="year-tabs" role="tablist" aria-label="Academic years">
            {years.map((y) => (
              <button
                key={y._id}
                role="tab"
                aria-selected={selectedYear?._id === y._id}
                className={`year-tab ${selectedYear?._id === y._id ? 'active' : ''}`}
                onClick={() => setSelectedYear(y)}
              >
                {y.name} <Badge status={y.status} />
                {y.isActive && <span className="active-dot" aria-label="active" title="Active year">●</span>}
              </button>
            ))}
          </div>

          {selectedYear && (
            <section className="year-detail" aria-live="polite">
              <div className="year-meta">
                <span>{fmtDate(selectedYear.startDate)} → {fmtDate(selectedYear.endDate)}</span>
                {canManage && !selectedYear.isActive && (
                  <button className="btn btn-secondary" onClick={() => setConfirmActivate(selectedYear)}>
                    Make this the active year
                  </button>
                )}
              </div>

              {/* ── Holidays ──────────────────────────────────────────────── */}
              <div className="holidays-header">
                <h2>Holidays</h2>
                {canManage && (
                  <button className="btn btn-sm" onClick={() => setShowHolidayModal(true)}>
                    Add holiday
                  </button>
                )}
              </div>
              {holidays.length === 0 ? (
                <EmptyState icon="🏖️" title="No holidays recorded" subtitle="This year has no holidays yet." />
              ) : (
                <ul className="holiday-list">
                  {holidays.map((h) => (
                    <li key={h._id} className="holiday-row">
                      <span className="holiday-date">{fmtDate(h.date)}</span>
                      <span className="holiday-label">{h.label}</span>
                      {h.recurringAnnually && <Badge status="recurring" />}
                      {canManage && (
                        <button
                          className="btn-icon"
                          aria-label={`Delete ${h.label}`}
                          onClick={() => deleteHoliday(h, loadHolidays, selectedYear)}
                        >✕</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {/* ── Consequential-action confirmation ─────────────────────────────── */}
      {confirmActivate && (
        <Modal
          isOpen
          onClose={() => setConfirmActivate(null)}
          title="Activate academic year?"
          footer={
            <>
              <button className="btn" onClick={() => setConfirmActivate(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => activateYear(confirmActivate)}>
                Activate {confirmActivate.name}
              </button>
            </>
          }
        >
          <p>
            Making <strong>{confirmActivate.name}</strong> active will deactivate the current active
            year. Attendance, promotion and reporting will use this year. This affects the whole school.
          </p>
        </Modal>
      )}

      {showYearModal && (
        <YearModal
          onClose={() => setShowYearModal(false)}
          onCreated={() => { setShowYearModal(false); loadYears(); }}
        />
      )}
      {showHolidayModal && selectedYear && (
        <HolidayModal
          yearId={selectedYear._id}
          onClose={() => setShowHolidayModal(false)}
          onCreated={() => { setShowHolidayModal(false); loadHolidays(selectedYear._id); }}
        />
      )}
    </div>
  );
}

async function deleteHoliday(holiday, reload, year) {
  if (!window.confirm(`Delete "${holiday.label}"?`)) return;
  try {
    await calendarAPI.deleteHoliday(holiday._id);
    toast.success('Holiday deleted.');
    reload(year._id);
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not delete the holiday.'));
  }
}

function YearModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' });
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const submit = async () => {
    if (!form.name || !form.startDate || !form.endDate) {
      setFieldError('All fields are required.');
      return;
    }
    setSubmitting(true);
    setFieldError('');
    try {
      await calendarAPI.createYear(form);
      toast.success('Academic year created.');
      onCreated();
    } catch (err) {
      // Surface the backend's own validation message (e.g. start-before-end).
      setFieldError(apiErrorMessage(err, 'Could not create the year.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="New academic year"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </>
      }>
      {fieldError && <div className="alert alert-error" role="alert">{fieldError}</div>}
      <FormGroup label="Name (e.g. 2027-28)">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </FormGroup>
      <FormGroup label="Start date">
        <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
      </FormGroup>
      <FormGroup label="End date">
        <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
      </FormGroup>
    </Modal>
  );
}

function HolidayModal({ yearId, onClose, onCreated }) {
  const [form, setForm] = useState({ label: '', date: '', recurringAnnually: false });
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const submit = async () => {
    if (!form.label || !form.date) { setFieldError('Label and date are required.'); return; }
    setSubmitting(true);
    setFieldError('');
    try {
      await calendarAPI.createHoliday({ ...form, academicYearId: yearId });
      toast.success('Holiday added.');
      onCreated();
    } catch (err) {
      setFieldError(apiErrorMessage(err, 'Could not add the holiday.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Add holiday"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </>
      }>
      {fieldError && <div className="alert alert-error" role="alert">{fieldError}</div>}
      <FormGroup label="Label">
        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      </FormGroup>
      <FormGroup label="Date">
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      </FormGroup>
      <FormGroup label="">
        <label className="checkbox">
          <input type="checkbox" checked={form.recurringAnnually}
            onChange={(e) => setForm({ ...form, recurringAnnually: e.target.checked })} />
          Repeats every year (carried forward at rollover)
        </label>
      </FormGroup>
    </Modal>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
