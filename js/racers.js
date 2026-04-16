// Racers view: add/edit/delete racers + JSON import/export of full app state.
(function (App) {
  const { getState, update, resetAll, SCHEMA_VERSION } = App.store;
  const { shortId, todayIso } = App.format;

  let root = null;

  function mount(el) {
    root = el;
    root.innerHTML = `
      <section class="view-header">
        <h2>Racers</h2>
        <div class="toolbar">
          <button id="racers-import" class="btn" title="Merge racers and past sessions from a JSON file">Import all</button>
          <button id="racers-import-only" class="btn" title="Import only racers (no past sessions) from a JSON file">Import racers only</button>
          <button id="racers-export" class="btn">Export JSON</button>
          <button id="racers-clear" class="btn btn-danger">Clear all</button>
          <input id="racers-import-file" type="file" accept="application/json" hidden />
          <input id="racers-import-only-file" type="file" accept="application/json" hidden />
        </div>
      </section>
      <form id="racer-form" class="row-form">
        <input id="racer-bib" type="number" min="0" step="1" placeholder="Bib #" required />
        <input id="racer-name" type="text" placeholder="Name" required />
        <button type="submit" class="btn btn-primary">Add racer</button>
      </form>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th class="col-bib">Bib</th><th>Name</th><th class="col-actions"></th></tr></thead>
          <tbody id="racers-tbody"></tbody>
        </table>
        <p id="racers-empty" class="empty">No racers yet — add one above or import JSON.</p>
      </div>
    `;

    root.querySelector('#racer-form').addEventListener('submit', onAdd);
    root.querySelector('#racers-import').addEventListener('click', () => {
      root.querySelector('#racers-import-file').click();
    });
    root.querySelector('#racers-import-file').addEventListener('change', onImport);
    root.querySelector('#racers-import-only').addEventListener('click', () => {
      root.querySelector('#racers-import-only-file').click();
    });
    root.querySelector('#racers-import-only-file').addEventListener('change', onImportRacersOnly);
    root.querySelector('#racers-export').addEventListener('click', onExport);
    root.querySelector('#racers-clear').addEventListener('click', onClear);

    render();
  }

  function render() {
    if (!root) return;
    const { racers } = getState();
    const tbody = root.querySelector('#racers-tbody');
    const empty = root.querySelector('#racers-empty');
    tbody.innerHTML = '';
    const sorted = [...racers].sort((a, b) => a.bib - b.bib);
    sorted.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="col-bib">${r.bib}</td>
        <td class="col-name"><span class="racer-name" data-id="${r.id}">${escapeHtml(r.name)}</span></td>
        <td class="col-actions">
          <button class="btn btn-sm" data-action="edit" data-id="${r.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${r.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    empty.hidden = sorted.length > 0;

    tbody.querySelectorAll('button[data-action="edit"]').forEach((b) => {
      b.addEventListener('click', () => onEdit(b.dataset.id));
    });
    tbody.querySelectorAll('button[data-action="delete"]').forEach((b) => {
      b.addEventListener('click', () => onDelete(b.dataset.id));
    });
  }

  function onAdd(e) {
    e.preventDefault();
    const bibEl = root.querySelector('#racer-bib');
    const nameEl = root.querySelector('#racer-name');
    const bib = Number(bibEl.value);
    const name = nameEl.value.trim();
    if (!name || !Number.isFinite(bib)) return;
    update((s) => ({
      ...s,
      racers: [...s.racers, { id: shortId('r_'), bib, name }],
    }));
    bibEl.value = '';
    nameEl.value = '';
    bibEl.focus();
  }

  function onEdit(id) {
    const { racers } = getState();
    const racer = racers.find((r) => r.id === id);
    if (!racer) return;
    const newName = prompt('Name:', racer.name);
    if (newName == null) return;
    const newBibStr = prompt('Bib #:', String(racer.bib));
    if (newBibStr == null) return;
    const newBib = Number(newBibStr);
    if (!newName.trim() || !Number.isFinite(newBib)) return;
    update((s) => ({
      ...s,
      racers: s.racers.map((r) => (r.id === id ? { ...r, name: newName.trim(), bib: newBib } : r)),
    }));
  }

  function onDelete(id) {
    const { racers, activeSession } = getState();
    const racer = racers.find((r) => r.id === id);
    if (!racer) return;
    if (activeSession?.results.some((r) => r.racerId === id)) {
      alert('This racer is in the active session. End the session first.');
      return;
    }
    if (!confirm(`Delete racer "${racer.name}"?\n\nTheir results in past sessions will be kept.`)) return;
    update((s) => ({ ...s, racers: s.racers.filter((r) => r.id !== id) }));
  }

  function onExport() {
    const state = getState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetrial-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImport(e) {
    const incoming = await readJsonFile(e.target);
    if (!incoming) return;
    const { addedRacers, addedSessions } = mergeImport(incoming, { includeSessions: true });
    alert(`Imported: ${addedRacers} new racer(s), ${addedSessions} new session(s).\nExisting entries were kept untouched.`);
  }

  async function onImportRacersOnly(e) {
    const incoming = await readJsonFile(e.target);
    if (!incoming) return;
    const { addedRacers } = mergeImport(incoming, { includeSessions: false });
    alert(`Imported ${addedRacers} new racer(s). Past sessions from the file were skipped.`);
  }

  async function readJsonFile(input) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return null;
    try {
      const text = await file.text();
      const incoming = JSON.parse(text);
      if (incoming?.version !== SCHEMA_VERSION) {
        alert(`Unsupported file version: ${incoming?.version}. Expected ${SCHEMA_VERSION}.`);
        return null;
      }
      return incoming;
    } catch (err) {
      alert(`Import failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Non-destructive merge. Existing entries are always kept; only new IDs are added.
   * To fully replace, use "Clear all" first and then Import.
   */
  function mergeImport(incoming, { includeSessions }) {
    let addedRacers = 0;
    let addedSessions = 0;
    update((s) => {
      const racersById = new Map(s.racers.map((r) => [r.id, r]));
      for (const r of incoming.racers || []) {
        if (!racersById.has(r.id)) {
          racersById.set(r.id, r);
          addedRacers++;
        }
      }
      let sessions = s.sessions;
      if (includeSessions) {
        const sessionsById = new Map(s.sessions.map((x) => [x.id, x]));
        for (const sess of incoming.sessions || []) {
          if (!sessionsById.has(sess.id)) {
            sessionsById.set(sess.id, sess);
            addedSessions++;
          }
        }
        sessions = [...sessionsById.values()];
      }
      return { ...s, racers: [...racersById.values()], sessions };
    });
    return { addedRacers, addedSessions };
  }

  function onClear() {
    if (!confirm('Delete ALL racers, sessions, and the active race?')) return;
    resetAll();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  App.racers = { mount, render };
})((window.App = window.App || {}));
