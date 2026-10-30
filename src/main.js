const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { findCredentials, LcuClient } = require('./lcu');
const { loadGameData, masteryMap, MASTERY_PATH } = require('./gamedata');
const engine = require('./engine');
const { OpggProvider, mergeStats } = require('./opgg');
const { LOADING_PHASES, readLoadingPlayers, playerCard } = require('./players');
const { lanePlan } = require('./laneplan');
const crypto = require('crypto');
const { initUpdates } = require('./updater');

protocol.registerSchemesAsPrivileged([{ scheme: 'lcuasset', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let win = null;
let lcu = null;
let game = null;
let lastSessionJson = '';
let lastState = null;
let polling = false;

// Dane użytkownika (champions.json w folderze aplikacji w AppData) mają pierwszeństwo przed wbudowanymi.
// Gdy aplikacja dostaje nowszą wersję danych, stary plik użytkownika trafia do kopii zapasowej.
function loadData() {
  const userFile = path.join(app.getPath('userData'), 'champions.json');
  const bundledFile = path.join(__dirname, '..', 'data', 'champions.json');
  const bundled = JSON.parse(fs.readFileSync(bundledFile, 'utf8'));
  let user = null;
  try { user = JSON.parse(fs.readFileSync(userFile, 'utf8')); } catch { /* brak pliku lub błąd składni */ }
  if (!user || (user.version || 1) < bundled.version) {
    try {
      if (fs.existsSync(userFile)) fs.copyFileSync(userFile, userFile.replace(/\.json$/, `.backup-v${(user && user.version) || 1}.json`));
      fs.copyFileSync(bundledFile, userFile);
      user = bundled;
    } catch { /* brak uprawnień, użyj wbudowanych */ }
  }
  if (!user) return { data: bundled, file: bundledFile };
  // Brakujące sekcje uzupełnij z wbudowanych danych.
  return { data: { ...bundled, ...user }, file: userFile };
}
let { data: baseData, file: dataFile } = { data: null, file: null };
// Dane efektywne = nasze dane + nakładka ze statystyk OP.GG.
let data = null;

// ---------- statystyki OP.GG ----------

const userFile = (name) => path.join(app.getPath('userData'), name);
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, value) => { try { fs.writeFileSync(file, JSON.stringify(value)); } catch { /* brak zapisu */ } };
const log = (line) => { try { fs.appendFileSync(userFile('log.txt'), `${new Date().toISOString()} ${line}\n`); } catch { /* brak zapisu */ } };

let settings = { stats: true };
let provider = null;
const stats = { meta: null, analyses: {} };
const queue = [];
let running = 0;
let refreshTimer = null;

function recomputeData() {
  data = settings.stats && game ? mergeStats(baseData, stats, game) : baseData;
}

// Po nadejściu nowych statystyk przelicz widok (z małym opóźnieniem, żeby nie migał przy serii odpowiedzi).
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { recomputeData(); lastSessionJson = ''; loadingDirty = true; }, 400);
}

function initStats() {
  settings = { ...settings, ...readJson(userFile('settings.json'), {}) };
  provider = new OpggProvider({
    endpoint: process.env.OPGG_ENDPOINT || undefined,
    cache: readJson(userFile('opgg-cache.json'), {}),
    saveCache: (cache) => writeJson(userFile('opgg-cache.json'), cache),
    log,
  });
}

function loadMeta() {
  if (!settings.stats || !game) return;
  provider.meta(game).then((meta) => {
    if (meta) { stats.meta = meta; scheduleRefresh(); }
  }).catch(() => {});
}

const attempted = new Map();

function requestAnalysis(alias, position) {
  if (!settings.stats || !alias || !game) return;
  const key = `${alias}:${position}`;
  if (stats.analyses[alias] && stats.analyses[alias]._key === key) return;
  if (queue.some((q) => q.key === key)) return;
  // Nieudane zapytanie ponawiaj najwcześniej po 5 minutach.
  if (Date.now() - (attempted.get(key) || 0) < 5 * 60 * 1000) return;
  attempted.set(key, Date.now());
  queue.push({ key, alias, position });
  pump();
}

function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift();
    running++;
    provider.analysis(job.alias, job.position, game).then((a) => {
      if (a) { stats.analyses[job.alias] = { ...a, _key: job.key }; scheduleRefresh(); }
    }).catch(() => {}).finally(() => { running--; pump(); });
  }
}

const roleOf = (alias) => ((data.champions[alias] || {}).roles || [])[0] || '';
const dataRole = (pos) => (pos === 'utility' ? 'support' : pos);

// Które analizy są potrzebne teraz: Twój champion, widoczni przeciwnicy, aktualne sugestie.
function requestNeeded(state, picks) {
  const aliasOf = (id) => game.championsById.get(id)?.alias;
  const myPos = dataRole(state.me ? state.me.position : '');
  if (state.me && state.me.championId) requestAnalysis(aliasOf(state.me.championId), myPos || roleOf(aliasOf(state.me.championId)));
  for (const e of state.enemies) if (e.championId) { const a = aliasOf(e.championId); requestAnalysis(a, roleOf(a)); }
  for (const s of picks.list) requestAnalysis(s.alias, myPos || roleOf(s.alias));
}

function send(state) {
  lastState = state;
  if (win && !win.isDestroyed()) win.webContents.send('state', state);
}

function champView(id) {
  const c = game && game.championsById.get(id);
  return c ? { id, alias: c.alias, name: c.name, icon: `lcuasset://lcu/lol-game-data/assets/v1/champion-icons/${id}.png` } : null;
}

async function tick() {
  if (polling) return;
  polling = true;
  try {
    if (!lcu) {
      const creds = await findCredentials();
      if (!creds) return send({ status: 'no-client' });
      lcu = new LcuClient(creds);
      game = null;
    }
    const phase = await lcu.get('/lol-gameflow/v1/gameflow-phase').catch(() => undefined);
    if (phase === undefined) { lcu = null; return send({ status: 'no-client' }); }
    if (!game) {
      game = await loadGameData(lcu).catch(() => null);
      if (!game) return send({ status: 'loading' });
      recomputeData();
      loadMeta();
    }
    if (LOADING_PHASES.includes(phase)) {
      lastSessionJson = '';
      if (!loading) {
        const players = await readLoadingPlayers(lcu).catch(() => null);
        if (!players) return send({ status: 'idle', phase });
        loading = { ...players, summaries: {} };
        fetchPlayerStats(loading);
        loadingDirty = true;
      }
      if (loadingDirty) { loadingDirty = false; send(buildLoadingView()); }
      return;
    }
    loading = null;
    if (phase !== 'ChampSelect') {
      lastSessionJson = '';
      return send({ status: 'idle', phase });
    }
    const session = await lcu.get('/lol-champ-select/v1/session');
    if (!session) return;
    const json = JSON.stringify([session.myTeam, session.theirTeam, session.actions, session.bans, session.timer && session.timer.phase]);
    if (json === lastSessionJson) return;
    if (!lastSessionJson) {
      // Nowy champ select: odśwież listę posiadanych championów.
      const owned = await lcu.get('/lol-champions/v1/owned-champions-minimal');
      if (owned) game.owned = new Set(owned.filter((c) => c.id > 0).map((c) => c.id));
      const mastery = await lcu.get(MASTERY_PATH);
      if (mastery) game.mastery = masteryMap(mastery);
    }
    lastSessionJson = json;
    send(buildView(session));
  } catch (err) {
    send({ status: 'error', message: String(err && err.message || err) });
    lcu = null;
  } finally {
    polling = false;
  }
}

// ---------- ekran ładowania ----------

let loading = null;
let loadingDirty = false;
const playerKey = (p) => `${p.gameName}#${p.tagLine}`;

function fetchPlayerStats(target) {
  if (!settings.stats) return;
  const players = [...target.allies, ...target.enemies].filter((p) => p.gameName && p.tagLine);
  let next = 0;
  const worker = async () => {
    while (next < players.length) {
      const p = players[next++];
      const summary = await provider.summoner({ gameName: p.gameName, tagLine: p.tagLine, region: target.region }).catch(() => null);
      target.summaries[playerKey(p)] = summary || false;
      if (target === loading) loadingDirty = true;
    }
  };
  for (let i = 0; i < 3; i++) worker();
}

function buildLoadingView() {
  const cardOf = (p) => playerCard(p, loading.summaries[playerKey(p)] || null, game);
  const card = (p) => ({
    ...cardOf(p),
    championView: champView(p.championId),
    pending: settings.stats && loading.summaries[playerKey(p)] === undefined && !!p.gameName,
  });
  const me = loading.allies.find((p) => p.isMe);
  let plan = null;
  try { plan = lanePlan(me, loading.enemies, cardOf, game, data); } catch (err) { log(`plan linii: ${err.message}`); }
  if (plan) {
    // Winrate matchupu z OP.GG: analiza Twojego championa (z pamięci podręcznej lub nowe zapytanie).
    requestAnalysis(game.championsById.get(me.championId)?.alias, plan.role);
    plan.me.icon = champView(plan.me.championId).icon;
    plan.opponent.icon = champView(plan.opponent.championId).icon;
  }
  const enemies = loading.enemies.map(card);
  if (plan && enemies[plan.opponentIndex]) enemies[plan.opponentIndex].laneOpponent = true;
  return {
    status: 'loading-screen',
    region: loading.region,
    plan,
    allies: loading.allies.map(card),
    enemies,
    statsEnabled: settings.stats,
    statsStatus: settings.stats ? provider.status : { ok: false, message: 'OP.GG wyłączone' },
  };
}

let lastSelectState = null;

function buildView(session) {
  const state = engine.readSession(session);
  lastSelectState = state;
  const me = state.me;
  const myAlias = me && me.championId ? game.championsById.get(me.championId)?.alias : null;
  const picks = engine.suggestPicks(state, game, data);
  requestNeeded(state, picks);
  const view = {
    status: 'champselect',
    phase: state.phase,
    allLocked: state.allLocked,
    myPosition: me ? me.position : '',
    positionLabel: engine.POSITION_LABELS[me ? me.position : ''] || '',
    allies: state.allies.map((a) => ({
      champion: champView(a.championId), locked: a.locked, isMe: a.isMe,
      position: engine.POSITION_LABELS[a.position] || '',
    })),
    enemies: state.enemies.map((e) => ({ champion: champView(e.championId), locked: e.locked })),
    enemyProfile: engine.enemyProfile(state, game, data),
    suggestions: picks.list.map((s) => ({ ...s, icon: champView(s.championId).icon })),
    blind: picks.blind,
    laneOpponent: picks.laneOpponent,
    banPhase: state.banPhase,
    myBanTurn: state.myBanTurn,
    bans: state.banPhase ? engine.suggestBans(state, game, data).map((b) => ({ ...b, icon: champView(b.championId).icon })) : [],
    compositions: engine.compositions(state, game, data),
    metaSource: (data.meta && data.meta.source) || '',
    statsStatus: settings.stats ? provider.status : { ok: false, message: 'OP.GG wyłączone' },
    statsEnabled: settings.stats,
    myChampion: null,
    build: null,
    dataFile,
  };
  if (myAlias) {
    view.myChampion = { ...champView(me.championId), locked: me.locked, runes: engine.runePageFor(myAlias, game, data, state) };
    if (state.allLocked) view.build = engine.buildFor(myAlias, state, game, data);
  }
  view._state = { me: me && { spell1Id: me.spell1Id, spell2Id: me.spell2Id } };
  return view;
}

// ---------- akcje wywoływane z interfejsu (tylko na kliknięcie użytkownika) ----------

const RUNE_PREFIX = 'CS Assist';

async function importRunes(alias) {
  if (!lcu || !game) throw new Error('Brak połączenia z klientem');
  const page = engine.runePageFor(alias, game, data, lastSelectState);
  const body = { name: page.name, primaryStyleId: page.primaryStyleId, subStyleId: page.subStyleId, selectedPerkIds: page.selectedPerkIds, current: true };
  const pages = (await lcu.get('/lol-perks/v1/pages')) || [];
  const own = pages.find((p) => p.isDeletable && String(p.name).startsWith(RUNE_PREFIX));
  if (own) await lcu.request('DELETE', `/lol-perks/v1/pages/${own.id}`);
  let res = await lcu.request('POST', '/lol-perks/v1/pages', body);
  if (!res.ok) {
    // Brak wolnego miejsca: nadpisz aktualnie wybraną edytowalną stronę.
    const current = await lcu.get('/lol-perks/v1/currentpage');
    if (current && current.isDeletable) {
      await lcu.request('DELETE', `/lol-perks/v1/pages/${current.id}`);
      res = await lcu.request('POST', '/lol-perks/v1/pages', body);
    }
  }
  if (!res.ok) throw new Error((res.data && res.data.message) || `Klient odrzucił runy (${res.status})`);
  return { ok: true, name: page.name };
}

async function setSpells(alias) {
  if (!lcu || !game || !lastState || lastState.status !== 'champselect') throw new Error('Brak aktywnego wyboru postaci');
  const { ids } = engine.spellsFor(alias, lastSelectState, game, data);
  const body = engine.orderSpells(ids, lastState._state.me);
  const res = await lcu.request('PATCH', '/lol-champ-select/v1/session/my-selection', body);
  if (!res.ok) throw new Error(`Klient odrzucił czary (${res.status})`);
  return { ok: true };
}

// Zestaw przedmiotów w sklepie: zastępuje poprzedni zestaw tej aplikacji, pozostałe zestawy gracza zostają.
async function exportItemSet(alias) {
  if (!lcu || !game || !lastSelectState) throw new Error('Brak aktywnego wyboru postaci');
  const build = engine.buildFor(alias, lastSelectState, game, data);
  const set = engine.itemSetFor(build, alias, lastSelectState, game, data);
  const me = await lcu.get('/lol-summoner/v1/current-summoner');
  if (!me || !me.summonerId) throw new Error('Nie udało się odczytać konta z klienta');
  const url = `/lol-item-sets/v1/item-sets/${me.summonerId}/sets`;
  const current = (await lcu.get(url)) || {};
  const others = (current.itemSets || []).filter((s) => !String(s.title || '').startsWith(RUNE_PREFIX));
  const body = { ...current, accountId: current.accountId || me.accountId, timestamp: Date.now(), itemSets: [...others, { ...set, uid: crypto.randomUUID() }] };
  const res = await lcu.request('PUT', url, body);
  if (!res.ok) throw new Error((res.data && res.data.message) || `Klient odrzucił zestaw przedmiotów (${res.status})`);
  return { ok: true, name: set.title };
}

const wrap = (fn) => async (_e, ...args) => {
  try { return await fn(...args); } catch (err) { return { ok: false, error: String(err.message || err) }; }
};
ipcMain.handle('import-runes', wrap(importRunes));
ipcMain.handle('set-spells', wrap(setSpells));
ipcMain.handle('export-item-set', wrap(exportItemSet));
ipcMain.handle('get-state', () => lastState);

// ---------- aktualizacje ----------

let updates = null;
let update = null;
ipcMain.handle('get-update', () => update);
ipcMain.handle('update-action', () => {
  if (!updates || !update) return { ok: false };
  if (update.state === 'ready') updates.install();
  else updates.openPage();
  return { ok: true };
});
ipcMain.handle('open-data-file', () => require('electron').shell.showItemInFolder(dataFile));
ipcMain.handle('reload-data', wrap(async () => {
  ({ data: baseData, file: dataFile } = loadData());
  recomputeData();
  lastSessionJson = '';
  return { ok: true };
}));

ipcMain.handle('toggle-stats', wrap(async () => {
  settings.stats = !settings.stats;
  writeJson(userFile('settings.json'), settings);
  recomputeData();
  if (settings.stats) loadMeta();
  lastSessionJson = '';
  return { ok: true, enabled: settings.stats };
}));
ipcMain.handle('stats-diagnostics', wrap(async () => {
  // Twoje konto jako przykładowy gracz: plik pokaże też odpowiedzi narzędzi profilu i historii gier.
  let player = null;
  if (lcu) {
    const me = await lcu.get('/lol-summoner/v1/current-summoner').catch(() => null);
    const locale = await lcu.get('/riotclient/region-locale').catch(() => null);
    const region = String((locale && (locale.webRegion || locale.region)) || '').toUpperCase();
    if (me && me.gameName && me.tagLine) player = { gameName: me.gameName, tagLine: me.tagLine, region };
  }
  const report = await provider.diagnostics(game || require('./gamedata').emptyGameData(), undefined, undefined, player);
  const file = path.join(app.getPath('documents'), 'champ-select-diagnostyka-opgg.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  require('electron').shell.showItemInFolder(file);
  return { ok: !report.error, file, error: report.error };
}));

app.whenReady().then(() => {
  ({ data: baseData, file: dataFile } = loadData());
  data = baseData;
  initStats();
  // Ikony z klienta (wymagają autoryzacji, więc pobiera je proces główny).
  protocol.handle('lcuasset', async (request) => {
    const url = new URL(request.url);
    if (!lcu) return new Response(null, { status: 503 });
    try {
      const res = await lcu.raw('GET', url.pathname);
      return new Response(res.body, { status: res.status, headers: { 'Content-Type': res.headers['content-type'] || 'image/png', 'Cache-Control': 'max-age=86400' } });
    } catch {
      return new Response(null, { status: 502 });
    }
  });

  win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 820, minHeight: 600,
    backgroundColor: '#0e1116',
    title: 'Champ Select Assistant',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  updates = initUpdates((u) => {
    update = u;
    if (win && !win.isDestroyed()) win.webContents.send('update', u);
  }, log);
  tick();
  setInterval(tick, 1000);
});

app.on('window-all-closed', () => app.quit());
