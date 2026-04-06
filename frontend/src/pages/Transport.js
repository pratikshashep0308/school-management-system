// frontend/src/pages/Transport.js
// Entry point for /transport route.
// Admin/transportManager → AdminTransport (buses, routes, assignments, live tracking, fees)
// Student/Parent → StudentTransportView (own transport details only)

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Lazy-load sub-pages to keep initial bundle small
const AdminTransport    = React.lazy(() => import('./transport/AdminTransport'));
const LiveTracking      = React.lazy(() => import('./transport/LiveTracking'));
const TransportFees     = React.lazy(() => import('./transport/TransportFees'));
const StudentTransportView = React.lazy(() => import('./transport/StudentTransportView'));

const ADMIN_ROLES = ['superAdmin', 'schoolAdmin', 'transportManager'];
const ADMIN_TABS  = [
  { id: 'manage',   icon: '🚌', label: 'Manage'   },
  { id: 'tracking', icon: '🗺️', label: 'Live Map' },
  { id: 'fees',     icon: '💰', label: 'Fees'     },
];

export default function Transport() {
  const { user } = useAuth();
  const isPortalUser = user?.role === 'student' || user?.role === 'parent';
  const isAdmin      = ADMIN_ROLES.includes(user?.role);

  // Students and parents see their own view
  if (isPortalUser) {
    return (
      <React.Suspense fallback={<PageLoader />}>
        <StudentTransportView />
      </React.Suspense>
    );
  }

  // Admin/staff see the tabbed admin panel
  if (isAdmin) {
    return <AdminPanel />;
  }

  // Other roles (teacher, accountant, etc.) see a read-only summary
  return (
    <React.Suspense fallback={<PageLoader />}>
      <AdminTransport />
    </React.Suspense>
  );
}

function AdminPanel() {
  const [tab, setTab] = useState('manage');

  return (
    <div>
      {/* Tab bar — sits at the very top of the transport section */}
      <div className="border-b border-gray-200 bg-white px-6">
        <nav className="flex gap-1 overflow-x-auto">
          {ADMIN_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}>
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <React.Suspense fallback={<PageLoader />}>
        {tab === 'manage'   && <AdminTransport />}
        {tab === 'tracking' && <LiveTracking />}
        {tab === 'fees'     && <TransportFees />}
      </React.Suspense>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="p-8">
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-gray-200 rounded-xl w-1/3" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-gray-200 rounded-2xl" />)}
        </div>
        <div className="h-64 bg-gray-200 rounded-2xl" />
      </div>
    </div>
  );
}
