async function api (path, opts = {}) {
  try {
    const res = await fetch (
      '/api' + path,
      Object.assign ({headers: {'Content-Type': 'application/json'}}, opts)
    );
    return await res.json ();
  } catch (err) {
    // network error or server not reachable
    return {ok: false, error: 'network error'};
  }
}

function el (id) {
  return document.getElementById (id);
}

async function refreshData () {
  const data = await api ('/data');
  let parts = (data && data.participants) || [];
  // fallback to localStorage if backend has no participants
  if ((!parts || parts.length === 0) && localStorage.getItem ('participants')) {
    try {
      const stored = JSON.parse (localStorage.getItem ('participants'));
      if (Array.isArray (stored) && stored.length) parts = stored;
    } catch (e) {
      /* ignore */
    }
  }
  const plist = el ('participantsList');
  if (!parts.length)
    plist.innerHTML =
      '<div class="text-sm text-gray-500">No participants</div>';
  else {
    plist.innerHTML = parts
      .map (
        p => `
      <div class="flex items-center justify-between py-1">
        <div class="flex items-center gap-3">
          <span class="font-medium">${p}</span>
        </div>
        <div class="flex gap-2">
          <button data-name="${p}" class="rename-participant px-2 py-0.5 bg-yellow-300 rounded text-xs">Rename</button>
          <button data-name="${p}" class="delete-participant px-2 py-0.5 bg-red-500 text-white rounded text-xs">Delete</button>
        </div>
      </div>
    `
      )
      .join ('');
  }

  const payerSelect = el ('payerSelect');
  payerSelect.innerHTML = '';
  parts.forEach (p => {
    const opt = document.createElement ('option');
    opt.value = p;
    opt.textContent = p;
    payerSelect.appendChild (opt);
  });

  const expenses = data.expenses || [];
  const elExp = el ('expensesList');
  if (!expenses.length)
    elExp.innerHTML =
      '<div class="text-sm text-gray-500">No expenses yet</div>';
  else {
    elExp.innerHTML =
      '<div class="space-y-2">' +
      expenses
        .map (
          e => `
      <div class="flex items-start justify-between p-2 border rounded">
        <div>
          <div class="text-sm text-gray-700">${e.date || ''} — <strong>${e.payer}</strong>: ${parseFloat (e.amount).toFixed (2)}</div>
          <div class="text-xs text-gray-500">${e.description || ''}</div>
        </div>
        <div class="flex gap-2">
          <button data-id="${e.id || ''}" class="edit-expense px-2 py-0.5 bg-yellow-300 rounded text-xs">Edit</button>
          <button data-id="${e.id || ''}" class="delete-expense px-2 py-0.5 bg-red-500 text-white rounded text-xs">Delete</button>
        </div>
      </div>
    `
        )
        .join ('') +
      '</div>';
  }
}

// Initialize Flatpickr for a nicer calendar UI and wire custom button
document.addEventListener ('DOMContentLoaded', function () {
  const dateEl = document.getElementById ('dateInput');
  if (window.flatpickr && dateEl) {
    flatpickr (dateEl, {
      altInput: true,
      altFormat: 'F j, Y',
      dateFormat: 'Y-m-d',
      allowInput: true,
      clickOpens: true,
      wrap: false,
    });
    // clicking the pseudo button should open the flatpickr calendar
    const wrap = document.querySelector ('.date-wrap');
    if (wrap && dateEl._flatpickr) {
      wrap.addEventListener ('click', e => {
        // if user clicked on input itself, let default happen
        if (e.target === dateEl) return;
        try {
          dateEl._flatpickr.open ();
        } catch (err) {}
      });
    }
  }
});

el ('saveParticipants').addEventListener ('click', async () => {
  const raw = el ('participantsInput').value;
  const names = raw.split (/\n|,/).map (s => s.trim ()).filter (Boolean);
  // try saving to backend; if it fails, store locally
  const res = await api ('/participants', {
    method: 'POST',
    body: JSON.stringify ({names}),
  });
  if (!res || res.ok === false) {
    // store locally
    localStorage.setItem ('participants', JSON.stringify (names));
    alert (
      'Saved locally (server unreachable). Participants will be used in UI.'
    );
  } else {
    // also mirror to localStorage for resilience
    localStorage.setItem ('participants', JSON.stringify (names));
  }
  el ('participantsInput').value = '';
  await refreshData ();
});

// clear local storage button (if present)
if (el ('clearLocal')) {
  el ('clearLocal').addEventListener ('click', () => {
    localStorage.removeItem ('participants');
    alert ('Local participants cleared');
    refreshData ();
  });
}

// participant actions (rename, delete) via delegation
el ('participantsList').addEventListener ('click', async ev => {
  const t = ev.target;
  if (t.classList.contains ('rename-participant')) {
    const old = t.dataset.name;
    const nw = prompt ('Rename participant', old);
    if (!nw || nw.trim () === '' || nw.trim () === old) return;
    const res = await api ('/participants/rename', {
      method: 'POST',
      body: JSON.stringify ({old, new: nw.trim ()}),
    });
    if (!res || res.ok === false) return alert (res.error || 'Failed');
    localStorage.setItem ('participants', JSON.stringify (res.participants));
    await refreshData ();
  } else if (t.classList.contains ('delete-participant')) {
    const name = t.dataset.name;
    if (
      !confirm (
        `Delete participant ${name}? This will also remove their expenses.`
      )
    )
      return;
    // snapshot participant and their expenses for undo
    const data = await api ('/data');
    const removedExpenses = (data.expenses || [])
      .filter (e => e.payer === name);
    const snapshot = {
      type: 'participant',
      item: {name: name, expenses: removedExpenses},
    };
    const res = await api ('/participant/' + encodeURIComponent (name), {
      method: 'DELETE',
    });
    if (!res || res.ok === false) return alert (res.error || 'Failed');
    localStorage.setItem ('participants', JSON.stringify (res.participants));
    showUndo (snapshot);
    await refreshData ();
  }
});

el ('addExpense').addEventListener ('click', async () => {
  const payer = el ('payerSelect').value;
  const amount = parseFloat (el ('amountInput').value || 0);
  const description = el ('descInput').value || '';
  const date = el ('dateInput').value || '';
  if (!payer) return alert ('Select a payer');
  if (!amount || amount <= 0) return alert ('Enter a positive amount');
  await api ('/expense', {
    method: 'POST',
    body: JSON.stringify ({payer, amount, description, date}),
  });
  el ('amountInput').value = '';
  el ('descInput').value = '';
  el ('dateInput').value = '';
  await refreshData ();
});

// expense actions via delegation
el ('expensesList').addEventListener ('click', async ev => {
  const t = ev.target;
  if (t.classList.contains ('delete-expense')) {
    const id = t.dataset.id;
    if (!confirm ('Delete this expense?')) return;
    // snapshot expense for undo
    const data = await api ('/data');
    const expense = (data.expenses || []).find (e => e.id === id);
    const snapshot = {type: 'expense', item: expense};
    const res = await api ('/expense/' + encodeURIComponent (id), {
      method: 'DELETE',
    });
    if (!res || res.ok === false) return alert (res.error || 'Failed');
    showUndo (snapshot);
    await refreshData ();
  } else if (t.classList.contains ('edit-expense')) {
    const id = t.dataset.id;
    // fetch current data
    const data = await api ('/data');
    const expense = (data.expenses || []).find (e => e.id === id);
    if (!expense) return alert ('Expense not found');
    const newPayer = prompt ('Payer', expense.payer) || expense.payer;
    const newAmount =
      prompt ('Amount', String (parseFloat (expense.amount).toFixed (2))) ||
      expense.amount;
    const newDesc =
      prompt ('Description', expense.description || '') || expense.description;
    const newDate =
      prompt ('Date (YYYY-MM-DD)', expense.date || '') || expense.date;
    const res = await api ('/expense/' + encodeURIComponent (id), {
      method: 'PUT',
      body: JSON.stringify ({
        payer: newPayer,
        amount: newAmount,
        description: newDesc,
        date: newDate,
      }),
    });
    if (!res || res.ok === false) return alert (res.error || 'Failed');
    await refreshData ();
  }
});

el ('computeReport').addEventListener ('click', async () => {
  const r = await api ('/report');
  const area = el ('reportArea');
  if (!r.ok) {
    area.innerHTML = `<div class="error">${r.error || 'Error'}</div>`;
    return;
  }

  const eventName = el ('eventInput') && el ('eventInput').value
    ? el ('eventInput').value.trim ()
    : '';
  const includeDates = el ('includeDates')
    ? !!el ('includeDates').checked
    : false;
  const includeDesc = el ('includeDesc') ? !!el ('includeDesc').checked : false;

  // fetch raw expenses so we can optionally show dates/descriptions
  const allData = await api ('/data');
  const expenses = allData && Array.isArray (allData.expenses)
    ? allData.expenses
    : [];

  // Build a friendly description
  const title = eventName ? `${eventName} — Settlement` : 'Settlement Summary';
  const summaryText = `Total: ${r.total.toFixed (2)} | Per head: ${r.per_head.toFixed (2)}`;

  let html = `<div class="report-card">
    <div class="report-header">
      <div>
        <div class="font-semibold">${title}</div>
        <div class="text-xs text-gray-500">${summaryText}</div>
      </div>
      <div class="report-actions"></div>
    </div>`;

  html += '<div class="report-summary">';
  html += '<h3 class="mt-2">Summary</h3>';
  html +=
    '<ul class="report-list">' +
    Object.entries (r.summary)
      .map (
        ([p, s]) =>
          `<li>${p}: paid ${s.paid.toFixed (2)}, share ${s.share.toFixed (2)}, balance ${s.balance.toFixed (2)}</li>`
      )
      .join ('') +
    '</ul>';

  if (!r.payments || r.payments.length === 0) {
    html += '<p class="mt-3">All settled — no payments needed.</p>';
  } else {
    html += '<h3 class="mt-3">Payments</h3>';
    html +=
      '<ul class="report-list">' +
      r.payments
        .map (p => `<li>${p.from} → ${p.to}: ${p.amount.toFixed (2)}</li>`)
        .join ('') +
      '</ul>';
  }

  // Optionally include the list of expenses with date/description
  if (expenses && expenses.length) {
    html += '<h3 class="mt-3">Expenses</h3>';
    html += '<ul class="report-list">';
    expenses.forEach (e => {
      const parts = [];
      parts.push (`${e.payer} paid ${parseFloat (e.amount).toFixed (2)}`);
      if (includeDates && e.date) parts.push (`on ${e.date}`);
      if (includeDesc && e.description) parts.push (`(${e.description})`);
      html += `<li>${parts.join (' ')}</li>`;
    });
    html += '</ul>';
  }

  html += '</div></div>';
  area.innerHTML = html;

  // Also prepare a plain-text version for clipboard
  let txt = `${title}\n${summaryText}\n\nSummary:\n`;
  txt += Object.entries (r.summary)
    .map (
      ([p, s]) =>
        `${p}: paid ${s.paid.toFixed (2)}, share ${s.share.toFixed (2)}, balance ${s.balance.toFixed (2)}`
    )
    .join ('\n');
  txt += '\n\n';
  if (!r.payments || r.payments.length === 0)
    txt += 'All settled — no payments needed.\n';
  else
    txt +=
      'Payments:\n' +
      r.payments
        .map (p => `${p.from} -> ${p.to}: ${p.amount.toFixed (2)}`)
        .join ('\n') +
      '\n';

  if (expenses && expenses.length) {
    txt += '\nExpenses:\n';
    expenses.forEach (e => {
      let line = `${e.payer} paid ${parseFloat (e.amount).toFixed (2)}`;
      if (includeDates && e.date) line += ` on ${e.date}`;
      if (includeDesc && e.description) line += ` (${e.description})`;
      txt += line + '\n';
    });
  }

  // store generated text on copy button for use by clipboard action
  const copyBtn = el ('copyReport');
  if (copyBtn) {
    copyBtn.dataset.cliptext = txt;
    // reset state
    copyBtn.classList.remove ('copied');
    el ('copyLabel').textContent = 'Copy';
  }
});

// clipboard copy handler
if (el ('copyReport')) {
  el ('copyReport').addEventListener ('click', async ev => {
    const btn = ev.currentTarget;
    const text = btn.dataset.cliptext || '';
    if (!text) return alert ('Nothing to copy — generate the report first');
    try {
      await navigator.clipboard.writeText (text);
      btn.classList.add ('copied');
      el ('copyLabel').textContent = 'Copied';
      setTimeout (() => {
        btn.classList.remove ('copied');
        el ('copyLabel').textContent = 'Copy';
      }, 2400);
    } catch (err) {
      alert ('Copy failed — your browser may block clipboard access.');
    }
  });
}

// initial load
refreshData ().catch (e => console.error (e));

// undo banner logic
let undoTimer = null;
let lastSnapshot = null;
function showUndo (snapshot) {
  lastSnapshot = snapshot;
  const b = el ('undoBanner');
  if (!b) return;
  b.innerHTML = `<span>Deleted ${snapshot.type}</span><button id="undoBtn" class="ml-3 bg-white text-black px-2 py-0.5 rounded text-sm">Undo</button>`;
  b.classList.remove ('hidden');
  const btn = document.getElementById ('undoBtn');
  if (btn)
    btn.addEventListener ('click', async () => {
      if (!lastSnapshot) return;
      const res = await api ('/api/restore', {
        method: 'POST',
        body: JSON.stringify (lastSnapshot),
      });
      if (!res || res.ok === false)
        return alert (res.error || 'Restore failed');
      lastSnapshot = null;
      clearTimeout (undoTimer);
      b.classList.add ('hidden');
      await refreshData ();
    });
  clearTimeout (undoTimer);
  undoTimer = setTimeout (() => {
    lastSnapshot = null;
    b.classList.add ('hidden');
  }, 7000);
}
