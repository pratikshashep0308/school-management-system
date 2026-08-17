// frontend/src/pages/NotificationProviders.js
//
// FP-064 · Notification provider configuration (§23, ADR-05 boundary).
//
// The client NEVER handles a raw secret. credentialsRef is a reference
// (env:/secret:/vault:) that the backend validates; the input makes that
// explicit and the backend rejects an inline secret. Delivery capability is
// reported as PENDING because the concrete provider adapter is ADR-05 (FP-039).

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { notificationConfigAPI, apiErrorMessage } from '../utils/tfsAPI';
import { useAuth } from '../context/AuthContext';
import { LoadingState, EmptyState, FormGroup, Badge } from '../components/ui';

const ADMIN_ROLES = ['superAdmin', 'schoolAdmin'];
const CHANNELS = ['sms', 'whatsapp'];

export default function NotificationProviders() {
  const { user } = useAuth();
  const canManage = ADMIN_ROLES.includes(user?.role);

  const [configs, setConfigs] = useState([]);
  const [status, setStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ channel: 'sms', provider: '', senderNumber: '', credentialsRef: '', isActive: false });
  const [saving, setSaving] = useState(false);
  const [refError, setRefError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: cfg }, { data: st }] = await Promise.all([
        notificationConfigAPI.list(),
        notificationConfigAPI.status(),
      ]);
      setConfigs(cfg.configs || []);
      setStatus(st.channels || {});
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load notification settings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    // Client-side guard mirrors the backend rule so the user gets immediate
    // feedback — but the backend remains authoritative and re-validates.
    if (draft.credentialsRef && !/^(env:|secret:|vault:)/.test(draft.credentialsRef)) {
      setRefError('Enter a reference like env:SMS_API_KEY — never paste the secret itself.');
      return;
    }
    setSaving(true);
    setRefError('');
    try {
      await notificationConfigAPI.upsert(draft);
      toast.success('Provider configuration saved.');
      setDraft({ channel: 'sms', provider: '', senderNumber: '', credentialsRef: '', isActive: false });
      load();
    } catch (err) {
      setRefError(apiErrorMessage(err, 'Could not save the configuration.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState message="Loading notification settings…" />;
  if (!canManage) return <EmptyState icon="🔒" title="Not available" subtitle="Restricted to administrators." />;

  return (
    <div className="page notification-providers">
      <header className="page-header"><h1>Notification Providers</h1></header>

      <div className="alert alert-info" role="note">
        Message delivery uses a configurable provider. Enter credentials as a
        <strong> reference</strong> (e.g. <code>env:SMS_API_KEY</code>), never the secret itself.
      </div>

      {/* ── Current configs ────────────────────────────────────────────────── */}
      {configs.length === 0 ? (
        <EmptyState icon="✉️" title="No providers configured" subtitle="Add one below." />
      ) : (
        <ul className="config-list">
          {configs.map((c) => (
            <li key={c.id} className="config-row">
              <span className="channel">{c.channel.toUpperCase()}</span>
              <span>{c.provider || <em>no provider</em>}</span>
              <span>{c.senderNumber || '—'}</span>
              <Badge status={c.credentialConfigured ? 'configured' : 'not-configured'} />
              <Badge status={c.isActive ? 'active' : 'inactive'} />
              {/* Delivery capability is ADR-05 pending. */}
              {status[c.channel] && (
                <span className="delivery-status" title={status[c.channel].deliveryStatus}>
                  {status[c.channel].deliveryValidated ? 'Delivery verified' : 'Delivery pending'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── Add / update ───────────────────────────────────────────────────── */}
      <section className="config-form">
        <h2>Add or update a provider</h2>
        {refError && <div className="alert alert-error" role="alert">{refError}</div>}
        <FormGroup label="Channel">
          <select value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
            {CHANNELS.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Provider name">
          <input value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
            placeholder="e.g. your SMS gateway" />
        </FormGroup>
        <FormGroup label="Sender number">
          <input value={draft.senderNumber} onChange={(e) => setDraft({ ...draft, senderNumber: e.target.value })}
            placeholder="+91…" />
        </FormGroup>
        <FormGroup label="Credentials reference">
          <input value={draft.credentialsRef} onChange={(e) => setDraft({ ...draft, credentialsRef: e.target.value })}
            placeholder="env:SMS_API_KEY" />
        </FormGroup>
        <FormGroup label="">
          <label className="checkbox">
            <input type="checkbox" checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
            Active
          </label>
        </FormGroup>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save provider'}
        </button>
      </section>
    </div>
  );
}
