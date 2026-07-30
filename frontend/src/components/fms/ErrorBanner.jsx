// frontend/src/components/fms/ErrorBanner.jsx
//
// Renders the backend's error envelope:
//   { success: false, error: { code, message, details, hint } }
//
// ─── NEVER SUBSTITUTE A GENERIC MESSAGE ──────────────────────────────────────
// The FMS backend was built to refuse rather than guess, and its refusals are
// written to explain:
//
//   "Fee type 'Excursion Fee' has no account mapping"
//   "Out of order: the next step is 'principal'"
//   "Financial year 2025-26 is locked; posting is not allowed"
//   "the settlement is 15000 paise short of the 750000 cleared — name an
//    expense account for the charges"
//
// Replacing any of those with "Something went wrong" throws away the only part
// that tells the user what to do next.

import React from 'react';

/** Pull the error out of an axios failure, whatever shape it arrived in. */
export function extractError(err) {
  if (!err) return null;

  const payload = err.response?.data?.error || err.response?.data || null;

  return {
    code: payload?.code || err.code || null,
    message: payload?.message || err.message || 'The request failed.',
    hint: payload?.hint || null,
    details: payload?.details || null,
    status: err.response?.status || null,
  };
}

const ErrorBanner = ({ error, onRetry, className = '' }) => {
  const e = error?.message ? error : extractError(error);
  if (!e) return null;

  const details = e.details && typeof e.details === 'object' ? e.details : null;

  return (
    <div
      role="alert"
      className={`rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* The backend's message, exactly as written. */}
          <p className="text-sm font-medium text-[var(--danger)]">{e.message}</p>

          {e.hint && (
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink)]">{e.hint}</p>
          )}

          {details && (
            <dl className="mt-3 space-y-1 text-xs">
              {Object.entries(details).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="shrink-0 font-medium text-[var(--muted)]">{k}</dt>
                  <dd className="min-w-0 break-words text-[var(--ink)]">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {e.code && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]">
              {e.code}{e.status ? ` · ${e.status}` : ''}
            </p>
          )}
        </div>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-md border border-[var(--danger)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] hover:bg-white"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorBanner;