// frontend/src/pages/ParentDashboard.js
// Parent dashboard reuses the StudentDashboard with isParent context
// The backend returns the linked child's data via JWT

import StudentDashboard from './StudentDashboard';

// Parents see identical UI — same API returns child's data based on JWT role
export default StudentDashboard;