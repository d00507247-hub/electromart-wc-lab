// ccc.js: the finance math for the ElectroMart CCC app.
// These functions never touch the page, so they can be checked with Node:
//   node -e "const C=require('./ccc.js'); console.log(C.dio(1200000, 6000000, 365))"
// Nothing here is rounded. Rounding happens only when app.js displays a number.

(function (root) {
  'use strict';

  // ---------- Reading the CSV files ----------

  // Turns CSV text into an array of objects keyed by the header row.
  // Handles quoted fields, so a note that contains a comma still parses.
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { field += ch; }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(function (f) { return f.trim() !== ''; })) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    row.push(field);
    if (row.some(function (f) { return f.trim() !== ''; })) rows.push(row);

    const header = rows.shift().map(function (h) { return h.trim(); });
    return rows.map(function (r) {
      const obj = {};
      header.forEach(function (h, j) { obj[h] = (r[j] || '').trim(); });
      return obj;
    });
  }

  // Turns the rows of electromart.csv into
  // { before: { revenue: ..., inventory: ... }, after: { ... }, section: { revenue: 'income_statement', ... } }
  function statementsFromRows(rows) {
    const out = { before: {}, after: {}, section: {} };
    rows.forEach(function (r) {
      out.before[r.item] = Number(r.before);
      out.after[r.item] = Number(r.after);
      out.section[r.item] = r.section;
    });
    return out;
  }

  // Turns the rows of assumptions.csv into { days_in_year: 365, bank_rate: 0.08, ... }
  function assumptionsFromRows(rows) {
    const out = {};
    rows.forEach(function (r) { out[r.assumption] = Number(r.value); });
    return out;
  }

  // ---------- Day counts ----------

  // Days of inventory outstanding: how long goods sit before they are sold.
  function dio(inventory, cogs, daysInYear) { return inventory / cogs * daysInYear; }

  // Days sales outstanding: how long customers take to pay (all sales are on credit).
  function dso(receivables, revenue, daysInYear) { return receivables / revenue * daysInYear; }

  // Days payables outstanding: how long ElectroMart takes to pay suppliers (purchases = COGS).
  function dpo(payables, cogs, daysInYear) { return payables / cogs * daysInYear; }

  // Cash conversion cycle: days a dollar is tied up in operations.
  function ccc(dioDays, dsoDays, dpoDays) { return dioDays + dsoDays - dpoDays; }

  // All four day counts for one period (one column of the statements).
  function periodDays(period, daysInYear) {
    const i = dio(period.inventory, period.cogs, daysInYear);
    const s = dso(period.accounts_receivable, period.revenue, daysInYear);
    const p = dpo(period.accounts_payable, period.cogs, daysInYear);
    return { dio: i, dso: s, dpo: p, ccc: ccc(i, s, p) };
  }

  // ---------- Cash freed ----------

  // Cash freed from the balance sheet change between two periods.
  // A drop in an asset frees cash; a rise in accounts payable frees cash.
  function cashFreed(before, after) {
    const inventory = before.inventory - after.inventory;
    const receivables = before.accounts_receivable - after.accounts_receivable;
    const payables = after.accounts_payable - before.accounts_payable;
    return {
      inventory: inventory,
      receivables: receivables,
      payables: payables,
      total: inventory + receivables + payables
    };
  }

  // The same cash freed, worked out from the days instead:
  // days changed × annual COGS (or revenue) / days in year.
  // It should equal cashFreed().
  function cashFreedFromDays(beforeDays, afterDays, before, daysInYear) {
    const inventory = (beforeDays.dio - afterDays.dio) * before.cogs / daysInYear;
    const receivables = (beforeDays.dso - afterDays.dso) * before.revenue / daysInYear;
    const payables = (afterDays.dpo - beforeDays.dpo) * before.cogs / daysInYear;
    return {
      inventory: inventory,
      receivables: receivables,
      payables: payables,
      total: inventory + receivables + payables
    };
  }

  // ---------- Levers ----------
  // A lever sets DIO, DSO or DPO directly. Revenue and COGS stay at their Before values.

  // The balances a set of days implies: days × annual COGS (or revenue) / days in year.
  function impliedBalances(days, before, daysInYear) {
    return {
      inventory: days.dio * before.cogs / daysInYear,
      accounts_receivable: days.dso * before.revenue / daysInYear,
      accounts_payable: days.dpo * before.cogs / daysInYear
    };
  }

  // Interest saved each year if the freed cash pays down the bank line.
  // Only the bank line's Before balance can be repaid, so positive cash freed is capped there.
  // Negative cash freed means more borrowing, so the "saving" is negative (extra interest).
  function interestSaved(cashFreedTotal, bankLineBefore, bankRate) {
    const repaid = cashFreedTotal > 0 ? Math.min(cashFreedTotal, bankLineBefore) : cashFreedTotal;
    return repaid * bankRate;
  }

  // Days paid past the net due date; never less than zero.
  function daysPastDue(dpoDays, netDays) { return Math.max(0, dpoDays - netDays); }

  // Nominal annual cost of skipping a supplier discount:
  // d / (1 − d) × days in year / (days paid − discount days).
  // Returns null when ElectroMart pays within the discount period, because then it takes the discount.
  function discountCost(discount, discountDays, daysPaid, daysInYear) {
    if (daysPaid <= discountDays) return null;
    return discount / (1 - discount) * daysInYear / (daysPaid - discountDays);
  }

  // Everything the lever panel shows, for one set of days.
  function leverResults(days, before, assumptions) {
    const n = assumptions.days_in_year;
    const implied = impliedBalances(days, before, n);
    const freed = cashFreed(before, implied);
    return {
      ccc: ccc(days.dio, days.dso, days.dpo),
      implied: implied,
      cashFreed: freed,
      interestSaved: interestSaved(freed.total, before.notes_payable, assumptions.bank_rate),
      capped: freed.total > before.notes_payable,
      daysPastDue: daysPastDue(days.dpo, assumptions.net_days),
      discountCost: discountCost(assumptions.supplier_discount, assumptions.discount_days, days.dpo, n)
    };
  }

  const api = {
    parseCsv: parseCsv,
    statementsFromRows: statementsFromRows,
    assumptionsFromRows: assumptionsFromRows,
    dio: dio,
    dso: dso,
    dpo: dpo,
    ccc: ccc,
    periodDays: periodDays,
    cashFreed: cashFreed,
    cashFreedFromDays: cashFreedFromDays,
    impliedBalances: impliedBalances,
    interestSaved: interestSaved,
    daysPastDue: daysPastDue,
    discountCost: discountCost,
    leverResults: leverResults
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CCC = api;
})(this);
