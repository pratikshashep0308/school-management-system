// frontend/src/pages/FMS/Dashboard.jsx
//
// The financial dashboard — SCR-04..07.
//
// ─── ONE CALL ────────────────────────────────────────────────────────────────
// GET /fms/dashboard returns the KPIs, the cash position AND all five charts
// together. Six separate requests would be six chances for the screen to show a
// half-consistent picture assembled from different moments.
//
// ─── THE CACHE IS VISIBLE ────────────────────────────────────────────────────
// The backend caches this for 60 seconds and reports { cached, ageSeconds }.
// That is shown, always. A cache the reader cannot detect is the only kind that
// misleads — it would show yesterday's cash position to somebody about to act
// on it today.
//
// ─── EMPTY IS NOT BROKEN ─────────────────────────────────────────────────────
// Until the Chart of Accounts exists (open item O3) every figure here is zero,
// and the backend says why. Rendering zeros plus that explanation is correct
// behaviour, not a defect to paper over with sample data.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

import fmsAPI from '../../utils/fmsAPI';
import { useFms } from '../../context/FmsContext';
import FmsLayout from '../../components/fms/FmsLayout';
import Money, { formatPaise } from '../../components/fms/Money';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend,
);

/** Charts receive rupees; the API speaks paise. Convert once, here. */
const toRupees = (paise) => (Number(paise) || 0) / 100;

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
    tooltip: {
      callbacks: {
        // Tooltips show the same formatting as the rest of the screen.
        label: (c) => `${c.dataset.label || c.label}: ${formatPaise(Math.round(c.parsed.y ?? c.parsed) * 100)}`,
      },
    },
  },
  scales: {
    y: { ticks: { callback: (v) => `₹${new Intl.NumberFormat('en-IN').format(v)}` } },
  },
};

const KpiCard = ({ label, paise, tone = 'default', sub }) => {
  const border = tone === 'danger'
    ? 'border-[var(--danger)]'
    : tone === 'good'
      ? 'border-[var(--mod)]'
      : 'border-[var(--border)]';

  return (
    <div className={`rounded-lg border ${border} bg-white p-4`}>
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-xl font-semibold">
        <Money paise={paise} />
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
};

const Panel = ({ title, note, children, className = '' }) => (
  <div className={`rounded-lg border border-[var(--border)] bg-white p-4 ${className}`}>
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold text-[var(--ink)]">{title}</h2>
      {note && <span className="text-xs text-[var(--muted)]">{note}</span>}
    </div>
    {children}
  </div>
);

const Dashboard = () => {
  const { financialYear } = useFms();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fmsAPI.getDashboard(opts.live ? { live: 'true' } : {});
      setData(res?.data?.data ?? res?.data ?? null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    try { await fmsAPI.refreshDashboard(); } catch (_) { /* clearing is best-effort */ }
    load({ live: true });
  };

  const kpis = data?.kpis;
  const cash = data?.cashPosition;
  const charts = data?.charts || {};

  const cacheNote = data?.cached
    ? `from cache · ${data.maxAgeSeconds ?? 0}s old`
    : 'live';

  return (
    <FmsLayout
      title="Financial Dashboard"
      actions={
        <>
          <span className="self-center text-xs text-[var(--muted)]">{cacheNote}</span>
          <button
            type="button"
            onClick={refresh}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--canvas)]"
          >
            Refresh
          </button>
        </>
      }
    >
      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      {loading && !data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-white" />
          ))}
        </div>
      )}

      {/* The backend says when there is nothing to show, and why. */}
      {kpis?.empty && (
        <EmptyState
          title="No financial data yet"
          reason={kpis.note}
          hint="Once the Chart of Accounts is set up, figures will appear here automatically."
        />
      )}

      {kpis && !kpis.empty && (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="Income" paise={kpis.income} />
            <KpiCard label="Expenditure" paise={kpis.expenditure} />
            {/* "Surplus", never "Profit" — a school is not trying to make one. */}
            <KpiCard
              label={kpis.isDeficit ? 'Deficit' : 'Surplus'}
              paise={kpis.surplus}
              tone={kpis.isDeficit ? 'danger' : 'good'}
            />
            <KpiCard label="Cash & Bank" paise={kpis.cashPosition} />
            <KpiCard label="Payables" paise={kpis.payables} />
          </section>

          {!kpis.ledgerBalanced && (
            <div className="mt-4 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
              The ledger does not balance for this period. Every posting goes through a
              single service that rejects unbalanced entries, so this means something
              wrote to the ledger outside it. Check before relying on any figure here.
            </div>
          )}

          <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel title="Where the money is" className="lg:col-span-1">
              {cash?.empty ? (
                <p className="text-sm text-[var(--muted)]">{cash.note}</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <tbody>
                      {(cash?.accounts || []).map((a) => (
                        <tr key={a.accountCode} className="border-b border-[var(--border)] last:border-0">
                          <td className="py-2">
                            <div>{a.accountName}</div>
                            <div className="text-xs text-[var(--muted)]">
                              {a.accountCode} · {a.type}
                            </div>
                          </td>
                          <td className="py-2 text-right"><Money paise={a.balance} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="mt-3 flex justify-between border-t border-[var(--border)] pt-3 text-sm">
                    <span className="text-[var(--muted)]">Cash {formatPaise(cash?.cash)}</span>
                    <span className="text-[var(--muted)]">Bank {formatPaise(cash?.bank)}</span>
                    <span className="font-semibold"><Money paise={cash?.total} /></span>
                  </div>

                  {/* A negative CASH balance is physically impossible — somebody
                      cannot have taken more notes out of a tin than were in it.
                      A negative BANK balance is merely an overdraft. */}
                  {(cash?.negativeCash || []).length > 0 && (
                    <div className="mt-3 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                      {cash.negativeCash.length} cash account(s) show a negative balance.
                      Physical cash cannot be negative — this indicates a mis-posting.
                    </div>
                  )}
                </>
              )}
            </Panel>

            <Panel title="Income vs Expenditure" className="lg:col-span-2">
              <div className="h-64">
                <Bar
                  options={chartOptions}
                  data={{
                    labels: (charts.incomeVsExpense?.series || []).map((m) => m.month),
                    datasets: [
                      {
                        label: 'Income',
                        data: (charts.incomeVsExpense?.series || []).map((m) => toRupees(m.income)),
                        backgroundColor: 'rgba(37,99,235,0.75)',
                      },
                      {
                        label: 'Expenditure',
                        data: (charts.incomeVsExpense?.series || []).map((m) => toRupees(m.expenditure)),
                        backgroundColor: 'rgba(220,38,38,0.7)',
                      },
                    ],
                  }}
                />
              </div>
            </Panel>
          </section>

          <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel title="Fee collection trend">
              <div className="h-56">
                <Line
                  options={chartOptions}
                  data={{
                    labels: (charts.collectionTrend?.series || []).map((m) => m.month),
                    datasets: [{
                      label: 'Collected',
                      data: (charts.collectionTrend?.series || []).map((m) => toRupees(m.amount)),
                      borderColor: 'rgb(22,163,74)',
                      backgroundColor: 'rgba(22,163,74,0.15)',
                      tension: 0.3,
                      fill: true,
                    }],
                  }}
                />
              </div>
            </Panel>

            <Panel title="Expenditure by head">
              <div className="h-56">
                <Doughnut
                  options={{ ...chartOptions, scales: undefined }}
                  data={{
                    labels: (charts.expenseByCategory?.categories || []).map((c) => c.accountName),
                    datasets: [{
                      data: (charts.expenseByCategory?.categories || []).map((c) => toRupees(c.amount)),
                      backgroundColor: [
                        '#2563eb', '#dc2626', '#16a34a', '#d97706',
                        '#7c3aed', '#0891b2', '#be123c', '#4d7c0f',
                      ],
                    }],
                  }}
                />
              </div>
            </Panel>

            <Panel
              title="Budget utilisation"
              note={charts.budgetUtilisation?.budgetCount === 0 ? 'no active budgets' : undefined}
            >
              {charts.budgetUtilisation?.budgetCount === 0 ? (
                /* "No budgets" and "0% used" are different statements, and only
                   one of them is true. */
                <p className="py-8 text-center text-sm text-[var(--muted)]">
                  {charts.budgetUtilisation.note}
                </p>
              ) : (
                <div className="space-y-3">
                  {(charts.budgetUtilisation?.budgets || []).slice(0, 6).map((b) => (
                    <div key={b.accountCode}>
                      <div className="flex justify-between text-xs">
                        <span className="truncate">{b.accountName}</span>
                        <span className={b.isOverBudget ? 'text-[var(--danger)]' : ''}>
                          {Math.round((b.utilisation || 0) * 100)}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--canvas)]">
                        <div
                          className={`h-full ${b.isOverBudget ? 'bg-[var(--danger)]' : 'bg-[var(--mod)]'}`}
                          style={{ width: `${Math.min(100, (b.utilisation || 0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </section>

          <section className="mt-4">
            <Panel title="Spending by department" note={charts.departmentSpending?.note}>
              {(charts.departmentSpending?.departments || []).length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--muted)]">
                  No paid or closed expenses in this period.
                </p>
              ) : (
                <div className="h-56">
                  <Bar
                    options={{ ...chartOptions, indexAxis: 'y' }}
                    data={{
                      labels: (charts.departmentSpending?.departments || []).map((d) => d.department),
                      datasets: [{
                        label: 'Spent',
                        data: (charts.departmentSpending?.departments || []).map((d) => toRupees(d.amount)),
                        backgroundColor: 'rgba(217,119,6,0.75)',
                      }],
                    }}
                  />
                </div>
              )}
            </Panel>
          </section>

          <p className="mt-6 text-xs text-[var(--muted)]">
            {financialYear ? `Financial year ${financialYear}. ` : ''}
            Every figure is computed from the general ledger at request time.
          </p>
        </>
      )}
    </FmsLayout>
  );
};

export default Dashboard;