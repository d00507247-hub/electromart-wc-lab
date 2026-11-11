// app.js: loads the CSV files, uses ccc.js for the math and fills in the page.
// All numbers come from data/; nothing about ElectroMart is typed in here.

(function () {
  'use strict';

  // ---------- Formatting (the only place numbers get rounded) ----------

  const daysFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dollarFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const plainFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

  function fmtDays(x) { return daysFmt.format(x); }
  function fmtSignedDays(x) { return (x > 0 ? '+' : x < 0 ? '−' : '') + daysFmt.format(Math.abs(x)); }
  function fmtDollars(x) {
    const r = Math.round(x);
    return (r < 0 ? '−$' : '$') + dollarFmt.format(Math.abs(r));
  }
  function fmtPlain(x) { return plainFmt.format(x); }
  function fmtPct(x) { return daysFmt.format(x * 100) + '%'; }

  function signClass(x) { return Math.round(x) > 0 ? 'pos' : Math.round(x) < 0 ? 'neg' : ''; }

  function cell(text, cls) {
    const td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  }

  function addRow(tbody, cells, rowClass) {
    const tr = document.createElement('tr');
    if (rowClass) tr.className = rowClass;
    cells.forEach(function (c) { tr.appendChild(c); });
    tbody.appendChild(tr);
  }

  function addMath(list, text) {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  }

  // ---------- Loading ----------

  function loadCsv(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('Could not load ' + path + ' (' + res.status + ')');
      return res.text();
    }).then(CCC.parseCsv);
  }

  // ---------- Rendering ----------

  function render(st, as) {
    const n = as.days_in_year;
    const b = st.before;
    const a = st.after;
    const dB = CCC.periodDays(b, n);
    const dA = CCC.periodDays(a, n);

    // Days table. For DIO, DSO and CCC fewer days is better; for DPO more days frees cash.
    const daysBody = document.getElementById('days-body');
    [
      ['DIO (inventory days)', 'dio', -1],
      ['DSO (collection days)', 'dso', -1],
      ['DPO (payment days)', 'dpo', 1],
      ['Cash conversion cycle', 'ccc', -1]
    ].forEach(function (m) {
      const change = dA[m[1]] - dB[m[1]];
      const good = change * m[2];
      addRow(daysBody, [
        cell(m[0]),
        cell(fmtDays(dB[m[1]])),
        cell(fmtDays(dA[m[1]])),
        cell(fmtSignedDays(change), signClass(good * 100))
      ], m[1] === 'ccc' ? 'key' : '');
    });

    const dm = document.getElementById('days-math');
    ['before', 'after'].forEach(function (p) {
      const s = st[p];
      const d = p === 'before' ? dB : dA;
      const label = p === 'before' ? 'Before' : 'After';
      addMath(dm, label + ' DIO = ' + fmtPlain(s.inventory) + ' / ' + fmtPlain(s.cogs) + ' × ' + n + ' = ' + fmtDays(d.dio) + ' days');
      addMath(dm, label + ' DSO = ' + fmtPlain(s.accounts_receivable) + ' / ' + fmtPlain(s.revenue) + ' × ' + n + ' = ' + fmtDays(d.dso) + ' days');
      addMath(dm, label + ' DPO = ' + fmtPlain(s.accounts_payable) + ' / ' + fmtPlain(s.cogs) + ' × ' + n + ' = ' + fmtDays(d.dpo) + ' days');
      addMath(dm, label + ' CCC = ' + fmtDays(d.dio) + ' + ' + fmtDays(d.dso) + ' − ' + fmtDays(d.dpo) + ' = ' + fmtDays(d.ccc) + ' days');
    });

    // Cash freed table, from the balance sheet change.
    const freed = CCC.cashFreed(b, a);
    const cashBody = document.getElementById('cash-body');
    [
      ['Inventory', 'inventory', 'inventory'],
      ['Receivables', 'accounts_receivable', 'receivables'],
      ['Payables', 'accounts_payable', 'payables']
    ].forEach(function (l) {
      addRow(cashBody, [
        cell(l[0]),
        cell(fmtDollars(b[l[1]])),
        cell(fmtDollars(a[l[1]])),
        cell(fmtDollars(freed[l[2]]), signClass(freed[l[2]]))
      ]);
    });
    addRow(document.getElementById('cash-foot'), [
      cell('Total'), cell(''), cell(''),
      cell(fmtDollars(freed.total), signClass(freed.total))
    ]);

    // Check from the days: days changed × annual COGS (or revenue) / days in year.
    const fromDays = CCC.cashFreedFromDays(dB, dA, b, n);
    document.getElementById('diy').textContent = n;
    const cm = document.getElementById('cash-math');
    addMath(cm, 'Inventory: (' + fmtDays(dB.dio) + ' − ' + fmtDays(dA.dio) + ') × ' + fmtPlain(b.cogs) + ' / ' + n + ' = ' + fmtDollars(fromDays.inventory));
    addMath(cm, 'Receivables: (' + fmtDays(dB.dso) + ' − ' + fmtDays(dA.dso) + ') × ' + fmtPlain(b.revenue) + ' / ' + n + ' = ' + fmtDollars(fromDays.receivables));
    addMath(cm, 'Payables: (' + fmtDays(dA.dpo) + ' − ' + fmtDays(dB.dpo) + ') × ' + fmtPlain(b.cogs) + ' / ' + n + ' = ' + fmtDollars(fromDays.payables));

    document.getElementById('assumptions').textContent =
      'Assumptions: ' + n + '-day year · bank rate ' + fmtPct(as.bank_rate) +
      ' · supplier terms ' + fmtPlain(as.supplier_discount * 100) + '/' + as.discount_days + ', net ' + as.net_days + '.';

    document.getElementById('status').hidden = true;
    document.getElementById('days-section').hidden = false;
    document.getElementById('cash-section').hidden = false;
  }

  Promise.all([loadCsv('data/electromart.csv'), loadCsv('data/assumptions.csv')])
    .then(function (results) {
      render(CCC.statementsFromRows(results[0]), CCC.assumptionsFromRows(results[1]));
    })
    .catch(function (err) {
      const s = document.getElementById('status');
      s.textContent = 'Could not load the data: ' + err.message;
      s.className = 'status error';
    });
})();
