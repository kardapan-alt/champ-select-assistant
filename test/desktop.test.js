const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createDesktop, createDraftWatcher } = require('../src/desktop');

function fixture({ background = true, packaged = true, portable = false, trayFails = false, launchAtLogin = false,
  keyboardShortcut, bookmarkShortcut, onBookmark=()=>{}, onShortcutChange=()=>{}, occupied = [] } = {}) {
  const app = new EventEmitter();
  const win = new EventEmitter();
  const calls = { shown: 0, saved: 0, restored: 0, quit: 0, login: [] };
  let visible = false, minimized = false, focused = false, tray;
  const shortcuts = new Map();
  const notices = [];
  const globalShortcut = {
    register: (key, callback) => { if (occupied.includes(key)) return false; shortcuts.set(key, callback); return true; },
    unregister: key => shortcuts.delete(key),
  };
  app.isPackaged = packaged;
  app.quit = () => { calls.quit++; app.emit('before-quit'); win.close(); app.emit('will-quit'); };
  app.setLoginItemSettings = (value) => calls.login.push(value);
  // Przy własnej nazwie wpisu Electron zwraca openAtLogin:false również
  // wtedy, gdy poprawny wpis launchItems uruchomi aplikację z Windowsem.
  app.getLoginItemSettings = () => ({ openAtLogin: false, launchItems: calls.login.at(-1)?.openAtLogin
    ? [{ name: 'Champ Select Assistant', scope: 'user', enabled: true, path: 'C:\\App\\Champ Select Assistant.exe', args: [] }] : [] });
  win.isDestroyed = () => false;
  let bounds={x:50,y:70,width:1100,height:760},maximized=false;
  win.getBounds=()=>({...bounds});win.getNormalBounds=win.getBounds;
  win.setBounds=value=>{bounds={...value};};win.setMinimumSize=(w,h)=>{calls.minimum=[w,h];};
  win.isMaximized=()=>maximized;win.maximize=()=>{maximized=true;};win.unmaximize=()=>{maximized=false;};
  win.isMinimized = () => minimized;
  win.restore = () => { minimized = false; calls.restored++; };
  win.minimize = () => { minimized = true; focused = false; };
  win.isVisible = () => visible;
  win.show = () => { visible = true; calls.shown++; };
  win.hide = () => { visible = false; focused = false; };
  win.focus = () => { focused = true; };
  win.blur = () => { focused = false; };
  win.isFocused = () => focused;
  win.flashFrame = () => {};
  win.close = () => {
    let prevented = false;
    win.emit('close', { preventDefault: () => { prevented = true; } });
    return prevented;
  };
  class Tray extends EventEmitter {
    constructor() { super(); if (trayFails) throw new Error('test'); tray = this; }
    setToolTip() {}
    setContextMenu(value) { this.menu = value; }
    destroy() { this.destroyed = true; }
  }
  const settings = { autoPopup: true, launchAtLogin, keyboardShortcut, bookmarkShortcut };
  const desktop = createDesktop({ app, win, Tray, globalShortcut, notify: message => notices.push(message), Menu: { buildFromTemplate: (items) => items },
    nativeImage: { createFromPath: () => ({ isEmpty: () => false }) }, settings, onBookmark, onShortcutChange,
    saveSettings: () => {calls.saved++; calls.savedSettings={...settings};}, argv: background ? ['app.exe', '--background'] : ['app.exe'],
    platform: 'win32', executable: 'C:\\App\\Champ Select Assistant.exe', portable });
  return { desktop, app, win, settings, calls, tray, shortcuts, notices, visible: () => visible,
    toggle: (label, checked) => tray.menu.find((item) => item.label?.startsWith(label)).click({ checked }) };
}

test('wyskakuje raz na draft, nie przy ReadyCheck, zmianach picków ani utracie połączenia', () => {
  let count = 0;
  const observe = createDraftWatcher(() => count++, () => true);
  ['None', 'Lobby', 'Matchmaking', 'ReadyCheck'].forEach(observe);
  assert.equal(count, 0);
  ['ChampSelect', 'ChampSelect', undefined, null, '', 'ChampSelect'].forEach(observe);
  assert.equal(count, 1);
  ['Lobby', 'ReadyCheck', 'ChampSelect', 'InProgress', 'EndOfGame', 'ChampSelect'].forEach(observe);
  assert.equal(count, 3);
});

test('start w tle pozostaje ukryty, wejście do draftu przed gotowością czeka na gotowe okno', () => {
  const f = fixture();
  f.desktop.observePhase('ChampSelect');
  assert.equal(f.visible(), false);
  f.win.emit('ready-to-show');
  assert.equal(f.visible(), true);
  assert.equal(f.calls.shown, 1);
});

test('krzyżyk chowa okno do następnego draftu, a minimalizowane okno jest przywracane', () => {
  const f = fixture();
  f.win.emit('ready-to-show');
  assert.equal(f.visible(), false);
  f.desktop.observePhase('ChampSelect');
  assert.equal(f.win.close(), true);
  f.desktop.observePhase('ChampSelect');
  assert.equal(f.visible(), false);
  f.win.minimize();
  f.desktop.observePhase('Lobby');
  f.desktop.observePhase('ChampSelect');
  assert.equal(f.visible(), true);
  assert.equal(f.calls.restored, 1);
});

test('wyłączenie popupu działa; ponowne włączenie czeka na nowy draft', () => {
  const f = fixture();
  f.win.emit('ready-to-show');
  f.toggle('Pokazuj', false);
  f.desktop.observePhase('ChampSelect');
  f.toggle('Pokazuj', true);
  f.desktop.observePhase('ChampSelect');
  assert.equal(f.visible(), false);
  f.desktop.observePhase('Lobby');
  f.desktop.observePhase('ChampSelect');
  assert.equal(f.visible(), true);
  assert.equal(f.calls.saved, 2);
});

test('skrót pokazuje istniejące okno, drugi start w tle pozostawia je ukryte', () => {
  const f = fixture({ background: false });
  f.win.emit('ready-to-show');
  assert.equal(f.visible(), true);
  f.win.close();
  f.app.emit('second-instance', {}, ['app.exe', '--background']);
  assert.equal(f.visible(), false);
  f.app.emit('second-instance', {}, ['app.exe']);
  assert.equal(f.visible(), true);
  f.win.close();
  f.tray.emit('click');
  assert.equal(f.visible(), true);
});

test('autostart zapisuje ścieżkę i --background, daje się wyłączyć i zachowuje preferencję', () => {
  const f = fixture({ launchAtLogin: true });
  assert.deepEqual(f.calls.login[0], { path: '"C:\\App\\Champ Select Assistant.exe"', args: ['--background'], name: 'Champ Select Assistant', openAtLogin: true });
  f.toggle('Uruchamiaj', false);
  assert.equal(f.calls.login.at(-1).openAtLogin, false);
  assert.equal(f.settings.launchAtLogin, false);
  assert.equal(f.calls.saved, 2);
});

test('wersja deweloperska i portable nie rejestrują autostartu, błąd systemu nie zapisuje fałszywego sukcesu', () => {
  for (const options of [{ packaged: false }, { portable: true }]) {
    const f = fixture({ ...options, launchAtLogin: true });
    assert.equal(f.calls.login.length, 0);
    assert.equal(f.tray.menu.find((i) => i.label?.startsWith('Uruchamiaj')).enabled, false);
  }
  const f = fixture();
  f.app.setLoginItemSettings = () => { throw new Error('registry denied'); };
  f.toggle('Uruchamiaj', true);
  assert.equal(f.settings.launchAtLogin, false);
  assert.equal(f.calls.saved, 0);
});

test('Zakończ i quit aktualizacji zamykają proces; zamknięcie sesji Windows nie jest blokowane', () => {
  const f = fixture();
  f.toggle('Zakończ');
  assert.equal(f.calls.quit, 1);
  assert.equal(f.win.close(), false);
  assert.equal(f.tray.destroyed, true);
  const g = fixture();
  g.app.emit('before-quit');
  assert.equal(g.win.close(), false);
  const h = fixture();
  h.win.emit('session-end');
  assert.equal(h.win.close(), false);
});

test('awaria zasobnika pokazuje okno zamiast zostawiać ukryty proces bez możliwości zamknięcia', () => {
  const f = fixture({ trayFails: true });
  f.win.emit('ready-to-show');
  assert.equal(f.visible(), true);
  assert.equal(f.win.close(), false);
});

test('Ctrl+Z pokazuje i chowa okno; widoczne pod inną aplikacją wraca na wierzch', () => {
  const f = fixture();
  f.win.emit('ready-to-show');
  const press = () => f.shortcuts.get('Control+Z')();
  assert.equal(f.visible(), false);
  press(); assert.equal(f.visible(), true);
  assert.equal(f.desktop.isCompact(),true);assert.equal(f.win.getBounds().width,520);
  press(); assert.equal(f.visible(), false);
  press(); f.win.blur(); press();
  assert.equal(f.visible(), true);
  assert.equal(f.win.isFocused(), true);
  f.win.minimize(); press();
  assert.equal(f.calls.restored, 1);
  assert.equal(f.visible(), true);
});

test('pełny widok wraca do poprzedniego rozmiaru; skrót z pełnego widoku otwiera mały',()=>{
  const f=fixture();f.win.emit('ready-to-show');f.desktop.show();
  f.win.setBounds({x:120,y:90,width:1250,height:800});
  f.shortcuts.get('Control+Z')();assert.equal(f.desktop.isCompact(),true);assert.equal(f.visible(),true);
  f.desktop.setCompact(false);assert.deepEqual(f.win.getBounds(),{x:120,y:90,width:1250,height:800});
  f.shortcuts.get('Control+Z')();f.desktop.show();assert.equal(f.desktop.isCompact(),false);
});

test('skrót przed gotowością okna pamięta pokazanie i pozwala je anulować', () => {
  const f = fixture();
  f.shortcuts.get('Control+Z')();
  f.win.emit('ready-to-show');
  assert.equal(f.visible(), true);
  const g = fixture();
  g.shortcuts.get('Control+Z')(); g.shortcuts.get('Control+Z')();
  g.win.emit('ready-to-show');
  assert.equal(g.visible(), false);
});

test('menu zmienia skrót, zwalnia poprzedni i zachowuje wyłączenie po restarcie', () => {
  const f = fixture();
  const menu = () => f.tray.menu.find(item => item.submenu).submenu;
  menu().find(item => item.label === 'Ctrl+Shift+X').click();
  assert.deepEqual([...f.shortcuts.keys()], ['Control+Shift+X']);
  assert.equal(f.settings.keyboardShortcut, 'Control+Shift+X');
  assert.equal(f.calls.saved, 1);
  menu().find(item => item.label === 'Wyłączony').click();
  assert.equal(f.shortcuts.size, 0);
  assert.equal(f.settings.keyboardShortcut, '');
  const g = fixture({ keyboardShortcut: f.settings.keyboardShortcut });
  assert.equal(g.shortcuts.size, 0);
});

test('aktualizacja zapisuje Ctrl+Z raz i zachowuje niestandardowe skróty oraz wyłączenie', () => {
  const f=fixture({keyboardShortcut:'Control+X'});
  assert.deepEqual([...f.shortcuts.keys()],['Control+Z']);
  const undoNotice=fixture=>fixture.tray.menu.find(item=>item.submenu).submenu.some(item=>item.label?.includes('Cofnij'));
  assert.ok(undoNotice(f));
  assert.equal(f.desktop.shortcutLabel(),'Ctrl+Z');
  assert.equal(f.calls.saved,1);
  assert.equal(f.calls.savedSettings.keyboardShortcut,'Control+Z');
  for(const value of [f.calls.savedSettings.keyboardShortcut,'Control+Shift+X','Control+Alt+X','']){
    const next=fixture({keyboardShortcut:value});
    assert.equal(next.calls.saved,0);
    assert.deepEqual([...next.shortcuts.keys()],value?[value]:[]);
  }
  const blocked=fixture({keyboardShortcut:'Control+X',occupied:['Control+Z']});
  assert.equal(undoNotice(blocked),false);
  assert.equal(blocked.calls.savedSettings.keyboardShortcut,'Control+Z');
  assert.equal(blocked.desktop.shortcutLabel(),null);
  assert.equal(blocked.shortcuts.size,0);
});

test('etykieta i odświeżenie widoku odpowiadają aktywnemu skrótowi',()=>{
  let changes=0;
  const f=fixture({keyboardShortcut:'',occupied:['Control+Alt+X'],onShortcutChange:()=>changes++});
  assert.equal(f.desktop.shortcutLabel(),null);
  assert.equal(f.desktop.setShortcut('Control+Shift+X'),true);
  assert.equal(f.desktop.shortcutLabel(),'Ctrl+Shift+X');
  assert.equal(f.desktop.setShortcut('Control+Alt+X'),false);
  assert.equal(f.desktop.shortcutLabel(),'Ctrl+Shift+X');
  assert.equal(changes,1);
  assert.equal(f.desktop.setShortcut(''),true);
  assert.equal(f.desktop.shortcutLabel(),null);
  assert.equal(changes,2);
});

test('zajęty skrót nie usuwa działającego; awaria przy starcie jest widoczna w menu', () => {
  const f = fixture({ occupied: ['Control+Shift+X'] });
  assert.equal(f.desktop.setShortcut('Control+Shift+X'), false);
  assert.deepEqual([...f.shortcuts.keys()], ['Control+Z']);
  assert.equal(f.settings.keyboardShortcut, 'Control+Z');
  assert.equal(f.calls.saved, 0);
  assert.equal(f.notices.length, 1);
  const g = fixture({ occupied: ['Control+Z'] });
  assert.equal(g.shortcuts.size, 0);
  assert.ok(g.tray.menu.find(item => item.submenu).submenu.some(item => item.label?.includes('niedostępny')));
  assert.equal(g.notices.length, 0, 'Cichy start nie pokazuje dialogu');
});

test('błąd zapisu ustawień przywraca dotychczasowy skrót', () => {
  const f = fixture();
  Object.defineProperty(f.calls, 'saved', { get: () => 0, set: () => { throw new Error('Dysk niedostępny'); } });
  assert.equal(f.desktop.setShortcut('Control+Alt+X'), false);
  assert.equal(f.settings.keyboardShortcut, 'Control+Z');
  assert.deepEqual([...f.shortcuts.keys()], ['Control+Z']);
});

test('zakończenie zwalnia skrót i nie pozwala ponownie pokazać okna', () => {
  const f = fixture();
  f.win.emit('ready-to-show');
  const press = f.shortcuts.get('Control+Z');
  f.app.quit();
  assert.equal(f.shortcuts.size, 0);
  press();
  assert.equal(f.visible(), false);
});

test('skrót zakładek jest aktywny wyłącznie dla wskazanej gry i nie otwiera okna',()=>{
  const marks=[], f=fixture({onBookmark:id=>marks.push(id)});
  f.win.emit('ready-to-show');
  assert.deepEqual([...f.shortcuts.keys()],['Control+Z']);
  f.desktop.setBookmarkGame('77');
  const old=f.shortcuts.get('Control+Alt+B');
  old();old();
  assert.deepEqual(marks,['77']);
  assert.equal(f.visible(),false);
  f.desktop.setBookmarkGame('78');
  old();f.shortcuts.get('Control+Alt+B')();
  assert.deepEqual(marks,['77','78']);
  f.desktop.setBookmarkGame(null);
  assert.deepEqual([...f.shortcuts.keys()],['Control+Z']);
});

test('zajęty skrót zakładki, jego zmiana i wyłączenie zachowują Ctrl+Z',()=>{
  const f=fixture({occupied:['Control+Alt+B']});
  const menu=()=>f.tray.menu.find(row=>row.label?.startsWith('Zakładka powtórki')).submenu;
  f.desktop.setBookmarkGame('55');assert.match(f.desktop.bookmarkStatus().error,/zajęty/);
  assert.deepEqual([...f.shortcuts.keys()],['Control+Z']);
  menu().find(row=>row.label==='Ctrl+Shift+B').click();
  assert.equal(f.desktop.bookmarkStatus().active,true);
  menu().find(row=>row.label==='Ctrl+Alt+B').click();
  assert.equal(f.settings.bookmarkShortcut,'Control+Shift+B');
  assert.equal(f.notices.length,1);
  menu().find(row=>row.label==='Wyłączony').click();
  assert.equal(f.settings.bookmarkShortcut,'');
  assert.deepEqual([...f.shortcuts.keys()],['Control+Z']);
  f.desktop.setBookmarkGame(null);f.desktop.setBookmarkGame('56');
  assert.equal(f.desktop.bookmarkStatus().active,false);
});
