(() => {
  const legacyStorageKey = 'echolang-reader-display';
  const defaults = {
    appearance: { colorScheme: 'blue' },
    reader: { font: 'serif', size: 18, lineHeight: 1.68, paragraphGap: 22, contentWidth: 850, sidebarWidth: 315 },
    batch: { sidebarWidth: 430 },
  };
  const fontFamilies = {
    serif: 'Georgia, "Noto Serif SC", "Songti SC", serif',
    sans: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    system: 'ui-sans-serif, "PingFang SC", "Microsoft YaHei", sans-serif',
  };
  const controls = {
    font: document.getElementById('appReaderFont'),
    size: document.getElementById('appReaderFontSize'),
    lineHeight: document.getElementById('appReaderLineHeight'),
    paragraphGap: document.getElementById('appReaderParagraphGap'),
    contentWidth: document.getElementById('appReaderContentWidth'),
  };
  const outputs = {
    size: document.getElementById('appReaderFontSizeValue'),
    lineHeight: document.getElementById('appReaderLineHeightValue'),
    paragraphGap: document.getElementById('appReaderParagraphGapValue'),
    contentWidth: document.getElementById('appReaderContentWidthValue'),
  };
  const colorSchemeButtons = [...document.querySelectorAll('[data-color-scheme]')];
  let settings = structuredClone(defaults);
  let saveTimer = 0;

  function mergeSettings(value = {}) {
    return {
      appearance: { ...defaults.appearance, ...(value.appearance || {}) },
      reader: { ...defaults.reader, ...(value.reader || {}) },
      batch: { ...defaults.batch, ...(value.batch || {}) },
    };
  }

  function applySettings(value, syncControls = true) {
    settings = mergeSettings(value);
    const reader = settings.reader;
    document.body.dataset.accent = settings.appearance.colorScheme;
    document.documentElement.style.setProperty('--reader-font-family', fontFamilies[reader.font] || fontFamilies.serif);
    document.documentElement.style.setProperty('--reader-font-size', `${reader.size}px`);
    document.documentElement.style.setProperty('--reader-line-height', String(reader.lineHeight));
    document.documentElement.style.setProperty('--reader-paragraph-gap', `${reader.paragraphGap}px`);
    document.documentElement.style.setProperty('--reader-content-width', `${reader.contentWidth}px`);
    document.documentElement.style.setProperty('--reader-sidebar-width', `${reader.sidebarWidth}px`);
    document.documentElement.style.setProperty('--batch-sidebar-width', `${settings.batch.sidebarWidth}px`);
    if (!syncControls || !controls.font) return;
    controls.font.value = reader.font;
    controls.size.value = String(reader.size);
    controls.lineHeight.value = String(reader.lineHeight);
    controls.paragraphGap.value = String(reader.paragraphGap);
    controls.contentWidth.value = String(reader.contentWidth);
    outputs.size.value = `${reader.size}px`;
    outputs.lineHeight.value = Number(reader.lineHeight).toFixed(2);
    outputs.paragraphGap.value = `${reader.paragraphGap}px`;
    outputs.contentWidth.value = `${reader.contentWidth}px`;
    colorSchemeButtons.forEach((button) => {
      const active = button.dataset.colorScheme === settings.appearance.colorScheme;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    syncThemeControls();
  }

  function readControls() {
    return mergeSettings({
      reader: {
        font: controls.font.value,
        size: Number(controls.size.value),
        lineHeight: Number(controls.lineHeight.value),
        paragraphGap: Number(controls.paragraphGap.value),
        contentWidth: Number(controls.contentWidth.value),
        sidebarWidth: settings.reader.sidebarWidth,
      },
      batch: { sidebarWidth: settings.batch.sidebarWidth },
      appearance: { colorScheme: settings.appearance.colorScheme },
    });
  }

  function setSaveState(copy, error = false) {
    const node = document.getElementById('appSettingsSaveState');
    if (!node) return;
    node.textContent = copy;
    node.style.color = error ? 'var(--rose)' : '';
  }

  async function saveSettings({ announce = false } = {}) {
    window.clearTimeout(saveTimer);
    setSaveState('保存中…');
    try {
      const response = await fetch('/api/app-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || '保存失败');
      applySettings(data.settings);
      setSaveState('已保存到 JSON');
      if (announce && typeof window.showToast === 'function') window.showToast('应用设置已保存');
    } catch (error) {
      setSaveState('保存失败', true);
      if (announce && typeof window.showToast === 'function') window.showToast(`设置保存失败：${error.message}`);
    }
  }

  function scheduleSave() {
    setSaveState('○ 有未保存修改');
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveSettings(), 420);
  }

  function handleControlInput() {
    applySettings(readControls());
    scheduleSave();
  }

  function syncThemeControls() {
    const dark = document.body.dataset.theme === 'dark';
    colorSchemeButtons.forEach((button) => { button.disabled = dark; });
    const hint = document.getElementById('colorSchemeHint');
    if (hint) hint.textContent = dark ? '当前使用 GitHub Dark；切换回浅色模式后可选择主题色。' : '选择应用在浅色模式下使用的主题色；深色模式固定采用 GitHub Dark。';
  }

  function bindResizer(node) {
    if (!node) return;
    const target = node.dataset.pane;
    node.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const grid = node.parentElement;
      const gridRect = grid.getBoundingClientRect();
      const minimum = target === 'reader' ? 240 : 300;
      const maximum = Math.max(minimum, Math.min(target === 'reader' ? 560 : 760, gridRect.width - 360));
      node.setPointerCapture(event.pointerId);
      node.classList.add('is-resizing');
      document.body.classList.add('is-resizing-pane');
      const move = (moveEvent) => {
        const width = Math.round(Math.max(minimum, Math.min(maximum, moveEvent.clientX - gridRect.left)));
        if (target === 'reader') settings.reader.sidebarWidth = width;
        else settings.batch.sidebarWidth = width;
        applySettings(settings);
        scheduleSave();
      };
      const finish = () => {
        node.classList.remove('is-resizing');
        document.body.classList.remove('is-resizing-pane');
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', finish);
        node.removeEventListener('pointercancel', finish);
        saveSettings();
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', finish);
      node.addEventListener('pointercancel', finish);
    });
  }

  async function loadSettings() {
    try {
      const response = await fetch('/api/app-settings');
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || '读取失败');
      let next = mergeSettings(data.settings);
      if (!data.exists) {
        try {
          const legacy = JSON.parse(localStorage.getItem(legacyStorageKey) || 'null');
          if (legacy) next.reader = { ...next.reader, font: legacy.font, size: legacy.size, lineHeight: legacy.lineHeight, paragraphGap: legacy.paragraphGap, contentWidth: legacy.width };
        } catch { /* Ignore invalid legacy display settings. */ }
      }
      applySettings(next);
      if (!data.exists) await saveSettings();
      else setSaveState('已保存到 JSON');
    } catch (error) {
      applySettings(defaults);
      setSaveState('使用默认设置', true);
    }
  }

  Object.values(controls).forEach((control) => control?.addEventListener('input', handleControlInput));
  colorSchemeButtons.forEach((button) => button.addEventListener('click', () => {
    if (document.body.dataset.theme === 'dark') return;
    settings.appearance.colorScheme = button.dataset.colorScheme;
    applySettings(settings);
    scheduleSave();
  }));
  document.getElementById('appSettingsReset')?.addEventListener('click', () => { applySettings(defaults); scheduleSave(); });
  document.addEventListener('echolang:themechange', syncThemeControls);
  document.getElementById('readingSettings')?.addEventListener('click', () => window.setActivePage?.('settings'));
  document.querySelectorAll('.pane-resizer').forEach(bindResizer);
  window.EchoLangAppSettings = { get: () => structuredClone(settings), apply: applySettings, save: saveSettings };
  loadSettings();
})();
