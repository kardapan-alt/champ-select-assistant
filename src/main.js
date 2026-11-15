const { app, BrowserWindow, ipcMain, protocol, Tray, Menu, nativeImage, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { findCredentials, LcuClient } = require('./lcu');
const { loadGameData, loadMastery } = require('./gamedata');
const engine = require('./engine');
const { OpggProvider, mergeStats } = require('./opgg');
const { LOADING_PHASES, readLoadingPlayers, playerCard } = require('./players');
const { lanePlan } = require('./laneplan');
const { gamePlan } = require('./gameplan');
const crypto = require('crypto');
const { initUpdates } = require('./updater');
const { createDesktop, DEFAULT_SHORTCUT } = require('./desktop');
const { roleQuestsEnabled } = require('./rolequests');
const { ChoiceStore, choiceKey, savedRunes, runeSignature, validateChoices, validateRunes, serialQueue } = require('./choices');
const draftlab = require('./draftlab');
const mayhem = require('./mayhem');
const { LiveClient, componentCredit } = require('./liveclient');
const liveClient = new LiveClient();
const { isAram, modeFromFlow } = require('./modes');
const offlineGame = require('./gamedata').buildGameData(require('../data/catalog.json'));
const choiceWrites = serialQueue();
let choicesStore;
let mayhemSession;
const withChoices = (alias, state) => ({ ...state, choices: choicesStore?.get(alias, state) || {} });
const buildFor = (alias, state) => ({ ...engine.buildFor(alias, withChoices(alias, state), game, data), scope: choiceKey(alias, state) });
const runesFor = (alias, state = lastSelectState) => engine.runePageFor(alias, game, data, withChoices(alias, state));

const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();

protocol.registerSchemesAsPrivileged([{ scheme: 'lcuasset', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let win = null;
let desktop = null;
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

let settings = { stats: true, autoRunes: true, autoItemSet: true, autoPopup: true, launchAtLogin: false, keyboardShortcut: DEFAULT_SHORTCUT };
// Tryb gry z /lol-gameflow/v1/session: 'aram' (Howling Abyss) albo 'classic'.
let currentMode = 'classic';
let currentMayhemPool = 'KIWI';
let currentRoleQuests = false;
async function detectMode() {
  const flow = await lcu.get('/lol-gameflow/v1/session').catch(() => null);
  const gameMode = String((flow && flow.gameData && flow.gameData.queue && flow.gameData.queue.gameMode) || '').toUpperCase();
  currentMode = modeFromFlow(flow);
  currentMayhemPool = gameMode === 'KIWI_JADE' ? 'KIWI_JADE' : 'KIWI';
  currentRoleQuests = roleQuestsEnabled(flow);
  recomputeData();
  return currentMode;
}
let provider = null;
const stats = { meta: null, analyses: {} };
const queue = [];
let running = 0;
let refreshTimer = null;

function recomputeData() {
  data = currentMode !== 'mayhem' && settings.stats && game ? mergeStats(baseData, stats, game) : baseData;
}

// Po nadejściu nowych statystyk przelicz widok (z małym opóźnieniem, żeby nie migał przy serii odpowiedzi).
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { recomputeData(); lastSessionJson = ''; loadingDirty = true; }, 400);
}

function initStats() {
  choicesStore = new ChoiceStore(readJson(userFile('choices.json'), {}), value => {
    const file = userFile('choices.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(value));
    fs.renameSync(file + '.tmp', file);
  });
  mayhemSession = new mayhem.MayhemSession(readJson(userFile('mayhem-session.json'), null), value => {
    const file = userFile('mayhem-session.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(value)); fs.renameSync(file + '.tmp', file);
  });
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

function requestAnalysis(alias, position, mode = currentMode, replace = true) {
  if (mode === 'mayhem') return;
  // OP.GG wymaga pozycji; bez niej (champion spoza danych, zanim wczyta się meta) spróbujemy przy następnym odświeżeniu.
  // Na ARAM-ie pozycja nic nie zmienia, ale pole jest wymagane, więc wystarczy dowolna.
  if (mode === 'aram') position = position || 'middle';
  if (!settings.stats || !alias || !game || !position) return;
  const key = `${alias}:${position}:${mode}`;
  if (stats.analyses[alias] && stats.analyses[alias]._key === key) return;
  // Analiza dla innej roli lub trybu (np. Cho'Gath z topa, gdy grasz nim w jungli) nie może dawać run i czarów:
  // usuwamy ją od razu, do czasu nowej obowiązują własne dane.
  if (stats.analyses[alias] && replace) { delete stats.analyses[alias]; scheduleRefresh(); }
  if (queue.some((q) => q.key === key)) return;
  // Nieudane zapytanie ponawiaj najwcześniej po 5 minutach.
  if (Date.now() - (attempted.get(key) || 0) < 5 * 60 * 1000) return;
  attempted.set(key, Date.now());
  queue.push({ key, alias, position, mode });
  pump();
}

function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift();
    running++;
    provider.analysis(job.alias, job.position, game, job.mode).then((a) => {
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
  // Twój champion i sugestie mają pierwszeństwo: przeciwnik tym samym championem nie podmienia ich analizy.
  const mine = new Set();
  if (state.me && state.me.championId) { const a = aliasOf(state.me.championId); mine.add(a); requestAnalysis(a, myPos || roleOf(a)); }
  for (const s of [...picks.list, ...(picks.masteryList || [])]) { mine.add(s.alias); requestAnalysis(s.alias, myPos || roleOf(s.alias)); }
  for (const e of state.enemies) if (e.championId) { const a = aliasOf(e.championId); requestAnalysis(a, roleOf(a), currentMode, !mine.has(a)); }
  for (const id of state.bench || []) requestAnalysis(aliasOf(id), roleOf(aliasOf(id)));
}

function send(state) {
  lastState = state;
  if (win && !win.isDestroyed()) win.webContents.send('state', state);
}

// Obrazek championa: kafelek z aktualnej grafiki skina (wybranego albo podstawowego) zamiast starych kwadratowych ikon.
// Gdy klient nie ma kafelka, protokół lcuasset podaje zwykłą ikonę.
const champJson = new Map();
let tileFailLogged = false;
async function tilePathFor(championId, skinId) {
  if (!champJson.has(championId)) champJson.set(championId, lcu.get(`/lol-game-data/assets/v1/champions/${championId}.json`).catch(() => null));
  const c = await champJson.get(championId);
  // Nieudane pobranie (np. klient jeszcze się ładuje) nie może na stałe zostawić starej ikony.
  if (!c) champJson.delete(championId);
  const skins = (c && c.skins) || [];
  const skin = skins.find((x) => x.id === skinId)
    || skins.find((x) => (x.chromas || []).some((ch) => ch.id === skinId))
    || skins.find((x) => x.isBase) || skins[0];
  return skin ? skin.tilePath || skin.loadScreenPath || '' : '';
}

function champView(id, skinId = 0) {
  const c = game && game.championsById.get(id);
  if (!c) return null;
  const skin = skinId > 0 && Math.floor(skinId / 1000) === id ? skinId : id * 1000;
  const icon = `lcuasset://lcu/lol-game-data/assets/v1/champion-tiles/${id}/${skin}.jpg`;
  return { id, alias: c.alias, name: c.name, icon };
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
    // Przejścia faz są niezależne od odświeżania statystyk i zawartości draftu.
    desktop?.observePhase(phase);
    if (!game) {
      game = await loadGameData(lcu).catch(() => null);
      if (!game) return send({ status: 'loading' });
      recomputeData();
      loadMeta();
    }
    if (LOADING_PHASES.includes(phase)) {
      lastSessionJson = '';
      if (!loading) {
        await detectMode();
        const players = await readLoadingPlayers(lcu).catch(() => null);
        if (!players) return send({ status: 'idle', phase });
        loading = { ...players, summaries: {} };
        fetchPlayerStats(loading);
        loadingDirty = true;
        autoExportItemSetForLoading();
      }
      if (currentMode === 'mayhem' && phase === 'InProgress') await syncLiveInventory();
      if (!loading) return;
      if (loadingDirty) { loadingDirty = false; send(buildLoadingView()); }
      return;
    }
    loading = null;
    if (phase !== 'ChampSelect') {
      lastSessionJson = '';
      lastImportedRunes = null; lastObservedRunes = null;
      autoRunes = { key: '', done: '', error: '' };
      autoItemSet = { key: '', done: '', error: '' };
      return send({ status: 'idle', phase });
    }
    const session = await lcu.get('/lol-champ-select/v1/session');
    if (!session) return;
    if (!lastSessionJson) { await detectMode(); recomputeData(); }
    await choiceWrites(() => preserveManualRunes(engine.readSession(session, currentMode, { roleQuestsEnabled: currentRoleQuests })));
    // Bany i dostępność z osobnych list klienta: akcje w sesji nie zawsze pokazują ban od razu.
    const [pickable, disabled] = await Promise.all([
      lcu.get('/lol-champ-select/v1/pickable-champion-ids').catch(() => null),
      lcu.get('/lol-champ-select/v1/disabled-champion-ids').catch(() => null),
    ]);
    session.extra = { pickable: Array.isArray(pickable) ? pickable : [], disabled: Array.isArray(disabled) ? disabled : [] };
    const json = JSON.stringify([session.myTeam, session.theirTeam, session.actions, session.bans, session.timer && session.timer.phase, session.benchChampions, session.extra]);
    if (json === lastSessionJson) return;
    if (!lastSessionJson) {
      // Nowy champ select: odśwież listę posiadanych championów.
      const owned = await lcu.get('/lol-champions/v1/owned-champions-minimal');
      if (owned) game.owned = new Set(owned.filter((c) => c.id > 0).map((c) => c.id));
      const mastery = await loadMastery(lcu);
      if (mastery.map.size) game.mastery = mastery.map;
    }
    lastSessionJson = json;
    send(buildView(session));
    autoImportRunes();
    autoExportItemSet();
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

async function syncLiveInventory() {
  const target = loading, me = target.allies.find(p=>p.isMe), state = loadingSelectState(me);
  if (!state || Date.now() < (target.nextLivePoll || 0)) return;
  target.nextLivePoll = Date.now()+2000;
  const alias = game.championsById.get(me.championId)?.alias;
  let result;
  try { result = await liveClient.inventory(me,alias,state.mayhemPool,game); }
  catch { result = { status:'waiting' }; }
  // Żądanie może skończyć się już po zamknięciu meczu. Nigdy nie przenosimy
  // ekwipunku do kolejnego meczu ani do testera draftów.
  const [phase, flow] = await Promise.all([
    lcu.get('/lol-gameflow/v1/gameflow-phase').catch(()=>null), lcu.get('/lol-gameflow/v1/session').catch(()=>null),
  ]);
  if (loading !== target || phase !== 'InProgress' || mayhemSession.value?.key !== state.mayhemKey) return;
  if (!flow?.gameData) return;
  if (target.gameId && String(flow.gameData.gameId) !== String(target.gameId)) { loading=null; return; }
  await choiceWrites(async () => {
    if (loading !== target || mayhemSession.value?.key !== state.mayhemKey) return;
    const status = result.status === 'live' ? 'live' : mayhemSession.value.inventory ? 'stale' : 'waiting';
    if (target.liveStatus !== status) { target.liveStatus=status; loadingDirty=true; }
    if (result.inventory && mayhemSession.setInventory(state.mayhemKey,result.inventory)) loadingDirty=true;
  });
}

function fetchPlayerStats(target) {
  if (!settings.stats || isAram(currentMode)) return;
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
    championView: champView(p.championId, p.skinId),
    pending: settings.stats && loading.summaries[playerKey(p)] === undefined && !!p.gameName,
  });
  const me = loading.allies.find((p) => p.isMe);
  const aram = isAram(currentMode);
  let plan = null;
  if (!aram) try { plan = lanePlan(me, loading.enemies, cardOf, game, data); } catch (err) { log(`plan linii: ${err.message}`); }
  if (plan) {
    // Winrate matchupu z OP.GG: analiza Twojego championa (z pamięci podręcznej lub nowe zapytanie).
    requestAnalysis(game.championsById.get(me.championId)?.alias, plan.role);
    plan.me.icon = champView(plan.me.championId).icon;
    plan.opponent.icon = champView(plan.opponent.championId).icon;
  }
  let teamPlan = null;
  if (currentMode !== 'mayhem') try { teamPlan = gamePlan(loading.allies, loading.enemies, aram ? null : cardOf, game, data, currentMode); } catch (err) { log(`plan gry: ${err.message}`); }
  const enemies = loading.enemies.map(card);
  if (plan && enemies[plan.opponentIndex]) enemies[plan.opponentIndex].laneOpponent = true;
  return {
    status: 'loading-screen',
    region: loading.region,
    plan,
    gamePlan: teamPlan,
    mode: currentMode,
    final: finalWithEnemies(me),
    allies: loading.allies.map(card),
    enemies,
    statsEnabled: settings.stats,
    statsStatus: aram ? { ok:true, message:currentMode === 'mayhem' ? 'Mayhem · build pod augmenty i ekwipunek' : 'ARAM · bez statystyk soloQ' } : settings.stats ? provider.status : { ok: false, message: 'OP.GG wyłączone' },
  };
}

let lastSelectState = null;
let lastFinal = null;

// Build z champ selecta przeliczony na ekranie ładowania, gdy znamy już wszystkich przeciwników
// (na ARAM-ie w wyborze postaci nie widać wroga).
function loadingSelectState(me) {
  const s = lastSelectState;
  if (!me?.championId) return null;
  const base = s?.me?.championId === me.championId ? s : { me, allies:loading.allies, bans:new Set(), allLocked:true };
  const alias = game.championsById.get(me.championId)?.alias;
  if (!loading.sessionId) loading.sessionId = crypto.randomUUID();
  const session = currentMode === 'mayhem' && alias ? mayhemSession.ensure(loading.gameId || loading.sessionId, alias, currentMayhemPool) : null;
  return { ...base, me:{ ...base.me, ...me }, allies:loading.allies, mode:currentMode, roleQuestsEnabled:currentRoleQuests,
    enemies: loading.enemies.map((p) => ({ championId: p.championId })),
    mayhem:session ? mayhem.effectiveSelection(session) : undefined,
    liveInventory:session?.autoInventory !== false ? session?.inventory : null,
    mayhemKey:session?.key, mayhemPool:currentMayhemPool };
}
function finalWithEnemies(me) {
  const s = loadingSelectState(me);
  if (!s) return lastFinal;
  const alias = game.championsById.get(me.championId)?.alias;
  try {
    lastSelectState = s;
    const build = { ...buildFor(alias, s), provisional:false };
    if (build.mayhem) {
      const auto = mayhemSession.value?.autoInventory !== false;
      const next = build.mayhem.nextItem;
      if (next && s.liveInventory) {
        const credit = componentCredit(next.id,s.liveInventory,game);
        if (credit > 0) next.components = { credit, remaining:Math.max(0,(game.items.get(next.id)?.priceTotal || 0)-credit) };
      }
      build.mayhem = { ...build.mayhem, matchKey:s.mayhemKey, pool:s.mayhemPool,
        live:{ auto, status:auto ? loading.liveStatus || 'waiting' : 'manual', inventory:mayhemSession.value?.inventory || null } };
    }
    return { myChampion: { ...champView(me.championId,me.skinId), locked:true, runes:runesFor(alias,s) }, build };
  } catch (err) { log(`build na ekranie ładowania: ${err.message}`); return lastFinal; }
}

function buildView(session) {
  const state = engine.readSession(session, currentMode, { ...session.extra, roleQuestsEnabled: currentRoleQuests });
  lastSelectState = state;
  const me = state.me;
  const myAlias = me && me.championId ? game.championsById.get(me.championId)?.alias : null;
  const aram = isAram(state.mode);
  // Na ARAM-ie nie ma wyboru z całej puli: zamiast sugestii ranking championów z ławki.
  const picks = aram ? { list: [], blind: false, laneOpponent: null } : engine.suggestPicks(state, game, data);
  requestNeeded(state, picks);
  const view = {
    status: 'champselect',
    mode: state.mode,
    aramChoices: aram ? engine.aramChoices(state, game, data).map((c) => ({ ...c, icon: champView(c.championId).icon })) : [],
    phase: state.phase,
    allLocked: state.allLocked,
    myPosition: me ? me.position : '',
    positionLabel: engine.POSITION_LABELS[me ? me.position : ''] || '',
    allies: state.allies.map((a) => ({
      champion: champView(a.championId, a.skinId), locked: a.locked, isMe: a.isMe,
      position: aram ? '' : engine.POSITION_LABELS[a.position] || '',
    })),
    enemies: state.enemies.map((e) => ({ champion: champView(e.championId, e.skinId), locked: e.locked })),
    enemyProfile: engine.enemyProfile(state, game, data),
    suggestions: picks.list.map((s) => ({ ...s, icon: champView(s.championId).icon })),
    masterySuggestions: (picks.masteryList || []).map((s) => ({ ...s, icon: champView(s.championId).icon })),
    blind: picks.blind,
    laneOpponent: picks.laneOpponent,
    banPhase: state.banPhase,
    myBanTurn: state.myBanTurn,
    bans: state.banPhase ? engine.suggestBans(state, game, data).map((b) => ({ ...b, icon: champView(b.championId).icon })) : [],
    compositions: engine.compositions(state, game, data),
    metaSource: (data.meta && data.meta.source) || '',
    statsStatus: currentMode === 'mayhem' ? { ok:true, message:'Mayhem · baza championa i wybrane augmenty' } : settings.stats ? provider.status : { ok: false, message: 'OP.GG wyłączone' },
    statsEnabled: settings.stats,
    autoRunes: autoRunesView(),
    autoItemSet: autoItemSetView(),
    myChampion: null,
    build: null,
    dataFile,
  };
  if (myAlias) {
    view.myChampion = { ...champView(me.championId, me.skinId), locked: me.locked, provisional: !state.allLocked, runes: runesFor(myAlias, state) };
    // Build od razu po wybraniu championa; dopóki nie wszyscy zablokowali, jest wstępny i zmienia się z każdym pickiem wroga.
    view.build = { ...buildFor(myAlias, state), provisional: !state.allLocked };
  }
  // Ostatni build z champ selecta zostaje do wglądu na ekranie ładowania i w trakcie gry.
  if (view.build && state.allLocked) lastFinal = { myChampion: view.myChampion, build: view.build };
  else if (!state.allLocked) lastFinal = null;
  view._state = { me: me && { spell1Id: me.spell1Id, spell2Id: me.spell2Id } };
  return view;
}

// ---------- akcje wywoływane z interfejsu (tylko na kliknięcie użytkownika) ----------

const RUNE_PREFIX = 'CS Assist';

let lastImportedRunes = null;
let lastObservedRunes = null;
async function preserveManualRunes(state) {
  if (state?.mode === 'mayhem') return null;
  const alias = game?.championsById.get(state?.me?.championId)?.alias;
  if (!alias || !lcu) return null;
  const current = await lcu.get('/lol-perks/v1/currentpage').catch(() => null);
  try { validateRunes(current, game); } catch { return null; }
  const scope = choiceKey(alias, state);
  const previous = lastImportedRunes?.scope === scope ? lastImportedRunes : lastObservedRunes?.scope === scope ? lastObservedRunes : null;
  if (previous && runeSignature(previous.page) !== runeSignature(current)) {
    const own = choicesStore.get(alias, state);
    own.runes = savedRunes(current);
    choicesStore.set(alias, state, own);
    lastImportedRunes = null;
    lastSessionJson = '';
    autoRunes.done = 'Zachowano runy zmienione w kliencie';
  }
  lastObservedRunes = { scope, page: savedRunes(current) };
  return current;
}
async function importRunes(alias, automatic = false) {
  if (currentMode === 'mayhem') throw new Error('W Mayhem runy są wyłączone.');
  if (!lcu || !game) throw new Error('Brak połączenia z klientem');
  if (automatic && (lastState?.status !== 'champselect' || game.championsById.get(lastSelectState?.me?.championId)?.alias !== alias)) return { ok: true, skipped: true };
  const currentPage = automatic ? await preserveManualRunes(lastSelectState) : null;
  const page = runesFor(alias);
  if (automatic && runeSignature(currentPage) === runeSignature(page)) return { ok: true, name: page.pinned ? 'Zachowane własne runy' : page.name };
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
  lastImportedRunes = { scope: choiceKey(alias, lastSelectState), page: savedRunes(page) };
  return { ok: true, name: page.name };
}

// Automatyczny import run, gdy wszyscy zablokowali championów (raz na dany skład; można wyłączyć w ustawieniach).
let autoRunes = { key: '', done: '', error: '' };
async function autoImportRunes() {
  if (currentMode === 'mayhem') return;
  const s = lastSelectState;
  if (!settings.autoRunes || !s || !s.allLocked || !s.me || !s.me.championId) return;
  const alias = game.championsById.get(s.me.championId)?.alias;
  // Gdy dojdą statystyki OP.GG dla Twojego championa, runy importują się jeszcze raz (już z aktualnego patcha).
  const key = [alias, ...s.enemies.map((e) => e.championId), statsKey(alias), choiceKey(alias, s), JSON.stringify(choicesStore.get(alias, s))].join(':');
  if (!alias || key === autoRunes.key) return;
  const target = autoRunes = { key, done: '', error: '' };
  try {
    const res = await choiceWrites(() => importRunes(alias, true));
    if (res.skipped) target.key = '';
    else target.done = res.name;
  } catch (err) {
    target.error = String(err && err.message || err);
    log(`auto-import run: ${target.error}`);
  }
  if (target === autoRunes && lastState?.status === 'champselect') send({ ...lastState, autoRunes: autoRunesView() });
}
const autoRunesView = () => ({ enabled: settings.autoRunes, done: autoRunes.done, error: autoRunes.error });

async function setSpells(alias) {
  if (!lcu || !game || !lastState || lastState.status !== 'champselect') throw new Error('Brak aktywnego wyboru postaci');
  const { ids } = engine.spellsFor(alias, lastSelectState, game, data);
  const body = engine.orderSpells(ids, lastState._state.me);
  const res = await lcu.request('PATCH', '/lol-champ-select/v1/session/my-selection', body);
  if (!res.ok) throw new Error(`Klient odrzucił czary (${res.status})`);
  return { ok: true };
}

// Grupy zestawów po początku tytułu („Blitz: Ahri” → „Blitz”), żeby gracz mógł sam zdecydować, które usunąć.
const itemSetGroup = (title) => {
  const t = String(title || '').trim();
  const m = /^(.+?)(?::| - | \| )/.exec(t);
  return (m ? m[1] : t.split(/\s+/)[0] || 'bez nazwy').slice(0, 30);
};
function itemSetGroups(sets) {
  const groups = new Map();
  for (const set of sets) {
    const name = itemSetGroup(set.title);
    const g = groups.get(name) || { name, count: 0, bytes: 0 };
    g.count += 1;
    g.bytes += Buffer.byteLength(JSON.stringify(set));
    groups.set(name, g);
  }
  return [...groups.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 6).map((g) => ({ ...g, kb: Math.ceil(g.bytes / 1024) }));
}
async function itemSetsUrl() {
  const me = await lcu.get('/lol-summoner/v1/current-summoner');
  if (!me || !me.summonerId) throw new Error('Nie udało się odczytać konta z klienta');
  return { me, url: `/lol-item-sets/v1/item-sets/${me.summonerId}/sets` };
}

// Zestaw przedmiotów w sklepie: zastępuje poprzedni zestaw tej aplikacji, pozostałe zestawy gracza zostają.
async function exportItemSet(alias, state = lastSelectState) {
  if (!lcu || !game || !state) throw new Error('Brak aktywnego wyboru postaci');
  const build = buildFor(alias, state);
  const set = engine.itemSetFor(build, alias, state, game, data);
  const { me, url } = await itemSetsUrl();
  const current = (await lcu.get(url)) || {};
  const others = (current.itemSets || []).filter((s) => !String(s.title || '').startsWith(RUNE_PREFIX));
  const body = { ...current, accountId: current.accountId || me.accountId, timestamp: Date.now(), itemSets: [...others, { ...set, uid: crypto.randomUUID() }] };
  const res = await lcu.request('PUT', url, body);
  if (!res.ok) {
    const message = (res.data && res.data.message) || '';
    log(`zestaw przedmiotów: ${res.status} ${message} (${others.length} innych zestawów, ${Buffer.byteLength(JSON.stringify(body))} B)`);
    // Klient ma limit rozmiaru wszystkich zestawów razem. Nie usuwamy niczego sami: gracz wybiera, które zestawy skasować.
    if (res.status === 413 || /too large/i.test(message)) {
      const err = new Error(`W kliencie jest za dużo zestawów przedmiotów (${others.length}, razem ${Math.ceil(Buffer.byteLength(JSON.stringify(current)) / 1024)} KB), więc nie przyjmuje nowego. Usuń część z nich poniżej.`);
      err.extra = { itemSetGroups: itemSetGroups(others) };
      throw err;
    }
    throw new Error(message || `Klient odrzucił zestaw przedmiotów (${res.status})`);
  }
  return { ok: true, name: set.title };
}

// Automatyczny zestaw w sklepie: po zablokowaniu wszystkich (na ARAM-ie po każdej zamianie championa).
let autoItemSet = { key: '', done: '', error: '' };
const statsKey = (alias) => (settings.stats && stats.analyses[alias] ? stats.analyses[alias]._key : '');
const autoItemSetView = () => ({ enabled: settings.autoItemSet, done: autoItemSet.done, error: autoItemSet.error, groups: autoItemSet.groups || null });
async function runAutoItemSet(alias, state, key) {
  if (!alias || key === autoItemSet.key) return;
  const target = autoItemSet = { key, done: '', error: '' };
  try {
    const result = await choiceWrites(() => {
      const active = lastState?.status === 'champselect' || (lastState?.status === 'loading-screen' && isAram(currentMode));
      if (!active || game.championsById.get(lastSelectState?.me?.championId)?.alias !== alias || choiceKey(alias, lastSelectState) !== choiceKey(alias, state)) return { skipped: true };
      return exportItemSet(alias, state);
    });
    if (result.skipped) target.key = '';
    else target.done = result.name;
  } catch (err) {
    target.error = String(err && err.message || err);
    target.groups = (err.extra && err.extra.itemSetGroups) || null;
    log(`auto-zestaw: ${target.error}`);
  }
  if (target === autoItemSet && lastState?.status === 'champselect') send({ ...lastState, autoItemSet: autoItemSetView() });
}
function autoExportItemSet() {
  const s = lastSelectState;
  if (!settings.autoItemSet || !s || !s.allLocked || !s.me || !s.me.championId) return;
  const alias = game.championsById.get(s.me.championId)?.alias;
  runAutoItemSet(alias, s, [alias, ...s.enemies.map((e) => e.championId), statsKey(alias), choiceKey(alias, s), JSON.stringify(choicesStore.get(alias, s))].join(':'));
}
// ARAM: w wyborze postaci nie widać wroga, więc na ekranie ładowania wysyłamy zestaw jeszcze raz, już pod skład wroga.
function autoExportItemSetForLoading() {
  if (!settings.autoItemSet || !isAram(currentMode) || !loading) return;
  const me = loading.allies.find((p) => p.isMe);
  const s = loadingSelectState(me);
  if (!s) return;
  const alias = game.championsById.get(me.championId)?.alias;
  runAutoItemSet(alias, s, [alias, ...s.enemies.map((e) => e.championId), statsKey(alias), choiceKey(alias, s), JSON.stringify(choicesStore.get(alias, s))].join(':'));
}

const wrap = (fn) => async (_e, ...args) => {
  try { return await fn(...args); } catch (err) { return { ok: false, error: String(err.message || err), ...(err.extra || {}) }; }
};

// Usuwa zestawy z wybranej grupy (tylko na kliknięcie gracza), żeby zrobić miejsce na zestaw aplikacji.
async function cleanItemSets(group) {
  if (!lcu) throw new Error('Brak połączenia z klientem');
  const { url } = await itemSetsUrl();
  const current = (await lcu.get(url)) || {};
  const sets = current.itemSets || [];
  const keep = sets.filter((x) => itemSetGroup(x.title) !== group);
  const res = await lcu.request('PUT', url, { ...current, timestamp: Date.now(), itemSets: keep });
  if (!res.ok) throw new Error((res.data && res.data.message) || `Klient odrzucił zmianę (${res.status})`);
  log(`usunięto ${sets.length - keep.length} zestawów „${group}”`);
  autoItemSet.key = '';
  return { ok: true, removed: sets.length - keep.length };
}
ipcMain.handle('clean-item-sets', wrap(cleanItemSets));
ipcMain.handle('import-runes', wrap(alias => choiceWrites(() => importRunes(alias))));
ipcMain.handle('set-spells', wrap(setSpells));
ipcMain.handle('export-item-set', wrap(alias => choiceWrites(() => exportItemSet(alias))));
ipcMain.handle('get-state', () => lastState);

function choiceContext(alias, scope) {
  if (!game || !lastSelectState || game.championsById.get(lastSelectState.me?.championId)?.alias !== alias) throw new Error('Wybór postaci się zmienił. Odśwież własne wybory.');
  if (scope && scope !== choiceKey(alias, lastSelectState)) throw new Error('Rola lub tryb się zmieniły. Otwórz własne wybory ponownie.');
  return lastSelectState;
}
function refreshChoices(alias, state) {
  lastSessionJson = ''; loadingDirty = true; autoItemSet.key = ''; autoRunes.key = '';
  if (lastState?.status === 'champselect' && lastState.myChampion?.alias === alias) {
    const next = { ...lastState, build: { ...buildFor(alias, state), provisional: lastState.build?.provisional },
      myChampion: { ...lastState.myChampion, runes: runesFor(alias, state) } };
    if (state.allLocked) lastFinal = { build: next.build, myChampion: next.myChampion };
    send(next);
  }
}
ipcMain.handle('get-choices', wrap((alias) => {
  const state = choiceContext(alias);
  return { ok: true, choices: choicesStore.get(alias, state), scope: choiceKey(alias, state), catalog: draftlab.catalog(game, data, state, alias) };
}));
ipcMain.handle('edit-choices', wrap((input) => choiceWrites(async () => {
  const state = choiceContext(input.alias, input.scope);
  if (state.mode === 'mayhem' && ['runes','client-runes','unpin-runes'].includes(input.action)) throw new Error('W Mayhem runy są wyłączone.');
  let own = choicesStore.get(input.alias, state);
  if (input.action === 'item') {
    if (input.slot === 'boots') own.boots = own.boots === Number(input.id) ? null : Number(input.id);
    else {
      const slot = Number(input.slot), id = Number(input.id), same = own.items.some(p => p.slot === slot && p.id === id);
      own.items = own.items.filter(p => p.slot !== slot);
      if (!same) own.items.push({ slot, id });
    }
  } else if (input.action === 'items') { own.items = input.items; own.boots = input.boots; }
  else if (input.action === 'reset-items') { own.items = []; own.boots = null; }
  else if (input.action === 'runes') own.runes = savedRunes(runesFor(input.alias, state));
  else if (input.action === 'client-runes') {
    if (!lcu) throw new Error('Uruchom klienta i wybierz własną stronę run.');
    own.runes = validateRunes(await lcu.get('/lol-perks/v1/currentpage'), game);
  } else if (input.action === 'unpin-runes') { own.runes = null; lastImportedRunes = null; lastObservedRunes = null; }
  else throw new Error('Nieznana zmiana wyborów.');
  own = validateChoices(own, engine.buildFor(input.alias, { ...state, choices: {} }, game, data), input.alias, state, game);
  choicesStore.set(input.alias, state, own);
  refreshChoices(input.alias, state);
  return { ok: true, choices: own };
})));
ipcMain.handle('draft-catalog', wrap(() => ({ ok: true, ...draftlab.catalog(game || offlineGame, baseData) })));
ipcMain.handle('preview-draft', wrap((input) => ({ ok: true, ...draftlab.preview(input, game || offlineGame, baseData) })));
ipcMain.handle('mayhem-catalog', wrap(pool => ({ ok:true, ...mayhem.choicesCatalog(pool === 'KIWI_JADE' ? pool : 'KIWI') })));
function mayhemContext(key) {
  if (currentMode !== 'mayhem' || lastState?.status !== 'loading-screen' || !loading) throw Error('Augmenty meczu można zmieniać po rozpoczęciu Mayhem. Do symulacji użyj testera draftów.');
  const state = loadingSelectState(loading.allies.find(p => p.isMe));
  if (!state || (key && state.mayhemKey !== key)) throw Error('Mecz się zmienił. Otwórz augmenty ponownie.');
  return state;
}
ipcMain.handle('get-mayhem', wrap(() => {
  const state = mayhemContext(), alias = game.championsById.get(state.me.championId).alias;
  return { ok:true, matchKey:state.mayhemKey, alias, selection:mayhemSession.value.selection,
    autoInventory:mayhemSession.value.autoInventory !== false,
    ...mayhem.choicesCatalog(state.mayhemPool), items:draftlab.catalog(game,baseData,state,alias) };
}));
ipcMain.handle('set-mayhem', wrap(input => choiceWrites(async () => {
  if (!input?.matchKey) throw Error('Brak identyfikatora meczu. Otwórz augmenty ponownie.');
  const state = mayhemContext(input.matchKey), alias = game.championsById.get(state.me.championId).alias;
  if (input.autoInventory !== undefined && typeof input.autoInventory !== 'boolean') throw Error('Nieprawidłowy tryb odczytu ekwipunku.');
  const automatic = input.autoInventory ?? mayhemSession.value.autoInventory !== false;
  // Formularz otwarty przed zakupem nie może cofnąć świeżego odczytu z gry.
  const selection = mayhem.validateSelection(automatic ? { ...input.selection, owned:[], ownedBoots:null } : input.selection,game,alias,state.mayhemPool);
  mayhemSession.set(state.mayhemKey,selection);
  mayhemSession.setAutoInventory(state.mayhemKey,automatic);
  loadingDirty = true; send(buildLoadingView());
  return { ok:true };
})));

// ---------- aktualizacje ----------

let updates = null;
let update = null;
ipcMain.handle('get-update', () => update);
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('update-action', () => {
  if (!updates || !update) return { ok: false };
  if (update.state === 'downloading') return { ok: false };
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
ipcMain.handle('toggle-auto-item-set', wrap(async () => {
  settings.autoItemSet = !settings.autoItemSet;
  writeJson(userFile('settings.json'), settings);
  autoItemSet.key = '';
  lastSessionJson = '';
  return { ok: true, enabled: settings.autoItemSet };
}));
ipcMain.handle('toggle-auto-runes', wrap(async () => {
  settings.autoRunes = !settings.autoRunes;
  writeJson(userFile('settings.json'), settings);
  autoRunes.key = '';
  lastSessionJson = '';
  return { ok: true, enabled: settings.autoRunes };
}));
// Skąd brać grafiki championów (Cho'Gath jako przykład): status każdej ścieżki.
async function tileDiagnostics(id) {
  const status = (p) => (p ? lcu.raw('GET', p).then((r) => r.status).catch((e) => String(e.message)) : null);
  const tilePath = await tilePathFor(id, id * 1000).catch(() => '');
  return { tilePath, viaJson: await status(tilePath), legacy: await status(`/lol-game-data/assets/v1/champion-tiles/${id}/${id * 1000}.jpg`), icon: await status(`/lol-game-data/assets/v1/champion-icons/${id}.png`) };
}
// Skórka wybrana w champ select: czy klient ma jej kafelek (diagnostyka "starych" ikon).
async function skinDiagnostics(championId, skinId) {
  const tilePath = await tilePathFor(championId, skinId).catch(() => '');
  const status = tilePath ? await lcu.raw('GET', tilePath).then((r) => r.status).catch((e) => String(e.message)) : null;
  return { championId, skinId, tilePath, status };
}
// Zestawy przedmiotów: ile ich jest i ile zajmują (bez treści), żeby zobaczyć, czemu klient ich nie przyjmuje.
async function itemSetDiagnostics() {
  const me = await lcu.get('/lol-summoner/v1/current-summoner').catch(() => null);
  if (!me || !me.summonerId) return null;
  const current = await lcu.get(`/lol-item-sets/v1/item-sets/${me.summonerId}/sets`).catch(() => null);
  const sets = (current && current.itemSets) || [];
  return { count: sets.length, bytes: Buffer.byteLength(JSON.stringify(current || {})), groups: itemSetGroups(sets) };
}

// Surowe odpowiedzi maestrii z każdego endpointu (Twoje konto), żeby sprawdzić, skąd brakuje championów.
async function masteryDiagnostics() {
  const me = await lcu.get('/lol-summoner/v1/current-summoner').catch(() => null);
  const out = { account: me ? { gameName: me.gameName, tagLine: me.tagLine, summonerId: me.summonerId } : null, endpoints: {} };
  for (const p of require('./gamedata').masteryPaths(me)) {
    const res = await lcu.raw('GET', p).catch((err) => ({ status: 0, body: Buffer.from(String(err.message)) }));
    let body = null;
    try { body = JSON.parse(res.body.toString('utf8')); } catch { body = res.body.toString('utf8').slice(0, 300); }
    const list = require('./gamedata').masteryList(body);
    out.endpoints[p.replace(/[0-9a-f-]{30,}/i, '{puuid}')] = {
      status: res.status,
      count: list ? list.length : null,
      shape: list ? Object.keys(list[0] || {}) : typeof body === 'object' && body ? Object.keys(body).slice(0, 20) : body,
      sample: list ? list.slice(0, 60).map((x) => ({ championId: x.championId, championLevel: x.championLevel, championPoints: x.championPoints })) : null,
    };
  }
  return out;
}

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
  // Dane z klienta do sprawdzenia banów i maestrii (bez danych innych graczy: tylko komórki, championy i akcje).
  if (lcu) {
    const session = await lcu.get('/lol-champ-select/v1/session').catch(() => null);
    const mastery = await loadMastery(lcu).catch(() => null);
    const team = (list) => (list || []).map((p) => ({ cellId: p.cellId, championId: p.championId, championPickIntent: p.championPickIntent, assignedPosition: p.assignedPosition, selectedSkinId: p.selectedSkinId }));
    report.lcu = {
      champSelect: session ? {
        localPlayerCellId: session.localPlayerCellId, myTeam: team(session.myTeam), theirTeam: team(session.theirTeam),
        actions: session.actions, bans: session.bans, phase: session.timer && session.timer.phase,
        pickable: await lcu.get('/lol-champ-select/v1/pickable-champion-ids').catch((e) => String(e.message)),
        disabled: await lcu.get('/lol-champ-select/v1/disabled-champion-ids').catch((e) => String(e.message)),
        skins: await Promise.all([...(session.myTeam || []), ...(session.theirTeam || [])].filter((p) => p.championId > 0)
          .map((p) => skinDiagnostics(p.championId, p.selectedSkinId || p.championId * 1000))),
      } : null,
      mastery: mastery ? { counts: mastery.raw, champions: mastery.map.size } : null,
      masteryRaw: await masteryDiagnostics(),
      tiles: await tileDiagnostics(31),
      itemSets: await itemSetDiagnostics(),
    };
  }
  const file = path.join(app.getPath('documents'), 'champ-select-diagnostyka-opgg.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  require('electron').shell.showItemInFolder(file);
  return { ok: !report.error, file, error: report.error };
}));

app.whenReady().then(() => {
  if (!primaryInstance) return;
  ({ data: baseData, file: dataFile } = loadData());
  data = baseData;
  initStats();
  // Ikony z klienta (wymagają autoryzacji, więc pobiera je proces główny).
  // Obrazki z klienta trzymane w pamięci: kolejne odświeżenia widoku nie pytają klienta o to samo.
  const assetCache = new Map();
  protocol.handle('lcuasset', async (request) => {
    const url = new URL(request.url);
    const hit = assetCache.get(url.pathname);
    if (hit) return new Response(hit.body, { status: 200, headers: { 'Content-Type': hit.type } });
    if (!lcu) return new Response(null, { status: 503 });
    try {
      // Kafelek skina: ścieżka z danych championa (tilePath, np. ASSETS/Characters/.../*_tile_*.jpg), potem stara ścieżka
      // champion-tiles, a na końcu zwykła ikona championa.
      const tile = /^\/lol-game-data\/assets\/v1\/champion-tiles\/(\d+)\/(\d+)\.jpg$/.exec(url.pathname);
      let res = null;
      let fallback = false;
      if (tile) {
        const tilePath = await tilePathFor(Number(tile[1]), Number(tile[2]));
        if (tilePath) res = await lcu.raw('GET', tilePath);
        if (!res || res.status !== 200) res = await lcu.raw('GET', url.pathname);
        if (res.status !== 200) {
          if (!tileFailLogged) { tileFailLogged = true; log(`kafelek championa ${url.pathname} (${tilePath || 'brak tilePath'}): ${res.status}, używam ikony`); }
          res = await lcu.raw('GET', `/lol-game-data/assets/v1/champion-icons/${tile[1]}.png`);
          fallback = true;
        }
      } else {
        res = await lcu.raw('GET', url.pathname);
      }
      // Zastępczej ikony nie zapamiętujemy: przy następnym odświeżeniu spróbujemy znowu pobrać kafelek skina.
      if (res.status === 200 && !fallback) {
        if (assetCache.size > 600) assetCache.delete(assetCache.keys().next().value);
        assetCache.set(url.pathname, { body: res.body, type: res.headers['content-type'] || 'image/png' });
      }
      return new Response(res.body, { status: res.status, headers: { 'Content-Type': res.headers['content-type'] || 'image/png', 'Cache-Control': fallback ? 'no-store' : 'max-age=86400' } });
    } catch {
      return new Response(null, { status: 502 });
    }
  });

  win = new BrowserWindow({
    show: false,
    width: 1100, height: 760, minWidth: 820, minHeight: 600,
    backgroundColor: '#0e1116',
    title: 'Champ Select Assistant',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  desktop = createDesktop({ app, win, Tray, Menu, nativeImage, globalShortcut, settings,
    saveSettings: () => writeJson(userFile('settings.json'), settings), log,
    notify: message => { dialog.showMessageBox({ type: 'info', title: 'Skrót klawiaturowy', message }).catch(err => log(err.message)); } });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  updates = initUpdates((u) => {
    update = u;
    if (win && !win.isDestroyed()) win.webContents.send('update', u);
  }, log);
  tick();
  setInterval(tick, 1000);
});

app.on('window-all-closed', () => app.quit());
