// Time and speed formatting helpers.
(function (App) {
  /** Format milliseconds as m:ss.hh (minutes : seconds . hundredths). */
  function formatLapTime(ms) {
    if (ms == null || !isFinite(ms) || ms < 0) return '—';
    const totalHundredths = Math.round(ms / 10);
    const hundredths = totalHundredths % 100;
    const totalSeconds = Math.floor(totalHundredths / 100);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }

  /** Format signed milliseconds as +m:ss.hh / -m:ss.hh for deltas. */
  function formatDelta(ms) {
    if (ms == null || !isFinite(ms)) return '—';
    const sign = ms > 0 ? '+' : ms < 0 ? '-' : '±';
    return sign + formatLapTime(Math.abs(ms));
  }

  /** Compute km/h from lap time (ms) and track length (m). Returns null if inputs invalid. */
  function computeKmh(lapTimeMs, trackLengthMeters) {
    if (!lapTimeMs || lapTimeMs <= 0) return null;
    if (!trackLengthMeters || trackLengthMeters <= 0) return null;
    const hours = lapTimeMs / 3_600_000;
    const km = trackLengthMeters / 1000;
    return km / hours;
  }

  /** Format a km/h number to 1 decimal, or — if null. */
  function formatKmh(kmh) {
    if (kmh == null || !isFinite(kmh)) return '—';
    return kmh.toFixed(1);
  }

  /** Current local date as YYYY-MM-DD. */
  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Short unique id. */
  function shortId(prefix = '') {
    return prefix + Math.random().toString(36).slice(2, 8);
  }

  App.format = { formatLapTime, formatDelta, computeKmh, formatKmh, todayIso, shortId };
})((window.App = window.App || {}));
