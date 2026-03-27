// frontend/src/pages/Fees.jsx
import React, { useState, useEffect, useCallback } from 'react';
import feeAPI from '../utils/feeAPI';
import FeesClassSummary  from '../components/fees/FeesClassSummary';
import FeesStudentTable  from '../components/fees/FeesStudentTable';
import PaymentModal      from '../components/fees/PaymentModal';
import ReceiptModal      from '../components/fees/ReceiptModal';
import SetupLedgerModal  from '../components/fees/SetupLedgerModal';
import SummaryCards      from '../components/fees/SummaryCards';

export default function Fees() {
  const [tab, setTab]               = useState('dashboard'); // 'dashboard' | 'students'
  const [summary, setSummary]       = useState(null);
  const [classSummary, setClass]    = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Modals
  const [payModal, setPayModal]         = useState(false);
  const [receiptModal, setReceiptModal] = useState(null);   // receipt number string
  const [setupModal, setSetupModal]     = useState(false);
  const [selectedStudent, setSelected] = useState(null);   // for pre-filling payment modal

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, c] = await Promise.all([
        feeAPI.getSummary(),
        feeAPI.getClassSummary()
      ]);
      setSummary(s.data.data);
      setClass(c.data.data.classes);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load fees data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const handlePaymentSuccess = (receiptNumber) => {
    setPayModal(false);
    setSelected(null);
    loadDashboard();
    setReceiptModal(receiptNumber);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">

      {/* ── PAGE HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Fees Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track collections, manage payments & generate receipts</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSetupModal(true)}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
          >
            ⚙ Setup Class Ledger
          </button>
          <button
            onClick={() => { setSelected(null); setPayModal(true); }}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            + Record Payment
          </button>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="flex gap-1 mb-6 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
        {[
          { id: 'dashboard', label: '📊 Dashboard' },
          { id: 'students',  label: '👨‍🎓 Students' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {tab === 'dashboard' && (
            <div className="space-y-6">
              <SummaryCards summary={summary} />
              <FeesClassSummary
                data={classSummary}
                onPayClick={(student) => { setSelected(student); setPayModal(true); }}
              />
            </div>
          )}

          {tab === 'students' && (
            <FeesStudentTable
              onPayClick={(student) => { setSelected(student); setPayModal(true); }}
              onReceiptClick={(rn) => setReceiptModal(rn)}
            />
          )}
        </>
      )}

      {/* ── MODALS ── */}
      {payModal && (
        <PaymentModal
          student={selectedStudent}
          onClose={() => { setPayModal(false); setSelected(null); }}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {receiptModal && (
        <ReceiptModal
          receiptNumber={receiptModal}
          onClose={() => setReceiptModal(null)}
        />
      )}

      {setupModal && (
        <SetupLedgerModal
          onClose={() => setSetupModal(false)}
          onSuccess={() => { setSetupModal(false); loadDashboard(); }}
        />
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-slate-200 rounded-2xl" />
        ))}
      </div>
      <div className="h-64 bg-slate-200 rounded-2xl" />
    </div>
  );
}
