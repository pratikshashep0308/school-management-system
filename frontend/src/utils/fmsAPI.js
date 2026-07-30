// frontend/src/utils/fmsAPI.js
//
// Financial Management System — API client.
//
// Every path here was read from backend/fms/routes/*.js, not inferred. The
// backend is complete and unchanging (179 endpoints, 1,577 passing tests), so
// this file is a faithful map of it rather than a guess at it.
//
// Uses the shared axios instance from './api' — that already handles the base
// URL, the JWT header and 401 redirects. A second instance would duplicate all
// three and drift from the first.
//
// MONEY: every amount crossing this boundary is an INTEGER NUMBER OF PAISE.
// 12345678 means ₹1,23,456.78. Render it through <Money>, never by hand.

import api from './api';

const fmsAPI = {
  // ── Plugin status ──────────────────────────────────────────────────────────
  // Returns { enabled, version, currency, financialYear }. When the FMS is
  // switched off this is the only endpoint that responds.
  getStatus: () => api.get('/fms/status'),

  // ── Dashboard (SCR-04..07) ─────────────────────────────────────────────────
  // getDashboard returns KPIs, cash position AND all five charts in one call.
  // Prefer it over the individual endpoints.
  getDashboard:     (params = {}) => api.get('/fms/dashboard', { params }),
  getKpis:          (params = {}) => api.get('/fms/dashboard/kpis', { params }),
  getCashPosition:  (params = {}) => api.get('/fms/dashboard/cash-position', { params }),
  getCharts:        (params = {}) => api.get('/fms/dashboard/charts', { params }),
  refreshDashboard: ()            => api.post('/fms/dashboard/refresh'),

  // ── Chart of accounts (SCR-08/09/10) ───────────────────────────────────────
  getAccountGroupTree: ()                => api.get('/fms/accounts/groups/tree'),
  getAccountGroups:    (params = {})     => api.get('/fms/accounts/groups', { params }),
  getAccountGroup:     (id)              => api.get(`/fms/accounts/groups/${id}`),
  createAccountGroup:  (body)            => api.post('/fms/accounts/groups', body),
  updateAccountGroup:  (id, body)        => api.patch(`/fms/accounts/groups/${id}`, body),
  // Deactivates rather than deletes — history is kept.
  deactivateAccountGroup: (id)           => api.delete(`/fms/accounts/groups/${id}`),

  getAccounts:      (params = {})        => api.get('/fms/accounts', { params }),
  getAccount:       (id)                 => api.get(`/fms/accounts/${id}`),
  getAccountBalance:(id, params = {})    => api.get(`/fms/accounts/${id}/balance`, { params }),
  createAccount:    (body)               => api.post('/fms/accounts', body),
  updateAccount:    (id, body)           => api.patch(`/fms/accounts/${id}`, body),
  // Deactivates rather than deletes.
  deactivateAccount:(id)                 => api.delete(`/fms/accounts/${id}`),

  // ── General ledger (SCR-46) ────────────────────────────────────────────────
  getLedger:       (params = {})     => api.get('/fms/ledger', { params }),
  getTrialBalance: (params = {})     => api.get('/fms/ledger/trial-balance', { params }),
  getAccountLedger:(id, params = {}) => api.get(`/fms/ledger/accounts/${id}`, { params }),
  getVoucher:      (id)              => api.get(`/fms/ledger/vouchers/${id}`),

  // ── Journal vouchers (SCR-47/48/49) ────────────────────────────────────────
  getJournals:   (params = {}) => api.get('/fms/journal', { params }),
  getJournal:    (id)          => api.get(`/fms/journal/${id}`),
  createJournal: (body)        => api.post('/fms/journal', body),
  updateJournal: (id, body)    => api.patch(`/fms/journal/${id}`, body),
  submitJournal: (id, body)    => api.post(`/fms/journal/${id}/submit`, body),
  approveJournal:(id, body)    => api.post(`/fms/journal/${id}/approve`, body),
  rejectJournal: (id, body)    => api.post(`/fms/journal/${id}/reject`, body),
  cancelJournal: (id, body)    => api.post(`/fms/journal/${id}/cancel`, body),
  // Posts a reversing voucher — the original is never edited or removed.
  reverseJournal:(id, body)    => api.post(`/fms/journal/${id}/reverse`, body),

  // ── Cash & bank book (SCR-50/51) ───────────────────────────────────────────
  // bookType is 'cash' or 'bank'.
  getBook:        (bookType, params = {})     => api.get(`/fms/books/${bookType}`, { params }),
  getBookDay:     (bookType, date, params={}) => api.get(`/fms/books/${bookType}/day/${date}`, { params }),
  // A variance requires a reason and opens the closing as 'disputed'.
  closeDay:       (body)                      => api.post('/fms/books/close', body),
  getClosings:    (params = {})               => api.get('/fms/books/closings/list', { params }),
  // Must be a DIFFERENT person from the one who counted.
  verifyClosing:  (id, body)                  => api.post(`/fms/books/closings/${id}/verify`, body),

  // ── Income / receipts (SCR-11/12/13) ───────────────────────────────────────
  getIncomeVouchers: (params = {}) => api.get('/fms/income', { params }),
  getIncomeVoucher:  (id)          => api.get(`/fms/income/${id}`),
  getReceipt:        (id)          => api.get(`/fms/income/${id}/receipt`),
  recordIncome:      (body)        => api.post('/fms/income', body),
  // Receipts are cancelled by reversal, never deleted.
  cancelIncome:      (id, body)    => api.post(`/fms/income/${id}/cancel`, body),

  // ── Expenses (SCR-14/15/16/17) ─────────────────────────────────────────────
  getExpenses:      (params = {}) => api.get('/fms/expenses', { params }),
  getExpense:       (id)          => api.get(`/fms/expenses/${id}`),
  // outcome is ok | warning | exceeded | notChecked.
  // notChecked means NO BUDGET EXISTED — it is not a pass.
  getBudgetCheck:   (id)          => api.get(`/fms/expenses/${id}/budget-check`),
  createExpense:    (body)        => api.post('/fms/expenses', body),
  updateExpense:    (id, body)    => api.patch(`/fms/expenses/${id}`, body),
  submitExpense:    (id, body)    => api.post(`/fms/expenses/${id}/submit`, body),
  cancelExpense:    (id, body)    => api.post(`/fms/expenses/${id}/cancel`, body),

  // ── Approvals (SCR-18/19) ──────────────────────────────────────────────────
  // The backend enforces thresholds, step order and separation of duties.
  // Call these and render the response — including a 403 with its reason.
  getApprovalInbox:    (params = {})     => api.get('/fms/approvals/inbox', { params }),
  getApprovalHistory:  (expenseId)       => api.get(`/fms/approvals/history/${expenseId}`),
  getApprovalPosition: (expenseId)       => api.get(`/fms/approvals/position/${expenseId}`),
  verifyExpense:       (expenseId, body) => api.post(`/fms/approvals/${expenseId}/verify`, body),
  approveExpense:      (expenseId, body) => api.post(`/fms/approvals/${expenseId}/approve`, body),
  rejectExpense:       (expenseId, body) => api.post(`/fms/approvals/${expenseId}/reject`, body),
  returnExpense:       (expenseId, body) => api.post(`/fms/approvals/${expenseId}/return`, body),
  getApprovalMatrix:   ()                => api.get('/fms/approvals/matrix'),
  // A new matrix version SUPERSEDES the old one; past approvals keep their rules.
  updateApprovalMatrix:(body)            => api.put('/fms/approvals/matrix', body),
  previewApprovalChain:(body)            => api.post('/fms/approvals/matrix/preview', body),
  getApprovalLog:      (params = {})     => api.get('/fms/approvals/log', { params }),

  // ── Payments (SCR-20/21) ───────────────────────────────────────────────────
  getPaymentQueue: (params = {})     => api.get('/fms/payments/queue', { params }),
  getPayments:     (params = {})     => api.get('/fms/payments', { params }),
  getPayment:      (id)              => api.get(`/fms/payments/${id}`),
  getChequePrint:  (id)              => api.get(`/fms/payments/${id}/cheque`),
  payExpense:      (expenseId, body) => api.post(`/fms/payments/${expenseId}/pay`, body),
  failPayment:     (id, body)        => api.post(`/fms/payments/${id}/fail`, body),
  closeExpense:    (expenseId, body) => api.post(`/fms/payments/expense/${expenseId}/close`, body),

  // ── Budgets (SCR-22/23/24/25) ──────────────────────────────────────────────
  getBudgets:        (params = {}) => api.get('/fms/budgets', { params }),
  // consumed = actual + committed. Show all three; the arithmetic matters.
  getBudgetVsActual: (params = {}) => api.get('/fms/budgets/vs-actual', { params }),
  getBudget:         (id)          => api.get(`/fms/budgets/${id}`),
  checkAvailability: (params = {}) => api.get('/fms/budgets/check/availability', { params }),
  createBudget:      (body)        => api.post('/fms/budgets', body),
  updateBudget:      (id, body)    => api.patch(`/fms/budgets/${id}`, body),
  activateBudget:    (id, body)    => api.post(`/fms/budgets/${id}/activate`, body),
  // A revision PRESERVES the original amount — show both.
  reviseBudget:      (id, body)    => api.post(`/fms/budgets/${id}/revise`, body),
  closeBudget:       (id, body)    => api.post(`/fms/budgets/${id}/close`, body),

  // ── Vendors (SCR-26..29) ───────────────────────────────────────────────────
  getVendors:        (params = {})  => api.get('/fms/vendors', { params }),
  // GSTIN is checksum-verified; PAN is format-only (its checksum is unpublished).
  validateTaxId:     (body)         => api.post('/fms/vendors/validate-tax-id', body),
  getExpiringDocs:   (params = {})  => api.get('/fms/vendors/documents/expiring', { params }),
  getVendor:         (id)           => api.get(`/fms/vendors/${id}`),
  getVendorHistory:  (id, params={})=> api.get(`/fms/vendors/${id}/history`, { params }),
  createVendor:      (body)         => api.post('/fms/vendors', body),
  updateVendor:      (id, body)     => api.patch(`/fms/vendors/${id}`, body),
  setVendorStatus:   (id, body)     => api.post(`/fms/vendors/${id}/status`, body),
  addVendorDocument: (id, body)     => api.post(`/fms/vendors/${id}/documents`, body),
  // Cannot be verified by whoever uploaded it.
  verifyVendorDoc:   (docId, body)  => api.post(`/fms/vendors/documents/${docId}/verify`, body),

  // ── Purchase (SCR-30..35) ──────────────────────────────────────────────────
  getPurchaseRequests: (params = {}) => api.get('/fms/purchase/requests', { params }),
  getPurchaseRequest:  (id)          => api.get(`/fms/purchase/requests/${id}`),
  createPurchaseRequest:(body)       => api.post('/fms/purchase/requests', body),
  addQuotations:       (id, body)    => api.post(`/fms/purchase/requests/${id}/quotations`, body),
  // Choosing a dearer quotation requires a written reason.
  selectQuotation:     (id, body)    => api.post(`/fms/purchase/requests/${id}/select-quotation`, body),
  approvePurchase:     (id, body)    => api.post(`/fms/purchase/requests/${id}/approve`, body),
  cancelPurchase:      (id, body)    => api.post(`/fms/purchase/requests/${id}/cancel`, body),
  closePurchase:       (id, body)    => api.post(`/fms/purchase/requests/${id}/close`, body),

  getPurchaseOrders:   (params = {}) => api.get('/fms/purchase/orders', { params }),
  getPurchaseOrder:    (id)          => api.get(`/fms/purchase/orders/${id}`),
  issuePurchaseOrder:  (id, body)    => api.post(`/fms/purchase/requests/${id}/issue-po`, body),

  getGoodsReceipts:    (params = {}) => api.get('/fms/purchase/receipts', { params }),
  // Rejected goods do not count as accepted.
  receiveGoods:        (id, body)    => api.post(`/fms/purchase/orders/${id}/receive`, body),

  getPurchaseInvoices: (params = {}) => api.get('/fms/purchase/invoices', { params }),
  getPurchaseInvoice:  (id)          => api.get(`/fms/purchase/invoices/${id}`),
  addPurchaseInvoice:  (id, body)    => api.post(`/fms/purchase/orders/${id}/invoices`, body),
  // Three-way match: PO vs goods received vs invoice.
  getThreeWayMatch:    (id)          => api.get(`/fms/purchase/invoices/${id}/match`),
  verifyPurchaseInvoice:(id, body)   => api.post(`/fms/purchase/invoices/${id}/verify`, body),
  payPurchaseInvoice:  (id, body)    => api.post(`/fms/purchase/invoices/${id}/pay`, body),

  // ── Banking & reconciliation (SCR-38..42) ──────────────────────────────────
  getBankAccounts:     (params = {})     => api.get('/fms/banking/accounts', { params }),
  getBankAccount:      (id)              => api.get(`/fms/banking/accounts/${id}`),
  createBankAccount:   (body)            => api.post('/fms/banking/accounts', body),
  recordBankMovement:  (body)            => api.post('/fms/banking/movements', body),
  transferFunds:       (body)            => api.post('/fms/banking/transfers', body),
  importStatement:     (id, body)        => api.post(`/fms/banking/accounts/${id}/import`, body),
  getBankTransactions: (id, params = {}) => api.get(`/fms/banking/accounts/${id}/transactions`, { params }),
  autoMatch:           (id, body)        => api.post(`/fms/banking/accounts/${id}/auto-match`, body),
  matchTransaction:    (id, body)        => api.post(`/fms/banking/transactions/${id}/match`, body),
  unmatchTransaction:  (id, body)        => api.post(`/fms/banking/transactions/${id}/unmatch`, body),
  getReconciliation:   (id, params = {}) => api.get(`/fms/banking/accounts/${id}/reconciliation`, { params }),
  // Refuses unless the balancing equation resolves to zero.
  reconcile:           (id, body)        => api.post(`/fms/banking/accounts/${id}/reconcile`, body),
  getReconciliations:  (params = {})     => api.get('/fms/banking/reconciliations', { params }),
  reopenReconciliation:(id, body)        => api.post(`/fms/banking/reconciliations/${id}/reopen`, body),

  // ── Petty cash (SCR-43/44/45) ──────────────────────────────────────────────
  getPettyCashFloats:  (params = {})     => api.get('/fms/petty-cash/floats', { params }),
  getPettyCashFloat:   (id)              => api.get(`/fms/petty-cash/floats/${id}`),
  createPettyCashFloat:(body)            => api.post('/fms/petty-cash/floats', body),
  setPettyCashStatus:  (id, body)        => api.post(`/fms/petty-cash/floats/${id}/status`, body),
  getPettyCashBook:    (id, params = {}) => api.get(`/fms/petty-cash/floats/${id}/book`, { params }),
  getPettyCashTxns:    (params = {})     => api.get('/fms/petty-cash/transactions', { params }),
  addPettyCashTxn:     (id, body)        => api.post(`/fms/petty-cash/floats/${id}/transactions`, body),
  cancelPettyCashTxn:  (id, body)        => api.post(`/fms/petty-cash/transactions/${id}/cancel`, body),
  postClosingVariance: (closingId, body) => api.post(`/fms/petty-cash/closings/${closingId}/variance`, body),

  // ── Reports (SCR-55..60) ───────────────────────────────────────────────────
  // Every report accepts ?format=pdf|excel and returns a file.
  getReportCatalogue:  (params = {}) => api.get('/fms/reports', { params }),
  reportTrialBalance:  (params = {}) => api.get('/fms/reports/trial-balance', { params }),
  reportBalanceSheet:  (params = {}) => api.get('/fms/reports/balance-sheet', { params }),
  reportProfitAndLoss: (params = {}) => api.get('/fms/reports/profit-and-loss', { params }),
  reportIncomeExpenditure:(params={}) => api.get('/fms/reports/income-expenditure', { params }),
  // A movement statement, NOT a statutory cash flow — the response says so.
  reportCashFlow:      (params = {}) => api.get('/fms/reports/cash-flow', { params }),
  reportDepartmentExpense:(params={}) => api.get('/fms/reports/department-expense', { params }),
  reportFeeCollection: (params = {}) => api.get('/fms/reports/fee-collection', { params }),
  reportBudgetVsActual:(params = {}) => api.get('/fms/reports/budget-vs-actual', { params }),
  reportCashBook:      (params = {}) => api.get('/fms/reports/cash-book', { params }),
  reportBankBook:      (params = {}) => api.get('/fms/reports/bank-book', { params }),
  // Three identities that must hold before statements are circulated.
  verifyReports:       (params = {}) => api.get('/fms/reports/verify', { params }),

  /**
   * Download a report as PDF or Excel.
   * Returns a blob; the caller triggers the browser download.
   */
  downloadReport: (path, params = {}, format = 'pdf') =>
    api.get(`/fms/reports/${path}`, {
      params: { ...params, format },
      responseType: 'blob',
    }),

  // ── Financial years (SCR-67) ───────────────────────────────────────────────
  getFinancialYears: (params = {}) => api.get('/fms/financial-years', { params }),
  getFinancialYear:  (id)          => api.get(`/fms/financial-years/${id}`),
  // Call this BEFORE offering to close — it reports blockers and warnings.
  getYearReadiness:  (id)          => api.get(`/fms/financial-years/${id}/readiness`),
  closeYear:         (id, body)    => api.post(`/fms/financial-years/${id}/close`, body),
  // IRREVERSIBLE. Requires confirmYearCode matching the year code exactly.
  lockYear:          (id, body)    => api.post(`/fms/financial-years/${id}/lock`, body),
  // Only a CLOSED year can be reopened. A LOCKED year cannot, ever.
  reopenYear:        (id, body)    => api.post(`/fms/financial-years/${id}/reopen`, body),

  // ── Integrations (SMS → FMS) ───────────────────────────────────────────────
  // ALWAYS dry-run first: { dryRun: true } reports what WOULD post, writing nothing.
  getFeeIngestStatus:   ()             => api.get('/fms/integrations/fees/status'),
  syncFees:             (body = {})    => api.post('/fms/integrations/fees/sync', body),
  getUnclassifiedFees:  (params = {})  => api.get('/fms/integrations/fees/unclassified', { params }),

  // D1 — receipts the books hold that the school system no longer has. Read-only:
  // it reports, it never reverses.
  getFeeReconciliation: (params = {})  => api.get('/fms/integrations/fees/reconciliation', { params }),

  getPayrollStatus:     ()             => api.get('/fms/integrations/payroll/status'),
  syncPayroll:          (body = {})    => api.post('/fms/integrations/payroll/sync', body),
  getPayrollPostings:   (params = {})  => api.get('/fms/integrations/payroll/postings', { params }),

  // B1 — deductions the payroll ingest cannot break out (ESIC, professional tax).
  getPayrollMappingReport:()           => api.get('/fms/integrations/payroll/mapping-report'),

  // A2 — registration fees collected at admission.
  getAdmissionIngestStatus:()          => api.get('/fms/integrations/admissions/status'),
  syncAdmissions:       (body = {})    => api.post('/fms/integrations/admissions/sync', body),

  getExpenseIngestStatus:()            => api.get('/fms/integrations/expenses/status'),
  syncExpenses:         (body = {})    => api.post('/fms/integrations/expenses/sync', body),

  // Online/UPI receipts sit in clearing (1202) until settled against a bank credit.
  // Nothing else in the system surfaces this — it is a weekly manual task.
  getSettlementStatus:  ()             => api.get('/fms/integrations/settlements/status'),
  getPendingSettlements:(params = {})  => api.get('/fms/integrations/settlements/pending', { params }),
  // A SUGGESTION — it refuses to guess when nothing fits.
  suggestSettlement:    (body)         => api.post('/fms/integrations/settlements/suggest', body),
  createSettlement:     (body)         => api.post('/fms/integrations/settlements', body),
  reverseSettlement:    (id, body)     => api.post(`/fms/integrations/settlements/${id}/reverse`, body),

  // Fee type → income account. Required before fee ingest can run.
  // Which accounts can actually be fed, and which will read zero forever.
  getChartCoverage:     ()             => api.get('/fms/integrations/chart-coverage'),
  // Every integration check in one call.
  getDiagnostics:       ()             => api.get('/fms/integrations/diagnostics'),

  // What each import run did — when, who, which endpoints, what came back.
  getSyncLogs:          (params = {})  => api.get('/fms/integrations/sync-logs', { params }),
  getSyncLog:           (id)           => api.get(`/fms/integrations/sync-logs/${id}`),

  getMappings:          (params = {})  => api.get('/fms/integrations/mappings', { params }),
  upsertMapping:        (body)         => api.put('/fms/integrations/mappings', body),
  deactivateMapping:    (id)           => api.delete(`/fms/integrations/mappings/${id}`),

  // ── Audit trail (SCR-61) ───────────────────────────────────────────────────
  getAuditTrail:   (params = {})          => api.get('/fms/audit', { params }),
  getAuditActions: ()                     => api.get('/fms/audit/actions'),
  // "What happened to this document" — the question people actually ask.
  getEntityHistory:(entity, id)           => api.get(`/fms/audit/history/${entity}/${id}`),
  getAuditActivity:(params = {})          => api.get('/fms/audit/activity', { params }),
  getAuditRetention:()                    => api.get('/fms/audit/retention'),
  exportAudit:     (params = {})          => api.get('/fms/audit/export', { params }),
  getAuditEntry:   (id)                   => api.get(`/fms/audit/${id}`),

  // ── Notifications (SCR-64) ─────────────────────────────────────────────────
  getNotifications:      (params = {}) => api.get('/fms/notifications', { params }),
  markNotificationsRead: (ids)         => api.post('/fms/notifications/read', { ids }),
  getNotificationEvents: ()            => api.get('/fms/notifications/events'),
  // A preference can NARROW an event's channels; it can never widen them.
  setNotificationPrefs:  (body)        => api.put('/fms/notifications/preferences', body),
  getNotificationPrefs:  ()            => api.get('/fms/notifications/preferences'),
  getNotificationLog:    (params = {}) => api.get('/fms/notifications/log', { params }),
  getNotificationStats:  (params = {}) => api.get('/fms/notifications/stats', { params }),

  // ── Multi-branch (SCR-66) ──────────────────────────────────────────────────
  // Consolidation requires a multiBranch role assignment; a single-branch user
  // is refused. Inter-branch entries are REPORTED, never silently netted.
  getBranches:            (params = {}) => api.get('/fms/branches', { params }),
  getConsolidatedTrialBalance:(params={}) => api.get('/fms/branches/trial-balance', { params }),
  getConsolidatedStatements:(params={}) => api.get('/fms/branches/statements', { params }),
  getInterBranchEntries:  (params = {}) => api.get('/fms/branches/inter-branch', { params }),
};

export default fmsAPI;