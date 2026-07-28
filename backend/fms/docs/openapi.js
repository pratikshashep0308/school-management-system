// backend/fms/docs/openapi.js
//
// OpenAPI 3.0.3 spec for the FMS — **implemented endpoints only**.
//
// ─── WHY THIS IS NOT THE PACKAGE'S openapi.yaml ──────────────────────────────
// The design specification (02_API_Specification/openapi.yaml) describes 97
// paths across the whole FMS. Almost none are built yet. Serving that as
// "living documentation" would document endpoints that return 404, which is
// worse than no documentation — it invites the frontend to code against
// something that does not exist.
//
// This file documents what is ACTUALLY implemented. Each phase adds its
// endpoints here as they are built, so the two converge by the end of Phase 6.
// Until then this is the honest one, and the contract test checks real
// responses against it.
//
// It is JS rather than YAML because the SMS has no YAML parser, and adding one
// to serve a static document is not a trade worth making.

const pkg = require('../config');

const envelope = (dataSchema) => ({
  type: 'object',
  required: ['success', 'data'],
  properties: {
    success: { type: 'boolean', enum: [true] },
    message: { type: 'string' },
    data: dataSchema,
  },
});

const spec = {
  openapi: '3.0.3',

  info: {
    title: 'The Future Step School ERP — FMS Plugin API',
    version: pkg.version,
    description:
      'Financial Management System plugin.\n\n' +
      'Mounted at `/api/fms` only when `FMS_ENABLED=true`. Every route below the ' +
      'public health endpoints passes the FMS deny-by-default authorization ' +
      'wrapper (`fms_roleassignments` + the FMS permission matrix), **not** the ' +
      "SMS `checkPermission`, which fails open by design.\n\n" +
      '**Money** is integer paise everywhere (₹1,234.56 → `123456`). ' +
      '**IDs** are 24-character MongoDB ObjectId strings. ' +
      '**Branch scope** is always derived from the JWT and is never a client parameter.\n\n' +
      'This document covers implemented endpoints only. See ' +
      '`docs/fms-spec/02_API_Specification/openapi.yaml` for the full design target.',
  },

  servers: [
    { url: '/api/fms', description: 'Current host' },
  ],

  tags: [
    { name: 'Plugin', description: 'Status and health. No authentication.' },
    { name: 'Financial Year', description: 'Accounting periods.' },
    { name: 'Chart of Accounts', description: 'Account groups and ledger heads (SRS M2).' },
    { name: 'General Ledger', description: 'Read-only. Every route is a GET — entries are written only by LedgerPostingService (SRS M11).' },
    { name: 'Journal Voucher', description: 'Manual journal entries with an approval step (SRS M12).' },
    { name: 'Cash & Bank Book', description: 'Derived entirely from ledger postings. Daily closing records the physical count (SRS M13/M14).' },
    { name: 'Income', description: 'Money received. Posts immediately — the cash is already in hand (SRS M3).' },
    { name: 'Expenses', description: 'Requests to spend. No ledger posting until payment (SRS M4).' },
    { name: 'Approvals', description: 'Threshold-routed approval workflow with separation of duties (SRS M5, BPMN WF1).' },
    { name: 'Payments', description: 'Paying approved expenses. Posts to the ledger; paying twice is impossible (BPMN WF3).' },
    { name: 'Budgets', description: 'Spending allowances. Actuals are derived from postings, never stored (SRS M6).' },
  ],

  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },

    schemas: {
      Error: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', enum: [false] },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                description: 'Stable machine-readable code. Branch on this, not on message.',
                example: 'VALIDATION_FAILED',
              },
              message: { type: 'string' },
              details: { type: 'object' },
            },
          },
        },
      },

      Pagination: {
        type: 'object',
        required: ['page', 'limit', 'total', 'pages'],
        properties: {
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 200 },
          total: { type: 'integer', minimum: 0 },
          pages: { type: 'integer', minimum: 0 },
          hasNext: { type: 'boolean' },
          hasPrev: { type: 'boolean' },
        },
      },

      PluginStatus: {
        type: 'object',
        required: ['enabled', 'version', 'currency', 'financialYear'],
        properties: {
          enabled: { type: 'boolean' },
          version: { type: 'string', example: '0.1.0' },
          currency: { type: 'string', example: 'INR' },
          financialYear: { type: 'string', example: 'FY2026-27' },
        },
      },

      PluginHealth: {
        type: 'object',
        required: ['status', 'version', 'database', 'replicaSet', 'transactionsAvailable'],
        properties: {
          status: { type: 'string', enum: ['OK', 'DEGRADED'] },
          version: { type: 'string' },
          database: { type: 'string', example: 'connected' },
          replicaSet: { type: 'string', example: 'rs:rs0' },
          transactionsAvailable: {
            type: 'boolean',
            description:
              'False on a standalone mongod. No ledger posting can succeed while ' +
              'this is false, so the endpoint returns 503.',
          },
          ingestEnabled: { type: 'boolean' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },

      BudgetPosition: {
        type: 'object',
        required: ['effectiveBudget', 'actual', 'committed', 'consumed', 'available'],
        properties: {
          budgetAmount: { type: 'integer', description: 'The ORIGINAL allocation, never overwritten' },
          revisedBudget: { type: 'integer', nullable: true },
          effectiveBudget: { type: 'integer', description: 'The revision if there is one, else the original' },
          actual: {
            type: 'integer',
            description: 'Σ(debit − credit) from the LEDGER. Derived, never stored. A reversal reduces it.',
          },
          actualEntries: { type: 'integer' },
          committed: {
            type: 'integer',
            description:
              'Approved but NOT yet paid. Excludes paid expenses, which are already ' +
              'in `actual` — counting both would exhaust the budget at half its real spend.',
          },
          committedRequests: { type: 'integer' },
          consumed: { type: 'integer', description: 'actual + committed, with no overlap' },
          available: { type: 'integer', description: 'effectiveBudget − consumed' },
          utilisation: { type: 'number', description: 'consumed / effectiveBudget' },
          isOverBudget: { type: 'boolean' },
          isNearLimit: { type: 'boolean' },
        },
      },

      Budget: {
        type: 'object',
        required: ['_id', 'account', 'budgetAmount', 'budgetStatus'],
        properties: {
          _id: { type: 'string' },
          financialYear: { type: 'string' },
          account: { type: 'string', description: 'Must be an expense-type, postable head' },
          accountCode: { type: 'string' },
          accountName: { type: 'string' },
          department: { type: 'object', properties: { name: { type: 'string', nullable: true }, ref: { type: 'string', nullable: true } } },
          budgetAmount: { type: 'integer', description: 'Integer PAISE' },
          revisedBudget: { type: 'integer', nullable: true },
          warnThreshold: { type: 'number', default: 0.9, description: 'Fraction at which a warning is raised' },
          overBudgetPolicy: {
            type: 'string', enum: ['block', 'warn'],
            description: "'block' refuses unless acknowledged; 'warn' allows and flags",
          },
          budgetStatus: { type: 'string', enum: ['draft', 'active', 'revised', 'closed'] },
          revisions: { type: 'array', items: { type: 'object' }, description: 'Append-only, each with a reason' },
          position: { $ref: '#/components/schemas/BudgetPosition' },
        },
      },

      PaymentVoucher: {
        type: 'object',
        required: ['_id', 'paymentNumber', 'paymentDate', 'amount', 'paymentMode', 'paymentStatus'],
        properties: {
          _id: { type: 'string' },
          paymentNumber: { type: 'string', example: 'PMT-2026-27-00001', description: 'Also the GL voucher number' },
          paymentDate: { type: 'string', format: 'date-time' },
          expenseRequest: { type: 'string' },
          expenseNumber: { type: 'string' },
          amount: { type: 'integer', description: 'Integer PAISE. The expense total including GST.' },
          paymentMode: { type: 'string', enum: ['cash','cheque','neft','rtgs','upi','dd'] },
          instrumentNumber: { type: 'string', description: 'Required for cheque and DD' },
          bankReference: { type: 'string', description: 'NEFT/RTGS/UPI reference' },
          debitAccount: { type: 'string', description: 'The expense head' },
          debitAccountCode: { type: 'string' },
          creditAccount: { type: 'string', description: 'Cash or bank the money came from' },
          creditAccountCode: { type: 'string' },
          payeeName: { type: 'string' },
          paymentStatus: { type: 'string', enum: ['pending','processing','paid','failed'] },
          isLive: {
            type: 'boolean',
            description:
              'A unique partial index on { school, expenseRequest } where isLive ' +
              'is true makes double payment impossible at the database, not merely ' +
              'checked in code. A failed payment sets it false, freeing the expense ' +
              'for a retry.',
          },
          voucher: { type: 'string' },
          reversalVoucher: { type: 'string', nullable: true },
          failureReason: { type: 'string' },
        },
      },

      ApprovalTier: {
        type: 'object',
        required: ['minAmount', 'approvers'],
        properties: {
          tier: { type: 'integer' },
          minAmount: { type: 'integer', description: 'Integer PAISE, inclusive' },
          maxAmount: { type: 'integer', nullable: true, description: 'Inclusive. null = open-ended (highest tier only)' },
          approvers: { type: 'array', items: { type: 'string', enum: ['deptHead','principal','chairman','trustee'] } },
          label: { type: 'string' },
        },
      },

      ApprovalPosition: {
        type: 'object',
        required: ['tier', 'approvers', 'chain', 'next'],
        properties: {
          tier: { type: 'integer' },
          approvers: { type: 'array', items: { type: 'string' } },
          chain: { type: 'array', items: { type: 'object', properties: { step: { type: 'string' }, roles: { type: 'array', items: { type: 'string' } }, completed: { type: 'boolean' }, toStatus: { type: 'string' } } } },
          completedSteps: { type: 'array', items: { type: 'string' } },
          next: {
            type: 'object',
            description:
              'Who must act now. This resolves the state ambiguity: a tier-3 ' +
              'expense at chairmanApproved is complete, while a tier-4 one is ' +
              'waiting for a trustee.',
            properties: {
              done: { type: 'boolean' },
              step: { type: 'string', nullable: true },
              roles: { type: 'array', items: { type: 'string' } },
              isFinal: { type: 'boolean' },
              remaining: { type: 'array', items: { type: 'string' } },
              reason: { type: 'string' },
            },
          },
        },
      },

      ApprovalRecord: {
        type: 'object',
        required: ['_id', 'step', 'action', 'actor', 'fromStatus', 'toStatus'],
        properties: {
          _id: { type: 'string' },
          expenseRequest: { type: 'string' },
          expenseNumber: { type: 'string' },
          step: { type: 'string', enum: ['accounts','deptHead','principal','chairman','trustee'] },
          action: { type: 'string', enum: ['verify','approve','reject','return'] },
          actor: { type: 'string' },
          actorEmail: { type: 'string' },
          actorRole: { type: 'string' },
          fromStatus: { type: 'string' },
          toStatus: { type: 'string' },
          amountAtAction: { type: 'integer', description: 'Snapshot — stays meaningful if the request is later edited' },
          tierAtAction: { type: 'integer' },
          comment: { type: 'string' },
          actedAt: { type: 'string', format: 'date-time' },
        },
      },

      BudgetCheck: {
        type: 'object',
        required: ['checked', 'outcome'],
        properties: {
          checked: {
            type: 'boolean',
            description:
              'FALSE means nobody looked — NOT that it passed. Returning "ok" ' +
              'when no budget exists would let every request pass a control that ' +
              'was never applied.',
          },
          outcome: { type: 'string', enum: ['ok', 'warning', 'exceeded', 'notChecked'] },
          reason: { type: 'string' },
          budgetAmount: { type: 'integer', description: 'Integer PAISE' },
          consumed: { type: 'integer', description: 'Committed spend: everything not draft/rejected/cancelled' },
          available: { type: 'integer' },
          checkedAt: { type: 'string', format: 'date-time' },
        },
      },

      ExpenseRequest: {
        type: 'object',
        required: ['_id', 'expenseNumber', 'requestDate', 'purpose', 'totalAmount', 'expenseStatus'],
        properties: {
          _id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          expenseNumber: { type: 'string', example: 'EXP-2026-27-00001' },
          requestDate: { type: 'string', format: 'date-time' },
          department: { type: 'object', properties: { name: { type: 'string' }, ref: { type: 'string', nullable: true, description: 'fms_departments — P4.x' } } },
          requestedBy: { type: 'string' },
          requestedByName: { type: 'string' },
          vendor: { type: 'object', properties: { name: { type: 'string' }, ref: { type: 'string', nullable: true, description: 'fms_vendors — P4.2' }, gstin: { type: 'string' }, pan: { type: 'string' } } },
          category: { type: 'string' },
          subCategory: { type: 'string' },
          purpose: { type: 'string' },
          remarks: { type: 'string' },
          budgetHead: { type: 'string', description: 'Must be an expense-type, postable account' },
          budgetHeadCode: { type: 'string' },
          budgetHeadName: { type: 'string' },
          baseAmount: { type: 'integer', description: 'Integer PAISE' },
          gstType: { type: 'string', enum: ['none', 'intra', 'inter'], description: 'intra = CGST+SGST, inter = IGST. Both together is rejected.' },
          gstRate: { type: 'number', description: 'Percent, e.g. 18' },
          cgst: { type: 'integer' },
          sgst: { type: 'integer' },
          igst: { type: 'integer' },
          gstAmount: { type: 'integer', description: 'Derived: cgst + sgst + igst' },
          otherTaxAmount: { type: 'integer' },
          totalAmount: { type: 'integer', description: 'Must equal base + GST + other tax, enforced at the schema layer' },
          paymentMode: { type: 'string', enum: ['cash', 'cheque', 'neft', 'rtgs', 'upi', 'dd'] },
          dueDate: { type: 'string', format: 'date-time' },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
          budgetCheck: { $ref: '#/components/schemas/BudgetCheck' },
          expenseStatus: {
            type: 'string',
            enum: ['draft','submitted','accountsVerified','principalApproved','chairmanApproved','paymentPending','paymentCompleted','closed','rejected','returned','cancelled'],
            description: 'P3.2 covers draft → submitted. The approval chain is P3.3.',
          },
          attachments: { type: 'array', items: { type: 'object' } },
          workflow: { type: 'array', items: { type: 'object' } },
        },
      },

      IncomeVoucher: {
        type: 'object',
        required: ['_id', 'receiptNumber', 'receiptDate', 'category', 'amount', 'paymentMode', 'payerName', 'incomeStatus'],
        properties: {
          _id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          receiptNumber: {
            type: 'string', example: 'INC-2026-27-00001',
            description:
              'Also the GL voucher number. One sequence, not two — a separate ' +
              'receipt book that can gap or duplicate against the ledger is a ' +
              'reconciliation problem nobody notices for months.',
          },
          receiptDate: { type: 'string', format: 'date-time' },
          category: {
            type: 'string',
            enum: ['studentFee','admissionFee','donation','csr','rent','interest','sales','event','miscellaneous'],
          },
          amount: { type: 'integer', description: 'Integer PAISE (₹1,234.56 → 123456)' },
          paymentMode: { type: 'string', enum: ['cash','cheque','bank','upi','online','dd'] },
          instrumentNumber: { type: 'string', description: 'Required for cheque and DD' },
          bankName: { type: 'string' },
          debitAccount: { type: 'string', description: 'Cash or bank account the money landed in' },
          debitAccountCode: { type: 'string' },
          creditAccount: { type: 'string', description: 'Income head. Must be an income-type account.' },
          creditAccountCode: { type: 'string' },
          creditAccountName: { type: 'string' },
          payerType: { type: 'string', enum: ['student','organisation','individual','other'] },
          payerName: { type: 'string', description: 'Denormalised — a receipt stays readable if the SMS record is deleted' },
          smsStudentId: { type: 'string', nullable: true, description: 'Opaque SMS id; no join' },
          admissionNumber: { type: 'string' },
          className: { type: 'string' },
          narration: { type: 'string' },
          incomeStatus: {
            type: 'string', enum: ['posted','cancelled'],
            description: 'There is no draft. Money received is a fact, not a proposal.',
          },
          voucher: { type: 'string' },
          reversalVoucher: { type: 'string', nullable: true },
          cancellationReason: { type: 'string' },
          printCount: { type: 'integer' },
        },
      },

      BookDay: {
        type: 'object',
        required: ['date', 'openingBalance', 'receipts', 'payments', 'closingBalance'],
        properties: {
          date: { type: 'string', format: 'date' },
          openingBalance: { type: 'integer', description: 'Integer PAISE. Equals the previous day\'s closing.' },
          receipts: { type: 'integer', description: 'Money in (ledger debits on the account)' },
          payments: { type: 'integer', description: 'Money out (ledger credits)' },
          closingBalance: { type: 'integer', description: 'opening + receipts − payments' },
          entries: { type: 'integer' },
          closing: {
            type: 'object', nullable: true,
            description: 'Present only if the day has been closed',
            properties: {
              status: { type: 'string', enum: ['open','closed','verified','disputed'] },
              physicalCount: { type: 'integer', nullable: true },
              variance: { type: 'integer' },
              verified: { type: 'boolean' },
            },
          },
        },
      },

      DailyClosing: {
        type: 'object',
        required: ['_id', 'closingDate', 'bookType', 'systemClosing', 'closingStatus'],
        properties: {
          _id: { type: 'string' },
          account: { type: 'string' },
          accountCode: { type: 'string' },
          accountName: { type: 'string' },
          bookType: { type: 'string', enum: ['cash', 'bank'] },
          closingDate: { type: 'string', format: 'date-time' },
          openingBalance: { type: 'integer' },
          totalReceipts: { type: 'integer' },
          totalPayments: { type: 'integer' },
          systemClosing: {
            type: 'integer',
            description:
              'What the ledger said at the moment of closing. A snapshot for ' +
              'investigating variances, never the source of truth for a balance.',
          },
          physicalCount: { type: 'integer', nullable: true, description: 'Required for cash' },
          variance: { type: 'integer', description: 'physical − system. Derived, never supplied.' },
          varianceReason: { type: 'string' },
          closingStatus: {
            type: 'string',
            enum: ['open', 'closed', 'verified', 'disputed'],
            description: 'A non-zero variance opens as `disputed` until verified.',
          },
          closedBy: { type: 'string' },
          verifiedBy: { type: 'string', nullable: true },
          entryCount: { type: 'integer' },
        },
      },

      JournalLine: {
        type: 'object',
        required: ['account'],
        properties: {
          _id: { type: 'string' },
          account: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          accountCode: { type: 'string' },
          accountName: { type: 'string' },
          debit: { type: 'integer', description: 'Integer PAISE. Exactly one of debit/credit non-zero.' },
          credit: { type: 'integer', description: 'Integer PAISE' },
          narration: { type: 'string' },
          partyType: { type: 'string', nullable: true, enum: ['vendor','student','teacher','other', null] },
          party: { type: 'string', nullable: true },
          partyName: { type: 'string' },
        },
      },

      JournalVoucher: {
        type: 'object',
        required: ['_id', 'jvDate', 'narration', 'lines', 'jvStatus'],
        properties: {
          _id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          financialYear: { type: 'string' },
          jvDate: { type: 'string', format: 'date-time' },
          narration: { type: 'string' },
          reference: { type: 'string' },
          lines: { type: 'array', items: { $ref: '#/components/schemas/JournalLine' } },
          totalDebit: { type: 'integer', description: 'Integer PAISE' },
          totalCredit: { type: 'integer', description: 'Integer PAISE' },
          jvStatus: {
            type: 'string',
            enum: ['draft', 'submitted', 'posted', 'rejected', 'cancelled', 'reversed'],
            description:
              'draft → submitted → posted → reversed. reject returns it to the ' +
              'author; cancel is terminal and pre-posting only. A posted voucher ' +
              'is immutable.',
          },
          voucher: { type: 'string', nullable: true, description: 'fms_vouchers._id once posted' },
          voucherNumber: { type: 'string', nullable: true, example: 'JV-2026-27-00001' },
          attachments: { type: 'array', items: { type: 'object' } },
          workflow: {
            type: 'array',
            description: 'Append-only trail: who did what, when, with comments',
            items: { type: 'object' },
          },
          rejectionReason: { type: 'string' },
          reversalReason: { type: 'string' },
        },
      },

      LedgerEntry: {
        type: 'object',
        required: ['_id', 'entryDate', 'accountCode', 'debit', 'credit'],
        properties: {
          _id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          entryDate: { type: 'string', format: 'date-time' },
          voucher: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          voucherNumber: { type: 'string', example: 'INC-2026-27-00001' },
          voucherType: { type: 'string', enum: ['income', 'payment', 'receipt', 'journal'] },
          account: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          accountCode: { type: 'string', description: 'Snapshot at posting time — survives a later rename' },
          accountName: { type: 'string', description: 'Snapshot at posting time' },
          debit: { type: 'integer', description: 'Integer PAISE. Exactly one of debit/credit is non-zero.' },
          credit: { type: 'integer', description: 'Integer PAISE' },
          narration: { type: 'string' },
          partyType: { type: 'string', nullable: true, enum: ['vendor', 'student', 'teacher', 'other', null] },
          party: { type: 'string', nullable: true },
          partyName: { type: 'string', description: 'Denormalised — survives deletion of the SMS record' },
          isReversal: { type: 'boolean' },
          status: { type: 'string', enum: ['posted', 'reversed'] },
        },
      },

      Balance: {
        type: 'object',
        required: ['balance', 'naturalBalance'],
        properties: {
          balance: { type: 'integer', description: 'Raw Σdebit − Σcredit, integer paise' },
          naturalBalance: {
            type: 'integer',
            description: 'Sign-flipped for credit-normal accounts, so positive means the normal side',
          },
          drCr: { type: 'string', nullable: true, enum: ['Dr', 'Cr', null] },
        },
      },

      TrialBalanceLine: {
        type: 'object',
        required: ['accountCode', 'totalDebit', 'totalCredit'],
        properties: {
          account: { type: 'string' },
          accountCode: { type: 'string' },
          accountName: { type: 'string' },
          accountType: { type: 'string', nullable: true, enum: ['asset','liability','income','expense','equity', null] },
          normalBalance: { type: 'string', nullable: true, enum: ['debit','credit', null] },
          totalDebit: { type: 'integer' },
          totalCredit: { type: 'integer' },
          entries: { type: 'integer' },
          balance: { type: 'integer' },
          naturalBalance: { type: 'integer' },
          drCr: { type: 'string', nullable: true },
        },
      },

      AccountGroup: {
        type: 'object',
        required: ['_id', 'groupCode', 'groupName', 'accountType', 'normalBalance'],
        properties: {
          _id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          groupCode: { type: 'string', example: '4100' },
          groupName: { type: 'string', example: 'Fee Income' },
          accountType: { type: 'string', enum: ['asset', 'liability', 'income', 'expense', 'equity'] },
          normalBalance: { type: 'string', enum: ['debit', 'credit'] },
          parent: { type: 'string', nullable: true, pattern: '^[0-9a-fA-F]{24}$' },
          level: { type: 'integer', minimum: 1 },
          isSystem: {
            type: 'boolean',
            description: 'Seeded groups. Cannot be deleted, only deactivated.',
          },
          status: { type: 'string', enum: ['active', 'inactive', 'archived'] },
        },
      },

      Account: {
        type: 'object',
        required: ['_id', 'accountCode', 'accountName', 'accountType', 'normalBalance'],
        properties: {
          _id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          accountCode: { type: 'string', example: '4101' },
          accountName: { type: 'string', example: 'Tuition Fee Income' },
          accountGroup: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          accountType: {
            type: 'string',
            enum: ['asset', 'liability', 'income', 'expense', 'equity'],
            description: 'Inherited from the group. Never set directly by a client.',
          },
          normalBalance: { type: 'string', enum: ['debit', 'credit'] },
          isPostable: {
            type: 'boolean',
            description: 'False for grouping heads. Posting to one is rejected with 409.',
          },
          isBankAccount: { type: 'boolean' },
          isCashAccount: { type: 'boolean' },
          openingBalance: {
            type: 'integer',
            description:
              'Integer PAISE. Stored but NOT posted — it becomes real only when a ' +
              'financial-year opening journal is posted, so it is excluded from currentBalance.',
          },
          currentBalance: {
            type: 'integer',
            description: 'Integer PAISE. Σ debit − Σ credit over ledger entries. Cache; authoritative value is the aggregate.',
          },
          smsFeeTypeId: {
            type: 'string', nullable: true,
            description: 'SMS FeeType._id this head receives income for. Opaque — no join.',
          },
          smsExpenseCategoryId: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['active', 'inactive', 'archived'] },
        },
      },

      AccountBalance: {
        type: 'object',
        required: ['accountCode', 'totalDebit', 'totalCredit', 'currentBalance'],
        properties: {
          accountCode: { type: 'string' },
          accountName: { type: 'string' },
          normalBalance: { type: 'string', enum: ['debit', 'credit'] },
          openingBalance: { type: 'integer' },
          openingBalancePosted: { type: 'boolean' },
          totalDebit: { type: 'integer' },
          totalCredit: { type: 'integer' },
          currentBalance: { type: 'integer', description: 'Recomputed from the ledger' },
          cachedBalance: { type: 'integer' },
          drift: {
            type: 'integer',
            description: 'cached − computed. Non-zero means the cache has diverged and is a bug.',
          },
          entries: { type: 'integer' },
        },
      },

      FinancialYear: {
        type: 'object',
        required: ['_id', 'yearCode', 'startDate', 'endDate', 'fyStatus'],
        properties: {
          _id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          yearCode: { type: 'string', example: '2026-27' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          fyStatus: {
            type: 'string',
            enum: ['open', 'closing', 'closed', 'locked', 'reopened'],
          },
          isCurrent: { type: 'boolean' },
          openingBalancesPosted: { type: 'boolean' },
        },
      },
    },

    responses: {
      Unauthorized: {
        description: 'Not authenticated',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Forbidden: {
        description: 'Authenticated but not permitted, or no FMS role assigned',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      BadRequest: {
        description: 'Malformed request',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      ValidationFailed: {
        description: 'Content failed validation; `details.fields` lists each problem',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Conflict: {
        description: 'Conflicts with current state (locked period, duplicate, already posted)',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      ServerError: {
        description: 'Unexpected error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },

    parameters: {
      page: {
        name: 'page', in: 'query', required: false,
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
      limit: {
        name: 'limit', in: 'query', required: false,
        schema: { type: 'integer', minimum: 1, maximum: 200, default: 25 },
      },
      sort: {
        name: 'sort', in: 'query', required: false,
        description: "Comma-separated; '-' prefix for descending. Unknown fields are rejected.",
        schema: { type: 'string', example: '-startDate' },
      },
    },
  },

  paths: {
    '/status': {
      get: {
        tags: ['Plugin'],
        summary: 'Plugin status',
        description: 'Public. The UI calls this to decide whether to render FMS navigation.',
        security: [],
        responses: {
          200: {
            description: 'Plugin is mounted',
            content: {
              'application/json': {
                schema: envelope({ $ref: '#/components/schemas/PluginStatus' }),
              },
            },
          },
        },
      },
    },

    '/health': {
      get: {
        tags: ['Plugin'],
        summary: 'Plugin health',
        description:
          'Public. Returns **503** when MongoDB is not a replica set, because no ' +
          'ledger posting can succeed in that state.',
        security: [],
        responses: {
          200: {
            description: 'Healthy — transactions available',
            content: {
              'application/json': {
                schema: envelope({ $ref: '#/components/schemas/PluginHealth' }),
              },
            },
          },
          503: {
            description: 'Degraded — transactions unavailable',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },

    '/health/sms': {
      get: {
        tags: ['Plugin'],
        summary: 'SMS REST boundary reachability',
        description: 'Public. Confirms the FMS can reach the SMS API before an ingest cycle.',
        security: [],
        responses: {
          200: { description: 'SMS reachable', content: { 'application/json': { schema: { type: 'object' } } } },
          503: { description: 'SMS unreachable', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },


    '/accounts': {
      get: {
        tags: ['Chart of Accounts'],
        summary: 'List accounts',
        description: 'Requires `accounts: read`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/sort' },
          { name: 'accountType', in: 'query', schema: { type: 'string', enum: ['asset','liability','income','expense','equity'] } },
          { name: 'accountGroup', in: 'query', schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active','inactive','archived'] } },
          { name: 'isPostable', in: 'query', schema: { type: 'boolean' } },
          { name: 'q', in: 'query', description: 'Search code or name', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Paginated list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'count', 'pagination', 'data'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    count: { type: 'integer' },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Account' } },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Chart of Accounts'],
        summary: 'Create an account',
        description:
          'Requires `accounts: edit`. `accountType` and `normalBalance` are INHERITED ' +
          'from the group and are ignored if supplied — letting a client set them ' +
          'independently is how an income head ends up in the expense tree.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['accountCode', 'accountName', 'accountGroup'],
                properties: {
                  accountCode: { type: 'string', example: '4101' },
                  accountName: { type: 'string', example: 'Tuition Fee Income' },
                  accountGroup: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
                  isPostable: { type: 'boolean', default: true },
                  isBankAccount: { type: 'boolean', default: false },
                  isCashAccount: { type: 'boolean', default: false },
                  openingBalance: { type: 'integer', description: 'Integer PAISE' },
                  smsFeeTypeId: { type: 'string', nullable: true },
                  smsExpenseCategoryId: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, message: { type: 'string' }, data: { $ref: '#/components/schemas/Account' } } } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/accounts/{id}': {
      get: {
        tags: ['Chart of Accounts'],
        summary: 'Get an account',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'The account', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/Account' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Chart of Accounts'],
        summary: 'Update an account',
        description:
          'Requires `accounts: edit`. Once the account carries ledger entries, ' +
          '`accountCode`, `accountGroup` and `openingBalance` are FROZEN (409) — ' +
          'history references the code and interprets the type.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/Account' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
      delete: {
        tags: ['Chart of Accounts'],
        summary: 'Delete an account',
        description:
          'Requires `accounts: admin`. Succeeds ONLY if the account has never been ' +
          'posted to. Otherwise 409 with the posting count — deactivate instead ' +
          '(`PATCH { "status": "inactive" }`), which blocks new postings while ' +
          'keeping history intact.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object' } } } },
          404: { $ref: '#/components/responses/NotFound' },
          409: { description: 'Account has postings', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/accounts/{id}/balance': {
      get: {
        tags: ['Chart of Accounts'],
        summary: 'Account balance recomputed from the ledger',
        description: '`drift` is cached − computed. Non-zero indicates a bug, not a rounding artefact.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Balance', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/AccountBalance' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/accounts/groups': {
      get: {
        tags: ['Chart of Accounts'],
        summary: 'List account groups',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/sort' },
          { name: 'accountType', in: 'query', schema: { type: 'string', enum: ['asset','liability','income','expense','equity'] } },
        ],
        responses: {
          200: {
            description: 'Paginated list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'count', 'pagination', 'data'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    count: { type: 'integer' },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/AccountGroup' } },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Chart of Accounts'],
        summary: 'Create an account group',
        description: 'Requires `accounts: edit`. A child group must share its parent\'s accountType.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['groupCode','groupName','accountType'], properties: { groupCode: { type: 'string' }, groupName: { type: 'string' }, accountType: { type: 'string', enum: ['asset','liability','income','expense','equity'] }, normalBalance: { type: 'string', enum: ['debit','credit'] }, parent: { type: 'string', nullable: true } } } } },
        },
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/AccountGroup' } } } } } },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/accounts/groups/tree': {
      get: {
        tags: ['Chart of Accounts'],
        summary: 'Nested group hierarchy',
        description: 'For the SCR-08 sidebar. Each node carries a `children` array.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Tree', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { type: 'array', items: { $ref: '#/components/schemas/AccountGroup' } } } } } } },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/accounts/groups/{id}': {
      get: {
        tags: ['Chart of Accounts'],
        summary: 'Get an account group',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'The group', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/AccountGroup' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Chart of Accounts'],
        summary: 'Update an account group',
        description: '`groupCode` and `accountType` are immutable — accounts reference this group and changing its type would silently reclassify them.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/AccountGroup' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
      delete: {
        tags: ['Chart of Accounts'],
        summary: 'Delete an account group',
        description: 'Requires `accounts: admin`. Rejected with 409 if the group has child groups or accounts, or is a system group.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object' } } } },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },


    '/ledger': {
      get: {
        tags: ['General Ledger'],
        summary: 'List ledger entries (general journal)',
        description:
          'Requires `ledger: read`. `summary` totals cover the WHOLE filtered set, ' +
          'not the current page — a page total would be useless for reconciliation.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/sort' },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', description: 'Inclusive of the whole day', schema: { type: 'string', format: 'date' } },
          { name: 'account', in: 'query', schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
          { name: 'financialYear', in: 'query', schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
          { name: 'voucher', in: 'query', schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
          { name: 'voucherType', in: 'query', schema: { type: 'string', enum: ['income','payment','receipt','journal'] } },
          { name: 'partyType', in: 'query', schema: { type: 'string', enum: ['vendor','student','teacher','other'] } },
          { name: 'party', in: 'query', schema: { type: 'string' } },
          { name: 'minAmount', in: 'query', description: 'Integer paise', schema: { type: 'integer' } },
        ],
        responses: {
          200: {
            description: 'Paginated entries with whole-set totals',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'count', 'pagination', 'summary', 'data'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    count: { type: 'integer' },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                    summary: {
                      type: 'object',
                      required: ['totalDebit', 'totalCredit', 'balanced'],
                      properties: {
                        totalDebit: { type: 'integer' },
                        totalCredit: { type: 'integer' },
                        difference: { type: 'integer' },
                        balanced: { type: 'boolean' },
                      },
                    },
                    data: { type: 'array', items: { $ref: '#/components/schemas/LedgerEntry' } },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/ledger/trial-balance': {
      get: {
        tags: ['General Ledger'],
        summary: 'Trial balance',
        description:
          'Per-account totals plus the system-wide check. **`totals.balanced` must ' +
          'always be true** — if it is false the ledger has been written to by ' +
          'something other than LedgerPostingService.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'financialYear', in: 'query', schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
        ],
        responses: {
          200: {
            description: 'Trial balance',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'data'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    data: {
                      type: 'object',
                      required: ['lines', 'totals'],
                      properties: {
                        period: { type: 'object' },
                        lines: { type: 'array', items: { $ref: '#/components/schemas/TrialBalanceLine' } },
                        totals: {
                          type: 'object',
                          required: ['totalDebit', 'totalCredit', 'balanced'],
                          properties: {
                            totalDebit: { type: 'integer' },
                            totalCredit: { type: 'integer' },
                            difference: { type: 'integer' },
                            balanced: { type: 'boolean' },
                            accounts: { type: 'integer' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/ledger/accounts/{id}': {
      get: {
        tags: ['General Ledger'],
        summary: 'Account statement with running balance',
        description:
          'Requires `ledger: read`. Returns opening balance, movements with a ' +
          'running balance, and closing balance. The running balance is computed ' +
          'over the whole matched set before pagination, so a row on page 3 ' +
          'carries the balance after every earlier row.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: {
            description: 'Account statement',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'account', 'opening', 'closing', 'data'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    count: { type: 'integer' },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                    account: { type: 'object' },
                    period: { type: 'object' },
                    opening: { $ref: '#/components/schemas/Balance' },
                    movement: { type: 'object' },
                    closing: { $ref: '#/components/schemas/Balance' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/LedgerEntry' } },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/ledger/vouchers/{id}': {
      get: {
        tags: ['General Ledger'],
        summary: 'Voucher drill-down',
        description:
          'The voucher behind a ledger row, with all its lines and both ends of ' +
          'any reversal chain (`reversedBy` / `reversalOf`).',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: {
            description: 'Voucher with lines',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'data'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    data: {
                      type: 'object',
                      required: ['voucher', 'lines', 'totals'],
                      properties: {
                        voucher: { type: 'object' },
                        lines: { type: 'array', items: { $ref: '#/components/schemas/LedgerEntry' } },
                        totals: { type: 'object' },
                        reversedBy: { type: 'object', nullable: true },
                        reversalOf: { type: 'object', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },


    '/journal': {
      get: {
        tags: ['Journal Voucher'],
        summary: 'List journal vouchers',
        description: 'Requires `journal: read`. `?mine=true` limits to your own.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/sort' },
          { name: 'jvStatus', in: 'query', schema: { type: 'string', enum: ['draft','submitted','posted','rejected','cancelled','reversed'] } },
          { name: 'financialYear', in: 'query', schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'mine', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          200: {
            description: 'Paginated list',
            content: { 'application/json': { schema: { type: 'object', required: ['success','count','pagination','data'], properties: { success: { type: 'boolean', enum: [true] }, count: { type: 'integer' }, pagination: { $ref: '#/components/schemas/Pagination' }, data: { type: 'array', items: { $ref: '#/components/schemas/JournalVoucher' } } } } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Journal Voucher'],
        summary: 'Create a draft journal voucher',
        description:
          'Requires `journal: edit`. **Lines must balance even for a draft** — an ' +
          'unbalanced voucher cannot be saved at all, not merely blocked at posting. ' +
          'Amounts are integer paise.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['financialYear','jvDate','narration','lines'], properties: { financialYear: { type: 'string' }, jvDate: { type: 'string', format: 'date' }, narration: { type: 'string' }, reference: { type: 'string' }, lines: { type: 'array', minItems: 2, items: { $ref: '#/components/schemas/JournalLine' } }, attachments: { type: 'array', items: { type: 'object' } } } } } },
        },
        responses: {
          201: { description: 'Draft created', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, message: { type: 'string' }, data: { $ref: '#/components/schemas/JournalVoucher' } } } } } },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { description: 'Validation failed — including an unbalanced voucher', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/journal/{id}': {
      get: {
        tags: ['Journal Voucher'],
        summary: 'Get a journal voucher with lines and workflow trail',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'The voucher', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/JournalVoucher' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Journal Voucher'],
        summary: 'Update a draft or rejected voucher',
        description:
          'Requires `journal: edit`. **A posted voucher returns 409** — reverse it ' +
          'and raise a new one. Editing a rejected voucher returns it to draft, so ' +
          'the correction cannot skip re-approval.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/JournalVoucher' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
          409: { description: 'Voucher is not editable in its current status', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/journal/{id}/submit': {
      post: {
        tags: ['Journal Voucher'],
        summary: 'Submit for approval',
        description: 'draft | rejected → submitted. Requires `journal: edit`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Submitted', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/journal/{id}/approve': {
      post: {
        tags: ['Journal Voucher'],
        summary: 'Approve and post to the ledger',
        description:
          'Requires `journal: admin`. submitted → posted, writing the ledger via ' +
          'LedgerPostingService.\n\n' +
          '**Separation of duties:** the approver must not be the creator or the ' +
          'submitter. Approving your own voucher returns 403 — a control where one ' +
          'person can raise and approve their own entry is not a control.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Posted', content: { 'application/json': { schema: { type: 'object' } } } },
          403: { description: 'Not permitted, or separation of duties', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },

    '/journal/{id}/reject': {
      post: {
        tags: ['Journal Voucher'],
        summary: 'Reject a submitted voucher',
        description: 'Requires `journal: admin`. A reason is mandatory — a rejection without one cannot be acted on.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Rejected', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/journal/{id}/cancel': {
      post: {
        tags: ['Journal Voucher'],
        summary: 'Cancel a pre-posting voucher',
        description:
          'Requires `journal: edit`. Terminal, and never a delete — the record of ' +
          'the attempt survives. A posted voucher returns 409; reverse it instead.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Cancelled', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },

    '/journal/{id}/reverse': {
      post: {
        tags: ['Journal Voucher'],
        summary: 'Reverse a posted voucher',
        description:
          'Requires `journal: admin`. Posts an equal-and-opposite voucher. The ' +
          'original ledger entries are never modified — total debits and credits ' +
          'both increase.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Reversed', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },


    '/books/{bookType}': {
      get: {
        tags: ['Cash & Bank Book'],
        summary: 'Cash or bank book, day by day',
        description:
          'Requires `ledger: read`. Every figure is derived from ledger postings ' +
          'at query time — nothing is stored twice.\n\n' +
          'Days with no movement are still returned, carrying the balance forward, ' +
          'so continuity is readable. `continuous` proves ' +
          '`opening + receipts − payments = closing` independently of the row loop.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'bookType', in: 'path', required: true, schema: { type: 'string', enum: ['cash','bank'] } },
          { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'account', in: 'query', description: 'Limit to one account; otherwise all of that type', schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
        ],
        responses: {
          200: {
            description: 'The book',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success','data'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    data: {
                      type: 'object',
                      required: ['bookType','openingBalance','closingBalance','days','continuous'],
                      properties: {
                        bookType: { type: 'string', enum: ['cash','bank'] },
                        accounts: { type: 'array', items: { type: 'object' } },
                        period: { type: 'object' },
                        openingBalance: { type: 'integer' },
                        totalReceipts: { type: 'integer' },
                        totalPayments: { type: 'integer' },
                        closingBalance: { type: 'integer' },
                        continuous: { type: 'boolean' },
                        days: { type: 'array', items: { $ref: '#/components/schemas/BookDay' } },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/books/{bookType}/day/{date}': {
      get: {
        tags: ['Cash & Bank Book'],
        summary: 'One day in full',
        description: 'Every entry for the day with a running balance, plus the closing record if the day has been closed.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'bookType', in: 'path', required: true, schema: { type: 'string', enum: ['cash','bank'] } },
          { name: 'date', in: 'path', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'account', in: 'query', schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
        ],
        responses: {
          200: { description: 'The day', content: { 'application/json': { schema: { type: 'object' } } } },
          400: { $ref: '#/components/responses/BadRequest' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/books/close': {
      post: {
        tags: ['Cash & Bank Book'],
        summary: 'Close a day',
        description:
          'Requires `pettyCash: edit`.\n\n' +
          '**A cash closing requires `physicalCount`** — closing cash without ' +
          'counting it is not a control. Bank closings do not, since there is ' +
          'nothing to count.\n\n' +
          'Any variance requires `varianceReason` and opens the closing as ' +
          '`disputed`. Variance is computed, never accepted from the caller.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['account','date'], properties: {
            account: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
            date: { type: 'string', format: 'date' },
            physicalCount: { type: 'integer', description: 'Integer PAISE. Required for cash.' },
            varianceReason: { type: 'string' },
            notes: { type: 'string' },
            denominations: { type: 'array', items: { type: 'object', properties: { denomination: { type: 'integer' }, count: { type: 'integer' } } } },
          } } } },
        },
        responses: {
          201: { description: 'Closed', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, message: { type: 'string' }, data: { $ref: '#/components/schemas/DailyClosing' } } } } } },
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { description: 'Already closed for that date', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/books/closings/list': {
      get: {
        tags: ['Cash & Bank Book'],
        summary: 'List daily closings',
        description: '`?unverified=true` returns everything still needing attention.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/sort' },
          { name: 'bookType', in: 'query', schema: { type: 'string', enum: ['cash','bank'] } },
          { name: 'closingStatus', in: 'query', schema: { type: 'string', enum: ['open','closed','verified','disputed'] } },
          { name: 'account', in: 'query', schema: { type: 'string' } },
          { name: 'unverified', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          200: { description: 'Paginated list', content: { 'application/json': { schema: { type: 'object', required: ['success','count','pagination','data'], properties: { success: { type: 'boolean', enum: [true] }, count: { type: 'integer' }, pagination: { $ref: '#/components/schemas/Pagination' }, data: { type: 'array', items: { $ref: '#/components/schemas/DailyClosing' } } } } } } },
          400: { $ref: '#/components/responses/BadRequest' },
        },
      },
    },

    '/books/closings/{id}/verify': {
      post: {
        tags: ['Cash & Bank Book'],
        summary: 'Verify a daily closing',
        description:
          'Requires `pettyCash: admin`. **The verifier must not be whoever closed ' +
          'it** — self-verification is not verification. A closing with a variance ' +
          'requires a note.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Verified', content: { 'application/json': { schema: { type: 'object' } } } },
          403: { description: 'Not permitted, or separation of duties', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },


    '/income': {
      get: {
        tags: ['Income'],
        summary: 'List receipts',
        description:
          'Requires `income: read`. `summary` totals **exclude cancelled receipts** — ' +
          'including them would overstate collections, which is the number people read.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/sort' },
          { name: 'category', in: 'query', schema: { type: 'string', enum: ['studentFee','admissionFee','donation','csr','rent','interest','sales','event','miscellaneous'] } },
          { name: 'incomeStatus', in: 'query', schema: { type: 'string', enum: ['posted','cancelled'] } },
          { name: 'paymentMode', in: 'query', schema: { type: 'string', enum: ['cash','cheque','bank','upi','online','dd'] } },
          { name: 'student', in: 'query', description: 'SMS student id', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'q', in: 'query', description: 'Search receipt number, payer or admission number', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Paginated receipts with a period total',
            content: { 'application/json': { schema: { type: 'object', required: ['success','count','pagination','summary','data'], properties: {
              success: { type: 'boolean', enum: [true] },
              count: { type: 'integer' },
              pagination: { $ref: '#/components/schemas/Pagination' },
              summary: { type: 'object', properties: { postedCount: { type: 'integer' }, postedAmount: { type: 'integer' }, note: { type: 'string' } } },
              data: { type: 'array', items: { $ref: '#/components/schemas/IncomeVoucher' } },
            } } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Income'],
        summary: 'Record money received',
        description:
          'Requires `income: edit`. **Posts to the ledger immediately** — unlike a ' +
          'journal voucher there is no draft, because the money is already in hand.\n\n' +
          'Dr cash/bank, Cr the income head. `creditAccount` must be an income-type ' +
          'account. `debitAccount` is inferred for cash/cheque/bank/DD when exactly ' +
          'one such account exists, but **must be named explicitly for online and UPI** ' +
          '— that money has not settled to the bank yet and posting it to the main ' +
          'bank head would overstate the balance.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object',
            required: ['receiptDate','category','amount','paymentMode','creditAccount','payerName'],
            properties: {
              receiptDate: { type: 'string', format: 'date', description: 'Cannot be in the future' },
              category: { type: 'string', enum: ['studentFee','admissionFee','donation','csr','rent','interest','sales','event','miscellaneous'] },
              amount: { type: 'integer', description: 'Integer PAISE, must be > 0' },
              paymentMode: { type: 'string', enum: ['cash','cheque','bank','upi','online','dd'] },
              creditAccount: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
              debitAccount: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
              payerName: { type: 'string' },
              payerType: { type: 'string', enum: ['student','organisation','individual','other'] },
              smsStudentId: { type: 'string' },
              admissionNumber: { type: 'string' },
              className: { type: 'string' },
              instrumentNumber: { type: 'string', description: 'Required for cheque and DD' },
              instrumentDate: { type: 'string', format: 'date' },
              bankName: { type: 'string' },
              narration: { type: 'string' },
              reference: { type: 'string' },
            } } } },
        },
        responses: {
          201: { description: 'Receipt issued and posted', content: { 'application/json': { schema: { type: 'object' } } } },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { description: 'Financial year closed or locked', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/income/{id}': {
      get: {
        tags: ['Income'],
        summary: 'Get a receipt',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'The receipt', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/IncomeVoucher' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/income/{id}/receipt': {
      get: {
        tags: ['Income'],
        summary: 'Printable receipt (SCR-13)',
        description:
          'Requires `income: read`. Returns printable **HTML** with print CSS — no ' +
          'new dependency, prints correctly from any browser, and can be emailed.\n\n' +
          'A cancelled receipt renders with a CANCELLED watermark rather than being ' +
          'withheld: the payer may still hold the paper copy, and it must be ' +
          'possible to show why it is void.\n\n' +
          '`?format=json` returns the data for a custom renderer.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['html','json'], default: 'html' } },
        ],
        responses: {
          200: { description: 'Receipt', content: { 'text/html': { schema: { type: 'string' } }, 'application/json': { schema: { type: 'object' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/income/{id}/cancel': {
      post: {
        tags: ['Income'],
        summary: 'Cancel a receipt',
        description:
          'Requires `income: edit`. **Reverses the posting; never deletes.** A ' +
          'receipt is a document that was handed to someone, so the record and its ' +
          'original ledger entries both survive. A reason is mandatory.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Cancelled and reversed', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { description: 'Already cancelled, or the period is locked', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },


    '/expenses': {
      get: {
        tags: ['Expenses'],
        summary: 'List expense requests',
        description:
          'Requires `expenses: read`. `?pending=true` returns the approver queue; ' +
          '`?overBudget=true` returns requests submitted over budget. Totals ' +
          'exclude rejected and cancelled.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/sort' },
          { name: 'expenseStatus', in: 'query', schema: { type: 'string' } },
          { name: 'priority', in: 'query', schema: { type: 'string', enum: ['low','normal','high','urgent'] } },
          { name: 'department', in: 'query', schema: { type: 'string' } },
          { name: 'budgetHead', in: 'query', schema: { type: 'string' } },
          { name: 'mine', in: 'query', schema: { type: 'boolean' } },
          { name: 'pending', in: 'query', schema: { type: 'boolean' } },
          { name: 'overBudget', in: 'query', schema: { type: 'boolean' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Paginated list with totals', content: { 'application/json': { schema: { type: 'object', required: ['success','count','pagination','summary','data'], properties: { success: { type: 'boolean', enum: [true] }, count: { type: 'integer' }, pagination: { $ref: '#/components/schemas/Pagination' }, summary: { type: 'object' }, data: { type: 'array', items: { $ref: '#/components/schemas/ExpenseRequest' } } } } } } },
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Expenses'],
        summary: 'Create a draft expense request',
        description:
          'Requires `expenses: edit`. **No ledger posting** — nothing has been ' +
          'spent yet.\n\n' +
          '`budgetHead` must be an expense-type, postable account. ' +
          '`totalAmount` must equal base + GST + other tax, and intra-state GST ' +
          '(CGST+SGST) cannot be mixed with inter-state (IGST) — both rules are ' +
          'enforced at the schema layer.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object',
            required: ['requestDate','category','purpose','budgetHead','paymentMode','baseAmount','totalAmount'],
            properties: {
              requestDate: { type: 'string', format: 'date' },
              department: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
              vendor: { type: 'object', properties: { name: { type: 'string' }, gstin: { type: 'string' }, pan: { type: 'string' } } },
              category: { type: 'string' },
              subCategory: { type: 'string' },
              purpose: { type: 'string' },
              remarks: { type: 'string' },
              budgetHead: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
              baseAmount: { type: 'integer', description: 'Integer PAISE' },
              gstType: { type: 'string', enum: ['none','intra','inter'] },
              gstRate: { type: 'number' },
              cgst: { type: 'integer' }, sgst: { type: 'integer' }, igst: { type: 'integer' },
              otherTaxAmount: { type: 'integer' },
              totalAmount: { type: 'integer' },
              paymentMode: { type: 'string', enum: ['cash','cheque','neft','rtgs','upi','dd'] },
              dueDate: { type: 'string', format: 'date' },
              priority: { type: 'string', enum: ['low','normal','high','urgent'] },
              attachments: { type: 'array', items: { type: 'object', properties: { fileName: { type: 'string' }, url: { type: 'string' }, kind: { type: 'string', enum: ['invoice','bill','quotation','purchaseOrder','challan','proof','other'] } } } },
            } } } },
        },
        responses: {
          201: { description: 'Draft created', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, message: { type: 'string' }, data: { $ref: '#/components/schemas/ExpenseRequest' } } } } } },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/expenses/{id}': {
      get: {
        tags: ['Expenses'],
        summary: 'Get an expense request',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'The request', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/ExpenseRequest' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Expenses'],
        summary: 'Update a draft, returned or rejected request',
        description: 'Editing a returned or rejected request returns it to `draft`, so the correction cannot skip re-approval.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: { type: 'object' } } } },
          404: { $ref: '#/components/responses/NotFound' },
          409: { description: 'Not editable in its current status', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/expenses/{id}/budget-check': {
      get: {
        tags: ['Expenses'],
        summary: 'Preview the budget position',
        description: 'Runs the check without submitting, so a requester can see where they stand first.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Budget position', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/BudgetCheck' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/expenses/{id}/submit': {
      post: {
        tags: ['Expenses'],
        summary: 'Submit for approval',
        description:
          'Requires `expenses: edit`. Runs the budget check and records the result ' +
          'on the request, so approvers see what was known at submission.\n\n' +
          'At least one attachment is required. An **over-budget** request is ' +
          'refused with 409 unless `acknowledgeOverBudget: true` — silence must ' +
          'not be the way past a control. The acknowledgement is recorded in the ' +
          'workflow trail.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { comment: { type: 'string' }, acknowledgeOverBudget: { type: 'boolean' } } } } } },
        responses: {
          200: { description: 'Submitted', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { description: 'Over budget without acknowledgement, or wrong status', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/expenses/{id}/cancel': {
      post: {
        tags: ['Expenses'],
        summary: 'Cancel a request',
        description: 'Never a delete. A paid or closed expense cannot be cancelled — reverse the payment instead.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Cancelled', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },


    '/approvals/inbox': {
      get: {
        tags: ['Approvals'],
        summary: 'Expenses awaiting YOUR action (SCR-18)',
        description:
          'Requires `approvals: read`. Computed, not stored — a stored queue ' +
          'would drift the moment the matrix changed or a role was reassigned.\n\n' +
          'Excludes your own requests and anything you have already acted on, ' +
          'since either would only produce a 403 on click.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
        ],
        responses: {
          200: { description: 'Your queue', content: { 'application/json': { schema: { type: 'object', required: ['success','count','data'], properties: { success: { type: 'boolean', enum: [true] }, count: { type: 'integer' }, pagination: { $ref: '#/components/schemas/Pagination' }, role: { type: 'string' }, data: { type: 'array', items: { type: 'object' } } } } } } },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/approvals/position/{expenseId}': {
      get: {
        tags: ['Approvals'],
        summary: 'Tier, chain and who must act next',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'expenseId', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Position', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/ApprovalPosition' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/approvals/history/{expenseId}': {
      get: {
        tags: ['Approvals'],
        summary: 'Full approval trail (SCR-21)',
        description: 'Every action, oldest first, each with actor, role, from/to status and a snapshot of the amount and tier at the time.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'expenseId', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'History', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { type: 'object', properties: { expenseNumber: { type: 'string' }, currentStatus: { type: 'string' }, position: { $ref: '#/components/schemas/ApprovalPosition' }, approvals: { type: 'array', items: { $ref: '#/components/schemas/ApprovalRecord' } } } } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/approvals/{expenseId}/verify': {
      post: {
        tags: ['Approvals'],
        summary: 'Accounts verification — the first step at every tier',
        description:
          'Requires `approvals: admin` and the `accountant` or `accountsManager` ' +
          'role. Separate from approve because verification is checking the ' +
          'paperwork, not authorising the spend.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'expenseId', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { comment: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Verified', content: { 'application/json': { schema: { type: 'object' } } } },
          403: { description: 'Wrong step, wrong role, or separation of duties', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/approvals/{expenseId}/approve': {
      post: {
        tags: ['Approvals'],
        summary: 'Approve at the next required step',
        description:
          'Requires `approvals: admin`. `step` may be given explicitly; otherwise ' +
          'the next required step is used.\n\n' +
          '**Four guards apply:** the expense must be at the right status; steps ' +
          'cannot be skipped; only roles mapped to the step may act; and nobody ' +
          'may approve what they raised, submitted, or already acted on.\n\n' +
          'A 403 explains which step was expected and which roles may perform it.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'expenseId', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { step: { type: 'string', enum: ['deptHead','principal','chairman','trustee'] }, comment: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Approved', content: { 'application/json': { schema: { type: 'object' } } } },
          403: { description: 'Out of order, wrong role, or separation of duties', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },

    '/approvals/{expenseId}/reject': {
      post: {
        tags: ['Approvals'],
        summary: 'Reject — terminal',
        description: 'A reason is mandatory. The request must be raised afresh, not resubmitted.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'expenseId', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Rejected', content: { 'application/json': { schema: { type: 'object' } } } },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/approvals/{expenseId}/return': {
      post: {
        tags: ['Approvals'],
        summary: 'Return for correction',
        description:
          'Sends the request back to its author, who may edit and resubmit. ' +
          '**Resubmission restarts the chain from accounts** — approvals given to ' +
          'the version that was returned do not carry over to the corrected one.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'expenseId', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Returned', content: { 'application/json': { schema: { type: 'object' } } } },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/approvals/matrix': {
      get: {
        tags: ['Approvals'],
        summary: 'Current thresholds (SCR-20)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'The matrix in force', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { type: 'object', properties: { tiers: { type: 'array', items: { $ref: '#/components/schemas/ApprovalTier' } }, source: { type: 'string', enum: ['configured','default'] }, version: { type: 'integer', nullable: true } } } } } } } },
        },
      },
      put: {
        tags: ['Approvals'],
        summary: 'Replace the thresholds',
        description:
          'Requires `approvals: edit`. **A matrix with a gap or an overlap is ' +
          'rejected** — a gap leaves amounts unroutable, an overlap makes routing ' +
          'depend on iteration order.\n\n' +
          'The previous version is superseded rather than edited, so the routing ' +
          'that applied to past approvals stays reconstructable.',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['tiers'], properties: { tiers: { type: 'array', items: { $ref: '#/components/schemas/ApprovalTier' } }, financialYear: { type: 'string', nullable: true }, notes: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Saved', content: { 'application/json': { schema: { type: 'object' } } } },
          403: { $ref: '#/components/responses/Forbidden' },
          422: { description: 'Gap, overlap or unknown approver role', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/approvals/matrix/preview': {
      post: {
        tags: ['Approvals'],
        summary: 'Where would this amount route?',
        description: 'Sanity-check a matrix before saving it.',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['amount'], properties: { amount: { type: 'integer', description: 'Integer PAISE' }, tiers: { type: 'array', items: { $ref: '#/components/schemas/ApprovalTier' } } } } } } },
        responses: {
          200: { description: 'Routing', content: { 'application/json': { schema: { type: 'object' } } } },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/approvals/log': {
      get: {
        tags: ['Approvals'],
        summary: 'Every approval action taken',
        description: 'Append-only. Filterable by step, action and actor.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/sort' },
          { name: 'step', in: 'query', schema: { type: 'string', enum: ['accounts','deptHead','principal','chairman','trustee'] } },
          { name: 'action', in: 'query', schema: { type: 'string', enum: ['verify','approve','reject','return'] } },
          { name: 'actor', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Paginated log', content: { 'application/json': { schema: { type: 'object', required: ['success','count','pagination','data'], properties: { success: { type: 'boolean', enum: [true] }, count: { type: 'integer' }, pagination: { $ref: '#/components/schemas/Pagination' }, data: { type: 'array', items: { $ref: '#/components/schemas/ApprovalRecord' } } } } } } },
          400: { $ref: '#/components/responses/BadRequest' },
        },
      },
    },


    '/payments/queue': {
      get: {
        tags: ['Payments'],
        summary: 'Approved expenses awaiting payment (SCR-53)',
        description: 'Requires `payments: read`. Ordered by priority, then due date.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { name: 'paymentMode', in: 'query', schema: { type: 'string', enum: ['cash','cheque','neft','rtgs','upi','dd'] } },
        ],
        responses: {
          200: { description: 'The queue', content: { 'application/json': { schema: { type: 'object', required: ['success','count','data'], properties: { success: { type: 'boolean', enum: [true] }, count: { type: 'integer' }, pagination: { $ref: '#/components/schemas/Pagination' }, summary: { type: 'object' }, data: { type: 'array', items: { type: 'object' } } } } } } },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/payments': {
      get: {
        tags: ['Payments'],
        summary: 'List payments',
        description: 'Totals exclude failed payments — money that bounced did not leave.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/sort' },
          { name: 'paymentStatus', in: 'query', schema: { type: 'string', enum: ['pending','processing','paid','failed'] } },
          { name: 'paymentMode', in: 'query', schema: { type: 'string', enum: ['cash','cheque','neft','rtgs','upi','dd'] } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: { description: 'Paginated payments', content: { 'application/json': { schema: { type: 'object', required: ['success','count','pagination','summary','data'], properties: { success: { type: 'boolean', enum: [true] }, count: { type: 'integer' }, pagination: { $ref: '#/components/schemas/Pagination' }, summary: { type: 'object' }, data: { type: 'array', items: { $ref: '#/components/schemas/PaymentVoucher' } } } } } } },
          400: { $ref: '#/components/responses/BadRequest' },
        },
      },
    },

    '/payments/{id}': {
      get: {
        tags: ['Payments'],
        summary: 'Get a payment voucher',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'The payment', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/PaymentVoucher' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/payments/{id}/cheque': {
      get: {
        tags: ['Payments'],
        summary: 'Printable cheque overlay (SCR-40)',
        description:
          'Returns HTML positioned in millimetres for a CTS-2010 cheque leaf, so ' +
          'it prints ONTO a real cheque rather than producing a picture of one.\n\n' +
          '**The offsets need calibrating to the school\'s bank before first use** — ' +
          'every layout differs slightly. `?guide=false` hides the alignment border.\n\n' +
          'Only cheque and DD payments have a cheque to print; anything else returns 409.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
          { name: 'guide', in: 'query', schema: { type: 'boolean', default: true } },
        ],
        responses: {
          200: { description: 'Cheque HTML', content: { 'text/html': { schema: { type: 'string' } } } },
          409: { description: 'Not a cheque or DD payment', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/payments/{expenseId}/pay': {
      post: {
        tags: ['Payments'],
        summary: 'Pay an approved expense',
        description:
          'Requires `payments: edit`. Creates the voucher, posts the ledger and ' +
          'advances the expense in one call — the money leaves in a single act, so ' +
          'splitting it would only create a window where the books and reality ' +
          'disagree.\n\n' +
          'Posts **Dr the expense head / Cr cash or bank** for the full amount ' +
          'including GST. (A GST-registered entity able to claim input credit would ' +
          'split the GST to an input-credit account; education services are exempt, ' +
          'so the whole amount is genuinely the cost.)\n\n' +
          '**Paying twice is impossible** — a unique partial index rejects a second ' +
          'live payment at the database. The expense must be at `paymentPending`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'expenseId', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['paymentMode'], properties: {
            paymentMode: { type: 'string', enum: ['cash','cheque','neft','rtgs','upi','dd'] },
            creditAccount: { type: 'string', description: 'Inferred when exactly one account fits the mode' },
            instrumentNumber: { type: 'string', description: 'Required for cheque and DD' },
            instrumentDate: { type: 'string', format: 'date' },
            bankReference: { type: 'string' },
            bankName: { type: 'string' },
            paymentDate: { type: 'string', format: 'date', description: 'Defaults to now; cannot be in the future' },
            payeeName: { type: 'string', description: 'Defaults to the vendor on the expense' },
            narration: { type: 'string' },
          } } } },
        },
        responses: {
          201: { description: 'Paid and posted', content: { 'application/json': { schema: { type: 'object' } } } },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { description: 'Not approved, already paid, or the period is locked', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/payments/{id}/fail': {
      post: {
        tags: ['Payments'],
        summary: 'Mark a payment failed',
        description:
          'A bounced cheque or rejected transfer. **Reverses the posting** and ' +
          'returns the expense to `paymentPending` so it can be paid again. The ' +
          'failed voucher stays on record — a cheque that bounced is part of the ' +
          'history. A reason is mandatory.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Failed and reversed', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/payments/expense/{expenseId}/close': {
      post: {
        tags: ['Payments'],
        summary: 'Close a paid expense',
        description: 'Terminal. Only a `paymentCompleted` expense can be closed.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'expenseId', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Closed', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },


    '/budgets': {
      get: {
        tags: ['Budgets'],
        summary: 'List budgets, each with its live position',
        description: 'Requires `budgets: read`. Positions are derived at query time, so the figures are never stale.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/sort' },
          { name: 'budgetStatus', in: 'query', schema: { type: 'string', enum: ['draft','active','revised','closed'] } },
          { name: 'financialYear', in: 'query', schema: { type: 'string' } },
          { name: 'account', in: 'query', schema: { type: 'string' } },
          { name: 'department', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Paginated budgets', content: { 'application/json': { schema: { type: 'object', required: ['success','count','pagination','data'], properties: { success: { type: 'boolean', enum: [true] }, count: { type: 'integer' }, pagination: { $ref: '#/components/schemas/Pagination' }, data: { type: 'array', items: { $ref: '#/components/schemas/Budget' } } } } } } },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Budgets'],
        summary: 'Create a draft budget',
        description:
          'Requires `budgets: edit`. Only **expense-type, postable** heads may be ' +
          'budgeted. A draft is NOT consulted by expense submission — activate it first.',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['financialYear','account','budgetAmount'], properties: {
          financialYear: { type: 'string' },
          account: { type: 'string' },
          budgetAmount: { type: 'integer', description: 'Integer PAISE' },
          department: { type: 'object', properties: { name: { type: 'string' } } },
          warnThreshold: { type: 'number', default: 0.9 },
          overBudgetPolicy: { type: 'string', enum: ['block','warn'], default: 'block' },
          notes: { type: 'string' },
        } } } } },
        responses: {
          201: { description: 'Draft created', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { description: 'A budget already exists for this head', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/budgets/vs-actual': {
      get: {
        tags: ['Budgets'],
        summary: 'Budget vs Actual monitor (SCR-25)',
        description:
          'Every budget in a year with its derived position, plus totals and a ' +
          'count of over-budget and near-limit heads.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'financialYear', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'department', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Budget vs actual', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { type: 'object', properties: { lines: { type: 'array', items: { $ref: '#/components/schemas/Budget' } }, totals: { type: 'object' } } } } } } } },
          400: { $ref: '#/components/responses/BadRequest' },
        },
      },
    },

    '/budgets/check/availability': {
      get: {
        tags: ['Budgets'],
        summary: 'Preview availability without raising anything',
        description:
          'Returns `checked: false` when no live budget exists — **not** `ok`. ' +
          'Reporting a pass when nothing was consulted would let every unbudgeted ' +
          'request through a control that was never applied.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'account', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'financialYear', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'amount', in: 'query', required: true, schema: { type: 'integer', description: 'Integer PAISE' } },
          { name: 'department', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Availability', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/BudgetCheck' } } } } } },
          400: { $ref: '#/components/responses/BadRequest' },
        },
      },
    },

    '/budgets/{id}': {
      get: {
        tags: ['Budgets'],
        summary: 'Get a budget with its position',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'The budget', content: { 'application/json': { schema: { type: 'object', required: ['success','data'], properties: { success: { type: 'boolean', enum: [true] }, data: { $ref: '#/components/schemas/Budget' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Budgets'],
        summary: 'Edit a draft budget',
        description: 'Drafts only. **A live budget must be revised, not edited** — a change to money already allocated has to carry a reason.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { description: 'Not a draft', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/budgets/{id}/activate': {
      post: {
        tags: ['Budgets'],
        summary: 'Activate a draft',
        description: 'Requires `budgets: admin`. Only a live budget is consulted by expense submission.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Activated', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },

    '/budgets/{id}/revise': {
      post: {
        tags: ['Budgets'],
        summary: 'Revise a live budget (SCR-24)',
        description:
          'Requires `budgets: admin`. **The original allocation is preserved** — the ' +
          'revision sits beside it, so "what was originally allocated" stays ' +
          'answerable. A reason is mandatory.\n\n' +
          'Revising BELOW what has already been consumed is permitted but returns a ' +
          'warning: it records a real decision rather than being refused.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['newAmount','reason'], properties: { newAmount: { type: 'integer', description: 'Integer PAISE' }, reason: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Revised', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationFailed' },
        },
      },
    },

    '/budgets/{id}/close': {
      post: {
        tags: ['Budgets'],
        summary: 'Close a budget',
        description: 'Terminal. Budgets are closed, never deleted — a budget that was spent against is part of how the year was managed.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
        responses: {
          200: { description: 'Closed', content: { 'application/json': { schema: { type: 'object' } } } },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },

    '/financial-years': {
      get: {
        tags: ['Financial Year'],
        summary: 'List financial years',
        description:
          'Requires `financialYear: read`. Scoped to the caller\'s branch — the ' +
          '`school` filter comes from the JWT and cannot be supplied by the client.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/sort' },
          {
            name: 'fyStatus', in: 'query', required: false,
            schema: { type: 'string', enum: ['open', 'closing', 'closed', 'locked', 'reopened'] },
          },
        ],
        responses: {
          200: {
            description: 'Paginated list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'count', 'pagination', 'data'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    count: { type: 'integer' },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/FinancialYear' },
                    },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          500: { $ref: '#/components/responses/ServerError' },
        },
      },
    },

    '/financial-years/{id}': {
      get: {
        tags: ['Financial Year'],
        summary: 'Get one financial year',
        description:
          'Requires `financialYear: read`. Returns 404 rather than 403 for a ' +
          'record in another branch — confirming existence would leak information ' +
          'across the branch boundary.',
        security: [{ bearerAuth: [] }],
        parameters: [{
          name: 'id', in: 'path', required: true,
          schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
        }],
        responses: {
          200: {
            description: 'The financial year',
            content: {
              'application/json': {
                schema: envelope({ $ref: '#/components/schemas/FinancialYear' }),
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },
};

module.exports = spec;