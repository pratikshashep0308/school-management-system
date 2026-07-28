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