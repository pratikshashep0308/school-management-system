/**
 * Staging finding #3 — the three delta pages must be REACHABLE.
 *
 * The original per-page tests rendered each component directly, so they passed
 * while the pages were unreachable in the running app (no <Route>, no nav item).
 * These tests assert the WIRING instead: that App.js declares a route for each
 * page and Sidebar.js declares a nav item for each, gated by the correct module
 * key. This is a source-structure requirement, so reading the wiring files is the
 * correct check (analogous to an import-graph assertion).
 */
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.resolve(__dirname, '../../App.js'), 'utf8');
const sidebarSrc = fs.readFileSync(path.resolve(__dirname, '../../components/common/Sidebar.js'), 'utf8');

const PAGES = [
  { comp: 'AcademicCalendar',      routePath: 'academic-calendar',      moduleKey: 'academicCalendar' },
  { comp: 'PromotionWorkflow',     routePath: 'promotion',              moduleKey: 'promotion' },
  { comp: 'NotificationProviders', routePath: 'notification-providers', moduleKey: 'notificationConfig' },
];

describe('App.js routes the delta pages', () => {
  PAGES.forEach(({ comp, routePath }) => {
    test(`imports ${comp}`, () => {
      expect(appSrc).toMatch(new RegExp(`import\\s+${comp}\\s+from`));
    });
    test(`declares a <Route> for /${routePath} rendering ${comp}`, () => {
      // Find the single-line <Route path="..."> and assert the same line renders
      // the component. Matches: path="academic-calendar" ... <AcademicCalendar
      const line = appSrc.split('\n').find(
        (l) => l.includes(`path="${routePath}"`) || l.includes(`path='${routePath}'`)
      );
      expect(line).toBeDefined();
      expect(line).toContain(comp);
    });
  });
});

describe('Sidebar.js exposes the delta pages', () => {
  PAGES.forEach(({ routePath, moduleKey }) => {
    test(`has a nav item for /${routePath}`, () => {
      expect(sidebarSrc).toMatch(new RegExp(`path:\\s*["']/${routePath}["']`));
    });
    test(`/${routePath} maps to module key ${moduleKey}`, () => {
      const re = new RegExp(`["']/${routePath}["']:\\s*["']${moduleKey}["']`);
      expect(sidebarSrc).toMatch(re);
    });
  });
});
