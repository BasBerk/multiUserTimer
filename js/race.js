// Race view: start next / finish / DNF / live clock + end session.
(function (App) {
  const { getState, update } = App.store;
  const { formatLapTime, computeKmh, formatKmh, shortId, todayIso } = App.format;

  let root = null;
  let rafId = null;
  let isVisible = false;

  function mount(el) {
    root = el;
    root.innerHTML = `
      <section class="view-header">
        <h2>Race</h2>
        <div class="toolbar">
          <label class="inline-field">
            Track length (m)
            <input id="track-length" type="number" min="0" step="1" />
          </label>
          <button id="new-race-day" class="btn">New race day</button>
          <button id="end-session" class="btn btn-danger" disabled>End session</button>
        </div>
      </section>

      <div class="race-grid">
        <div class="race-panel">
          <h3>Running <span id="running-count" class="pill">0</span></h3>
          <div id="running-list" class="running-list"></div>
          <p id="running-empty" class="empty">No racers on course.</p>
        </div>

        <div class="race-panel">
          <h3>Start list <span id="pending-count" class="pill">0</span></h3>
          <button id="start-next" class="btn btn-primary btn-big" disabled>Start next</button>
          <form id="quick-add-form" class="row-form">
            <input id="quick-add-bib" type="number" min="0" step="1" placeholder="Bib #" required />
            <input id="quick-add-name" type="text" placeholder="Add racer" required />
            <button type="submit" class="btn btn-sm">Add</button>
          </form>
          <ol id="pending-list" class="pending-list"></ol>
          <p id="pending-empty" class="empty">No racers pending.</p>
        </div>

        <div class="race-panel">
          <h3>Finished <span id="finished-count" class="pill">0</span></h3>
          <ol id="finished-list" class="finished-list"></ol>
          <p id="finished-empty" class="empty">No finishes yet.</p>
        </div>
      </div>
    `;

    root.querySelector('#track-length').addEventListener('change', onTrackLengthChange);
    root.querySelector('#start-next').addEventListener('click', onStartNext);
    root.querySelector('#end-session').addEventListener('click', onEndSession);
    root.querySelector('#new-race-day').addEventListener('click', onNewRaceDay);
    root.querySelector('#quick-add-form').addEventListener('submit', onQuickAdd);

    render();
  }

  function onQuickAdd(e) {
    e.preventDefault();
    const bibEl = root.querySelector('#quick-add-bib');
    const nameEl = root.querySelector('#quick-add-name');
    const bib = Number(bibEl.value);
    const name = nameEl.value.trim();
    if (!name || !Number.isFinite(bib)) return;
    update((s) => ({ ...s, racers: [...s.racers, { id: shortId('r_'), bib, name }] }));
    bibEl.value = '';
    nameEl.value = '';
    bibEl.focus();
  }

  function onNewRaceDay() {
    const state = getState();
    const active = state.activeSession;
    const hasResults = active && active.results.length > 0;
    const msg = hasResults
      ? 'Archive the current session to history and start a new race day?\n\nAll current racers will be pending again.'
      : 'Start a new race day?\n\nAll current racers will be pending again.';
    if (!confirm(msg)) return;
    update((s) => {
      const nextSessions = hasResults
        ? [
            ...s.sessions,
            {
              ...s.activeSession,
              results: s.activeSession.results.map((r) =>
                r.status === 'running' ? { ...r, status: 'dnf', finishedAt: performance.now(), lapTimeMs: null } : r,
              ),
            },
          ]
        : s.sessions;
      return {
        ...s,
        sessions: nextSessions,
        activeSession: {
          id: shortId('s_'),
          date: todayIso(),
          trackLengthMeters: s.trackLengthMeters,
          results: [],
        },
      };
    });
  }

  function render() {
    if (!root) return;
    const state = getState();
    root.querySelector('#track-length').value = state.trackLengthMeters ?? '';

    if (!state.activeSession) {
      // Create a new active session; update() will re-invoke render via the store listener.
      update((s) => ({
        ...s,
        activeSession: {
          id: shortId('s_'),
          date: todayIso(),
          trackLengthMeters: s.trackLengthMeters,
          results: [],
        },
      }));
      return;
    }
    const active = state.activeSession;

    const racers = [...state.racers].sort((a, b) => a.bib - b.bib);
    const pending = racers.filter((r) => !active.results.some((x) => x.racerId === r.id));
    const running = active.results.filter((x) => x.status === 'running');
    const finished = active.results.filter((x) => x.status === 'finished' || x.status === 'dnf');

    // Start list
    const pendingList = root.querySelector('#pending-list');
    pendingList.innerHTML = '';
    pending.forEach((r) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="bib">#${r.bib}</span> ${escapeHtml(r.name)}`;
      pendingList.appendChild(li);
    });
    root.querySelector('#pending-empty').hidden = pending.length > 0;
    root.querySelector('#pending-count').textContent = pending.length;
    root.querySelector('#start-next').disabled = pending.length === 0;

    // Running
    const runList = root.querySelector('#running-list');
    runList.innerHTML = '';
    running.forEach((entry) => {
      const div = document.createElement('div');
      div.className = 'running-row';
      div.dataset.racerId = entry.racerId;
      div.innerHTML = `
        <div class="running-info">
          <span class="bib">#${entry.bib}</span>
          <span class="name">${escapeHtml(entry.name)}</span>
        </div>
        <div class="running-clock" data-started-at="${entry.startedAt}">0:00.00</div>
        <div class="running-actions">
          <button class="btn btn-primary" data-action="finish" data-id="${entry.racerId}">Finish</button>
          <button class="btn btn-danger btn-sm" data-action="dnf" data-id="${entry.racerId}">DNF</button>
        </div>
      `;
      runList.appendChild(div);
    });
    root.querySelector('#running-empty').hidden = running.length > 0;
    root.querySelector('#running-count').textContent = running.length;

    runList.querySelectorAll('button[data-action="finish"]').forEach((b) => {
      b.addEventListener('click', () => onFinish(b.dataset.id));
    });
    runList.querySelectorAll('button[data-action="dnf"]').forEach((b) => {
      b.addEventListener('click', () => onDnf(b.dataset.id));
    });

    // Finished
    const finList = root.querySelector('#finished-list');
    finList.innerHTML = '';
    const trackLen = state.trackLengthMeters;
    const sortedFin = [...finished].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'finished' ? -1 : 1;
      return (a.lapTimeMs ?? Infinity) - (b.lapTimeMs ?? Infinity);
    });
    sortedFin.forEach((entry) => {
      const li = document.createElement('li');
      if (entry.status === 'dnf') {
        li.innerHTML = `<span class="bib">#${entry.bib}</span> ${escapeHtml(entry.name)} <span class="time">DNF</span>`;
      } else {
        const kmh = computeKmh(entry.lapTimeMs, trackLen);
        li.innerHTML = `
          <span class="bib">#${entry.bib}</span>
          ${escapeHtml(entry.name)}
          <span class="time">${formatLapTime(entry.lapTimeMs)}</span>
          <span class="kmh">${formatKmh(kmh)} km/h</span>
        `;
      }
      finList.appendChild(li);
    });
    root.querySelector('#finished-empty').hidden = finished.length > 0;
    root.querySelector('#finished-count').textContent = finished.length;

    root.querySelector('#end-session').disabled = active.results.length === 0;

    tickLoop();
  }

  function onTrackLengthChange(e) {
    const v = Number(e.target.value);
    const next = Number.isFinite(v) && v > 0 ? v : 0;
    update((s) => ({
      ...s,
      trackLengthMeters: next,
      activeSession: s.activeSession ? { ...s.activeSession, trackLengthMeters: next } : s.activeSession,
    }));
  }

  function onStartNext() {
    const state = getState();
    const active = state.activeSession;
    const pending = [...state.racers]
      .sort((a, b) => a.bib - b.bib)
      .filter((r) => !active.results.some((x) => x.racerId === r.id));
    if (pending.length === 0) return;
    const next = pending[0];
    const now = performance.now();
    update((s) => ({
      ...s,
      activeSession: {
        ...s.activeSession,
        results: [
          ...s.activeSession.results,
          {
            racerId: next.id,
            bib: next.bib,
            name: next.name,
            startedAt: now,
            finishedAt: null,
            lapTimeMs: null,
            status: 'running',
          },
        ],
      },
    }));
  }

  function onFinish(racerId) {
    const now = performance.now();
    update((s) => {
      const active = s.activeSession;
      if (!active) return s;
      const results = active.results.map((r) => {
        if (r.racerId !== racerId || r.status !== 'running') return r;
        return { ...r, status: 'finished', finishedAt: now, lapTimeMs: now - r.startedAt };
      });
      return { ...s, activeSession: { ...active, results } };
    });
  }

  function onDnf(racerId) {
    if (!confirm('Mark this racer as DNF?')) return;
    update((s) => {
      const active = s.activeSession;
      if (!active) return s;
      const results = active.results.map((r) =>
        r.racerId === racerId && r.status === 'running'
          ? { ...r, status: 'dnf', finishedAt: performance.now(), lapTimeMs: null }
          : r,
      );
      return { ...s, activeSession: { ...active, results } };
    });
  }

  function onEndSession() {
    const state = getState();
    const active = state.activeSession;
    if (!active) return;
    const stillRunning = active.results.some((r) => r.status === 'running');
    if (stillRunning) {
      if (!confirm('Some racers are still running. End the session anyway? (They will be marked DNF.)')) return;
    }
    update((s) => {
      const session = {
        ...s.activeSession,
        results: s.activeSession.results.map((r) =>
          r.status === 'running' ? { ...r, status: 'dnf', finishedAt: performance.now(), lapTimeMs: null } : r,
        ),
      };
      return { ...s, sessions: [...s.sessions, session], activeSession: null };
    });
  }

  // --- Live clock loop -----------------------------------------------------

  function setVisible(visible) {
    isVisible = visible;
    if (visible) tickLoop();
    else stopLoop();
  }

  function tickLoop() {
    if (!isVisible) return;
    const active = getState().activeSession;
    const hasRunning = active?.results.some((r) => r.status === 'running');
    if (!hasRunning) {
      stopLoop();
      return;
    }
    if (rafId != null) return;
    const step = () => {
      rafId = null;
      if (!isVisible) return;
      const now = performance.now();
      const clocks = root?.querySelectorAll('.running-clock') ?? [];
      let anyRunning = false;
      clocks.forEach((el) => {
        const startedAt = Number(el.dataset.startedAt);
        if (Number.isFinite(startedAt)) {
          el.textContent = formatLapTime(now - startedAt);
          anyRunning = true;
        }
      });
      if (anyRunning) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }

  function stopLoop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  App.race = { mount, render, setVisible };
})((window.App = window.App || {}));
