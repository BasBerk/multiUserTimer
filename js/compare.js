// Compare view: per-racer progress across sessions.
(function (App) {
  const { getState } = App.store;
  const { formatLapTime, formatDelta, computeKmh, formatKmh } = App.format;

  let root = null;

  function mount(el) {
    root = el;
    root.innerHTML = `
      <section class="view-header">
        <h2>Progress</h2>
      </section>
      <div id="compare-body"></div>
      <p id="compare-empty" class="empty">No session results yet. Run a race to see progress here.</p>
    `;
    render();
  }

  function render() {
    if (!root) return;
    const { racers, sessions } = getState();
    const body = root.querySelector('#compare-body');
    const empty = root.querySelector('#compare-empty');
    body.innerHTML = '';

    const sortedSessions = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (sortedSessions.length === 0) {
      empty.hidden = false;
      return;
    }

    // Build per-racer timeline from sessions.
    const byRacer = new Map();
    for (const sess of sortedSessions) {
      for (const r of sess.results) {
        if (!byRacer.has(r.racerId)) byRacer.set(r.racerId, { name: r.name, bib: r.bib, entries: [] });
        byRacer.get(r.racerId).entries.push({
          date: sess.date,
          trackLengthMeters: sess.trackLengthMeters,
          status: r.status,
          lapTimeMs: r.lapTimeMs,
        });
      }
    }

    // Reconcile racer names/bibs with current racer list if still present.
    for (const r of racers) {
      if (byRacer.has(r.id)) {
        byRacer.get(r.id).name = r.name;
        byRacer.get(r.id).bib = r.bib;
      }
    }

    if (byRacer.size === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const sortedRacers = [...byRacer.entries()].sort((a, b) => a[1].bib - b[1].bib);
    for (const [, data] of sortedRacers) {
      const card = document.createElement('div');
      card.className = 'compare-card';
      const rows = data.entries
        .map((e, i) => {
          const prev = data.entries.slice(0, i).reverse().find((x) => x.status === 'finished');
          const delta = e.status === 'finished' && prev ? e.lapTimeMs - prev.lapTimeMs : null;
          const kmh = e.status === 'finished' ? computeKmh(e.lapTimeMs, e.trackLengthMeters) : null;
          if (e.status === 'dnf') {
            return `<tr><td>${e.date}</td><td>${e.trackLengthMeters || 0} m</td><td>DNF</td><td>—</td><td>—</td></tr>`;
          }
          const deltaClass = delta == null ? '' : delta < 0 ? 'delta-good' : delta > 0 ? 'delta-bad' : '';
          return `
            <tr>
              <td>${e.date}</td>
              <td>${e.trackLengthMeters || 0} m</td>
              <td>${formatLapTime(e.lapTimeMs)}</td>
              <td>${formatKmh(kmh)}</td>
              <td class="${deltaClass}">${delta == null ? '—' : formatDelta(delta)}</td>
            </tr>
          `;
        })
        .join('');
      card.innerHTML = `
        <h3><span class="bib">#${data.bib}</span> ${escapeHtml(data.name)}</h3>
        <table class="data-table">
          <thead><tr><th>Date</th><th>Track</th><th>Time</th><th>km/h</th><th>Δ vs prev</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      body.appendChild(card);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  App.compare = { mount, render };
})((window.App = window.App || {}));
