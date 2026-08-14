// backend/models/RolePermission.js
// Stores the role → module access matrix for a school.
// Each document = one role's permissions for one school.
const mongoose = require('mongoose');

const RolePermissionSchema = new mongoose.Schema({
  role: {
    type: String,
    required: true,
    enum: ['superAdmin', 'schoolAdmin', 'teacher', 'accountant', 'librarian', 'transportManager', 'student', 'parent'],
  },
  // Map of moduleKey -> access level string
  // Levels: 'none' | 'read' | 'edit' | 'admin'
  // e.g. { students: 'edit', fees: 'none', library: 'read' }
  permissions: {
    type: Map,
    of: String,
    default: {},
  },
  school:    { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

// One permission document per role per school
RolePermissionSchema.index({ role: 1, school: 1 }, { unique: true });

module.exports = mongoose.models.RolePermission
  || mongoose.model('RolePermission', RolePermissionSchema);