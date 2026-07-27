// backend/fms/index.js
//
// FMS plugin entry point.
//
// The plugin is an INDEPENDENT, TOGGLEABLE package. It:
//   1. reads SMS data over the SMS REST API only — never imports an SMS model,
//      never reads or writes an SMS collection;
//   2. owns fms_-prefixed collections in the same MongoDB database;
//   3. mounts nothing when FMS_ENABLED is not 'true';
//   4. adds no new datastore, language, or framework.
//
// Toggling off does NOT delete fms_ data. Off is not uninstall.

const config = require('./config');

/**
 * Returns the route tuple for server.js, or null when the plugin is disabled.
 *
 * Deliberately a plain tuple in the SMS's own [path, file] shape so the change
 * to server.js is a single guarded push and nothing else.
 *
 * Note the 2-element form: it bypasses the SMS `checkPermission` middleware,
 * which fails open. The FMS supplies its own deny-by-default wrapper.
 */
function routeTuple() {
  if (!config.isEnabled()) return null;
  return ['/api/fms', './fms/routes'];
}

module.exports = {
  config,
  routeTuple,
  isEnabled: config.isEnabled,
  version: config.version,
};