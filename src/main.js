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
const { createReport, readReport } = require('./build-report');
const { ReplayLibrary, replayEntries, checkReplay } = require('./replay-checks');
let replayLibrary;
const mayhem = require('./mayhem');
const { LiveClient, componentCredit } = require('./liveclient');
const { shopPlan } = require('./shop-plan');
const liveClient = new LiveClient();
const augmentVision = require('./augment-vision');
const augmentScreen = require('./augment-screen');
const {WindowsOcr}=require('./windows-ocr');
const windowsOcr=new WindowsOcr();
const {AugmentClicks}=require('./augment-clicks');
const augmentClicks=new AugmentClicks();
const augmentOffers=require('./augment-offers');
const {compareAugments}=require('./mayhem-compare');
const {headlinerView}=require('./headliners');
const {synergies}=require('./augment-synergies');
const {MatchReview}=require('./match-review');
const { MayhemFavorites } = require('./mayhem-favorites');
const {augmentImpact}=require('./augment-impact');
const {readoutFor,BuildChanges}=require('./build-insight');
const {purchaseKey,canBuy,withPurchaseGoal,PurchaseGoal}=require('./next-purchase');
const {dataFreshness,patchOf}=require('./data-freshness');
let purchaseGoal;
const {ownerKey,ResultResolver}=require('./match-result');
const resultResolver=new ResultResolver();
const {HeadlinerConsensus,automaticHeadliner,applyHeadliner}=require('./headliner-vision');
const headlinerConsensus=new HeadlinerConsensus();
let matchReview;
let mayhemFavorites;
const offerTracker=new augmentOffers.OfferTracker();
const visionCatalog=require('../data/mayhem-augments.json').augments;
const visionConsensus = new augmentVision.Consensus();
let visionConfig = null, visionRevision = 0, visionToken = '', visionLastFrame = 0;
const { isAram, modeFromFlow } = require('./modes');
const { writeRunePage } = require('./rune-import');
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
// Włączamy funkcje dopiero po potwierdzeniu obsługiwanej kolejki przez klienta.
let currentMode = 'unsupported';
let currentMayhemPool = 'KIWI';
let currentRoleQuests = false;
function detectMode(flow) {
  const gameMode = String((flow && flow.gameData && flow.gameData.queue && flow.gameData.queue.gameMode) || '').toUpperCase();
  const nextMode = modeFromFlow(flow);
  const pool = gameMode === 'KIWI_JADE' ? 'KIWI_JADE' : 'KIWI';
  const roleQuests = roleQuestsEnabled(flow);
  const changed = nextMode !== currentMode || pool !== currentMayhemPool || roleQuests !== currentRoleQuests;
  if (changed) {
    lastSessionJson = '';
    lastSelectState = null;
    lastFinal = null;
    lastImportedRunes = null;
    lastObservedRunes = null;
    autoRunes = { key:'', done:'', error:'' };
    autoItemSet = { key:'', done:'', error:'' };
    loading = null;
  }
  currentMode = nextMode;
  currentMayhemPool = pool;
  currentRoleQuests = roleQuests;
  if (changed) recomputeData();
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
  replayLibrary = new ReplayLibrary(readJson(userFile('saved-build-reports.json'),[]),entries=>{
    const file=userFile('saved-build-reports.json');
    fs.writeFileSync(file+'.tmp',JSON.stringify(entries)); fs.renameSync(file+'.tmp',file);
  });
  purchaseGoal=new PurchaseGoal(readJson(userFile('next-purchase.json'),null),value=>{
    const file=userFile('next-purchase.json');fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);
  });
  try { visionConfig=augmentVision.migrateConfig(readJson(userFile('augment-screen.json'),null)); }
  catch { visionConfig={enabled:true,mode:'auto'}; }
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
  matchReview = new MatchReview(readJson(userFile('match-review.json'), {}), value => {
    const file=userFile('match-review.json');fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);
  });
  if(matchReview.value.active)matchReview.gap();
  const favoritesFile = userFile('mayhem-favorites.json');
  mayhemFavorites = new MayhemFavorites(readJson(favoritesFile,[]), entries => {
    fs.writeFileSync(favoritesFile+'.tmp',JSON.stringify(entries),'utf8');
    fs.renameSync(favoritesFile+'.tmp',favoritesFile);
  });
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
  if (mode !== 'classic' && mode !== 'aram') return;
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

const shownBuildReports = new Map();
let reportSession = '';
function send(state) {
  const b=state.final?.build||state.build,analysisKey=b?.fromStats?stats.analyses[b.alias]?._key:null;
  const [analysisAlias,analysisRole,analysisMode]=(analysisKey||'').split(':');
  state.dataStatus=dataFreshness(game||offlineGame,{connected:!!lcu&&!['no-client','error'].includes(state.status),mode:state.mode||currentMode,
    analysisAt:analysisKey?provider?.cache?.[`analysis:${analysisAlias}:${analysisRole}${analysisMode==='aram'?':aram':''}`]?.at:null,baseSource:b?.baseSource,
    runeSource:(state.final?.myChampion||state.myChampion)?.runes?.runeSource});
  if(['idle','no-client'].includes(state.status))state.recentMatch=matchReview?.latest()||null;
  const session = b && ['champselect','loading-screen'].includes(state.status)
    ? JSON.stringify([state.status,loading?.gameId || loading?.sessionId || '',b.alias,b.mode]) : '';
  if (session !== reportSession) { shownBuildReports.clear(); reportSession = session; }
  if (session && game && lastSelectState?.mode === b.mode && game.championsById.get(lastSelectState.me?.championId)?.alias === b.alias) {
    const report = createReport(withChoices(b.alias,lastSelectState),b,game,{
      version:app.getVersion(),patch:state.dataStatus.version,gold:b.shop?.gold
    });
    b.reportToken = crypto.createHash('sha256').update(session).update(JSON.stringify(report)).digest('hex');
    shownBuildReports.set(b.reportToken,report);
    if (shownBuildReports.size > 8) shownBuildReports.delete(shownBuildReports.keys().next().value);
  }
  if(visionToken && (state.status!=='loading-screen' || !state.final?.build?.mayhem
    ||state.final.build.mayhem.matchKey!==lastState?.final?.build?.mayhem?.matchKey))stopVisionWorkers();
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
    if (phase === undefined) { matchReview?.gap(); lcu = null; loading = null; return send({ status: 'no-client' }); }
    if(visionToken && phase!=='InProgress')stopVisionWorkers();
    // Przejścia faz są niezależne od odświeżania statystyk i zawartości draftu.
    const active = phase === 'ChampSelect' || LOADING_PHASES.includes(phase);
    const flow = active ? await lcu.get('/lol-gameflow/v1/session').catch(() => null) : null;
    // During an established game a transient read failure is handled by the
    // existing stale-snapshot path. A new session always needs positive proof.
    if (active && (flow || !loading || phase === 'ChampSelect')) detectMode(flow);
    desktop?.observePhase(active && currentMode === 'unsupported' ? 'Unsupported' : phase);
    if (active && currentMode === 'unsupported') return send({ status:'unsupported', mode:currentMode, phase });
    if (!game) {
      game = await loadGameData(lcu).catch(() => null);
      if (!game) return send({ status: 'loading' });
      recomputeData();
      loadMeta();
    }
    if (LOADING_PHASES.includes(phase)) {
      lastSessionJson = '';
      if (flow && loading?.gameId && String(loading.gameId) !== String(flow.gameData?.gameId)) loading=null;
      if (!loading || flow) {
        const players = await readLoadingPlayers(lcu, flow, loading).catch(() => null);
        if (!players) return send({ status: 'idle', phase });
        if (!loading) {
          loading = { ...players, summaries: {} };
          fetchPlayerStats(loading);
          loadingDirty = true;
          autoExportItemSetForLoading();
        } else if (JSON.stringify([players.allies,players.enemies]) !== JSON.stringify([loading.allies,loading.enemies])) {
          Object.assign(loading, players);
          const visible = new Set([...players.allies,...players.enemies].filter(p=>!p.anonymous).map(playerKey));
          for (const key of Object.keys(loading.summaries)) if (!visible.has(key)) delete loading.summaries[key];
          fetchPlayerStats(loading);
          loadingDirty = true;
        }
      }
      if (phase === 'InProgress') await syncLiveInventory();
      if (!loading) return;
      if (loading.liveStatus === 'live' && Date.now()-(loading.liveAt||0)>=6000) {
        loading.liveStatus='stale'; loading.liveSnapshot=null; loadingDirty=true;matchReview?.gap();
      }
      if (loadingDirty) { loadingDirty = false; send(buildLoadingView()); }
      return;
    }
    if(['PreEndOfGame','EndOfGame','WaitingForStats','None','Lobby','ChampSelect','Matchmaking','ReadyCheck'].includes(phase))
      matchReview?.finish(['PreEndOfGame','EndOfGame','WaitingForStats'].includes(phase)?'ended':'left');
    else matchReview?.gap();
    loading = null;
    if (phase !== 'ChampSelect') {
      currentMode = 'unsupported';
      lastSelectState = null;
      lastFinal = null;
      resultResolver.poll(matchReview,lcu).then(changed=>{
        if(changed&&lastState?.status==='idle')send({...lastState});
      }).catch(()=>{});
      lastSessionJson = '';
      lastImportedRunes = null; lastObservedRunes = null;
      autoRunes = { key: '', done: '', error: '' };
      autoItemSet = { key: '', done: '', error: '' };
      return send({ status: 'idle', phase });
    }
    const session = await lcu.get('/lol-champ-select/v1/session');
    if (!session) return;
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
    matchReview?.gap();
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
  const pool = currentMode === 'mayhem' ? state.mayhemPool : currentMode === 'aram' ? 'ARAM' : 'CLASSIC';
  try { result = await liveClient.inventory(me,alias,pool,game,{ mode:currentMode, enemies:target.enemies,
    sideBoots:currentRoleQuests && ['bottom','adc'].includes(me.position) }); }
  catch { result = { status:'waiting' }; }
  // Żądanie może skończyć się już po zamknięciu meczu. Nigdy nie przenosimy
  // ekwipunku do kolejnego meczu ani do testera draftów.
  const [phase, flow] = await Promise.all([
    lcu.get('/lol-gameflow/v1/gameflow-phase').catch(()=>null), lcu.get('/lol-gameflow/v1/session').catch(()=>null),
  ]);
  const sameSession = () => loading === target && (currentMode !== 'mayhem' || mayhemSession.value?.key === state.mayhemKey);
  if (!sameSession() || phase !== 'InProgress') return;
  if (!flow?.gameData) return;
  if (target.gameId && String(flow.gameData.gameId) !== String(target.gameId)) { loading=null; return; }
  await choiceWrites(async () => {
    if (!sameSession()) return;
    const oldInventory = currentMode === 'mayhem' ? mayhemSession.value.inventory : target.liveInventory;
    const status = result.status === 'live' && result.inventory ? 'live' : oldInventory ? 'stale' : 'waiting';
    if (target.liveStatus !== status) { target.liveStatus=status; loadingDirty=true; }
    const snapshot = status === 'live' ? result : null;
    if(!snapshot)matchReview?.gap();
    if (JSON.stringify(target.liveSnapshot) !== JSON.stringify(snapshot)) loadingDirty=true;
    target.liveSnapshot=snapshot;
    if (snapshot) {
      target.liveAt=Date.now();
      if(Array.isArray(snapshot.enemies))target.enemiesAt=target.liveAt;
      // Refresh the timestamp even when the contents of a snapshot are equal.
      loadingDirty=true;
      if (currentMode === 'mayhem') { if (mayhemSession.setInventory(state.mayhemKey,result.inventory)) loadingDirty=true; }
      else { target.liveInventory=result.inventory; }
    }
  });
}

function fetchPlayerStats(target) {
  if (!settings.stats) return;
  target.statsFetching ||= new Set();
  const players = [...target.allies, ...target.enemies].filter((p) => !p.anonymous && p.gameName && p.tagLine);
  let next = 0;
  const worker = async () => {
    while (next < players.length) {
      if(loading!==target||!settings.stats)return;
      const p = players[next++];
      const key=playerKey(p);
      const visible=()=>[...target.allies,...target.enemies].some(current=>!current.anonymous && playerKey(current)===key);
      if(!visible()||target.statsFetching.has(key)||target.summaries[key])continue;
      target.statsFetching.add(key);
      const summary = await provider.summoner({ gameName: p.gameName, tagLine: p.tagLine, region: target.region }).catch(() => null);
      target.statsFetching.delete(key);
      if (!visible() || loading!==target) continue;
      target.summaries[key] = summary || false;
      if (target === loading) loadingDirty = true;
    }
  };
  for (let i = 0; i < 3; i++) worker();
}

function buildLoadingView() {
  const cardOf = (p) => playerCard(p, settings.stats && !p.anonymous ? loading.summaries[playerKey(p)]||null:null, game,Date.now(),currentMode);
  const card = (p) => ({
    ...cardOf(p),
    championView: champView(p.championId, p.skinId),
    pending: settings.stats && loading.summaries[playerKey(p)] === undefined && !!p.gameName&&!!p.tagLine,
    statsDisabled:!settings.stats,
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
    statsStatus: settings.stats ? provider.status : { ok: false, message: 'Profile OP.GG wyłączone' },
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
    liveInventory:session ? session.autoInventory !== false ? session.inventory : null : loading.liveInventory,
    liveEnemies:loading.liveStatus === 'live' && Date.now()-(loading.liveAt||0)<6000 ? loading.liveSnapshot?.enemies : null,
    mayhemKey:session?.key, mayhemPool:currentMayhemPool };
}
function finalWithEnemies(me) {
  const s = loadingSelectState(me);
  if (!s) return lastFinal;
  const alias = game.championsById.get(me.championId)?.alias;
  try {
    lastSelectState = s;
    const natural = { ...buildFor(alias, s), provisional:false };
    const liveStatus = currentMode === 'mayhem' && mayhemSession.value?.autoInventory === false ? 'manual'
      : loading.liveStatus === 'live' && Date.now()-(loading.liveAt||0)>=6000 ? 'stale' : loading.liveStatus || 'waiting';
    const goal=purchaseGoal.ensure(purchaseKey(loading.gameId||loading.sessionId,alias,currentMode,ownerKey(me.puuid)));
    const result=withPurchaseGoal(alias,withChoices(alias,s),game,data,natural,goal.id);
    if(goal.id&&!result.active&&liveStatus==='live')purchaseGoal.set(goal.key,goal.revision,null,result.reason);
    const build={...result.build,provisional:false};
    const naturalShop=shopPlan(natural,loading.liveSnapshot,game,liveStatus);
    if(result.active&&naturalShop.target?.id!==goal.id)build.purchaseAlternative=naturalShop.target;
    build.shop = { ...shopPlan(build,loading.liveSnapshot,game,liveStatus),
      enemies:liveStatus === 'live' && Array.isArray(s.liveEnemies) ? 'live' : 'waiting' };
    const options=[...natural.items,natural.boots,natural.mayhem?.nextItem,...(naturalShop.comparison||[]).map(o=>o.target)]
      .filter((i,index,all)=>i?.id&&!i.owned&&canBuy(i.id,game,natural)&&all.findIndex(x=>x?.id===i.id)===index);
    build.purchaseGoal={...purchaseGoal.value,name:game.items.get(purchaseGoal.value.id)?.name||null,
      active:!!result.active,canEdit:liveStatus==='live'&&Number.isFinite(loading.liveSnapshot?.gold),
      notice:purchaseGoal.value.notice||(!result.active&&goal.id?result.reason:''),options:options.map(i=>({id:i.id,name:i.name})),
      suggestion:result.active&&naturalShop.target?.id!==goal.id?naturalShop.target:null};
    if (build.mayhem) {
      const auto = mayhemSession.value?.autoInventory !== false;
      const next = build.mayhem.nextItem;
      if (next && s.liveInventory) {
        const credit = componentCredit(next.id,s.liveInventory,game);
        if (credit > 0) next.components = { credit, remaining:Math.max(0,(game.items.get(next.id)?.priceTotal || 0)-credit) };
      }
      build.mayhem = { ...build.mayhem, matchKey:s.mayhemKey, pool:s.mayhemPool,
        headliner:headlinerView(s.mayhem?.headliner,s.mayhem),synergies:synergies(s.mayhem),
        headlinerDetection:{auto:automaticHeadliner(mayhemSession.value),source:mayhemSession.value.headlinerSource||'manual',
          available:!!visionConfig?.enabled&&visionConfig.mode==='auto'},
        live:{ auto, status:auto ? loading.liveStatus || 'waiting' : 'manual', inventory:mayhemSession.value?.inventory || null },
        screen:{ enabled:!!visionConfig?.enabled, config:visionConfig, revision:visionRevision,
          status:visionConfig?.enabled ? loading.visionStatus || 'waiting' : 'off', error:loading.visionError||null,
          missed:!!loading.visionMissed,diagnostics:loading.visionDiagnostics||null } };
      const undo=augmentScreen.undoCandidate(mayhemSession.value);
      build.mayhem.undo=undo?{token:undo.token,names:undo.ids.map(id=>visionCatalog.find(a=>a.id===id)?.name).filter(Boolean)}:null;
      const offer=loading.visionOffer;
      if(offer&&Date.now()-offer.at<30000){
        const enemy=engine.teamProfile(s.enemies.filter(e=>e.championId).map(e=>engine.champInfo(game.championsById.get(e.championId)?.alias,game,data)));
        const comparison=compareAugments(offer.ids,{champion:engine.champInfo(alias,game,data),selection:s.mayhem,build,game,pool:s.mayhemPool,enemy});
        build.mayhem.comparison=comparison?{...comparison,paused:!augmentClicks.active()}:null;
      }
    }
    const insightContext={key:`${loading.gameId||loading.sessionId}:${alias}:${currentMode}`,status:liveStatus,
      liveAt:loading.liveAt,enemiesAt:loading.enemiesAt,enemies:s.liveEnemies,inventory:s.liveInventory,
      gold:loading.liveSnapshot?.gold,session:currentMode==='mayhem'?mayhemSession.value:null,screenAt:loading.visionAt};
    build.readout=readoutFor(build,insightContext);
    loading.buildChanges ||= new BuildChanges();
    build.lastChange=loading.buildChanges.observe(build,insightContext);
    if(liveStatus==='live'||(liveStatus==='manual' && loading.liveStatus==='live' && Date.now()-(loading.liveAt||0)<6000))matchReview?.observe({key:`${loading.gameId||loading.sessionId}:${alias}:${currentMode}`,
      alias,name:game.championsById.get(me.championId)?.name||alias,mode:currentMode,snapshot:loading.liveSnapshot,build,
      compareAugment:id=>augmentImpact(id,withChoices(alias,s),build,goal.id,game,data),
      replayReport:()=>createReport(withChoices(alias,s),build,game,{
        version:app.getVersion(),patch:patchOf(game.provenance?.version),gold:build.shop?.gold
      }),
      gameId:loading.gameId,championId:me.championId,owner:ownerKey(me.puuid)});
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
let runePageOwners;

let lastImportedRunes = null;
let lastObservedRunes = null;
async function preserveManualRunes(state) {
  if (state?.mode !== 'classic' && state?.mode !== 'aram') return null;
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
  if (!lcu || !game || currentMode === 'unsupported' || lastState?.status !== 'champselect') throw new Error('Import wymaga wyboru postaci w obsługiwanej kolejce.');
  if (automatic && (lastState?.status !== 'champselect' || game.championsById.get(lastSelectState?.me?.championId)?.alias !== alias)) return { ok: true, skipped: true };
  const currentPage = automatic ? await preserveManualRunes(lastSelectState) : null;
  const page = runesFor(alias);
  if (automatic && runeSignature(currentPage) === runeSignature(page)) return { ok: true, name: page.pinned ? 'Zachowane własne runy' : page.name };
  const body = { name: page.name, primaryStyleId: page.primaryStyleId, subStyleId: page.subStyleId, selectedPerkIds: page.selectedPerkIds, current: true };
  const file = userFile('rune-page-owners.json');
  runePageOwners ||= readJson(file, {}) || {};
  await verifyActionMode('ChampSelect');
  await writeRunePage(lcu, body, runePageOwners, (account, entry) => {
    runePageOwners[account] = entry;
    fs.writeFileSync(file+'.tmp', JSON.stringify(runePageOwners));
    fs.renameSync(file+'.tmp',file);
  });
  lastImportedRunes = { scope: choiceKey(alias, lastSelectState), page: savedRunes(page) };
  return { ok: true, name: page.name };
}

// Automatyczny import run, gdy wszyscy zablokowali championów (raz na dany skład; można wyłączyć w ustawieniach).
let autoRunes = { key: '', done: '', error: '' };
async function autoImportRunes() {
  if (currentMode !== 'classic' && currentMode !== 'aram') return;
  const s = lastSelectState;
  if (!settings.autoRunes || !s || !s.allLocked || !s.me || !s.me.championId) return;
  const alias = game.championsById.get(s.me.championId)?.alias;
  // Gdy dojdą statystyki OP.GG dla Twojego championa, runy importują się jeszcze raz (już z aktualnego patcha).
  const key = [alias, ...s.enemies.map((e) => `${e.championId}@${e.position||''}`), statsKey(alias), choiceKey(alias, s), JSON.stringify(choicesStore.get(alias, s))].join(':');
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
  await verifyActionMode('ChampSelect');
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
  await verifyActionMode();
  if (state.mode !== currentMode) throw Error('Tryb gry zmienił się przed zapisem zestawu.');
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

async function verifyActionMode(requiredPhase) {
  const [phase, flow] = await Promise.all([lcu.get('/lol-gameflow/v1/gameflow-phase'), lcu.get('/lol-gameflow/v1/session')]);
  const validPhase = requiredPhase ? phase === requiredPhase : phase === 'ChampSelect' || LOADING_PHASES.includes(phase);
  if (!validPhase || currentMode === 'unsupported' || currentMode !== modeFromFlow(flow)) throw Error('Poczekaj na potwierdzenie obsługiwanej kolejki.');
}

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
ipcMain.handle('get-view-mode',()=>desktop?.isCompact()||false);
ipcMain.handle('set-view-mode',wrap(compact=>{
  if(typeof compact!=='boolean')throw Error('Nieprawidłowy widok.');
  desktop?.setCompact(compact);return {ok:true};
}));
ipcMain.handle('set-next-purchase',wrap(input=>choiceWrites(async()=>{
  if(!loading||lastState?.status!=='loading-screen')throw Error('Cel zakupu ustawisz podczas meczu.');
  const target=loading,me=target.allies.find(p=>p.isMe),state=loadingSelectState(me);
  const alias=game.championsById.get(me?.championId)?.alias;
  const key=purchaseKey(target.gameId||target.sessionId,alias,currentMode,ownerKey(me.puuid));
  if(input?.key!==key||purchaseGoal.value?.key!==key||input.revision!==purchaseGoal.value.revision)throw Error('Mecz lub cel się zmienił. Otwórz zakup ponownie.');
  if(input.id!==null){
    const [phase,flow]=await Promise.all([lcu.get('/lol-gameflow/v1/gameflow-phase'),lcu.get('/lol-gameflow/v1/session')]);
    if(loading!==target||phase!=='InProgress'||!target.gameId||String(flow?.gameData?.gameId)!==String(target.gameId)
      ||target.liveStatus!=='live'||Date.now()-(target.liveAt||0)>=6000||!Number.isFinite(target.liveSnapshot?.gold))throw Error('Poczekaj na świeży odczyt bieżącego meczu.');
    const view=finalWithEnemies(me)?.build;
    if(!view?.purchaseGoal?.options.some(i=>i.id===input.id))throw Error('Ten przedmiot nie jest już dostępny w planie. Wybierz cel ponownie.');
    const base=buildFor(alias,state),result=withPurchaseGoal(alias,withChoices(alias,state),game,data,base,input.id);
    if(!result.active)throw Error(result.reason||'Nie można przypiąć tego celu.');
  }
  purchaseGoal.set(key,input.revision,input.id,input.id===null?'Przywrócono automatyczny plan.':'');
  loadingDirty=true;send(buildLoadingView());return {ok:true};
})));

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
let buildReportDraft = null;
ipcMain.handle('capture-build-report', wrap(token => {
  const report = shownBuildReports.get(token);
  if (!report) throw Error('Build się zmienił. Otwórz zgłoszenie jeszcze raz.');
  buildReportDraft = {token:crypto.randomUUID(),report};
  return {ok:true,...buildReportDraft};
}));
ipcMain.handle('save-build-report', wrap(async token => {
  const draft = buildReportDraft;
  if (!draft || draft.token !== token) throw Error('Otwórz ponownie podgląd zgłoszenia.');
  const {filePath,canceled} = await dialog.showSaveDialog(win,{
    title:'Zapisz anonimowe zgłoszenie buildu',defaultPath:`build-${draft.report.scenario.alias}.json`,
    filters:[{name:'Zgłoszenie Champ Select Assistant',extensions:['json']}]
  });
  if (!canceled && filePath) {
    const tempFile = filePath + '.' + crypto.randomUUID() + '.tmp';
    try {
      await fs.promises.writeFile(tempFile,JSON.stringify(draft.report,null,2),{encoding:'utf8',flag:'wx'});
      await fs.promises.rename(tempFile,filePath);
    } finally { await fs.promises.rm(tempFile,{force:true}); }
  }
  return {ok:true,saved:!canceled && !!filePath};
}));
ipcMain.handle('read-build-report', wrap(text => {
  const report = readReport(text);
  draftlab.preview(report.scenario,game || offlineGame,baseData);
  return {ok:true,report};
}));
ipcMain.handle('preview-draft', wrap((input) => ({ ok: true, ...draftlab.preview(input, game || offlineGame, baseData) })));
ipcMain.handle('inspect-items', wrap(() => ({ok:true, items:draftlab.inspectionCatalog(game || offlineGame)})));
ipcMain.handle('inspect-draft-item', wrap((input,id) => ({ok:true, ...draftlab.preview(input,game || offlineGame,baseData,{inspectItem:id})})));
ipcMain.handle('mayhem-catalog', wrap(pool => ({ ok:true, ...mayhem.choicesCatalog(pool === 'KIWI_JADE' ? pool : 'KIWI') })));
ipcMain.handle('match-reviews',wrap(()=>({ok:true,matches:matchReview.list()})));
const currentReplays = () => replayEntries(matchReview.value.matches,replayLibrary);
ipcMain.handle('check-saved-matches',wrap(async () => {
  const {entries,missing}=currentReplays(), catalog=game || offlineGame, currentData=baseData, checks=[];
  for (const entry of entries.values()) {
    checks.push(checkReplay(entry,catalog,currentData));
    await new Promise(resolve=>setImmediate(resolve));
  }
  return {ok:true,version:app.getVersion(),patch:patchOf(catalog.provenance?.version),missing,
    checks};
}));
ipcMain.handle('manage-replay',wrap(input=>{
  if (input?.action==='import') {
    const report=readReport(input.text);
    // Keep a valid historical file even when its champion, augment or item
    // is missing from today's catalogue. checkReplay reports that case separately.
    return {ok:true,id:replayLibrary.add(report)};
  }
  if (typeof input?.id!=='string') throw Error('Wybierz zapisany przypadek.');
  const entry=currentReplays().entries.get(input.id);
  if (!entry) throw Error('Ta sytuacja wypadła już z historii meczu.');
  if (input.action==='remove') { replayLibrary.remove(entry.caseId); return {ok:true}; }
  if (input.action==='keep') return {ok:true,id:replayLibrary.add(entry.report)};
  if (input.action==='open') return {ok:true,report:entry.report};
  throw Error('Nieznana operacja na zapisanym przypadku.');
}));
ipcMain.handle('open-riot-policy',wrap(async()=>{await require('electron').shell.openExternal('https://support-developer.riotgames.com/hc/en-us/articles/22698591841939-General-Policies');return {ok:true};}));
ipcMain.handle('review-feedback',wrap(input=>({ok:true,match:matchReview.feedback(input?.key,input)})));
ipcMain.handle('mayhem-favorites',wrap(() => ({ok:true,entries:mayhemFavorites.list()})));
ipcMain.handle('add-mayhem-favorite',wrap(key => {
  const match = matchReview.value.matches.find(m => m.key === key);
  return {ok:true,...mayhemFavorites.add(match)};
}));
ipcMain.handle('edit-mayhem-favorite',wrap(({id,note}) => {
  mayhemFavorites.note(id,note); return {ok:true};
}));
ipcMain.handle('remove-mayhem-favorite',wrap(id => {
  mayhemFavorites.remove(id); return {ok:true};
}));
function mayhemContext(key) {
  if (currentMode !== 'mayhem' || lastState?.status !== 'loading-screen' || !loading) throw Error('Augmenty meczu można zmieniać po rozpoczęciu Mayhem. Do symulacji użyj testera draftów.');
  const state = loadingSelectState(loading.allies.find(p => p.isMe));
  if (!state || (key && state.mayhemKey !== key)) throw Error('Mecz się zmienił. Otwórz augmenty ponownie.');
  return state;
}
ipcMain.handle('get-mayhem', wrap(() => {
  const state = mayhemContext(), alias = game.championsById.get(state.me.championId).alias;
  return { ok:true, matchKey:state.mayhemKey, alias, selection:mayhemSession.value.selection,
    autoHeadliner:automaticHeadliner(mayhemSession.value),headlinerSource:mayhemSession.value.headlinerSource||'manual',
    autoInventory:mayhemSession.value.autoInventory !== false,
    screenAugments:mayhemSession.value.screenSlots || [],
    screenUndoRevision:mayhemSession.value.screenUndoRevision || 0,
    ...mayhem.choicesCatalog(state.mayhemPool), items:draftlab.catalog(game,baseData,state,alias) };
}));
ipcMain.handle('set-mayhem', wrap(input => choiceWrites(async () => {
  if (!input?.matchKey) throw Error('Brak identyfikatora meczu. Otwórz augmenty ponownie.');
  const state = mayhemContext(input.matchKey), alias = game.championsById.get(state.me.championId).alias;
  if((input.screenUndoRevision||0)!==(mayhemSession.value.screenUndoRevision||0))throw Error('W międzyczasie cofnięto rozpoznanie. Otwórz edytor ponownie, aby zachować tę poprawkę.');
  if (input.autoInventory !== undefined && typeof input.autoInventory !== 'boolean') throw Error('Nieprawidłowy tryb odczytu ekwipunku.');
  const automatic = input.autoInventory ?? mayhemSession.value.autoInventory !== false;
  // Formularz otwarty przed zakupem nie może cofnąć świeżego odczytu z gry.
  const merged=augmentScreen.manualSelection(mayhemSession.value,input.selection,
    Array.isArray(input.knownScreenAugments)?input.knownScreenAugments:[]);
  if(input.headlinerEdited!==true)merged.selection.headliner=mayhemSession.value.selection.headliner;
  if(input.headlinerEdited===true&&typeof input.autoHeadliner!=='boolean')throw Error('Nieprawidłowy tryb wykrywania Headlinera.');
  if(input.headlinerEdited===true&&input.autoHeadliner)delete merged.selection.headliner;
  const selection = mayhem.validateSelection(automatic ? { ...merged.selection, owned:[], ownedBoots:null } : merged.selection,game,alias,state.mayhemPool);
  mayhemSession.set(state.mayhemKey,selection);
  mayhemSession.patch(state.mayhemKey,{screenIgnored:merged.screenIgnored,screenHistory:merged.screenHistory});
  mayhemSession.setAutoInventory(state.mayhemKey,automatic);
  if(input.headlinerEdited===true){mayhemSession.patch(state.mayhemKey,{autoHeadliner:input.autoHeadliner,headlinerSource:'manual'});headlinerConsensus.reset();}
  loading.visionMissed=false;
  loadingDirty = true; send(buildLoadingView());
  return { ok:true };
})));

ipcMain.handle('undo-augment-recognition',wrap(input=>choiceWrites(async()=>{
  if(!input?.matchKey||typeof input.token!=='string')throw Error('Brak rozpoznania do cofnięcia.');
  const state=mayhemContext(input.matchKey),next=augmentScreen.undoRecognition(mayhemSession.value,input.token);
  mayhemSession.patch(state.mayhemKey,{selection:next.selection,screenHistory:next.screenHistory,
    screenIgnored:next.screenIgnored,screenUndoRevision:next.screenUndoRevision});
  loading.visionMissed=false;offerTracker.reset();visionConsensus.reset();loadingDirty=true;visionStatus('undone');
  return {ok:true};
})));
function updateVisionOffer(value,invalidatedAt){
  if(!loading)return;
  if(invalidatedAt)loading.visionOfferAfter=invalidatedAt;
  if(value&&value.at<=(loading.visionOfferAfter||0))return;
  if(JSON.stringify(loading.visionOffer?.ids||null)!==JSON.stringify(value?.ids||null))loadingDirty=true;
  loading.visionOffer=value;
}
function visionStatus(status,error=null) {
  if(loading&&(Date.now()-(loading.visionSavedAt||0)>=5000||loading.visionStatus!==status)){
    loading.visionSavedAt=Date.now();
    writeJson(userFile('augment-diagnostics.json'),{version:app.getVersion(),at:Date.now(),status,error,
      ...(loading.visionDiagnostics||{}),focused:augmentClicks.active(),
      inputAgeMs:augmentClicks.lastSeen?Date.now()-augmentClicks.lastSeen:null,
      streak:offerTracker.streak,pending:offerTracker.pending?.id||null,
      saved:mayhemSession.value?.selection?.augments?.length||0});
  }
  if(!loading || loading.visionStatus===status&&loading.visionError===error&&!loadingDirty)return;
  loading.visionStatus=status;loading.visionError=error;loadingDirty=false;send(buildLoadingView());
}
function noteVisionRead(){
  const now=Date.now();loading.visionAt=now;
  if(now-(loading.visionReportedAt||0)>=2000){loading.visionReportedAt=now;loadingDirty=true;}
}
ipcMain.handle('augment-screen-source',wrap(async matchKey=>{
  const state=mayhemContext(matchKey);
  if(await lcu.get('/lol-gameflow/v1/gameflow-phase')!=='InProgress')throw Error('Odczyt obrazu działa podczas meczu Mayhem.');
  const handle=await augmentScreen.gameWindowHandle();
  if(!handle)throw Error('Nie widzę okna gry. Użyj okna bez ramek.');
  const sources=await require('electron').desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0},fetchWindowIcons:false});
  const source=augmentScreen.sourceForHandle(sources,handle);
  mayhemContext(matchKey);
  if(!source)throw Error('Nie mogę odczytać okna gry. Użyj trybu okna bez ramek.');
  visionToken=crypto.randomUUID();visionLastFrame=0;visionConsensus.reset();headlinerConsensus.reset();
  offerTracker.reset();
  if(visionConfig?.mode==='auto')augmentClicks.start(handle,event=>{
    if(loading&&event.type==='focus'&&!event.focused&&offerTracker.hasChoiceInput())loading.visionMissed=true;
    offerTracker.input(event);
    if(event.type==='down'||event.type==='cancel')updateVisionOffer(null,event.at);
    if(event.type==='focus'&&!event.focused){headlinerConsensus.reset();visionStatus('paused');}
    else if(loadingDirty)visionStatus(loading?.visionStatus||'scanning');
  });
  win.webContents.setBackgroundThrottling(false);
  return {ok:true,sourceId:source.id,token:visionToken,pool:state.mayhemPool};
}));
function stopVisionWorkers(){
  updateVisionOffer(null);
  visionToken='';visionConsensus.reset();headlinerConsensus.reset();
  windowsOcr.stop();augmentClicks.stop();offerTracker.reset();
  if(win&&!win.isDestroyed())win.webContents.setBackgroundThrottling(true);
}
ipcMain.handle('stop-augment-capture',stopVisionWorkers);
ipcMain.handle('set-augment-screen',wrap(input=>choiceWrites(async()=>{
  const state=mayhemContext(input?.matchKey);
  const config=augmentVision.validateConfig(input.config);
  writeJson(userFile('augment-screen.json'),config);visionConfig=config;visionRevision++;visionConsensus.reset();
  offerTracker.reset();
  if(!config.enabled)stopVisionWorkers();
  else if(config.mode!=='auto')augmentClicks.stop();
  loading.visionStatus=config.enabled?'waiting':'off';loading.visionError=null;send(buildLoadingView());
  return {ok:true,matchKey:state.mayhemKey};
})));
ipcMain.handle('augment-screen-problem',wrap(input=>{
  mayhemContext(input?.matchKey);visionConsensus.reset();offerTracker.reset();
  const error=typeof input.error==='string'?input.error.slice(0,220):'Nie udało się odczytać obrazu gry. Użyj okna bez ramek.';
  visionStatus('capture-error',error);return {ok:true};
}));
ipcMain.handle('augment-screen-preview',wrap(async input=>{
  const state=mayhemContext(input?.matchKey);
  if(!visionToken || input.token!==visionToken)throw Error('Otwórz odczyt ekranu ponownie.');
  const result=await windowsOcr.read(input.png);
  mayhemContext(input.matchKey);
  if(result?.error==='language')throw Error('Windows nie ma OCR po polsku ani angielsku. Dodaj odpowiedni język OCR w ustawieniach Windows.');
  if(!result?.readings)throw Error('OCR nie odczytał obrazu. Sprawdź, czy w zaznaczonym obszarze widać nazwę.');
  const detected=augmentVision.recognizeText(result.readings,visionCatalog,state.mayhemPool);
  return {ok:true,...detected,name:visionCatalog.find(a=>a.id===detected.id)?.name};
}));
ipcMain.handle('augment-screen-frame',wrap(async input=>{
  const state=mayhemContext(input?.matchKey);
  if(!visionConfig?.enabled || !visionToken || input.token!==visionToken || input.revision!==visionRevision
    || !Number.isSafeInteger(input.frame) || input.frame<=visionLastFrame)return {ok:false,error:'Nieaktualny odczyt obrazu.'};
  visionLastFrame=input.frame;
  if(visionConfig.mode==='auto')return readAutomaticAugment(input,state);
  if(!augmentVision.sameLayout(visionConfig,input.width,input.height)){visionConsensus.reset();visionStatus('layout');return {ok:true};}
  const result=await windowsOcr.read(input.png);
  return choiceWrites(async()=>{
  mayhemContext(input.matchKey);
  if(!visionConfig?.enabled || input.token!==visionToken || input.revision!==visionRevision)return {ok:false,error:'Nieaktualny odczyt.'};
    if(!result?.readings){visionConsensus.reset();visionStatus(result?.error==='language'?'language':'ocr-error');return {ok:true};}
    noteVisionRead();
  const matches=[augmentVision.recognizeText(result.readings,visionCatalog,state.mayhemPool)];
  const stable=visionConsensus.observe(`${state.mayhemKey}:${visionRevision}:${visionToken}`,matches);
  if(stable.some(Boolean)){
    try{
      const known=mayhemSession.value.screenSlots || [];
      const next=augmentScreen.reconcile(mayhemSession.value,[...known,...stable.filter(id=>id&&!known.includes(id))],game,state.mayhemPool,{token:crypto.randomUUID(),at:Date.now()});
      if(JSON.stringify(next)!==JSON.stringify(mayhemSession.value)){
        mayhemSession.patch(state.mayhemKey,{selection:next.selection,screenSlots:next.screenSlots,screenHistory:next.screenHistory});loadingDirty=true;
      }
    }catch{visionStatus('conflict');return {ok:true};}
  }
  visionStatus(matches.some(m=>m.status==='ambiguous')?'ambiguous':matches.some(m=>m.status==='match')?'reading':'unreadable');
  if(loadingDirty){loadingDirty=false;send(buildLoadingView());}
  return {ok:true};
  });
}));
async function readAutomaticAugment(input,state){
  if(loading?.visionOffer&&Date.now()-loading.visionOffer.at>=30000)updateVisionOffer(null);
  if(!augmentClicks.child)return {ok:false,error:'Ponawiam odczyt okna gry.'};
  const active=augmentClicks.active();
  if(!active&&!offerTracker.paused)offerTracker.input({type:'focus',focused:false,at:Date.now()});
  const focusedAtCapture=active&&input.at>=offerTracker.resumedAt;
  if(!focusedAtCapture&&!loading.visionOffer){headlinerConsensus.reset();visionStatus('paused');return {ok:true};}
  const grid=augmentOffers.readGrid(input.grid);
  loading.visionDiagnostics={...(loading.visionDiagnostics||{}),width:input.width,height:input.height,
    frame:input.frame,frameValid:!!grid?.valid,receivedAt:Date.now()};
  if(!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<640||input.height<400||input.width>10000||input.height>10000
    ||!Number.isSafeInteger(input.at)||Math.abs(Date.now()-input.at)>1500||!grid?.valid){
    if(!focusedAtCapture){offerTracker.preview(null,null,input.at);visionStatus('paused');return {ok:true};}
    offerTracker.reset();headlinerConsensus.reset();updateVisionOffer(null);visionStatus('unreadable-frame');return {ok:true};}
  const started=Date.now(),result=await windowsOcr.read(input.png),readMs=Date.now()-started;
  return choiceWrites(async()=>{
    mayhemContext(input.matchKey);
    if(!visionConfig?.enabled||visionConfig.mode!=='auto'||input.token!==visionToken||input.revision!==visionRevision)return {ok:false,error:'Nieaktualny odczyt.'};
    // Losing focus invalidates an unfinished gesture, including OCR results that
    // return after a focus change. The last verified offer remains visible.
    if(input.at<=offerTracker.cancelledAt)return {ok:true};
    const focusedNow=augmentClicks.active();
    if(!focusedAtCapture&&focusedNow)return {ok:true};
    if(focusedAtCapture&&!focusedNow){visionStatus('paused');return {ok:true};}
    const cropWidth=Math.min(1,input.height*16/9/input.width);
    const detected=result?.layouts&&augmentOffers.detectOffer({...result,crop:{x:(1-cropWidth)/2,y:0,w:cropWidth,h:1}},grid,visionCatalog,state.mayhemPool);
    if(!focusedNow){
      const ids=loading.visionOffer?.ids;
      if(offerTracker.preview(detected?.cards,ids,input.at))loading.visionOffer.at=input.at;
      else if(detected?.cards&&ids&&detected.cards.some((card,i)=>card.id!==ids[i]))updateVisionOffer(null);
      visionStatus('paused');
      return {ok:true};
    }
    if(!result?.layouts){offerTracker.reset();headlinerConsensus.reset();updateVisionOffer(null);visionStatus(result?.error==='language'?'language':'ocr-error');return {ok:true};}
    noteVisionRead();
    if(automaticHeadliner(mayhemSession.value)&&!mayhemSession.value.selection.headliner){
      const headliner=headlinerConsensus.observe(`${state.mayhemKey}:${visionToken}:${visionRevision}`,result,input.at);
      const patch=headliner&&applyHeadliner(mayhemSession.value,headliner);
      if(patch){mayhemSession.patch(state.mayhemKey,patch);loadingDirty=true;}
    }
    loading.visionDiagnostics={...loading.visionDiagnostics,readMs,
      titles:detected.candidates.length,cards:detected.cards?.length||0,
      recognizedIds:detected.candidates.map(c=>c.id)};
    const previousOffer=offerTracker.offer;
    const id=offerTracker.observe({...detected,grid,at:input.at,aspect:input.width/input.height,active:true,readMs});
    if(detected.cards||id)loading.visionMissed=false;
    else if(previousOffer&&!offerTracker.pending&&!offerTracker.down&&!augmentOffers.oldCardsVisible(grid,previousOffer))loading.visionMissed=true;
    updateVisionOffer(detected.cards&&offerTracker.streak>=2?{ids:detected.cards.map(c=>c.id),at:input.at}:null);
    let saved=false;
    if(id){
      try{
        const known=mayhemSession.value.screenSlots||[];
        const next=augmentScreen.reconcile(mayhemSession.value,[...new Set([...known,id])],game,state.mayhemPool,{token:crypto.randomUUID(),at:Date.now()});
        saved=next.selection.augments.includes(id)&&!mayhemSession.value.selection.augments.includes(id);
        if(JSON.stringify(next)!==JSON.stringify(mayhemSession.value)){
          mayhemSession.patch(state.mayhemKey,{selection:next.selection,screenSlots:next.screenSlots,screenHistory:next.screenHistory});loadingDirty=true;
        }
      }catch{visionStatus('conflict');return {ok:true};}
    }
    visionStatus(saved?'detected':offerTracker.pending?'confirming':detected.cards?offerTracker.streak>=2?'offers':'reading-offers':loading.visionMissed?'missed':detected.candidates.length?'partial':'scanning');
    if(loadingDirty){loadingDirty=false;send(buildLoadingView());}
    return {ok:true};
  });
}
app.on('before-quit',stopVisionWorkers);

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
  if(loading){if(settings.stats)fetchPlayerStats(loading);loadingDirty=true;send(buildLoadingView());}
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
  desktop = createDesktop({ app, win, Tray, Menu, nativeImage, globalShortcut, screen:require('electron').screen,settings,
    onViewMode:compact=>win.webContents.send('view-mode',compact),
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
