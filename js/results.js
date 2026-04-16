// Results view: pick a session, show ranked table, export JSON / WhatsApp text.
(function (App) {
  const { getState, update } = App.store;
  const { formatLapTime, computeKmh, formatKmh } = App.format;

  let root = null;
  let selectedSessionId = null;

  function mount(el) {
    root = el;
    root.innerHTML = `
      <section class="view-header">
        <h2>Results</h2>
        <div class="toolbar">
          <label class="inline-field">
            Session
            <select id="session-select"></select>
          </label>
          <button id="copy-whatsapp" class="btn btn-primary">Copy WhatsApp text</button>
          <button id="export-session" class="btn">Export session JSON</button>
          <button id="delete-session" class="btn btn-danger">Delete session</button>
        </div>
      </section>
      <div id="session-meta" class="session-meta"></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th class="col-rank">#</th>
              <th class="col-bib">Bib</th>
              <th>Name</th>
              <th class="col-time">Time</th>
              <th class="col-kmh">km/h</th>
            </tr>
          </thead>
          <tbody id="results-tbody"></tbody>
        </table>
        <p id="results-empty" class="empty">No sessions yet.</p>
      </div>
      <pre id="whatsapp-preview" class="whatsapp-preview" hidden></pre>
    `;

    root.querySelector('#session-select').addEventListener('change', (e) => {
      selectedSessionId = e.target.value || null;
      render();
    });
    root.querySelector('#copy-whatsapp').addEventListener('click', onCopyWhatsApp);
    root.querySelector('#export-session').addEventListener('click', onExportSession);
    root.querySelector('#delete-session').addEventListener('click', onDeleteSession);

    render();
  }

  function render() {
    if (!root) return;
    const { sessions } = getState();
    const sorted = [...sessions].sort((a, b) => (a.date < b.date ? 1 : -1));

    const sel = root.querySelector('#session-select');
    const prev = selectedSessionId;
    sel.innerHTML = '';
    sorted.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.date} — ${s.results.length} racers`;
      sel.appendChild(opt);
    });

    if (sorted.length === 0) {
      selectedSessionId = null;
    } else if (!prev || !sorted.find((s) => s.id === prev)) {
      selectedSessionId = sorted[0].id;
    }
    if (selectedSessionId) sel.value = selectedSessionId;

    const session = sorted.find((s) => s.id === selectedSessionId);
    const empty = root.querySelector('#results-empty');
    const tbody = root.querySelector('#results-tbody');
    const meta = root.querySelector('#session-meta');
    const preview = root.querySelector('#whatsapp-preview');
    preview.hidden = true;

    const controls = ['#copy-whatsapp', '#export-session', '#delete-session'];
    controls.forEach((q) => (root.querySelector(q).disabled = !session));

    tbody.innerHTML = '';
    if (!session) {
      empty.hidden = false;
      meta.textContent = '';
      return;
    }
    empty.hidden = true;
    meta.textContent = `Date: ${session.date} · Track: ${session.trackLengthMeters || 0} m · Racers: ${session.results.length}`;

    const ranked = rankResults(session);
    ranked.forEach((r) => {
      const tr = document.createElement('tr');
      if (r.status === 'dnf') {
        tr.innerHTML = `
          <td class="col-rank">DNF</td>
          <td class="col-bib">${r.bib}</td>
          <td>${escapeHtml(r.name)}</td>
          <td class="col-time">—</td>
          <td class="col-kmh">—</td>
        `;
      } else {
        const kmh = computeKmh(r.lapTimeMs, session.trackLengthMeters);
        tr.innerHTML = `
          <td class="col-rank">${r.rank}</td>
          <td class="col-bib">${r.bib}</td>
          <td>${escapeHtml(r.name)}</td>
          <td class="col-time">${formatLapTime(r.lapTimeMs)}</td>
          <td class="col-kmh">${formatKmh(kmh)}</td>
        `;
      }
      tbody.appendChild(tr);
    });
  }

  function rankResults(session) {
    const finished = session.results
      .filter((r) => r.status === 'finished')
      .sort((a, b) => a.lapTimeMs - b.lapTimeMs)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    const dnf = session.results.filter((r) => r.status === 'dnf').map((r) => ({ ...r }));
    return [...finished, ...dnf];
  }

  function currentSession() {
    return getState().sessions.find((s) => s.id === selectedSessionId) || null;
  }

  function onExportSession() {
    const session = currentSession();
    if (!session) return;
    const racerIds = new Set(session.results.map((r) => r.racerId));
    const racers = getState().racers.filter((r) => racerIds.has(r.id));
    const payload = { version: 1, trackLengthMeters: session.trackLengthMeters, racers, sessions: [session] };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetrial-session-${session.date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onDeleteSession() {
    const session = currentSession();
    if (!session) return;
    if (!confirm(`Delete session from ${session.date}? This cannot be undone.`)) return;
    update((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== session.id) }));
    selectedSessionId = null;
  }

  async function onCopyWhatsApp() {
    const session = currentSession();
    if (!session) return;
    const text = buildWhatsAppText(session);
    const preview = root.querySelector('#whatsapp-preview');
    preview.textContent = text;
    preview.hidden = false;
    try {
      await navigator.clipboard.writeText(text);
      flashButton(root.querySelector('#copy-whatsapp'), 'Copied!');
    } catch {
      alert('Clipboard access denied — the text is shown below, select and copy manually.');
    }
  }

  function buildWhatsAppText(session) {
    const ranked = rankResults(session);
    const header = [`Time Trial — ${session.date}`, `Track: ${session.trackLengthMeters || 0} m`, ''];

    const rows = ranked.map((r) => {
      if (r.status === 'dnf') {
        return { rank: 'DNF', bib: String(r.bib), name: r.name, time: '—', kmh: '—' };
      }
      const kmh = computeKmh(r.lapTimeMs, session.trackLengthMeters);
      return {
        rank: String(r.rank),
        bib: String(r.bib),
        name: r.name,
        time: formatLapTime(r.lapTimeMs),
        kmh: formatKmh(kmh),
      };
    });

    const cols = [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'bib', label: 'Bib', align: 'right' },
      { key: 'name', label: 'Name', align: 'left' },
      { key: 'time', label: 'Time', align: 'right' },
      { key: 'kmh', label: 'km/h', align: 'right' },
    ];
    const widths = cols.map((c) => Math.max(c.label.length, ...rows.map((r) => String(r[c.key]).length)));

    const pad = (value, width, align) => {
      const s = String(value);
      if (s.length >= width) return s;
      const fill = ' '.repeat(width - s.length);
      return align === 'right' ? fill + s : s + fill;
    };
    const line = (getValue) =>
      cols.map((c, i) => pad(getValue(c), widths[i], c.align)).join('  ');

    const body = [line((c) => c.label), ...rows.map((r) => line((c) => r[c.key]))];
    return '```\n' + [...header, ...body].join('\n') + '\n```';
  }

  function flashButton(btn, text) {
    const original = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1200);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  App.results = { mount, render, buildWhatsAppText };
})((window.App = window.App || {}));
