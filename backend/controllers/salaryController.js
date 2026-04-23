const mongoose = require('mongoose');

// GET all slips
exports.getAll = async (req, res) => {
  try {
    const SalarySlip = mongoose.model('SalarySlip');
    const filter = { school: req.user.school };
    if (req.query.month)  filter.month  = Number(req.query.month);
    if (req.query.year)   filter.year   = Number(req.query.year);
    if (req.query.status) filter.status = req.query.status;
    const slips = await SalarySlip.find(filter)
      .populate({ path: 'teacher', populate: { path: 'user', select: 'name email phone profileImage' }, select: 'user employeeId designation salary' })
      .sort({ createdAt: -1 });
    res.json({ success: true, count: slips.length, data: slips });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET one slip
exports.getOne = async (req, res) => {
  try {
    const SalarySlip = mongoose.model('SalarySlip');
    const slip = await SalarySlip.findOne({ _id: req.params.id, school: req.user.school })
      .populate({ path: 'teacher', populate: { path: 'user', select: 'name email phone profileImage' }, select: 'user employeeId designation salary' })
      .populate('paidBy', 'name');
    if (!slip) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: slip });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST pay salary
exports.pay = async (req, res) => {
  try {
    const SalarySlip = mongoose.model('SalarySlip');
    const { teacherId, month, year, basicSalary, allowances, deductions, paymentMode, paymentDate, remarks } = req.body;
    const allow  = allowances || {};
    const deduct = deductions || {};
    const totalAllow  = (allow.hra||0)+(allow.da||0)+(allow.ta||0)+(allow.medical||0)+(allow.other||0);
    const totalDeduct = (deduct.pf||0)+(deduct.tax||0)+(deduct.loan||0)+(deduct.other||0);
    const grossSalary = (basicSalary||0) + totalAllow;
    const netSalary   = grossSalary - totalDeduct;
    const slip = await SalarySlip.findOneAndUpdate(
      { school: req.user.school, teacher: teacherId, month: Number(month), year: Number(year) },
      { school: req.user.school, teacher: teacherId, month: Number(month), year: Number(year),
        basicSalary: basicSalary||0, allowances: allow, deductions: deduct,
        grossSalary, netSalary, paymentMode: paymentMode||'bank',
        paymentDate: paymentDate||new Date(), status: 'paid', remarks, paidBy: req.user._id },
      { upsert: true, new: true }
    ).populate({ path: 'teacher', populate: { path: 'user', select: 'name email' } });
    res.json({ success: true, data: slip });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// PUT update
exports.update = async (req, res) => {
  try {
    const SalarySlip = mongoose.model('SalarySlip');
    const { allowances, deductions, basicSalary, ...rest } = req.body;
    const allow  = allowances || {};
    const deduct = deductions || {};
    const totalAllow  = (allow.hra||0)+(allow.da||0)+(allow.ta||0)+(allow.medical||0)+(allow.other||0);
    const totalDeduct = (deduct.pf||0)+(deduct.tax||0)+(deduct.loan||0)+(deduct.other||0);
    const grossSalary = (basicSalary||0) + totalAllow;
    const netSalary   = grossSalary - totalDeduct;
    const slip = await SalarySlip.findOneAndUpdate(
      { _id: req.params.id, school: req.user.school },
      { ...rest, basicSalary, allowances: allow, deductions: deduct, grossSalary, netSalary },
      { new: true }
    );
    if (!slip) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: slip });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// DELETE
exports.remove = async (req, res) => {
  try {
    const SalarySlip = mongoose.model('SalarySlip');
    await SalarySlip.findOneAndDelete({ _id: req.params.id, school: req.user.school });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET salary sheet
exports.getSalarySheet = async (req, res) => {
  try {
    const SalarySlip = mongoose.model('SalarySlip');
    const Teacher    = mongoose.model('Teacher');
    const now   = new Date();
    const month = Number(req.query.month) || (now.getMonth() + 1);
    const year  = Number(req.query.year)  || now.getFullYear();
    const teachers = await Teacher.find({ school: req.user.school, isActive: true })
      .populate('user', 'name email phone')
      .select('user employeeId designation salary');
    const slips    = await SalarySlip.find({ school: req.user.school, month, year });
    const slipMap  = {};
    slips.forEach(s => { slipMap[s.teacher.toString()] = s; });
    const sheet = teachers.map(t => ({
      teacher: t,
      slip:    slipMap[t._id.toString()] || null,
      status:  slipMap[t._id.toString()]?.status || 'pending',
    }));
    res.json({ success: true, data: sheet, total: teachers.length,
      paid: slips.filter(s=>s.status==='paid').length,
      totalAmount: slips.filter(s=>s.status==='paid').reduce((a,s)=>a+s.netSalary,0) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};