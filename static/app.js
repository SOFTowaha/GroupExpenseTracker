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

// Toast helper
function showToast (message, type = 'info', timeout = 3500) {
  const area = el ('toastArea');
  if (!area) return;
  const t = document.createElement ('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="msg">${message}</div>`;
  area.appendChild (t);
  // allow CSS transition
  requestAnimationFrame (() => t.classList.add ('show'));
  setTimeout (() => {
    t.classList.remove ('show');
    setTimeout (() => t.remove (), 220);
  }, timeout);
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

  // restore saved event name and currency if present
  const eventEl = el ('eventInput');
  if (eventEl) eventEl.value = data.event || '';
  const curEl = el ('currencySelect');
  if (curEl) curEl.value = data.currency || 'CAD';
}

// save settings (event name, currency)
async function saveSettings (settings) {
  try {
    const res = await api ('/settings', {
      method: 'POST',
      body: JSON.stringify (settings),
    });
    return res;
  } catch (e) {
    return {ok: false, error: 'network error'};
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
    showToast (
      'Saved locally (server unreachable). Participants will be used in UI.',
      'info'
    );
  } else {
    // also mirror to localStorage for resilience
    localStorage.setItem ('participants', JSON.stringify (names));
  }
  el ('participantsInput').value = '';
  await refreshData ();
});

// Currency change saves immediately
if (el ('currencySelect')) {
  el ('currencySelect').addEventListener ('change', async () => {
    const c = el ('currencySelect').value || 'USD';
    await saveSettings ({currency: c});
  });
}

// Event Save/Edit button: explicit save and toggle edit state
function setEventButtonState () {
  const eventEl = el ('eventInput');
  const btn = el ('eventSaveBtn');
  if (!eventEl || !btn) return;
  if ((eventEl.value || '').trim () === '') {
    eventEl.disabled = false;
    btn.textContent = 'Save';
  } else {
    // if value exists, default to readonly mode until user clicks Edit
    eventEl.disabled = true;
    btn.textContent = 'Edit';
  }
}

if (el ('eventSaveBtn')) {
  el ('eventSaveBtn').addEventListener ('click', async () => {
    const eventEl = el ('eventInput');
    const btn = el ('eventSaveBtn');
    if (!eventEl || !btn) return;
    if (eventEl.disabled) {
      // switch to edit mode
      eventEl.disabled = false;
      eventEl.focus ();
      btn.textContent = 'Save';
      return;
    }
    // save current value
    const v = (eventEl.value || '').trim ();
    const res = await saveSettings ({event: v});
    if (!res || res.ok === false) {
      showToast (res.error || 'Save failed', 'error');
      return;
    }
    // saved: make readonly and switch to Edit
    eventEl.disabled = true;
    btn.textContent = 'Edit';
  });
}

// Initialize button state after loading data
document.addEventListener ('DOMContentLoaded', setEventButtonState);

// clear local storage button (if present)
if (el ('clearLocal')) {
  el ('clearLocal').addEventListener ('click', () => {
    localStorage.removeItem ('participants');
    showToast ('Local participants cleared', 'success');
    refreshData ();
  });
}

// participant actions (rename, delete) via delegation
el ('participantsList').addEventListener ('click', async ev => {
  const t = ev.target;
  if (t.classList.contains ('rename-participant')) {
    const old = t.dataset.name;
    openModal ('rename', {old});
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
    if (!res || res.ok === false) {
      showToast (res.error || 'Failed', 'error');
      return;
    }
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
  if (!payer) {
    showToast ('Select a payer', 'error');
    return;
  }
  if (!amount || amount <= 0) {
    showToast ('Enter a positive amount', 'error');
    return;
  }
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
    if (!res || res.ok === false) {
      showToast (res.error || 'Failed', 'error');
      return;
    }
    showUndo (snapshot);
    await refreshData ();
  } else if (t.classList.contains ('edit-expense')) {
    const id = t.dataset.id;
    // fetch current data
    const data = await api ('/data');
    const expense = (data.expenses || []).find (e => e.id === id);
    if (!expense) {
      showToast ('Expense not found', 'error');
      return;
    }
    openModal ('editExpense', {expense});
  }
});

/* Modal logic */
const modalOverlay = el ('modalOverlay');
const modal = el ('modal');
const modalTitle = el ('modalTitle');
const modalBody = el ('modalBody');
const modalForm = el ('modalForm');
let modalState = null; // {type, data}

function openModal (type, data) {
  modalState = {type, data};
  modalOverlay.classList.remove ('hidden');
  if (type === 'rename') {
    modalTitle.textContent = 'Rename Participant';
    modalBody.innerHTML = `
      <div class="field">
        <label class="label">Old name</label>
        <div class="control"><input id="modalOldName" class="input" readonly /></div>
      </div>
      <div class="field">
        <label class="label">New name</label>
        <div class="control"><input id="modalNewName" class="input" /></div>
      </div>
    `;
    el ('modalOldName').value = data.old;
    el ('modalNewName').focus ();
  } else if (type === 'editExpense') {
    modalTitle.textContent = 'Edit Expense';
    // build payer select options dynamically
    const parts = (async () => {
      const d = await api ('/data');
      return d.participants || [];
    }) ();
    modalBody.innerHTML = `
      <div class="field">
        <label class="label">Payer</label>
        <div class="control"><select id="modalPayer" class="input"></select></div>
      </div>
      <div class="field">
        <label class="label">Amount</label>
        <div class="control"><input id="modalAmount" class="input" /></div>
      </div>
      <div class="field">
        <label class="label">Description</label>
        <div class="control"><input id="modalDesc" class="input" /></div>
      </div>
      <div class="field">
        <label class="label">Date</label>
        <div class="control date-wrap"><input id="modalDate" type="text" class="input" /></div>
      </div>
    `;
    // populate form after participants fetched
    parts.then (ps => {
      const sel = el ('modalPayer');
      sel.innerHTML = '';
      ps.forEach (p => {
        const o = document.createElement ('option');
        o.value = p;
        o.textContent = p;
        sel.appendChild (o);
      });
      // set values
      const e = data.expense;
      el ('modalPayer').value = e.payer;
      el ('modalAmount').value = parseFloat (e.amount).toFixed (2);
      el ('modalDesc').value = e.description || '';
      el ('modalDate').value = e.date || '';
      // initialize flatpickr on modalDate
      if (window.flatpickr) {
        try {
          if (el ('modalDate')._flatpickr)
            el ('modalDate')._flatpickr.destroy ();
          flatpickr (el ('modalDate'), {
            altInput: true,
            altFormat: 'F j, Y',
            dateFormat: 'Y-m-d',
            allowInput: true,
          });
        } catch (err) {}
      }
    });
  }
}

function closeModal () {
  modalOverlay.classList.add ('hidden');
  modalBody.innerHTML = '';
  modalState = null;
}

// modal event handlers
el ('modalClose').addEventListener ('click', closeModal);
el ('modalCancel').addEventListener ('click', closeModal);
modalForm.addEventListener ('submit', async function (ev) {
  ev.preventDefault ();
  if (!modalState) return closeModal ();
  if (modalState.type === 'rename') {
    const old = el ('modalOldName').value;
    const nw = el ('modalNewName').value.trim ();
    if (!nw || nw === old) {
      showToast ('Enter a different name', 'error');
      return;
    }
    const res = await api ('/participants/rename', {
      method: 'POST',
      body: JSON.stringify ({old, new: nw}),
    });
    if (!res || res.ok === false) {
      showToast (res.error || 'Failed', 'error');
      return;
    }
    localStorage.setItem ('participants', JSON.stringify (res.participants));
    await refreshData ();
    closeModal ();
  } else if (modalState.type === 'editExpense') {
    const id = modalState.data.expense.id;
    const payer = el ('modalPayer').value;
    const amount = el ('modalAmount').value;
    const description = el ('modalDesc').value;
    const date = el ('modalDate').value;
    const res = await api ('/expense/' + encodeURIComponent (id), {
      method: 'PUT',
      body: JSON.stringify ({payer, amount, description, date}),
    });
    if (!res || res.ok === false) {
      showToast (res.error || 'Failed', 'error');
      return;
    }
    await refreshData ();
    closeModal ();
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
  // currency formatting
  const currencyCode =
    (el ('currencySelect') && el ('currencySelect').value) || 'CAD';
  const currencyMap = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    AUD: 'A$',
    CAD: 'C$',
    INR: '₹',
    CNY: '¥',
  };
  const currencySym = currencyMap[currencyCode] || '';
  const fmt = v => `${currencySym}${parseFloat (v).toFixed (2)}`;
  const includeDates = el ('includeDates')
    ? !!el ('includeDates').checked
    : false;
  const includeDesc = el ('includeDesc') ? !!el ('includeDesc').checked : false;

  // fetch raw expenses so we can optionally show dates/descriptions
  const allData = await api ('/data');
  const expenses = allData && Array.isArray (allData.expenses)
    ? allData.expenses
    : [];

  // Build a concise report layout: title + totals, summary table, payments, optional expenses
  const title = eventName ? `${eventName} — Settlement` : 'Settlement Summary';
  const totalsLine = `Total: ${fmt (r.total)} · Per head: ${fmt (r.per_head)}`;

  let html = `<div class="report-card">
    <div class="report-header">
      <div>
        <div class="font-semibold">${title}</div>
        <div class="text-xs text-gray-500">${totalsLine}</div>
      </div>
      <div class="report-actions"></div>
    </div>

    <div class="report-summary">
      <h3 class="mt-2">Summary</h3>
      <table style="width:100%;border-collapse:collapse;text-align:left">
        <thead><tr><th style="padding:6px 8px;color:var(--muted)">Person</th><th style="padding:6px 8px;color:var(--muted)">Paid</th><th style="padding:6px 8px;color:var(--muted)">Share</th><th style="padding:6px 8px;color:var(--muted)">Balance</th></tr></thead>
        <tbody>`;

  Object.entries (r.summary).forEach (([p, s]) => {
    html += `<tr><td style="padding:8px">${p}</td><td style="padding:8px">${fmt (s.paid)}</td><td style="padding:8px">${fmt (s.share)}</td><td style="padding:8px">${fmt (s.balance)}</td></tr>`;
  });

  html += `</tbody></table>`;

  if (!r.payments || r.payments.length === 0) {
    html += '<p class="mt-3">All settled — no payments needed.</p>';
  } else {
    html += '<h3 class="mt-3">Payments</h3>';
    html +=
      '<ul class="report-list">' +
      r.payments
        .map (p => `<li>${p.from} → ${p.to}: ${fmt (p.amount)}</li>`)
        .join ('') +
      '</ul>';
  }

  // Optionally include the list of expenses with date/description
  if (expenses && expenses.length) {
    html += '<h3 class="mt-3">Expenses</h3>';
    html += '<ul class="report-list">';
    expenses.forEach (e => {
      const parts = [];
      parts.push (`${e.payer} paid ${fmt (e.amount)}`);
      if (includeDates && e.date) parts.push (`on ${e.date}`);
      if (includeDesc && e.description) parts.push (`(${e.description})`);
      html += `<li>${parts.join (' ')}</li>`;
    });
    html += '</ul>';
  }

  html += '</div></div>';
  area.innerHTML = html;

  // Also prepare a plain-text version for clipboard
  let txt = `${title}\n${totalsLine}\n\nSummary:\n`;
  txt += Object.entries (r.summary)
    .map (
      ([p, s]) =>
        `${p}: paid ${fmt (s.paid)}, share ${fmt (s.share)}, balance ${fmt (s.balance)}`
    )
    .join ('\n');
  txt += '\n\n';
  if (!r.payments || r.payments.length === 0)
    txt += 'All settled — no payments needed.\n';
  else
    txt +=
      'Payments:\n' +
      r.payments
        .map (p => `${p.from} -> ${p.to}: ${fmt (p.amount)}`)
        .join ('\n') +
      '\n';

  if (expenses && expenses.length) {
    txt += '\nExpenses:\n';
    expenses.forEach (e => {
      let line = `${e.payer} paid ${fmt (e.amount)}`;
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
    if (!text) {
      showToast ('Nothing to copy — generate the report first', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText (text);
      btn.classList.add ('copied');
      el ('copyLabel').textContent = 'Copied';
      setTimeout (() => {
        btn.classList.remove ('copied');
        el ('copyLabel').textContent = 'Copy';
      }, 2400);
    } catch (err) {
      showToast (
        'Copy failed — your browser may block clipboard access.',
        'error'
      );
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
      if (!res || res.ok === false) {
        showToast (res.error || 'Restore failed', 'error');
        return;
      }
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
