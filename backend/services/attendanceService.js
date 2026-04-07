// backend/services/attendanceService.js
// Analytics engine, alert system, holiday handling, QR token generation

const mongoose = require('mongoose');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toId(id) {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}

function normalizeDate(d) {
  const date = new Date(d);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

// Returns true if date is a Sunday (skip Saturday optional per school config)
function isWeekend(date) {
  const d = new Date(date);
  return d.getDay() === 0; // 0 = Sunday
}

// Get all working days in a month (excluding Sundays + holidays)
function getWorkingDays(year, month, holidays = []) {
  const days = [];
  const d = new Date(year, month - 1, 1);
  const holidaySet = new Set(holidays.map(h => normalizeDate(h).toISOString()));

  while (d.getMonth() === month - 1) {
    const copy = new Date(d);
    if (!isWeekend(copy) && !holidaySet.has(normalizeDate(copy).toISOString())) {
      days.push(new Date(copy));
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// ─── ANALYTICS ENGINE ─────────────────────────────────────────────────────────

/**
 * getStudentAnalytics
 * Full analytics for a single student — monthly %, trend, calendar, streaks
 */
exports.getStudentAnalytics = async (studentId, schoolId, options = {}) => {
  const { Attendance } = require('../models/index');
  const { month, year, months = 6 } = options;

  const sid = toId(studentId);
  const now = new Date();

  // Last N months trend
  const trendStart = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  const allRecords = await Attendance.find({
    student: sid,
    school:  toId(schoolId),
    date:    { $gte: trendStart },
  }).sort({ date: 1 }).lean();

  // Group by month
  const monthlyMap = {};
  allRecords.forEach(r => {
    const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2,'0')}`;
    if (!monthlyMap[key]) monthlyMap[key] = { present: 0, absent: 0, late: 0, excused: 0, total: 0, key };
    monthlyMap[key][r.status] = (monthlyMap[key][r.status] || 0) + 1;
    monthlyMap[key].total++;
  });

  const monthlyTrend = Object.values(monthlyMap).map(m => ({
    ...m,
    percentage: m.total > 0 ? Math.round(((m.present + m.late) / m.total) * 100) : 0,
  }));

  // Current period records
  let periodFilter = { student: sid, school: toId(schoolId) };
  if (month && year) {
    periodFilter.date = {
      $gte: new Date(year, month - 1, 1),
      $lte: new Date(year, month, 0, 23, 59, 59),
    };
  } else {
    periodFilter.date = { $gte: trendStart };
  }

  const records = await Attendance.find(periodFilter).sort({ date: -1 }).lean();

  const total   = records.length;
  const present = records.filter(r => r.status === 'present').length;
  const absent  = records.filter(r => r.status === 'absent').length;
  const late    = records.filter(r => r.status === 'late').length;
  const excused = records.filter(r => r.status === 'excused').length;
  const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

  // Calendar map
  const calendar = {};
  records.forEach(r => {
    calendar[r.date.toISOString().split('T')[0]] = r.status;
  });

  // Streak calculation (consecutive present days)
  let currentStreak = 0, longestStreak = 0, tempStreak = 0;
  const sorted = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
  sorted.forEach(r => {
    if (r.status === 'present' || r.status === 'late') {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  });
  // Current streak from today backwards
  const reverseSorted = [...sorted].reverse();
  for (const r of reverseSorted) {
    if (r.status === 'present' || r.status === 'late') currentStreak++;
    else break;
  }

  // Consecutive absent days (for alert)
  let consecutiveAbsent = 0;
  for (const r of reverseSorted) {
    if (r.status === 'absent') consecutiveAbsent++;
    else break;
  }

  return {
    summary:     { total, present, absent, late, excused, percentage },
    monthlyTrend,
    calendar,
    streaks:     { current: currentStreak, longest: longestStreak, consecutiveAbsent },
    records,
    isLowAttendance: percentage < 75 && total >= 10,
    alertLevel:  percentage < 60 ? 'critical' : percentage < 75 ? 'warning' : 'ok',
  };
};

/**
 * getClassAnalytics
 * Analytics for a class — avg %, per-student breakdown, daily trend
 */
exports.getClassAnalytics = async (classId, schoolId, month, year) => {
  const { Attendance } = require('../models/index');
  const Student = require('../models/Student');

  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0, 23, 59, 59);

  const [students, records] = await Promise.all([
    Student.find({ class: toId(classId), isActive: true, school: toId(schoolId) })
      .populate('user', 'name profileImage')
      .sort({ rollNumber: 1 })
      .lean(),
    Attendance.find({ class: toId(classId), school: toId(schoolId), date: { $gte: start, $lte: end } }).lean(),
  ]);

  // Per-student map
  const studentStats = {};
  students.forEach(s => {
    studentStats[s._id.toString()] = {
      student:    { id: s._id, name: s.user?.name, rollNumber: s.rollNumber, admissionNumber: s.admissionNumber },
      present: 0, absent: 0, late: 0, excused: 0, total: 0, percentage: 0, days: {},
    };
  });

  records.forEach(r => {
    const sid = r.student.toString();
    if (!studentStats[sid]) return;
    const day = r.date.getDate();
    studentStats[sid].days[day] = r.status;
    studentStats[sid][r.status] = (studentStats[sid][r.status] || 0) + 1;
    studentStats[sid].total++;
  });

  const breakdown = Object.values(studentStats).map(s => ({
    ...s,
    percentage: s.total > 0 ? Math.round(((s.present + s.late) / s.total) * 100) : 0,
    alertLevel:  s.total >= 5 && ((s.present + s.late) / s.total) < 0.75 ? 'warning' : 'ok',
  }));

  // Daily attendance for the month
  const dailyMap = {};
  records.forEach(r => {
    const key = r.date.toISOString().split('T')[0];
    if (!dailyMap[key]) dailyMap[key] = { date: key, present: 0, absent: 0, late: 0, total: 0 };
    dailyMap[key][r.status] = (dailyMap[key][r.status] || 0) + 1;
    dailyMap[key].total++;
  });
  const dailyTrend = Object.values(dailyMap)
    .map(d => ({ ...d, percentage: d.total > 0 ? Math.round((d.present / d.total) * 100) : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const classTotal   = records.length;
  const classPresent = records.filter(r => r.status === 'present').length;
  const classAvgPct  = classTotal > 0 ? Math.round((classPresent / classTotal) * 100) : 0;

  const topStudents = [...breakdown].sort((a, b) => b.percentage - a.percentage).slice(0, 5);
  const lowStudents = breakdown.filter(s => s.total >= 5 && s.percentage < 75).sort((a, b) => a.percentage - b.percentage);
  const workingDays = [...new Set(records.map(r => r.date.toISOString().split('T')[0]))].length;

  return {
    summary: { totalStudents: students.length, classAvgPercentage: classAvgPct, workingDays, month: parseInt(month), year: parseInt(year) },
    breakdown,
    dailyTrend,
    topStudents,
    lowStudents,
  };
};

// ─── ALERT SYSTEM ─────────────────────────────────────────────────────────────

/**
 * checkAndSendAlerts
 * Called after marking attendance — checks for:
 *   1. Student below 75% attendance → notify student + parent
 *   2. Student absent 3+ consecutive days → notify parent
 *   3. Daily absent notification for parents
 */
exports.checkAndSendAlerts = async (classId, date, attendanceData, schoolId, sentBy) => {
  const { Attendance, Notification } = require('../models/index');
  const Student = require('../models/Student');

  const notificationsToCreate = [];
  const thirtyDaysAgo = new Date(date);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  for (const item of attendanceData) {
    const student = await Student.findById(item.studentId)
      .populate('user', 'name')
      .populate('class', 'name section')
      .lean();

    if (!student) continue;

    const studentName = student.user?.name || 'Student';
    const className   = student.class ? `${student.class.name} ${student.class.section || ''}` : '';

    // ── Alert 1: Daily absent notification to parent ─────────────────────────
    if (item.status === 'absent' && student.parentEmail) {
      notificationsToCreate.push({
        title:       `Attendance Alert: ${studentName} Absent Today`,
        message:     `${studentName} (${className}) was marked absent on ${new Date(date).toLocaleDateString('en-IN')}. Please contact the school if this is unexpected.`,
        type:        'alert',
        priority:    'high',
        audience:    'parents',
        targetClass: classId,
        sentBy:      toId(sentBy),
        school:      toId(schoolId),
      });
    }

    // ── Alert 2: Consecutive absences (3+ days) ───────────────────────────────
    const recentRecords = await Attendance.find({
      student: item.studentId,
      date:    { $gte: thirtyDaysAgo, $lte: new Date(date) },
      school:  toId(schoolId),
    }).sort({ date: -1 }).limit(5).lean();

    let consecutiveAbsent = 0;
    for (const r of recentRecords) {
      if (r.status === 'absent') consecutiveAbsent++;
      else break;
    }

    if (consecutiveAbsent >= 3) {
      notificationsToCreate.push({
        title:       `⚠️ ${studentName} Absent for ${consecutiveAbsent} Days`,
        message:     `${studentName} has been absent for ${consecutiveAbsent} consecutive school days. Please contact the school immediately.`,
        type:        'alert',
        priority:    'urgent',
        audience:    'parents',
        targetClass: toId(classId),
        sentBy:      toId(sentBy),
        school:      toId(schoolId),
      });
    }

    // ── Alert 3: Low attendance warning (<75%) ────────────────────────────────
    const monthRecords = await Attendance.find({
      student: item.studentId,
      school:  toId(schoolId),
      date:    { $gte: thirtyDaysAgo },
    }).lean();

    if (monthRecords.length >= 10) {
      const present = monthRecords.filter(r => r.status === 'present' || r.status === 'late').length;
      const pct = Math.round((present / monthRecords.length) * 100);

      if (pct < 75) {
        const level = pct < 60 ? '🔴 Critical' : '🟡 Warning';
        notificationsToCreate.push({
          title:       `${level}: ${studentName}'s Attendance is ${pct}%`,
          message:     `${studentName} (${className}) has ${pct}% attendance over the last 30 days. Minimum required is 75%. Immediate improvement is needed.`,
          type:        'alert',
          priority:    pct < 60 ? 'urgent' : 'high',
          audience:    'all',
          targetClass: toId(classId),
          sentBy:      toId(sentBy),
          school:      toId(schoolId),
        });
      }
    }
  }

  if (notificationsToCreate.length > 0) {
    await Notification.insertMany(notificationsToCreate, { ordered: false }).catch(() => {});
  }

  return notificationsToCreate.length;
};

// ─── HOLIDAY MANAGEMENT ───────────────────────────────────────────────────────

// In-memory holiday list per school (in production, use a Holiday model)
const schoolHolidays = {};

exports.setHolidays = (schoolId, dates) => {
  schoolHolidays[schoolId.toString()] = dates.map(d => normalizeDate(d).toISOString());
};

exports.getHolidays = (schoolId) => {
  return (schoolHolidays[schoolId?.toString()] || []).map(d => new Date(d));
};

exports.isHoliday = (date, schoolId) => {
  const key = normalizeDate(date).toISOString();
  const holidays = schoolHolidays[schoolId?.toString()] || [];
  return isWeekend(date) || holidays.includes(key);
};

exports.getWorkingDays = getWorkingDays;
exports.isWeekend = isWeekend;
exports.normalizeDate = normalizeDate;

// ─── QR ATTENDANCE (Future-ready) ────────────────────────────────────────────

const crypto = require('crypto');

/**
 * generateQRToken
 * Creates a time-limited token for QR-based attendance marking.
 * The QR code encodes this token — the device scans it and calls
 * POST /api/attendance/qr-mark with { token, studentId }
 *
 * Token expires in `ttl` minutes (default 5).
 */
exports.generateQRToken = (classId, date, schoolId, ttl = 5) => {
  const payload = JSON.stringify({
    classId:   classId.toString(),
    date:      normalizeDate(date).toISOString(),
    schoolId:  schoolId.toString(),
    expiresAt: Date.now() + ttl * 60 * 1000,
    nonce:     crypto.randomBytes(8).toString('hex'),
  });
  const token  = Buffer.from(payload).toString('base64');
  const sig    = crypto.createHmac('sha256', process.env.JWT_SECRET || 'secret').update(token).digest('hex');
  return `${token}.${sig}`;
};

/**
 * verifyQRToken
 * Returns the decoded payload or throws if invalid/expired.
 */
exports.verifyQRToken = (tokenStr) => {
  const [token, sig] = tokenStr.split('.');
  const expectedSig = crypto.createHmac('sha256', process.env.JWT_SECRET || 'secret').update(token).digest('hex');
  if (sig !== expectedSig) throw new Error('Invalid QR token signature');

  const payload = JSON.parse(Buffer.from(token, 'base64').toString());
  if (Date.now() > payload.expiresAt) throw new Error('QR token has expired');
  return payload;
};

// ─── EXPORT HELPERS ───────────────────────────────────────────────────────────

/**
 * buildExcelReport
 * Returns an ExcelJS workbook buffer for download
 */
exports.buildExcelReport = async (data, meta, reportType = 'monthly') => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EduCore Attendance System';
  wb.created = new Date();

  const ws = wb.addWorksheet(`Attendance Report`, {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  // Title row
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = `Attendance Report — ${meta.className || ''} — ${meta.monthName || ''} ${meta.year || ''}`;
  ws.getCell('A1').font  = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Summary row
  ws.mergeCells('A2:H2');
  ws.getCell('A2').value = `Total Students: ${meta.totalStudents || data.length} | Working Days: ${meta.workingDays || '—'} | Class Avg: ${meta.classAvgPercentage || '—'}%`;
  ws.getCell('A2').font  = { italic: true, size: 10 };
  ws.getCell('A2').fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
  ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.getRow(2).height = 18;

  // Headers
  const headers = ['Roll No', 'Student Name', 'Present', 'Absent', 'Late', 'Excused', 'Total', 'Attendance %'];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { horizontal: 'center' };
  });
  headerRow.height = 20;

  // Data rows
  data.forEach((row, i) => {
    const student = row.student || row;
    const r = ws.addRow([
      student.rollNumber || '',
      student.name || '',
      row.present || 0,
      row.absent  || 0,
      row.late    || 0,
      row.excused || 0,
      row.total   || 0,
      `${row.percentage || 0}%`,
    ]);

    // Alternate row colour
    if (i % 2 === 0) {
      r.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      });
    }

    // Colour-code the percentage cell
    const pctCell = r.getCell(8);
    const pct = row.percentage || 0;
    pctCell.font = { bold: true, color: { argb: pct >= 90 ? 'FF16A34A' : pct >= 75 ? 'FFD97706' : 'FFDC2626' } };
    pctCell.alignment = { horizontal: 'center' };
  });

  // Column widths
  ws.columns = [
    { width: 10 }, { width: 28 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 10 }, { width: 14 },
  ];

  return wb.xlsx.writeBuffer();
};

/**
 * buildPDFReport
 * Returns a PDFKit doc piped to the response
 */
exports.buildPDFReport = (res, data, meta) => {
  const PDFDoc = require('pdfkit');
  const doc = new PDFDoc({ margin: 36, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${meta.year}-${meta.month}.pdf"`);
  doc.pipe(res);

  // Title
  doc.fontSize(16).font('Helvetica-Bold')
    .text(`Attendance Report — ${meta.className || ''}`, { align: 'center' });
  doc.fontSize(10).font('Helvetica')
    .text(`${meta.monthName || ''} ${meta.year || ''} | Students: ${meta.totalStudents || data.length} | Avg: ${meta.classAvgPercentage || 0}%`, { align: 'center' });
  doc.moveDown(0.8);

  const pageW  = doc.page.width - 72;
  const cols   = [60, 160, 50, 50, 50, 50, 50, 70]; // widths
  const headers = ['Roll', 'Student', 'Present', 'Absent', 'Late', 'Excused', 'Total', '%'];
  const startX = 36;
  let y = doc.y;

  // Header row
  doc.rect(startX, y, pageW, 22).fill('#1E3A8A');
  doc.fill('#fff').fontSize(9).font('Helvetica-Bold');
  let x = startX;
  headers.forEach((h, i) => {
    doc.text(h, x + 3, y + 6, { width: cols[i] - 6, align: 'center' });
    x += cols[i];
  });
  doc.fill('#000');
  y += 22;

  // Data rows
  data.forEach((row, idx) => {
    if (y > doc.page.height - 60) {
      doc.addPage({ layout: 'landscape' });
      y = 36;
    }
    const rh = 18;
    if (idx % 2 === 0) doc.rect(startX, y, pageW, rh).fill('#F8FAFC');
    doc.fill('#111827').fontSize(8).font('Helvetica');

    const student = row.student || row;
    const values = [
      student.rollNumber || '—',
      student.name || '—',
      row.present, row.absent, row.late, row.excused || 0, row.total,
      `${row.percentage || 0}%`,
    ];

    x = startX;
    values.forEach((v, i) => {
      if (i === 7) {
        const pct = row.percentage || 0;
        doc.fill(pct >= 90 ? '#16A34A' : pct >= 75 ? '#D97706' : '#DC2626').font('Helvetica-Bold');
      }
      doc.text(String(v), x + 3, y + 4, { width: cols[i] - 6, align: i > 1 ? 'center' : 'left', ellipsis: true });
      doc.fill('#111827').font('Helvetica');
      x += cols[i];
    });

    doc.moveTo(startX, y + rh).lineTo(startX + pageW, y + rh).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    y += rh;
  });

  doc.end();
};