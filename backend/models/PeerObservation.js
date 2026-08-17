/**
 * PeerObservation — FP-017 · GAP-PLC-002 · FINAL LLD 1.1 §10.1
 *
 * A two-teacher artifact, kept separate from Meeting because it is not a
 * scheduled event and is distinct from a formal principal observation.
 *
 * ── Privacy is a query-layer control ────────────────────────────────────────
 * Private between the two participating teachers by default. A principal must
 * not be able to read one through a generic list endpoint, so the restriction
 * belongs in the query — `visibleTo()` below returns the filter every read path
 * must apply. A `visibility` field that callers may ignore is not a control.
 *
 * Note that `schoolAdmin` is deliberately granted 'none' on the peerObservations
 * moduleKey in the permission seed. That is not an oversight.
 */
const mongoose = require('mongoose');

const PeerObservationSchema = new mongoose.Schema(
  {
    observer: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    observed: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    date: { type: Date, required: true, default: Date.now },

    focus: { type: String, trim: true },
    notes: { type: String, trim: true },

    // 'shared' requires the observed teacher's explicit action; it is never a default.
    visibility: { type: String, enum: ['private', 'shared'], default: 'private' },
    sharedAt: { type: Date, default: null },

    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  },
  { timestamps: true }
);

PeerObservationSchema.index({ school: 1, observer: 1, date: -1 });
PeerObservationSchema.index({ school: 1, observed: 1, date: -1 });

/** A teacher cannot observe themselves — that is a self-reflection, not a peer observation. */
PeerObservationSchema.pre('validate', function (next) {
  if (String(this.observer) === String(this.observed)) {
    return next(
      new Error('PEER_OBSERVATION_SELF: observer and observed must be different teachers.')
    );
  }
  return next();
});

/**
 * The mandatory read filter. EVERY read path must apply this — it is the privacy
 * control, not the `visibility` field.
 *
 * @param {*} teacherId the requesting teacher's id
 * @returns {object} a Mongoose filter fragment
 */
PeerObservationSchema.statics.visibleTo = function (teacherId) {
  return {
    $or: [
      { observer: teacherId },
      { observed: teacherId },
      { visibility: 'shared' },
    ],
  };
};

module.exports =
  mongoose.models.PeerObservation ||
  mongoose.model('PeerObservation', PeerObservationSchema);
