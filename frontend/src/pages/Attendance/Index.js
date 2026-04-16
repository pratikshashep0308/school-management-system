/* eslint-disable no-unused-vars */
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import StudentAttendance       from './StudentAttendance';
import EmployeeAttendance      from './EmployeeAttendance';
import ClasswiseReport         from './ClasswiseReport';
import StudentAttendanceReport from './StudentAttendance';
import EmployeeAttendanceReport from './EmployeeAttendanceReport';

const TABS = [
  { key: 'student',   label: 'Students Attendance',        admin: false },
  { key: 'employee',  label: 'Employees Attendance',       admin: true  },
  { key: 'classwise', label: 'Class wise Report',          admin: false },
  { key: 'stuReport', label: 'Students Attendance Report', admin: false },
  { key: 'empReport', label: 'Employees Attendance Report',admin: true  },
];

export default function Attendance() {
  const { isAdmin } = useAuth();
  const [active, setActive] = useState('student');

  const visible = TABS.filter(t => !t.admin || isAdmin);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize:24, fontWeight:800, color:'#111827', margin:0 }}>📅 Attendance</h2>
        <p style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>Mark, view and analyse attendance</p>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:2, background:'#F3F4F6', borderRadius:10, padding:4, flexWrap:'wrap' }}>
        {visible.map(t => (
          <button key={t.key} onClick={() => setActive(t.key)}
            style={{
              padding:'8px 16px', borderRadius:8, fontSize:12, fontWeight:700,
              border:'none', cursor:'pointer', transition:'all 0.15s', whiteSpace:'nowrap',
              background: active === t.key ? '#fff' : 'transparent',
              color:      active === t.key ? '#1D4ED8' : '#6B7280',
              boxShadow:  active === t.key ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {active === 'student'   && <StudentAttendance />}
      {active === 'employee'  && <EmployeeAttendance />}
      {active === 'classwise' && <ClasswiseReport />}
      {active === 'stuReport' && <StudentAttendanceReport />}
      {active === 'empReport' && <EmployeeAttendanceReport />}
    </div>
  );
}