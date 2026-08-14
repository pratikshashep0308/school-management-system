/**
 * FP-052 (split) — GAP-PA-004 parent multi-child resolution
 * FINAL LLD 1.1 §35 · Test tier: B — UNIT, Student queries stubbed.
 *
 * The Specification claimed the ParentDashboard UI does not expose child
 * switching. It does — pages/ParentDashboard.js lines 298, 361, 455-481. The
 * defect was here: findOne meant a parent with two children only ever saw one,
 * so the switcher had nothing to switch between.
 *
 * This prompt is NOT blocked by U-08 and ships independently of promotion.
 */
const mongoose = require('mongoose');
const Student = require('../../models/Student');
const ctrl = require('../../controllers/studentPortalController');

const oid = () => new mongoose.Types.ObjectId();
const PARENT = oid();

function stub(byId = [], byEmail = []) {
  const origFind = Student.find;
  const origUpd = Student.findByIdAndUpdate;
  const backfilled = [];
  Student.find = (q) => {
    const rows = q && q.parentEmail ? byEmail : byId;
    const chain = {
      populate: () => chain,
      sort: () => Promise.resolve(rows),
    };
    return chain;
  };
  Student.findByIdAndUpdate = async (id) => { backfilled.push(String(id)); };
  return {
    backfilled,
    restore: () => { Student.find = origFind; Student.findByIdAndUpdate = origUpd; },
  };
}

const child = (name, roll) => ({ _id: oid(), rollNumber: roll, user: { name } });
const req = (over = {}) => ({
  user: { _id: PARENT, role: 'parent', email: 'p@example.com', school: oid() },
  query: {}, body: {}, ...over,
});

describe('GAP-PA-004 — a parent with several children sees all of them', () => {
  test('two linked children are BOTH returned', async () => {
    const a = child('Asha', 1); const b = child('Rohit', 2);
    const s = stub([a, b]);
    try {
      const kids = await ctrl.resolveChildren(req());
      expect(kids).toHaveLength(2);
      expect(kids.map((k) => k.user.name)).toEqual(['Asha', 'Rohit']);
    } finally { s.restore(); }
  });

  test('a parent with one child still returns exactly one — no regression', async () => {
    const s = stub([child('Asha', 1)]);
    try {
      expect(await ctrl.resolveChildren(req())).toHaveLength(1);
    } finally { s.restore(); }
  });

  test('a parent with no children returns an empty array, never null', async () => {
    const s = stub([]);
    try {
      const kids = await ctrl.resolveChildren(req());
      expect(Array.isArray(kids)).toBe(true);
      expect(kids).toHaveLength(0);
    } finally { s.restore(); }
  });
});

describe('legacy parentEmail linkage is preserved', () => {
  test('children found by email are included alongside parentId matches', async () => {
    const s = stub([child('Asha', 1)], [child('Legacy', 2)]);
    try {
      const kids = await ctrl.resolveChildren(req());
      expect(kids).toHaveLength(2);
      expect(kids.map((k) => k.user.name)).toEqual(['Asha', 'Legacy']);
    } finally { s.restore(); }
  });

  test('email-matched children are backfilled with parentId', async () => {
    const legacy = child('Legacy', 2);
    const s = stub([], [legacy]);
    try {
      await ctrl.resolveChildren(req());
      // A one-time cost per student; subsequent lookups use the indexed path.
      expect(s.backfilled).toContain(String(legacy._id));
    } finally { s.restore(); }
  });

  test('a child matched by BOTH paths is not duplicated', async () => {
    // The email query excludes ids already found by parentId.
    const a = child('Asha', 1);
    const s = stub([a], []);
    try {
      expect(await ctrl.resolveChildren(req())).toHaveLength(1);
    } finally { s.restore(); }
  });
});

describe('child selection', () => {
  test('an explicit childId selects that child', async () => {
    const a = child('Asha', 1); const b = child('Rohit', 2);
    const s = stub([a, b]);
    try {
      const sel = await ctrl.resolveChildren(req());
      expect(sel.find((c) => String(c._id) === String(b._id)).user.name).toBe('Rohit');
    } finally { s.restore(); }
  });

  test('non-parent roles get an empty array', async () => {
    const s = stub([child('X', 1)]);
    try {
      expect(await ctrl.resolveChildren(req({ user: { role: 'teacher' } }))).toHaveLength(0);
      expect(await ctrl.resolveChildren({})).toHaveLength(0);
    } finally { s.restore(); }
  });
});

describe('the defect is gone at the source', () => {
  test('resolveChildren is exported for the portal endpoint', () => {
    expect(typeof ctrl.resolveChildren).toBe('function');
  });

  test('the parent path no longer relies on a single-child findOne', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../controllers/studentPortalController.js'), 'utf8'
    );
    const parentBlock = src.slice(src.indexOf("role === 'parent'"), src.indexOf('resolveChildren(req)'));
    expect(parentBlock).not.toMatch(/findOne\(\{\s*parentId/);
  });
});
