// Obsługa okna i zasobnika. Zależności przekazywane jawnie, żeby testy nie
// dotykały prawdziwego autostartu ani klienta League of Legends.
const path = require('path');
const DEFAULT_SHORTCUT = 'Control+X';
const SHORTCUTS = [
  { value: 'Control+X', label: 'Ctrl+X' },
  { value: 'Control+Shift+X', label: 'Ctrl+Shift+X' },
  { value: 'Control+Alt+X', label: 'Ctrl+Alt+X' },
  { value: '', label: 'Wyłączony' },
];

function createDraftWatcher(show, enabled) {
  let previous = null;
  return (phase) => {
    // Błąd połączenia nie oznacza końca draftu.
    if (typeof phase !== 'string' || !phase) return;
    const entering = phase === 'ChampSelect' && previous !== 'ChampSelect';
    previous = phase;
    if (entering && enabled()) show();
  };
}

function createDesktop({ app, win, Tray, Menu, nativeImage, globalShortcut, settings, saveSettings, log = () => {}, notify = () => {},
  argv = process.argv, platform = process.platform, executable = process.execPath,
  portable = !!process.env.PORTABLE_EXECUTABLE_DIR }) {
  let tray = null;
  let quitting = false;
  let ready = false;
  let wantsWindow = !argv.includes('--background');
  let activeShortcut = '';
  let shortcutError = '';
  if (!SHORTCUTS.some(s => s.value === settings.keyboardShortcut)) settings.keyboardShortcut = DEFAULT_SHORTCUT;
  const canAutoStart = platform === 'win32' && app.isPackaged && !portable;
  // Electron 33 łączy ścieżkę i argumenty bez dodawania cudzysłowów.
  const loginOptions = { path: `"${executable}"`, args: ['--background'], name: 'Champ Select Assistant' };

  function show() {
    if (quitting || win.isDestroyed()) return;
    wantsWindow = true;
    if (!ready) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    if (!win.isFocused()) win.flashFrame(true);
  }

  function toggleWindow() {
    if (quitting || win.isDestroyed()) return;
    if ((!ready && wantsWindow) || (ready && win.isVisible() && !win.isMinimized() && win.isFocused())) {
      wantsWindow = false;
      win.hide();
    } else show();
  }

  function setShortcut(value, persist = true) {
    if (!SHORTCUTS.some(s => s.value === value)) return false;
    const previous = activeShortcut;
    const previousSetting = settings.keyboardShortcut;
    let registeredNew = false;
    try {
      if (value && value !== previous) {
        if (!globalShortcut?.register(value, toggleWindow)) throw new Error('Skrót jest zajęty przez inną aplikację lub niedostępny. Wybierz inny w menu zasobnika.');
        registeredNew = true;
      }
      settings.keyboardShortcut = value;
      if (persist) saveSettings();
      if (previous && previous !== value) globalShortcut.unregister(previous);
      activeShortcut = value;
      shortcutError = '';
      menu();
      return true;
    } catch (err) {
      if (registeredNew) globalShortcut.unregister(value);
      settings.keyboardShortcut = previousSetting;
      shortcutError = err.message;
      log(`skrót klawiaturowy: ${err.message}`);
      menu();
      if (persist) notify(`Nie udało się zmienić skrótu. ${err.message}`);
      return false;
    }
  }

  function setAutoStart(enabled) {
    if (!canAutoStart) return false;
    try {
      app.setLoginItemSettings({ ...loginOptions, openAtLogin: enabled });
      const actual = app.getLoginItemSettings(loginOptions);
      // openAtLogin sprawdza tylko domyślną nazwę AppUserModelID, nie własne
      // `name`. Dla naszej nazwanej pozycji trzeba sprawdzić launchItems.
      const entry = actual.launchItems.find((item) => item.name === loginOptions.name && item.scope === 'user');
      // launchItems.args pomija przełączniki Chromium (takie jak --background).
      const valid = entry?.enabled && entry.path.toLowerCase() === executable.toLowerCase();
      if (enabled ? !valid : !!entry) {
        throw new Error('Windows nie potwierdził ustawienia autostartu');
      }
      settings.launchAtLogin = enabled;
      saveSettings();
      return true;
    } catch (err) {
      log(`autostart: ${err.message}`);
      return false;
    }
  }

  function menu() {
    if (!tray) return;
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Pokaż aplikację', click: show },
      { label: `Skrót klawiaturowy: ${SHORTCUTS.find(s => s.value === activeShortcut)?.label || 'Wyłączony'}`,
        submenu: [
          ...SHORTCUTS.map(s => ({ label: s.label, type: 'radio', checked: settings.keyboardShortcut === s.value,
            click: () => setShortcut(s.value) })),
          { type: 'separator' },
          { label: 'Ctrl+X zastępuje standardowe Wytnij', enabled: false },
          ...(shortcutError ? [{ label: 'Skrót niedostępny — wybierz inny lub spróbuj ponownie', enabled: false }] : []),
        ] },
      { type: 'separator' },
      { label: 'Pokazuj przy wyborze postaci', type: 'checkbox', checked: !!settings.autoPopup,
        click: (item) => { settings.autoPopup = item.checked; saveSettings(); menu(); } },
      { label: 'Uruchamiaj z Windowsem w tle', type: 'checkbox', enabled: canAutoStart,
        checked: canAutoStart && !!settings.launchAtLogin,
        click: (item) => { setAutoStart(item.checked); menu(); } },
      { type: 'separator' },
      { label: 'Zakończ', click: () => app.quit() },
    ]));
  }

  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
    if (icon.isEmpty()) throw new Error('Brak ikony zasobnika');
    tray = new Tray(icon);
    tray.setToolTip('Champ Select Assistant — czekam na wybór postaci');
    tray.on('click', show);
    tray.on('double-click', show);
    menu();
  } catch (err) {
    if (tray) tray.destroy();
    tray = null;
    wantsWindow = true; // Bez zasobnika nie zostawiaj niewidocznej aplikacji.
    log(`zasobnik: ${err.message}`);
  }

  // Nie włączamy autostartu nowym użytkownikom bez ich decyzji w menu.
  if (canAutoStart && settings.launchAtLogin) setAutoStart(true);
  setShortcut(settings.keyboardShortcut, false);
  win.once('ready-to-show', () => { ready = true; if (wantsWindow) show(); });
  win.on('focus', () => win.flashFrame(false));
  win.on('close', (event) => {
    if (quitting || !tray) return;
    event.preventDefault();
    wantsWindow = false;
    win.hide();
  });
  win.on('session-end', () => { quitting = true; });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => {
    if (activeShortcut) globalShortcut.unregister(activeShortcut);
    activeShortcut = '';
    if (tray) { tray.destroy(); tray = null; }
  });
  app.on('second-instance', (_event, args) => { if (!args.includes('--background')) show(); });
  app.on('activate', show);

  const observePhase = createDraftWatcher(show, () => settings.autoPopup);
  return { show, observePhase, toggleWindow, setShortcut };
}

module.exports = { createDesktop, createDraftWatcher, DEFAULT_SHORTCUT };
