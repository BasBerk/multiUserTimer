// App bootstrap: mount views, wire navigation, re-render on state change.
(function (App) {
  const { onChange } = App.store;

  const views = {
    racers: { mount: App.racers.mount, render: App.racers.render },
    race: {
      mount: App.race.mount,
      render: App.race.render,
      onShow: () => App.race.setVisible(true),
      onHide: () => App.race.setVisible(false),
    },
    results: { mount: App.results.mount, render: App.results.render },
    compare: { mount: App.compare.mount, render: App.compare.render },
  };

  let currentView = null;

  function init() {
    for (const [name, view] of Object.entries(views)) {
      const el = document.querySelector(`[data-view="${name}"]`);
      if (el) view.mount(el);
    }

    document.querySelectorAll('nav [data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => showView(btn.dataset.nav));
    });

    onChange(() => {
      for (const view of Object.values(views)) view.render?.();
    });

    const initial = location.hash.replace('#', '') || 'racers';
    showView(views[initial] ? initial : 'racers');
  }

  function showView(name) {
    if (currentView === name) return;
    if (currentView && views[currentView]?.onHide) views[currentView].onHide();
    currentView = name;
    document.querySelectorAll('[data-view]').forEach((el) => {
      el.hidden = el.dataset.view !== name;
    });
    document.querySelectorAll('nav [data-nav]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.nav === name);
    });
    views[name]?.render?.();
    views[name]?.onShow?.();
    if (location.hash !== `#${name}`) {
      history.replaceState(null, '', `#${name}`);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})((window.App = window.App || {}));
