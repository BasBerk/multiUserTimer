// App state + localStorage persistence. Single source of truth.
(function (App) {
  const KEY = 'mut:v1';
  const SCHEMA_VERSION = 1;
  const listeners = new Set();

  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      trackLengthMeters: 1000,
      racers: [],
      sessions: [],
      activeSession: null,
    };
  }

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (parsed?.version !== SCHEMA_VERSION) return defaultState();
      return { ...defaultState(), ...parsed };
    } catch {
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Failed to persist state:', err);
    }
  }

  function getState() {
    return state;
  }

  function update(fn) {
    state = fn(state);
    save();
    listeners.forEach((l) => l(state));
  }

  function replaceState(incoming) {
    if (!incoming || incoming.version !== SCHEMA_VERSION) {
      throw new Error(`Unsupported state version: ${incoming?.version}`);
    }
    state = { ...defaultState(), ...incoming };
    save();
    listeners.forEach((l) => l(state));
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function resetAll() {
    state = defaultState();
    save();
    listeners.forEach((l) => l(state));
  }

  App.store = { getState, update, replaceState, onChange, resetAll, SCHEMA_VERSION };
})((window.App = window.App || {}));
