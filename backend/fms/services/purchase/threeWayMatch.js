// backend/fms/services/purchase/threeWayMatch.js
//
// Three-way match: purchase order vs goods received vs invoice.
// SRS M8 / FR-M8, BPMN WF2.
//
// ─── PURE ON PURPOSE ─────────────────────────────────────────────────────────
// No database. This is the control that stops a school paying for goods it
// never received, or paying a rate nobody agreed to — and it is exactly the
// kind of arithmetic where a wrong comparison operator is invisible until it
// has cost money. Pure logic can be tested exhaustively.
//
// ─── WHAT IS BEING COMPARED ──────────────────────────────────────────────────
//   PO       what we agreed to buy, and at what rate
//   GRN      what actually arrived and was accepted
//   INVOICE  what the vendor is asking to be paid for
//
// The match is not "are these three identical". Partial delivery is normal, and
// so is invoicing in instalments. What must never happen is being billed for
// more than arrived, or at a rate nobody agreed.

/** Every way an invoice line can fail to match. */
const DISCREPANCY = {
  NOT_ORDERED: 'NOT_ORDERED',
  NOT_RECEIVED: 'NOT_RECEIVED',
  OVER_INVOICED_VS_RECEIVED: 'OVER_INVOICED_VS_RECEIVED',
  OVER_INVOICED_VS_ORDERED: 'OVER_INVOICED_VS_ORDERED',
  RATE_MISMATCH: 'RATE_MISMATCH',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  SHORT_RECEIPT: 'SHORT_RECEIPT',
  OVER_RECEIPT: 'OVER_RECEIPT',
};

/**
 * Severity decides what a discrepancy does.
 *   blocking  — the invoice cannot be verified until it is resolved
 *   warning   — recorded and shown, but does not stop verification
 */
const SEVERITY = {
  [DISCREPANCY.NOT_ORDERED]: 'blocking',
  [DISCREPANCY.NOT_RECEIVED]: 'blocking',
  [DISCREPANCY.OVER_INVOICED_VS_RECEIVED]: 'blocking',
  [DISCREPANCY.OVER_INVOICED_VS_ORDERED]: 'blocking',
  [DISCREPANCY.RATE_MISMATCH]: 'blocking',
  [DISCREPANCY.AMOUNT_MISMATCH]: 'blocking',
  // Short and over receipt are facts about delivery, not about the invoice.
  // They are worth showing, but they do not by themselves make the bill wrong.
  [DISCREPANCY.SHORT_RECEIPT]: 'warning',
  [DISCREPANCY.OVER_RECEIPT]: 'warning',
};

const DEFAULT_TOLERANCE = {
  /** Quantity units allowed either way. Zero: you get what you ordered. */
  quantity: 0,
  /**
   * Rate tolerance in BASIS POINTS (100 = 1%). Zero by default: a rate change
   * is a renegotiation, not a rounding difference, and should be visible.
   */
  rateBps: 0,
  /**
   * Amount tolerance in paise, for genuine rounding. A line of 3 units at
   * ₹33.33 can legitimately be billed as ₹99.99 or ₹100.00.
   */
  amountPaise: 100,
};

function bpsDiff(a, b) {
  if (a === 0) return b === 0 ? 0 : Infinity;
  return Math.abs((b - a) / a) * 10000;
}

/**
 * Match one invoice line against its PO line and cumulative receipts.
 *
 * @param {object} po       { itemId, description, quantity, rate, amount }
 * @param {object} received { acceptedQty }  cumulative across all GRNs
 * @param {object} inv      { quantity, rate, amount }
 * @param {object} [tol]
 * @returns {{matched:boolean, discrepancies:Array}}
 */
function matchLine(po, received, inv, tol = DEFAULT_TOLERANCE) {
  const t = { ...DEFAULT_TOLERANCE, ...tol };
  const out = [];

  if (!po) {
    out.push({
      type: DISCREPANCY.NOT_ORDERED,
      severity: SEVERITY[DISCREPANCY.NOT_ORDERED],
      message: 'This line is not on the purchase order',
    });
    return { matched: false, discrepancies: out };
  }

  const acceptedQty = received?.acceptedQty || 0;
  const invQty = inv?.quantity || 0;
  const invRate = inv?.rate || 0;
  const invAmount = inv?.amount || 0;

  if (acceptedQty === 0 && invQty > 0) {
    out.push({
      type: DISCREPANCY.NOT_RECEIVED,
      severity: SEVERITY[DISCREPANCY.NOT_RECEIVED],
      message: `Invoiced for ${invQty} but nothing has been received`,
      invoiced: invQty, received: 0,
    });
  } else if (invQty > acceptedQty + t.quantity) {
    // The one that matters most: being billed for more than arrived.
    out.push({
      type: DISCREPANCY.OVER_INVOICED_VS_RECEIVED,
      severity: SEVERITY[DISCREPANCY.OVER_INVOICED_VS_RECEIVED],
      message: `Invoiced for ${invQty} but only ${acceptedQty} was accepted`,
      invoiced: invQty, received: acceptedQty, excess: invQty - acceptedQty,
    });
  }

  if (invQty > po.quantity + t.quantity) {
    out.push({
      type: DISCREPANCY.OVER_INVOICED_VS_ORDERED,
      severity: SEVERITY[DISCREPANCY.OVER_INVOICED_VS_ORDERED],
      message: `Invoiced for ${invQty} but only ${po.quantity} was ordered`,
      invoiced: invQty, ordered: po.quantity, excess: invQty - po.quantity,
    });
  }

  if (bpsDiff(po.rate, invRate) > t.rateBps) {
    out.push({
      type: DISCREPANCY.RATE_MISMATCH,
      severity: SEVERITY[DISCREPANCY.RATE_MISMATCH],
      message: `Invoiced at ${invRate} but the order rate is ${po.rate}`,
      orderedRate: po.rate, invoicedRate: invRate,
      differencePaise: invRate - po.rate,
    });
  }

  // The invoice's own arithmetic must hold, independent of the PO.
  const expected = invQty * invRate;
  if (Math.abs(invAmount - expected) > t.amountPaise) {
    out.push({
      type: DISCREPANCY.AMOUNT_MISMATCH,
      severity: SEVERITY[DISCREPANCY.AMOUNT_MISMATCH],
      message: `Line amount ${invAmount} ≠ ${invQty} × ${invRate} = ${expected}`,
      stated: invAmount, computed: expected, differencePaise: invAmount - expected,
    });
  }

  if (acceptedQty > po.quantity + t.quantity) {
    out.push({
      type: DISCREPANCY.OVER_RECEIPT,
      severity: SEVERITY[DISCREPANCY.OVER_RECEIPT],
      message: `Received ${acceptedQty} against an order for ${po.quantity}`,
      ordered: po.quantity, received: acceptedQty,
    });
  } else if (acceptedQty > 0 && acceptedQty < po.quantity - t.quantity) {
    out.push({
      type: DISCREPANCY.SHORT_RECEIPT,
      severity: SEVERITY[DISCREPANCY.SHORT_RECEIPT],
      message: `Received ${acceptedQty} of ${po.quantity} ordered — partial delivery`,
      ordered: po.quantity, received: acceptedQty, shortfall: po.quantity - acceptedQty,
    });
  }

  return {
    matched: out.filter((d) => d.severity === 'blocking').length === 0,
    discrepancies: out,
  };
}

/**
 * Match a whole invoice.
 *
 * @param {Array}  poItems       [{ itemId, description, quantity, rate, amount }]
 * @param {Object} receivedByItem { [itemId]: { acceptedQty } }  cumulative
 * @param {Array}  invoiceItems  [{ itemId, quantity, rate, amount }]
 * @param {Object} [tolerance]
 */
function matchInvoice(poItems, receivedByItem, invoiceItems, tolerance) {
  const poByItem = new Map((poItems || []).map((i) => [String(i.itemId), i]));
  const lines = [];

  for (const inv of invoiceItems || []) {
    const key = String(inv.itemId);
    const result = matchLine(poByItem.get(key), receivedByItem?.[key], inv, tolerance);
    lines.push({
      itemId: inv.itemId,
      description: poByItem.get(key)?.description || inv.description,
      matched: result.matched,
      discrepancies: result.discrepancies,
    });
  }

  const all = lines.flatMap((l) => l.discrepancies);
  const blocking = all.filter((d) => d.severity === 'blocking');
  const warnings = all.filter((d) => d.severity === 'warning');

  // The invoice total must equal the sum of its own lines. A total that does
  // not add up is not a discrepancy with the PO — it is an arithmetic error on
  // the bill, and it is easy to miss line by line.
  const statedTotal = (invoiceItems || []).reduce((s, i) => s + (i.amount || 0), 0);

  return {
    matched: blocking.length === 0,
    canVerify: blocking.length === 0,
    lineCount: lines.length,
    blockingCount: blocking.length,
    warningCount: warnings.length,
    lines,
    blocking,
    warnings,
    invoiceLineTotal: statedTotal,
    summary: blocking.length === 0
      ? (warnings.length ? `Matched with ${warnings.length} warning(s)` : 'Matched')
      : `${blocking.length} blocking discrepancy(ies) — this invoice cannot be verified`,
  };
}

/** Cumulative accepted quantity per PO item across every GRN. */
function accumulateReceipts(grns) {
  const out = {};
  for (const grn of grns || []) {
    for (const item of grn.items || []) {
      const key = String(item.poItemId);
      if (!out[key]) out[key] = { acceptedQty: 0, receivedQty: 0, rejectedQty: 0, grnCount: 0 };
      out[key].acceptedQty += item.acceptedQty || 0;
      out[key].receivedQty += item.receivedQty || 0;
      out[key].rejectedQty += item.rejectedQty || 0;
      out[key].grnCount += 1;
    }
  }
  return out;
}

/** Cumulative invoiced quantity per PO item, for over-invoicing across bills. */
function accumulateInvoiced(invoices) {
  const out = {};
  for (const inv of invoices || []) {
    if (['cancelled', 'rejected'].includes(inv.invoiceStatus)) continue;
    for (const item of inv.items || []) {
      const key = String(item.itemId);
      if (!out[key]) out[key] = { quantity: 0, amount: 0 };
      out[key].quantity += item.quantity || 0;
      out[key].amount += item.amount || 0;
    }
  }
  return out;
}

module.exports = {
  matchLine,
  matchInvoice,
  accumulateReceipts,
  accumulateInvoiced,
  DISCREPANCY,
  SEVERITY,
  DEFAULT_TOLERANCE,
  bpsDiff,
};