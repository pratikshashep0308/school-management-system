// backend/fms/services/auth/rbac.test.js
//
// RBAC tests. Uses node:test (built into Node 18+) so this adds no dependency.
//
//   node --test fms/services/auth/rbac.test.js
//
// Covers the assertions the playbook's P1.3 verification asks for, plus the
// deny-by-default property that the whole guard exists to provide.

const test = require('node:test');
const assert = require('node:assert');

const m = require('./permissionMatrix');

const role = (financeRole, permissions) => ({ financeRole, permissions });

// ─────────────────────────────────────────────────────────────────────────────
test('deny by default', async (t) => {
  await t.test('no assignment at all → denied', () => {
    assert.strictEqual(m.can(null, 'income', 'VIEW'), false);
    assert.strictEqual(m.can(undefined, 'ledger', 'VIEW'), false);
  });

  await t.test('unknown finance role → denied everywhere', () => {
    for (const mod of m.MODULE_KEYS) {
      assert.strictEqual(m.can(role('notARole'), mod, 'VIEW'), false, mod);
    }
  });

  await t.test('unknown module → denied', () => {
    assert.strictEqual(m.can(role('chairman'), 'nonexistentModule', 'VIEW'), false);
  });

  await t.test('unknown action → denied', () => {
    assert.strictEqual(m.can(role('chairman'), 'income', 'FROBNICATE'), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('playbook verification cases', async (t) => {
  await t.test('READ_ONLY cannot APPROVE', () => {
    for (const mod of m.MODULE_KEYS) {
      assert.strictEqual(m.can(role('readOnly'), mod, 'APPROVE'), false, mod);
      assert.strictEqual(m.can(role('readOnly'), mod, 'REJECT'), false, mod);
      assert.strictEqual(m.can(role('readOnly'), mod, 'REOPEN'), false, mod);
    }
  });

  await t.test('CASHIER cannot post journals', () => {
    assert.strictEqual(m.can(role('cashier'), 'journal', 'CREATE'), false);
    assert.strictEqual(m.can(role('cashier'), 'journal', 'EDIT'), false);
    assert.strictEqual(m.can(role('cashier'), 'journal', 'VIEW'), false);
  });

  await t.test('CASHIER can handle petty cash and income', () => {
    assert.strictEqual(m.can(role('cashier'), 'pettyCash', 'CREATE'), true);
    assert.strictEqual(m.can(role('cashier'), 'income', 'CREATE'), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('level ordering', async (t) => {
  await t.test('read does not imply edit', () => {
    assert.strictEqual(m.satisfies('read', 'edit'), false);
    assert.strictEqual(m.satisfies('read', 'admin'), false);
  });

  await t.test('admin implies everything', () => {
    assert.strictEqual(m.satisfies('admin', 'read'), true);
    assert.strictEqual(m.satisfies('admin', 'edit'), true);
    assert.strictEqual(m.satisfies('admin', 'admin'), true);
  });

  await t.test('none implies nothing', () => {
    assert.strictEqual(m.satisfies('none', 'read'), false);
    assert.strictEqual(m.satisfies(undefined, 'read'), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('the ledger is never directly writable', async (t) => {
  // fms_ledgerentries is append-only and written only by LedgerPostingService.
  // No role should be able to CREATE or EDIT through the ledger module.
  await t.test('no role has edit or admin on ledger', () => {
    for (const r of m.FINANCE_ROLES) {
      const lvl = m.levelFor(r, 'ledger');
      assert.ok(['none', 'read'].includes(lvl), `${r} has '${lvl}' on ledger`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('per-user overrides', async (t) => {
  await t.test('override can grant above the role default', () => {
    assert.strictEqual(m.can(role('cashier'), 'journal', 'CREATE'), false);
    assert.strictEqual(
      m.can(role('cashier', { journal: 'edit' }), 'journal', 'CREATE'),
      true
    );
  });

  await t.test('override can revoke below the role default', () => {
    assert.strictEqual(m.can(role('accountsManager'), 'journal', 'APPROVE'), true);
    assert.strictEqual(
      m.can(role('accountsManager', { journal: 'read' }), 'journal', 'APPROVE'),
      false
    );
  });

  await t.test('Mongoose Map overrides work', () => {
    const asMap = new Map([['journal', 'admin']]);
    assert.strictEqual(m.can(role('cashier', asMap), 'journal', 'APPROVE'), true);
  });

  await t.test('a garbage override falls back to the role default, not to allow', () => {
    assert.strictEqual(
      m.can(role('readOnly', { income: 'superuser' }), 'income', 'EDIT'),
      false
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('matrix integrity', async (t) => {
  await t.test('every role has an entry for every module', () => {
    for (const r of m.FINANCE_ROLES) {
      for (const mod of m.MODULE_KEYS) {
        assert.ok(
          m.LEVELS.includes(m.DEFAULT_MATRIX[r][mod]),
          `${r}.${mod} = ${m.DEFAULT_MATRIX[r][mod]}`
        );
      }
    }
  });

  await t.test('12 roles, 15 modules, 10 actions', () => {
    assert.strictEqual(m.FINANCE_ROLES.length, 12);
    assert.strictEqual(m.MODULE_KEYS.length, 15);
    assert.strictEqual(m.ACTIONS.length, 10);
  });

  await t.test('auditor is read-only across the board', () => {
    for (const mod of m.MODULE_KEYS) {
      assert.ok(['none', 'read'].includes(m.levelFor('auditor', mod)), mod);
    }
  });

  await t.test('teacher has no access to money movement', () => {
    for (const mod of ['ledger', 'journal', 'banking', 'pettyCash', 'payments', 'accounts']) {
      assert.strictEqual(m.levelFor('teacher', mod), 'none', mod);
    }
  });

  await t.test('only senior roles can close a financial year', () => {
    const canClose = m.FINANCE_ROLES.filter((r) => m.can(role(r), 'financialYear', 'REOPEN'));
    assert.deepStrictEqual(canClose.sort(), ['chairman', 'principal']);
  });
});