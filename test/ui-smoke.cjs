// Integracyjny test prawdziwego renderera Electron. Wyłącznie dane symulowane;
// osobny katalog profilu, ukryte okno i brak połączenia z klientem gracza.
const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.UI_OUTPUT || path.join(root, '../ui-preview'));
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(out, 'profile'));
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{ scheme: 'lcuasset', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const engine = require('../src/engine');
const data = require('../data/champions.json');
const { lanePlan } = require('../src/laneplan');
const { gamePlan } = require('../src/gameplan');
const { loadGameData } = require('../src/gamedata');
const { LcuClient } = require('../src/lcu');
let server;
app.whenReady().then(async () => {
  process.env.PORT = '0';
  server = require('../mock/mock-lcu');
  await new Promise((r) => server.listening ? r() : server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const game = await loadGameData(new LcuClient({ protocol: 'http', host: '127.0.0.1', port: server.address().port, password: 'x' }));
  protocol.handle('lcuasset', async (request) => {
    const url = new URL(request.url);
    const response = await fetch(base + url.pathname);
    return new Response(await response.arrayBuffer(), { headers: { 'Content-Type': response.headers.get('content-type') || 'image/svg+xml' } });
  });
  const id = (a) => game.championsByAlias.get(a).id;
  const view = (a) => ({ id: id(a), name: a, alias: a, icon: `lcuasset://lcu/lol-game-data/assets/v1/champion-icons/${id(a)}.png` });
  const player = (a, position, isMe = false) => ({ championId: id(a), position, gameName: `Gracz ${a}`, tagLine: 'TEST', isMe, locked: true });
  const allies = [player('Fiora', 'top'), player('LeeSin', 'jungle'), player('Ahri', 'middle'), player('Jinx', 'bottom'), player('Leona', 'utility', true)];
  const enemies = [player('Ornn', 'top'), player('Zed', 'jungle'), player('Yasuo', 'middle'), player('Jhin', 'bottom'), player('Soraka', 'utility')];
  const s = { me: allies[4], allies, enemies, bans: new Set(), mode: 'classic' };
  const build = engine.buildFor('Leona', s, game, data);
  const myChampion = { ...view('Leona'), locked: true, runes: engine.runePageFor('Leona', game, data, s) };
  const card = (p) => ({
    name: `${p.gameName}#TEST`, loaded: true, isMe: p.isMe, tags: [{ text: 'Mała próba danych o championie', kind: 'info' }],
    rank: { tier: 'EMERALD', label: 'Emerald III', lp: 50, winRate: 51, games: 200 },
    champion: { seasonGames: 16, seasonWinRate: 69 }, recent: { last30Days: 20, last30More: true, last30WinRate: 55 },
    championView: view(game.championsById.get(p.championId).alias), seasonChamps: [], recent30Champs: [],
  });
  const plan = lanePlan(s.me, enemies, card, game, data);
  plan.me.icon = view('Leona').icon; plan.opponent.icon = view('Soraka').icon;
  let fixture = { status: 'loading-screen', mode: 'classic', region: 'TEST', final: { build, myChampion }, plan, gamePlan: gamePlan(allies, enemies, card, game, data), allies: allies.map(card), enemies: enemies.map(card), statsStatus: { ok: true, message: 'Podgląd na danych symulowanych' } };
  ipcMain.handle('get-state', () => fixture);
  ipcMain.handle('app-version', () => require('../package.json').version);
  ipcMain.handle('get-update', () => null);
  const lab = require('../src/draftlab');
  ipcMain.handle('draft-catalog', () => ({ok:true,...lab.catalog(game,data)}));
  let delayNextPreview = 0;
  ipcMain.handle('preview-draft', async (_event,input) => {
    const delay = delayNextPreview; delayNextPreview = 0;
    if (delay) await new Promise(r => setTimeout(r, delay));
    try { return {ok:true,...lab.preview(input,game,data)}; } catch(e) { return {ok:false,error:e.message}; }
  });
  const win = new BrowserWindow({ width: 1100, height: 720, useContentSize: true, show: false, webPreferences: { preload: path.join(root, 'src/preload.js'), contextIsolation: true, nodeIntegration: false } });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  await win.loadFile(path.join(root, 'src/renderer/index.html'));
  const evaluate = (js) => win.webContents.executeJavaScript(js);
  const settled = () => evaluate(`(async () => {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
    await Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.addEventListener('load', r, {once:true}); i.addEventListener('error', r, {once:true}); })));
    await new Promise(r => requestAnimationFrame(r));
  })()`);
  await settled();
  const reports = [];
  for (const [width, height] of [[1100, 720], [820, 600]]) {
    win.setContentSize(width, height); await settled();
    const metrics = await evaluate(`({ width: innerWidth, height: innerHeight, scroll: document.documentElement.scrollWidth, build: document.querySelector('.build-primary').getBoundingClientRect().bottom, advice: document.querySelector('.priority-advice').getBoundingClientRect().bottom, items: document.querySelectorAll('.inventory-items > .item').length, quest: document.querySelectorAll('.quest-slot .item').length })`);
    assert.ok(metrics.scroll <= metrics.width, JSON.stringify(metrics));
    assert.ok(metrics.build < metrics.height && metrics.advice < metrics.height, `Najważniejsze decyzje poza ekranem: ${JSON.stringify(metrics)}`);
    assert.equal(metrics.items, 6);
    assert.equal(metrics.quest, 1);
    reports.push(metrics);
    fs.writeFileSync(path.join(out, `overview-${width}.png`), (await win.webContents.capturePage()).toPNG());
  }
  win.setContentSize(1100, 720); await settled();
  await evaluate(`document.querySelector('[data-loading-tab="build"]').click()`); await settled();
  assert.ok(await evaluate(`document.querySelector('[data-loading-tab="build"]').classList.contains('on')`));
  assert.ok(await evaluate(`document.body.innerText.includes('Odłamki:')`));
  assert.ok(await evaluate(`[...document.images].every(i => i.complete && i.naturalWidth > 0)`), 'ikony renderują się po zmianie zakładki');
  fs.writeFileSync(path.join(out, 'runes.png'), (await win.webContents.capturePage()).toPNG());
  await evaluate(`document.querySelector('[data-loading-tab="players"]').click()`); await settled();
  assert.equal(await evaluate(`document.querySelectorAll('.pcard').length`), 10);
  assert.equal(await evaluate(`document.querySelectorAll('.stat-v.good').length`), 10, '69% z 16 gier ma neutralny kolor; dobre tylko 30 dni');
  fs.writeFileSync(path.join(out, 'players.png'), (await win.webContents.capturePage()).toPNG());
  await evaluate(`document.querySelector('[data-loading-tab="overview"]').click(); document.querySelector('[data-detail="team-advice"]').open = true`); await settled();
  fixture = { ...fixture, region: 'TEST2' }; win.webContents.send('state', fixture); await settled();
  assert.ok(await evaluate(`document.querySelector('[data-detail="team-advice"]').open`), 'rozwinięcie zachowane po aktualizacji');
  // Bot musi zmieścić wszystkie 6 zakupów i buty obok, również w małym oknie.
  const botState = { ...s, me: player('Jinx', 'bottom', true) };
  const botBuild = engine.buildFor('Jinx', botState, game, data);
  fixture = { ...fixture, final: { build: botBuild, myChampion: { ...view('Jinx'), runes: engine.runePageFor('Jinx', game, data, botState) } } };
  await evaluate(`document.querySelector('[data-detail="team-advice"]').open = false`);
  win.webContents.send('state', fixture); await settled();
  for (const [width, height] of [[1100, 720], [820, 600]]) {
    win.setContentSize(width, height); await settled();
    const metrics = await evaluate(`({ role: 'bottom', width: innerWidth, height: innerHeight, scroll: document.documentElement.scrollWidth,
      build: document.querySelector('.build-primary').getBoundingClientRect().bottom, advice: document.querySelector('.priority-advice').getBoundingClientRect().bottom,
      items: document.querySelectorAll('.inventory-items > .item').length, quest: document.querySelectorAll('.quest-slot .item').length,
      sideX: document.querySelector('.quest-slot').getBoundingClientRect().left, mainRight: document.querySelector('.inventory-items').getBoundingClientRect().right })`);
    assert.equal(metrics.items, 6); assert.equal(metrics.quest, 1);
    assert.ok(metrics.sideX >= metrics.mainRight, 'Buty powinny być z boku ekwipunku');
    assert.ok(metrics.scroll <= width && metrics.advice < height && metrics.build < height, JSON.stringify(metrics));
    assert.ok(await evaluate(`document.querySelector('.build-context').innerText.includes('Po queście bota')`));
    reports.push(metrics);
    fs.writeFileSync(path.join(out, `bot-quest-${width}.png`), (await win.webContents.capturePage()).toPNG());
  }
  const waitUi = async (js) => {
    const end=Date.now()+6000;
    while(Date.now()<end) { if(await evaluate(js))return;await new Promise(r=>setTimeout(r,100)); }
    throw new Error(`UI condition failed: ${js}`);
  };
  await evaluate(`document.getElementById('draft-lab').click()`);
  await waitUi(`!!document.querySelector('#lab-results .build-panel')`);
  await evaluate(`document.querySelector('[data-lab-preset="crit"]').click()`);
  await waitUi(`labView?.build.alias === 'Ornn'`);
  assert.ok(await evaluate(`labView.build.items.some(i=>i.id===3143)`));
  await evaluate(`document.querySelector('.inventory-items [data-pin-item]').click()`);
  await waitUi(`labView.build.items[0].pinned`);
  const pinnedId=await evaluate('labView.build.items[0].id');
  await evaluate(`{const select=document.querySelector('[data-lab-team="enemies"]'); select.value='Rumble';select.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await waitUi(`labInput.enemies[0] === 'Rumble' && labView.build.items[0].pinned`);
  assert.equal(await evaluate('labView.build.items[0].id'),pinnedId);
  await evaluate(`document.querySelector('[data-detail="build-details"]').open=true;document.querySelector('[data-edit-items]').click()`);
  await waitUi(`document.getElementById('choices-dialog')?.open`);
  await evaluate(`document.querySelector('[name="slot-1"]').value='${pinnedId}';document.querySelector('#choices-form').requestSubmit()`);
  await waitUi(`!!document.querySelector('#choices-dialog .form-error').textContent`);
  assert.ok(await evaluate(`document.getElementById('choices-dialog').open`),'Błędny zestaw powinien zostawić otwarty edytor');
  await evaluate(`document.querySelector('[name="slot-1"]').value='0';document.querySelector('#choices-form').requestSubmit()`);
  await waitUi(`!document.getElementById('choices-dialog').open`);
  await evaluate(`document.querySelector('[data-detail="lab-runes"]').open=true;document.querySelector('[data-choice="runes"]').click()`);
  await waitUi(`labView.myChampion.runes.pinned`);
  assert.equal(await evaluate(`document.querySelectorAll('#lab-results [data-runes], #lab-results [data-itemset], #lab-results [data-spells]').length`),0,'Symulacja nie udostępnia importów do gry');
  win.setContentSize(1100,720); await settled();
  fs.writeFileSync(path.join(out,'draft-lab.png'),(await win.webContents.capturePage()).toPNG());
  // Spóźniona odpowiedź przypięcia nie może przywrócić poprzedniego draftu.
  delayNextPreview = 400;
  await evaluate(`document.querySelector('.inventory-items [data-pin-item]').click()`);
  await evaluate(`document.querySelector('[data-lab-preset="tanks"]').click()`);
  await waitUi(`labView?.build.alias === 'Jinx'`);
  await new Promise(r => setTimeout(r, 500));
  assert.equal(await evaluate('labView.build.alias'), 'Jinx');
  assert.equal(await evaluate('labView.build.items.some(i => i.pinned)'), false);
  await evaluate(`document.getElementById('draft-lab').click()`);
  assert.equal(await evaluate('labActive'),false);
  assert.ok(await evaluate(`!!document.querySelector('.loading-screen')`));
  assert.equal(errors.length, 0, errors.join('\n'));
  fs.writeFileSync(path.join(out, 'ui-report.json'), JSON.stringify({ ok: true, reports, errors }, null, 2));
  console.log(JSON.stringify({ ok: true, reports }));
  win.destroy(); server.close(); app.quit();
}).catch((error) => { console.error(error); server?.close(); app.exit(1); });
