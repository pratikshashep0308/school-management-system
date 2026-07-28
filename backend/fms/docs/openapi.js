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