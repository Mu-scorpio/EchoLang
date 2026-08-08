(() => {
  const desktopWindow = window.echoLangDesktop;
  const titlebar = document.getElementById('windowTitlebar');
  const controls = document.getElementById('windowControls');
  if (!titlebar || !controls) return;

  const setFocusState = (isFocused) => document.body.classList.toggle('is-window-focused', isFocused);
  const updateWindowState = (state = {}) => {
    const isMaximized = Boolean(state.isMaximized || state.isFullScreen);
    titlebar.dataset.maximized = String(isMaximized);
    const maximizeButton = controls.querySelector('[data-window-action="toggle-maximize"]');
    if (maximizeButton) {
      const label = isMaximized ? '还原窗口' : '最大化窗口';
      maximizeButton.title = label;
      maximizeButton.setAttribute('aria-label', label);
    }
  };

  const animateContextChange = () => {
    titlebar.classList.remove('is-context-changing');
    window.requestAnimationFrame(() => titlebar.classList.add('is-context-changing'));
  };

  window.addEventListener('focus', () => setFocusState(true));
  window.addEventListener('blur', () => setFocusState(false));
  document.addEventListener('echolang:pagechange', animateContextChange);
  titlebar.addEventListener('animationend', () => titlebar.classList.remove('is-context-changing'));
  setFocusState(document.hasFocus());

  if (!desktopWindow) return;
  document.documentElement.classList.add('has-desktop-window-controls');
  document.documentElement.dataset.desktopPlatform = desktopWindow.platform || 'unknown';

  const actions = {
    minimize: () => desktopWindow.minimize(),
    'toggle-maximize': async () => updateWindowState(await desktopWindow.toggleMaximize()),
    close: () => desktopWindow.close(),
  };

  controls.addEventListener('click', (event) => {
    const button = event.target.closest('[data-window-action]');
    if (!button || !actions[button.dataset.windowAction]) return;
    Promise.resolve(actions[button.dataset.windowAction]()).catch(() => {});
  });

  desktopWindow.getState().then(updateWindowState).catch(() => {});
  desktopWindow.onStateChanged(updateWindowState);
})();
