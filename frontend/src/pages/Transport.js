// frontend/src/pages/Transport.js
// Entry point for /transport route.
// Admin/transportManager → AdminTransport (buses, routes, assignments, live tracking, fees)
// Student/Parent → StudentTransportView (own transport details only)

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Lazy-load sub-pages to keep initial bundle small
const AdminTransport       = React.lazy(() => import('./transport/AdminTransport'));
const LiveTracking         = React.lazy(() => import('./transport/LiveTracking'));
const StudentTransportView = React.lazy(() => import('./transport/StudentTransportView'));

const ADMIN_ROLES = ['superAdmin', 'schoolAdmin', 'transportManager'];
const ADMIN_TABS  = [
  { id: 'manage',   icon: '🚌', label: 'Manage'   },
  { id: 'tracking', icon: '🗺️', label: 'Live Map' },
];

export default function Transport() {
  const { user } = useAuth();
  const isPortalUser = user?.role === 'student' || user?.role === 'parent';
  const isAdmin      = ADMIN_ROLES.includes(user?.role);

  if (isPortalUser) {
    return (
      <React.Suspense fallback={<PageLoader />}>
        <StudentTransportView />
      </React.Suspense>
    );
  }

  if (isAdmin) {
    return <AdminPanel />;
  }

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
      {/* Tab bar */}
      <div style={{
        borderBottom: '1px solid #E5E7EB',
        background: '#fff',
        paddingLeft: 24,
        paddingRight: 24,
      }}>
        <nav style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
          {ADMIN_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '16px 20px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                borderBottom: tab === t.id ? '2px solid #2563EB' : '2px solid transparent',
                background: 'transparent',
                color: tab === t.id ? '#2563EB' : '#6B7280',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
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
      </React.Suspense>
    </div>
  );
}

function PageLoader() {
  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ height: 40, background: '#E5E7EB', borderRadius: 12, width: '33%' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 112, background: '#E5E7EB', borderRadius: 16 }} />
          ))}
        </div>
        <div style={{ height: 256, background: '#E5E7EB', borderRadius: 16 }} />
      </div>
    </div>
  );
}