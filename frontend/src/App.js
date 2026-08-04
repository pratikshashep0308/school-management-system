// frontend/src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

// ── Financial Management System (plugin) ────────────────────────────────────
// The FMS is toggleable. FmsProvider resolves whether it is switched on and
// what finance role the signed-in person holds; FmsGuard hides every FMS route
// when it is off or when they have no finance role.
import { FmsProvider } from './context/FmsContext';
import FmsGuard from './components/fms/FmsGuard';

import FmsDashboard from './pages/FMS/Dashboard';
import FmsTrialBalance from './pages/FMS/TrialBalance';
import FmsChartOfAccounts from './pages/FMS/ChartOfAccounts';
import FmsApprovalInbox from './pages/FMS/ApprovalInbox';
import FmsApprovalAction from './pages/FMS/ApprovalAction';
import FmsGeneralLedger from './pages/FMS/GeneralLedger';
import FmsJournalVouchers from './pages/FMS/JournalVouchers';
import FmsCashBankBook from './pages/FMS/CashBankBook';
import FmsReports from './pages/FMS/Reports';
import FmsSettlements from './pages/FMS/Settlements';
import FmsBudgets from './pages/FMS/Budgets';
import FmsBankReconciliation from './pages/FMS/BankReconciliation';
import FmsFinancialYears from './pages/FMS/FinancialYears';
import FmsAuditTrail from './pages/FMS/AuditTrail';
import FmsIngestConsole from './pages/FMS/IngestConsole';
import FmsDiagnostics from './pages/FMS/Diagnostics';
import FmsAccessControl from './pages/FMS/AccessControl';
import FmsExpenseCategories from './pages/FMS/ExpenseCategories';
import FmsExpenses from './pages/FMS/Expenses';
import FmsBankAccounts from './pages/FMS/BankAccounts';
import FmsApprovalHistory from './pages/FMS/ApprovalHistory';
import FmsMappings from './pages/FMS/Mappings';
import FmsPayments from './pages/FMS/Payments';
import FmsPettyCash from './pages/FMS/PettyCash';
import { ThemeProvider } from './context/ThemeContext';

// Pages — Auth & Landing
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';
import Login            from './pages/Login';

// Pages — Role Dashboards
import AdminDashboard   from './pages/AdminDashboard';
import StudentDashboard from './pages/StudentDashboard';
import ParentDashboard  from './pages/ParentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';

// Pages — Admin modules
import Homework      from './pages/Homework';
import BehaviourNotes from './pages/BehaviourNotes';
import Settings      from './pages/Settings';
import StudentIDCards    from './pages/StudentIDCards';
import Students     from './pages/Students';
import Teachers     from './pages/Teachers';
import Classes      from './pages/Classes';
import Subjects     from './pages/Subjects';
import AccessControl from './pages/AccessControl';
import Attendance   from './pages/Attendance';
import Salary from './pages/Salary';
import Exams        from './pages/Exams';
import Fees         from './pages/Fees';
import Library      from './pages/Library';
import Transport    from './pages/Transport';
import Timetable    from './pages/Timetable';
import Assignments  from './pages/Assignments';
import Notifications from './pages/Notifications';
import Profile      from './pages/Profile';
import Admissions   from './pages/Admissions';
import Expenses     from './pages/Expenses';
import Meetings     from './pages/Meetings';

// Pages — Report Module
import ReportsDashboard from './pages/Reports/ReportsDashboard';
import CreateReport     from './pages/Reports/CreateReport';
import ReportViewer     from './pages/Reports/ReportViewer';

import Layout from './components/common/Layout';

// The finance module supplies its own chrome through FmsLayout, so this is a
// bare outlet. Its only job is to be a route parent that is NOT <Layout />.
//
// Declared here rather than up among the imports: a statement between import
// statements trips the import/first lint rule for every import that follows,
// which fails the production build.
const FmsShell = () => <Outlet />;

// ── ProtectedRoute: redirect to login if not authenticated ────────────────────
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 24 }}>
      ⏳
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// ── Smart Dashboard: render role-appropriate dashboard ───────────────────────
function SmartDashboard() {
  const { user } = useAuth();
  if (user?.role === 'student') return <StudentDashboard />;
  if (user?.role === 'parent')  return <ParentDashboard />;
  if (user?.role === 'teacher') return <TeacherDashboard />;
  return <AdminDashboard />;
}

// ── AdminRoute: staff roles only ──────────────────────────────────────────────
const ADMIN_ROLES = ['superAdmin', 'schoolAdmin', 'teacher', 'accountant', 'librarian', 'transportManager'];

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (!ADMIN_ROLES.includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

// ── ReportRoute: roles that can access reports ────────────────────────────────
const REPORT_ROLES = ['superAdmin', 'schoolAdmin', 'teacher', 'accountant', 'librarian', 'transportManager'];

function ReportRoute({ children }) {
  const { user } = useAuth();
  if (!REPORT_ROLES.includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <FmsProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3200,
              style: {
                borderRadius: '12px',
                background: 'var(--paper)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)',
                fontSize: '14px',
                fontWeight: 500,
                padding: '10px 14px',
                maxWidth: '380px',
              },
              success: { iconTheme: { primary: '#4a7c59', secondary: '#ffffff' } },
              error:   { iconTheme: { primary: '#dc2626', secondary: '#ffffff' } },
            }}
          />
          <Routes>
            {/* Public */}
            <Route path="/" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/login" element={<Login />}   />

            {/* Protected — all authenticated roles */}

            {/* ── Finance ──────────────────────────────────────────────────
                Deliberately OUTSIDE <Layout />. The finance module opens in its
                own window and renders no school-system chrome: no SMS sidebar,
                no SMS header. Two reasons, and only one of them is cosmetic.

                The real one is that the finance session lives in sessionStorage,
                which is per-window. Closing the finance window ends the session
                — the books lock the moment somebody shuts the window, without
                anybody having to remember to lock them. Sharing a tab with the
                school system would keep that session alive for as long as the
                user stayed signed in to anything.

                The cosmetic one is that two nested sidebars left the finance
                screens about half the width they needed. */}
            <Route path="/fms" element={<ProtectedRoute><FmsShell /></ProtectedRoute>}>
              <Route index element={<FmsGuard><FmsDashboard /></FmsGuard>} />
              <Route path="reports/trial-balance" element={<FmsGuard><FmsTrialBalance /></FmsGuard>} />
              <Route path="accounts" element={<FmsGuard><FmsChartOfAccounts /></FmsGuard>} />
              <Route path="approvals/history" element={<FmsGuard><FmsApprovalHistory /></FmsGuard>} />
              <Route path="approvals" element={<FmsGuard><FmsApprovalInbox /></FmsGuard>} />
              <Route path="approvals/:id" element={<FmsGuard><FmsApprovalAction /></FmsGuard>} />
              <Route path="ledger" element={<FmsGuard><FmsGeneralLedger /></FmsGuard>} />
              <Route path="journal" element={<FmsGuard><FmsJournalVouchers /></FmsGuard>} />
              <Route path="books" element={<FmsGuard><FmsCashBankBook /></FmsGuard>} />
              <Route path="reports" element={<FmsGuard><FmsReports /></FmsGuard>} />
              <Route path="reports/:report" element={<FmsGuard><FmsReports /></FmsGuard>} />
              <Route path="banking/settlements" element={<FmsGuard><FmsSettlements /></FmsGuard>} />
              <Route path="budgets" element={<FmsGuard><FmsBudgets /></FmsGuard>} />
              <Route path="payments" element={<FmsGuard><FmsPayments /></FmsGuard>} />
              <Route path="petty-cash" element={<FmsGuard><FmsPettyCash /></FmsGuard>} />
              <Route path="banking/reconcile" element={<FmsGuard><FmsBankReconciliation /></FmsGuard>} />
              <Route path="financial-years" element={<FmsGuard><FmsFinancialYears /></FmsGuard>} />
              <Route path="audit" element={<FmsGuard><FmsAuditTrail /></FmsGuard>} />
              <Route path="integrations" element={<FmsGuard><FmsIngestConsole /></FmsGuard>} />
              <Route path="diagnostics" element={<FmsGuard><FmsDiagnostics /></FmsGuard>} />
              <Route path="access" element={<FmsGuard><FmsAccessControl /></FmsGuard>} />
              <Route path="expenses" element={<FmsGuard><FmsExpenses /></FmsGuard>} />
              <Route path="bank-accounts" element={<FmsGuard><FmsBankAccounts /></FmsGuard>} />
              <Route path="expense-categories" element={<FmsGuard><FmsExpenseCategories /></FmsGuard>} />
              <Route path="settings/mappings" element={<FmsGuard><FmsMappings /></FmsGuard>} />
            </Route>

            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>

              {/* Smart dashboard — renders based on role */}
              <Route path="dashboard" element={<SmartDashboard />} />


              {/* Profile — all roles */}
              <Route path="profile" element={<Profile />} />

              {/* ── Admin module routes ── */}
              <Route path="students"      element={<AdminRoute><Students /></AdminRoute>} />
              <Route path="teachers"      element={<AdminRoute><Teachers /></AdminRoute>} />
              <Route path="classes"       element={<AdminRoute><Classes /></AdminRoute>} />
              <Route path="subjects"      element={<AdminRoute><Subjects /></AdminRoute>} />
              <Route path="access-control" element={<AdminRoute><AccessControl /></AdminRoute>} />
              <Route path="attendance"    element={<AdminRoute><Attendance /></AdminRoute>} />
              <Route path="salary"       element={<AdminRoute><Salary /></AdminRoute>} />
              <Route path="exams"         element={<AdminRoute><Exams /></AdminRoute>} />
              <Route path="fees"          element={<AdminRoute><Fees /></AdminRoute>} />
              <Route path="library"       element={<AdminRoute><Library /></AdminRoute>} />
              <Route path="transport"     element={<AdminRoute><Transport /></AdminRoute>} />
              <Route path="timetable"     element={<AdminRoute><Timetable /></AdminRoute>} />
              <Route path="assignments"   element={<AdminRoute><Assignments /></AdminRoute>} />
              <Route path="notifications" element={<AdminRoute><Notifications /></AdminRoute>} />
              <Route path="admissions"    element={<AdminRoute><Admissions /></AdminRoute>} />
              <Route path="expenses"     element={<AdminRoute><Expenses /></AdminRoute>} />
              <Route path="meetings"     element={<ProtectedRoute><Meetings /></ProtectedRoute>} />

              <Route path="homework"      element={<ProtectedRoute><Homework /></ProtectedRoute>} />
              <Route path="behaviour-notes" element={<ProtectedRoute><BehaviourNotes /></ProtectedRoute>} />
              <Route path="settings"   element={<AdminRoute><Settings /></AdminRoute>} />
              <Route path="id-cards"   element={<AdminRoute><StudentIDCards /></AdminRoute>} />

              {/* ── Report Module routes ── */}
              <Route path="reports"          element={<ReportRoute><ReportsDashboard /></ReportRoute>} />
              <Route path="reports/create"   element={<ReportRoute><CreateReport /></ReportRoute>} />
              <Route path="reports/run"      element={<ReportRoute><ReportViewer /></ReportRoute>} />
              <Route path="reports/edit/:id" element={<ReportRoute><CreateReport /></ReportRoute>} />

            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </FmsProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}