// backend/fms/services/banking/statementMatcher.js
//
// Bank statement parsing and auto-matching. SRS M9 / FR-M9, BPMN WF7,
// screens SCR-41 (reconciliation) and SCR-42 (import).
//
// ─── PURE ON PURPOSE ─────────────────────────────────────────────────────────
// No database. Matching a statement to a ledger is where a subtle error is
// least visible: a wrong match reconciles two unrelated movements and both
// stop being investigated. Pure logic can be tested against every shape of
// near-miss.
//
// ─── THE INVERSION THAT CATCHES PEOPLE OUT ───────────────────────────────────
// The statement is written from the BANK's point of view, and the bank's books
// are the mirror of ours:
//
//     money arriving   →  our ledger: DEBIT Bank      statement: CREDIT
//     money leaving    →  our ledger: CREDIT Bank     statement: DEBIT
//
// Matching on amount alone would happily pair a ₹5,000 deposit with a ₹5,000
// withdrawal. Direction is therefore checked first, and never inferred from
// the sign of a number that might have come from either perspective.

/** How confident a match is, and therefore whether a human need look. */
const CONFIDENCE = {
  EXACT: 'exact',        // amount, direction, date and reference all agree
  STRONG: 'strong',      // amount, direction and reference agree; date differs
  PROBABLE: 'probable',  // amount and direction agree; date is close
  WEAK: 'weak',          // amount is close; needs a human
  NONE: 'none',
};

/** Only these are applied without review. */
const AUTO_MATCH_AT = [CONFIDENCE.EXACT, CONFIDENCE.STRONG];

const DEFAULTS = {
  /** A cheque can take days to clear, so dates legitimately differ. */
  dateToleranceDays: 7,
  /** Amounts must agree to the paisa unless a tolerance is set deliberately. */
  amountTolerancePaise: 0,
  /** Below this, no match is offered at all. */
  minConfidence: CONFIDENCE.WEAK,
};

const RANK = {
  [CONFIDENCE.EXACT]: 4,
  [CONFIDENCE.STRONG]: 3,
  [CONFIDENCE.PROBABLE]: 2,
  [CONFIDENCE.WEAK]: 1,
  [CONFIDENCE.NONE]: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

/** Split a CSV line, honouring quoted fields containing commas. */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i += 1; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Amount text → integer paise.
 *
 * Bank exports are inconsistent: "1,234.56", "1234.56 Cr", "(1,234.56)" for
 * negatives, and occasionally a bare "-". Returning null for anything
 * unparseable is deliberate — guessing at a money value is worse than
 * reporting that the row could not be read.
 */
function parseAmount(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s || s === '-' || s === '—') return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }

  s = s.replace(/\b(cr|dr)\b/gi, '').replace(/[₹$,\s]/g, '').trim();
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return null;

  const paise = Math.round(parseFloat(s) * 100);
  if (!Number.isFinite(paise)) return null;
  return negative ? -paise : paise;
}

/** Bank date formats: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, dd-MMM-yyyy. */
function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    // dd/mm/yyyy — the Indian convention, and what every bank here exports.
    return new Date(Date.UTC(year, +m[2] - 1, +m[1]));
  }

  const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{2,4})/);
  if (m) {
    const mon = months[m[2].toLowerCase()];
    if (mon !== undefined) {
      const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return new Date(Date.UTC(year, mon, +m[1]));
    }
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse a CSV statement.
 *
 * @param {string} csv
 * @param {object} mapping  column names, e.g.
 *        { date:'Txn Date', narration:'Description', debit:'Withdrawal',
 *          credit:'Deposit', balance:'Balance', reference:'Chq/Ref No' }
 *        Or `{ date, narration, amount }` where a sign carries direction.
 * @returns {{rows:Array, errors:Array, headers:Array}}
 */
function parseStatement(csv, mapping = {}) {
  const lines = String(csv || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { rows: [], errors: [{ line: 0, reason: 'The file has no data rows' }], headers: [] };
  }

  const headers = splitCsvLine(lines[0]);
  const idx = (name) => (name ? headers.findIndex((h) => h.toLowerCase() === String(name).toLowerCase()) : -1);

  const col = {
    date: idx(mapping.date || 'date'),
    narration: idx(mapping.narration || 'narration'),
    debit: idx(mapping.debit || 'debit'),
    credit: idx(mapping.credit || 'credit'),
    amount: idx(mapping.amount || 'amount'),
    balance: idx(mapping.balance || 'balance'),
    reference: idx(mapping.reference || 'reference'),
  };

  if (col.date === -1) {
    return { rows: [], errors: [{ line: 0, reason: `No date column found (looked for '${mapping.date || 'date'}')` }], headers };
  }
  if (col.debit === -1 && col.credit === -1 && col.amount === -1) {
    return { rows: [], errors: [{ line: 0, reason: 'No amount column found' }], headers };
  }

  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    const at = (n) => (n >= 0 && n < f.length ? f[n] : null);

    const date = parseDate(at(col.date));
    if (!date) { errors.push({ line: i + 1, reason: `Unreadable date '${at(col.date)}'`, raw: lines[i] }); continue; }

    let amount = null;
    let direction = null;

    if (col.debit >= 0 || col.credit >= 0) {
      const dr = parseAmount(at(col.debit));
      const cr = parseAmount(at(col.credit));
      if (dr && cr) { errors.push({ line: i + 1, reason: 'Both debit and credit are populated', raw: lines[i] }); continue; }
      if (dr) { amount = Math.abs(dr); direction = 'debit'; }
      else if (cr) { amount = Math.abs(cr); direction = 'credit'; }
    } else {
      const a = parseAmount(at(col.amount));
      if (a !== null) { amount = Math.abs(a); direction = a < 0 ? 'debit' : 'credit'; }
    }

    if (amount === null || amount === 0) {
      errors.push({ line: i + 1, reason: 'No usable amount on this row', raw: lines[i] });
      continue;
    }

    rows.push({
      lineNumber: i + 1,
      valueDate: date,
      narration: at(col.narration) || '',
      reference: at(col.reference) || '',
      // Statement direction, from the BANK's point of view.
      statementDirection: direction,
      amount,
      runningBalance: col.balance >= 0 ? parseAmount(at(col.balance)) : null,
      raw: lines[i],
    });
  }

  return { rows, errors, headers };
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A statement line's direction expressed in OUR ledger's terms.
 *
 *   statement credit (money in)  →  our Bank account is DEBITED
 *   statement debit  (money out) →  our Bank account is CREDITED
 */
function ledgerDirectionOf(statementDirection) {
  return statementDirection === 'credit' ? 'debit' : 'credit';
}

/** Pull cheque numbers, UTRs and voucher numbers out of free text. */
function extractReferences(text) {
  const s = String(text || '').toUpperCase();
  const found = new Set();

  // Voucher numbers we issued, e.g. PMT-2026-27-00001
  for (const m of s.matchAll(/\b(INC|PMT|RCT|JV|EXP|PO|PR|GRN)-\d{4}-\d{2}-\d{4,6}\b/g)) found.add(m[0]);
  // Cheque numbers: 6 digits, the CTS standard
  for (const m of s.matchAll(/\b\d{6}\b/g)) found.add(m[0]);
  // Any alphanumeric token carrying BOTH letters and digits: UTRs
  // (SBIN123456789012), short bank refs (NEFT001), instrument codes.
  //
  // Requiring both is what keeps it useful — a letters-only rule would match
  // every word in a narration, and a digits-only rule every date and amount.
  for (const m of s.matchAll(/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{5,20}\b/g)) {
    found.add(m[0]);
  }

  return [...found];
}

function referencesOverlap(a, b) {
  const A = new Set(extractReferences(a));
  if (!A.size) return false;
  for (const r of extractReferences(b)) if (A.has(r)) return true;
  return false;
}

function daysBetween(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

/**
 * Score one statement line against one ledger entry.
 *
 * Direction is checked FIRST and disqualifies outright. Without that, a ₹5,000
 * deposit and a ₹5,000 withdrawal look like a perfect match.
 */
function scoreMatch(line, entry, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const wantDirection = ledgerDirectionOf(line.statementDirection);
  const entryDirection = (entry.debit || 0) > 0 ? 'debit' : 'credit';

  if (entryDirection !== wantDirection) {
    return { confidence: CONFIDENCE.NONE, reason: 'Opposite direction' };
  }

  const entryAmount = (entry.debit || 0) + (entry.credit || 0);
  const amountDiff = Math.abs(entryAmount - line.amount);
  if (amountDiff > o.amountTolerancePaise) {
    return { confidence: CONFIDENCE.NONE, reason: `Amount differs by ${amountDiff} paise` };
  }

  const days = daysBetween(line.valueDate, entry.entryDate);
  const refMatch = referencesOverlap(
    `${line.narration} ${line.reference}`,
    // referenceNumber first: it is the field that actually carries the UTR or
    // cheque number. Narration only helps when someone typed it in by hand.
    `${entry.referenceNumber || ''} ${entry.narration || ''} ${entry.voucherNumber || ''}`
  );

  let confidence;
  if (refMatch && days === 0) confidence = CONFIDENCE.EXACT;
  else if (refMatch && days <= o.dateToleranceDays) confidence = CONFIDENCE.STRONG;
  else if (days === 0) confidence = CONFIDENCE.PROBABLE;
  else if (days <= o.dateToleranceDays) confidence = CONFIDENCE.PROBABLE;
  else confidence = CONFIDENCE.WEAK;

  return {
    confidence,
    amountDiff,
    daysApart: days,
    referenceMatch: refMatch,
    reason: refMatch
      ? `Reference matches, ${days} day(s) apart`
      : `Amount and direction match, ${days} day(s) apart`,
  };
}

/**
 * Match a statement against unreconciled ledger entries.
 *
 * A ledger entry is claimed by at most one statement line: two lines matching
 * the same entry would reconcile one real movement twice, which is how a
 * duplicate payment hides.
 */
function matchStatement(lines, entries, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const claimed = new Set();
  const results = [];

  // Best candidates first, so a confident match takes precedence over a
  // speculative one competing for the same entry.
  const scored = [];
  for (const line of lines) {
    for (const entry of entries) {
      const s = scoreMatch(line, entry, o);
      if (s.confidence === CONFIDENCE.NONE) continue;
      if (RANK[s.confidence] < RANK[o.minConfidence]) continue;
      scored.push({ line, entry, ...s });
    }
  }
  scored.sort((a, b) =>
    RANK[b.confidence] - RANK[a.confidence] || a.daysApart - b.daysApart);

  const matchedLines = new Map();
  for (const c of scored) {
    if (matchedLines.has(c.line.lineNumber)) continue;
    if (claimed.has(String(c.entry._id))) continue;
    matchedLines.set(c.line.lineNumber, c);
    claimed.add(String(c.entry._id));
  }

  for (const line of lines) {
    const m = matchedLines.get(line.lineNumber);
    results.push({
      line,
      matched: !!m,
      entry: m?.entry || null,
      confidence: m?.confidence || CONFIDENCE.NONE,
      autoMatched: !!m && AUTO_MATCH_AT.includes(m.confidence),
      daysApart: m?.daysApart,
      referenceMatch: m?.referenceMatch,
      reason: m?.reason || 'No candidate found',
    });
  }

  const auto = results.filter((r) => r.autoMatched);
  const suggested = results.filter((r) => r.matched && !r.autoMatched);
  const unmatched = results.filter((r) => !r.matched);
  const unmatchedEntries = entries.filter((e) => !claimed.has(String(e._id)));

  return {
    results,
    autoMatchedCount: auto.length,
    suggestedCount: suggested.length,
    unmatchedCount: unmatched.length,
    // Ledger entries with no statement line: cheques issued but not presented,
    // or deposits not yet credited. These are the reconciling items.
    unmatchedEntries,
    summary:
      `${auto.length} auto-matched, ${suggested.length} suggested, ` +
      `${unmatched.length} statement line(s) unmatched, ` +
      `${unmatchedEntries.length} ledger entry(ies) outstanding`,
  };
}

/**
 * Reconciliation arithmetic.
 *
 *   bank closing
 *     + cheques issued but not yet presented   (we credited; the bank has not)
 *     − deposits made but not yet credited     (we debited; the bank has not)
 *     = our book balance
 */
function reconciliationStatement({ bankClosingBalance, bookBalance, unmatchedEntries = [] }) {
  let unpresentedCheques = 0;
  let depositsInTransit = 0;

  for (const e of unmatchedEntries) {
    if ((e.credit || 0) > 0) unpresentedCheques += e.credit;
    else depositsInTransit += e.debit || 0;
  }

  // Standard bank reconciliation:
  //   start from the BANK's balance
  //   LESS unpresented cheques  — the bank still shows money already spent
  //   PLUS deposits in transit  — recorded by us, not yet on the statement
  //   = what the books should say
  //
  // The signs were the other way round, which reconciled only when both
  // figures were zero.
  const adjusted = bankClosingBalance - unpresentedCheques + depositsInTransit;
  const difference = adjusted - bookBalance;

  return {
    bankClosingBalance,
    unpresentedCheques,
    depositsInTransit,
    adjustedBankBalance: adjusted,
    bookBalance,
    difference,
    reconciled: difference === 0,
    explanation: difference === 0
      ? 'Reconciled — the bank and the books agree once timing differences are allowed for'
      : `Unexplained difference of ${difference} paise remains`,
  };
}

module.exports = {
  parseStatement, parseAmount, parseDate, splitCsvLine,
  scoreMatch, matchStatement, reconciliationStatement,
  ledgerDirectionOf, extractReferences, referencesOverlap,
  CONFIDENCE, AUTO_MATCH_AT, DEFAULTS,
};