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

    setupLevers(b, as, dB, dA);

    document.getElementById('assumptions').textContent =
      'Assumptions: ' + n + '-day year · bank rate ' + fmtPct(as.bank_rate) +
      ' · supplier terms ' + fmtPlain(as.supplier_discount * 100) + '/' + as.discount_days + ', net ' + as.net_days + '.';

    document.getElementById('status').hidden = true;
    document.getElementById('days-section').hidden = false;
    document.getElementById('cash-section').hidden = false;
    document.getElementById('lever-section').hidden = false;
  }

  // ---------- Levers ----------

  function setupLevers(b, as, dB, dA) {
    const n = as.days_in_year;
    const keys = ['dio', 'dso', 'dpo'];

    // The exact days the levers are set to. Kept here, not read back from the sliders,
    // so Set to Before and Set to After use exactly the days in the table.
    const state = { dio: dB.dio, dso: dB.dso, dpo: dB.dpo };

    // Slider range: 0 to twice the larger of Before and After, rounded up to a multiple of 10.
    const ranges = {};
    keys.forEach(function (k) {
      const max = Math.ceil(Math.max(dB[k], dA[k]) * 2 / 10) * 10;
      ranges[k] = max;
      const range = document.getElementById(k + '-range');
      const num = document.getElementById(k + '-num');
      range.max = String(max);
      num.max = String(max);

      range.addEventListener('input', function () {
        state[k] = Number(range.value);
        num.value = state[k].toFixed(2);
        update();
      });
      num.addEventListener('input', function () {
        const v = Number(num.value);
        if (num.value === '' || !isFinite(v) || v < 0 || v > max) return;
        state[k] = v;
        range.value = String(v);
        update();
      });
      num.addEventListener('change', function () {
        let v = Number(num.value);
        if (num.value === '' || !isFinite(v)) v = state[k];
        state[k] = Math.min(max, Math.max(0, v));
        syncInputs();
        update();
      });
    });

    function syncInputs() {
      keys.forEach(function (k) {
        document.getElementById(k + '-range').value = String(state[k]);
        document.getElementById(k + '-num').value = state[k].toFixed(2);
      });
    }

    function setTo(days) {
      keys.forEach(function (k) { state[k] = days[k]; });
      syncInputs();
      update();
    }

    document.getElementById('set-before').addEventListener('click', function () { setTo(dB); });
    document.getElementById('set-after').addEventListener('click', function () { setTo(dA); });

    document.getElementById('net-days').textContent = as.net_days;
    document.getElementById('disc-pct').textContent = fmtPlain(as.supplier_discount * 100) + '%';
    document.getElementById('disc-days').textContent = as.discount_days;
    document.getElementById('diy2').textContent = n;

    function update() {
      const r = CCC.leverResults(state, b, as);

      document.getElementById('lever-ccc').textContent = fmtDays(r.ccc) + ' days';
      const change = r.ccc - dB.ccc;
      const changeEl = document.getElementById('lever-ccc-change');
      changeEl.textContent = fmtSignedDays(change) + ' vs. Before (' + fmtDays(dB.ccc) + ')';

      const body = document.getElementById('lever-body');
      body.textContent = '';
      [
        ['Inventory', 'inventory', 'inventory'],
        ['Receivables', 'accounts_receivable', 'receivables'],
        ['Payables', 'accounts_payable', 'payables']
      ].forEach(function (l) {
        addRow(body, [
          cell(l[0]),
          cell(fmtDollars(b[l[1]])),
          cell(fmtDollars(r.implied[l[1]])),
          cell(fmtDollars(r.cashFreed[l[2]]), signClass(r.cashFreed[l[2]]))
        ]);
      });
      const foot = document.getElementById('lever-foot');
      foot.textContent = '';
      addRow(foot, [cell('Total'), cell(''), cell(''), cell(fmtDollars(r.cashFreed.total), signClass(r.cashFreed.total))]);

      const interestEl = document.getElementById('lever-interest');
      interestEl.textContent = fmtDollars(r.interestSaved);
      interestEl.className = signClass(r.interestSaved);

      document.getElementById('lever-pastdue').textContent = fmtDays(r.daysPastDue) + ' days';
      document.getElementById('lever-disc').textContent =
        r.discountCost === null ? 'Takes the discount' : fmtPct(r.discountCost);

      // Show the math with the numbers plugged in.
      const m = document.getElementById('lever-math');
      m.textContent = '';
      addMath(m, 'CCC = ' + fmtDays(state.dio) + ' + ' + fmtDays(state.dso) + ' − ' + fmtDays(state.dpo) + ' = ' + fmtDays(r.ccc) + ' days');
      addMath(m, 'Inventory = ' + fmtDays(state.dio) + ' × ' + fmtPlain(b.cogs) + ' / ' + n + ' = ' + fmtDollars(r.implied.inventory) +
        '; cash freed = ' + fmtDollars(b.inventory) + ' − ' + fmtDollars(r.implied.inventory) + ' = ' + fmtDollars(r.cashFreed.inventory));
      addMath(m, 'Receivables = ' + fmtDays(state.dso) + ' × ' + fmtPlain(b.revenue) + ' / ' + n + ' = ' + fmtDollars(r.implied.accounts_receivable) +
        '; cash freed = ' + fmtDollars(b.accounts_receivable) + ' − ' + fmtDollars(r.implied.accounts_receivable) + ' = ' + fmtDollars(r.cashFreed.receivables));
      addMath(m, 'Payables = ' + fmtDays(state.dpo) + ' × ' + fmtPlain(b.cogs) + ' / ' + n + ' = ' + fmtDollars(r.implied.accounts_payable) +
        '; cash freed = ' + fmtDollars(r.implied.accounts_payable) + ' − ' + fmtDollars(b.accounts_payable) + ' = ' + fmtDollars(r.cashFreed.payables));
      if (r.cashFreed.total < 0) {
        addMath(m, 'Interest saved = ' + fmtDollars(r.cashFreed.total) + ' × ' + fmtPct(as.bank_rate) + ' = ' + fmtDollars(r.interestSaved) +
          ' (negative: ElectroMart must borrow more)');
      } else if (r.capped) {
        addMath(m, 'Interest saved = ' + fmtDollars(b.notes_payable) + ' (the whole bank line; cash freed of ' + fmtDollars(r.cashFreed.total) +
          ' is more than it owes) × ' + fmtPct(as.bank_rate) + ' = ' + fmtDollars(r.interestSaved));
      } else {
        addMath(m, 'Interest saved = ' + fmtDollars(r.cashFreed.total) + ' × ' + fmtPct(as.bank_rate) + ' = ' + fmtDollars(r.interestSaved));
      }
      addMath(m, 'Days past due = ' + fmtDays(state.dpo) + ' − ' + as.net_days + ' = ' + fmtDays(state.dpo - as.net_days) +
        (r.daysPastDue === 0 ? ', shown as 0.00 (not late)' : ' days'));
      if (r.discountCost === null) {
        addMath(m, 'DPO of ' + fmtDays(state.dpo) + ' is within the ' + as.discount_days + '-day discount period, so ElectroMart takes the discount.');
      } else {
        addMath(m, 'Discount cost = ' + fmtPlain(as.supplier_discount) + ' / (1 − ' + fmtPlain(as.supplier_discount) + ') × ' + n +
          ' / (' + fmtDays(state.dpo) + ' − ' + as.discount_days + ') = ' + fmtPct(r.discountCost));
      }
    }

    setTo(dB);
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
