// frontend/src/components/fms/DataTable.jsx
//
// A table that consumes the FMS API's standard envelope:
//   { success, data: [...], pagination: { page, limit, total, pages } }
//
// Handles the three states every screen must handle — loading, empty, error —
// so no screen has to reinvent them and forget one.
//
// Money columns pass through <Money>, which is the only place paise become
// rupees.

import React from 'react';
import Money from './Money';
import EmptyState from './EmptyState';
import ErrorBanner from './ErrorBanner';

/**
 * columns: [{
 *   key, label, money?, align?, width?, render?(row) => node
 * }]
 */
const DataTable = ({
  columns = [],
  rows = [],
  pagination = null,
  onPageChange,
  loading = false,
  error = null,
  emptyTitle = 'Nothing to show',
  emptyReason,
  emptyHint,
  emptyAction,
  onRowClick,
  onRetry,
  className = '',
}) => {
  if (error) return <ErrorBanner error={error} onRetry={onRetry} />;

  if (loading) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-white">
        <div className="animate-pulse space-y-3 p-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-4 rounded bg-[var(--canvas)]" />
          ))}
        </div>
      </div>
    );
  }

  if (!rows.length) {
    // emptyReason is the BACKEND's explanation — see EmptyState.
    return (
      <EmptyState
        title={emptyTitle}
        reason={emptyReason}
        hint={emptyHint}
        action={emptyAction}
      />
    );
  }

  const align = (c) => (c.align || (c.money ? 'right' : 'left'));

  return (
    <div className={className}>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--canvas)]">
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={`px-4 py-2.5 text-${align(c)} text-xs font-semibold uppercase tracking-wide text-[var(--muted)]`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row._id || row.id || i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-[var(--border)] last:border-0 ${
                  onRowClick ? 'cursor-pointer hover:bg-[var(--canvas)]' : ''
                }`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2.5 text-${align(c)} text-[var(--ink)]`}>
                    {c.render
                      ? c.render(row)
                      : c.money
                        ? <Money paise={row[c.key]} />
                        : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total > (pagination.limit || 0) && (
        <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted)]">
          <span>
            {(pagination.page - 1) * pagination.limit + 1}
            –
            {Math.min(pagination.page * pagination.limit, pagination.total)}
            {' of '}
            {pagination.total}
          </span>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange?.(pagination.page - 1)}
              className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.page * pagination.limit >= pagination.total}
              onClick={() => onPageChange?.(pagination.page + 1)}
              className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;