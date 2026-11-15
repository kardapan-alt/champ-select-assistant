// Prawdziwy main + Electron + symulowany LCU. Własny profil, brak API gracza,
// brak autostartu w Windows i brak przejmowania fokusu podczas testu.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const profile = path.resolve(__dirname, '../../desktop-preview/profile');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
if (process.argv.includes('--secondary')) {
  if (app.requestSingleInstanceLock()) { console.error('Druga instancja zdobyła blokadę'); app.exit(2); }
  else app.quit();
} else {
app.disableHardwareAcceleration();
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ stats: false, autoRunes: false, autoItemSet: false, autoPopup: true, launchAtLogin: false, keyboardShortcut: '' }));
fs.writeFileSync(path.join(profile, 'choices.json'), '{}');
process.argv.push('--background');
process.env.PORT = '0';
process.env.STEP = '-1';
const server = require('../mock/mock-lcu');
let win, shows = 0;
app.on('browser-window-created', (_event, created) => {
  win = created;
  win.setPosition(-30000, -30000);
  win.show = win.showInactive.bind(win);
  win.focus = () => {};
  win.on('show', () => shows++);
});
const waitFor = async (check, message) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error(message);
};
server.once('listening', async () => {
  process.env.LCU_MOCK = `http://127.0.0.1:${server.address().port}`;
  require('../src/main');
  try {
    await waitFor(() => win && !win.webContents.isLoading() && win.webContents.executeJavaScript("document.body.innerText.includes('Czekam na wybór postaci')"), 'Brak ekranu Lobby');
    assert.equal(win.isVisible(), false, 'Start w tle pokazał okno');
    const step = (n) => fetch(`${process.env.LCU_MOCK}/__step?n=${n}`);
    await step(0);
    await waitFor(() => win.isVisible(), 'Wejście do draftu nie pokazało okna');
    assert.equal(shows, 1);
    win.close();
    assert.equal(win.isDestroyed(), false);
    assert.equal(win.isVisible(), false);
    await step(1);
    await new Promise((r) => setTimeout(r, 2200));
    assert.equal(shows, 1, 'Nowe picki ponownie pokazały okno');
    assert.ok(await win.webContents.executeJavaScript("document.querySelector('.build-context')?.innerText.includes('Po queście mida')"), 'Quest z kolejki LCU nie dotarł do renderera');
    const live = await win.webContents.executeJavaScript('window.assist.getState()');
    const choice = { action:'item', alias:live.build.alias, scope:live.build.scope, slot:0, id:live.build.items[0].id };
    const pinned = await win.webContents.executeJavaScript(`window.assist.editChoices(${JSON.stringify(choice)})`);
    assert.equal(pinned.ok, true);
    assert.equal((await win.webContents.executeJavaScript('window.assist.getState()')).build.items[0].pinned, true);
    await win.webContents.executeJavaScript('window.assist.toggleAutoRunes()');
    await step(3);
    const currentPage = async () => (await fetch(`${process.env.LCU_MOCK}/lol-perks/v1/currentpage`)).json();
    await waitFor(async () => (await currentPage()).selectedPerkIds?.length === 9, 'Runy nie zostały automatycznie zaimportowane');
    const manual = await currentPage();
    await fetch(`${process.env.LCU_MOCK}/lol-perks/v1/pages/${manual.id}`,{method:'DELETE'});
    manual.selectedPerkIds[6] = manual.selectedPerkIds[6] === 5008 ? 5005 : 5008;
    manual.name = 'Własna zmiana w kliencie'; delete manual.id;
    assert.equal((await fetch(`${process.env.LCU_MOCK}/lol-perks/v1/pages`,{method:'POST',body:JSON.stringify(manual)})).ok,true);
    await waitFor(async () => (await win.webContents.executeJavaScript('window.assist.getState()')).myChampion?.runes.pinned, 'Ręczna zmiana run nie została zachowana');
    await new Promise(r=>setTimeout(r,2200));
    assert.deepEqual((await currentPage()).selectedPerkIds,manual.selectedPerkIds,'Automatyzacja nadpisała własne runy');
    console.log('PASS: przypięcie przez IPC oraz ochrona ręcznej zmiany run w kliencie.');
    await step(-1);
    await waitFor(() => win.webContents.executeJavaScript("document.body.innerText.includes('Czekam na wybór postaci')"), 'Nie wrócił do Lobby');
    await step(0);
    await waitFor(() => win.isVisible(), 'Kolejny draft nie pokazał okna');
    assert.equal(shows, 2);
    win.close();
    const launchAgain = (background) => new Promise((resolve, reject) => {
      const child = require('child_process').spawn(process.execPath, [__filename, '--secondary', ...(background ? ['--background'] : [])], { windowsHide: true, stdio: 'ignore' });
      child.on('error', reject);
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Drugi proces: ${code}`)));
    });
    await launchAgain(true);
    assert.equal(win.isVisible(), false, 'Powtórzony start w tle pokazał okno');
    await launchAgain(false);
    await waitFor(() => win.isVisible(), 'Ponowne uruchomienie skrótu nie pokazało istniejącego okna');
    assert.equal(shows, 3);
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    console.log('PASS: cichy start, popup przy wejściu, krzyżyk do zasobnika, brak powtórek, następny draft, pojedyncza instancja i ponowne otwarcie ze skrótu.');
    server.close();
    app.quit();
  } catch (err) { console.error(err); server.close(); app.exit(1); }
});
}
