const https = require('https');
const { isBootItem } = require('./rolequests');
const { itemAvailable } = require('./itemrules');
const { ownedAvailable } = require('./mayhem');

// Tylko lokalne, publiczne API uruchomionej gry. Bez tokenu LCU i bez przekierowań.
function getJson(path) {
  return new Promise(resolve => {
    const request = https.get({ hostname:'127.0.0.1', port:2999, path, rejectUnauthorized:false }, response => {
      let body = '';
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 1024 * 1024) request.destroy();
      });
      response.on('error', () => resolve(null));
      response.on('end', () => {
        try { resolve(response.statusCode === 200 ? JSON.parse(body) : null); }
        catch { resolve(null); }
      });
    });
    const timer = setTimeout(() => request.destroy(), 1800);
    request.on('close', () => { clearTimeout(timer); resolve(null); });
    request.on('error', () => resolve(null));
  });
}

const riotId = p => p?.riotId || (p?.riotIdGameName && p?.riotIdTagLine ? `${p.riotIdGameName}#${p.riotIdTagLine}` : p?.summonerName || '');
const sameId = (a,b) => !!a && !!b && a.normalize('NFC').toLowerCase() === b.normalize('NFC').toLowerCase();
// Live Client używa obu kluczy lokalizacji (m.in. Character_Aatrox_Name).
// Nadal wymagamy dokładnego aliasu z LCU oraz osobnej zgodności Riot ID.
const matchesChampion = (player,alias) => typeof alias==='string' && !!alias
  && [ `game_character_displayname_${alias}`, `Character_${alias}_Name` ].includes(player?.rawChampionName);

function inventoryOf(items, game, alias, mode = 'mayhem', sideBoots = false) {
  if (!Array.isArray(items) || items.length > 12) return null;
  const slots = new Set(), inventory = [];
  for (const raw of items) {
    if (!raw || !Number.isInteger(raw.itemID) || raw.itemID < 0 || !Number.isInteger(raw.slot) || raw.slot < 0 || raw.slot > 11) return null;
    if (slots.has(raw.slot)) return null;
    slots.add(raw.slot);
    // Dodatkowe buty uwzględniamy dopiero, gdy API faktycznie pokazuje je
    // poza sześcioma zwykłymi slotami. Slot 6 jest zarezerwowany dla trinketu.
    if (!raw.itemID || (raw.slot > 5 && !(sideBoots && raw.slot > 6 && isBootItem(raw.itemID,game)))) continue;
    const id = raw.itemID, item = game.items.get(id);
    const consumable = raw.consumable === true || item?.categories?.includes('Consumable');
    const boots = isBootItem(id,game);
    const upgrades = (item?.to || []).filter(next => itemAvailable(next,game,mode,alias));
    const finished = !consumable && ownedAvailable(id,game,alias,mode)
      && (!upgrades.length || [773041,773513,773514,773515].includes(id) || (boots && ![1001,2422].includes(id)));
    inventory.push({ id, slot:raw.slot, name:item?.name || String(raw.displayName || `Przedmiot ${id}`).slice(0,100),
      icon:item?.iconPath ? `lcuasset://lcu${item.iconPath.toLowerCase()}` : '',
      count:Number.isInteger(raw.count) && raw.count > 0 ? Math.min(raw.count,99) : 1,
      kind:!item ? 'unknown' : consumable ? 'consumable' : finished ? boots ? 'boots' : 'finished' : 'component' });
  }
  inventory.sort((a,b) => a.slot-b.slot);
  return { items:inventory, owned:inventory.filter(i=>i.kind==='finished').map(i=>i.id),
    ownedBoots:inventory.find(i=>i.kind==='boots')?.id || null };
}

function ownSnapshot(snapshot, me, alias, pool) {
  // Mirror matches can contain the same champion twice. Check the local Riot ID as well.
  const {activePlayer:active,allPlayers:players,gameData:stats}=snapshot || {};
  if (!active || !Array.isArray(players) || !stats) return {status:'waiting'};
  if (stats.gameMode!==pool || !Number.isFinite(stats.gameTime) || stats.gameTime<0) return {status:'mismatch'};
  const expected=me?.gameName && me?.tagLine ? `${me.gameName}#${me.tagLine}` : '';
  if (!sameId(riotId(active),expected)) return {status:'mismatch'};
  const matches=players.filter(p=>sameId(riotId(p),expected));
  const own=matches.length===1 ? matches[0] : null;
  if (!own || !matchesChampion(own,alias)) return {status:'mismatch'};
  return {status:'live',active,players,stats,own};
}
class LiveClient {
  constructor(read = getJson) { this.read = read; }
  async gameClock(me,alias,pool) {
    const result=ownSnapshot(await this.read('/liveclientdata/allgamedata'),me,alias,pool);
    return result.status==='live' ? result.stats.gameTime : null;
  }
  async inventory(me, alias, pool, game, options = {}) {
    const snapshot=await this.read('/liveclientdata/allgamedata');
    const result=ownSnapshot(snapshot,me,alias,pool);
    if (result.status!=='live') return result;
    const {active,players,stats,own}=result;
    const mode = options.mode || (pool === 'CLASSIC' ? 'classic' : pool === 'ARAM' ? 'aram' : 'mayhem');
    const inventory = inventoryOf(own.items,game,alias,mode,options.sideBoots);
    if (!inventory) return { status:'invalid' };
    const gold = Number.isFinite(active.currentGold) && active.currentGold >= 0 ? Math.floor(active.currentGold) : null;
    const enemies = enemyInventories(players,own,options.enemies,game,mode);
    const scoreboard = options.allies && ['ORDER','CHAOS'].includes(own.team) ? {
      allies: teamScores(players, own.team, options.allies, game),
      enemies: teamScores(players, own.team === 'ORDER' ? 'CHAOS' : 'ORDER', options.enemies, game),
    } : null;
    const outcome=require('./match-result').fromLiveEvents(snapshot.events,stats.gameTime);
    const training = options.training === true ? {trainingScores:require('./training').trainingScores(own.scores)} : {};
    return { status:'live', inventory, gold, enemies, ...(scoreboard ? {scoreboard} : {}), gameTime:stats.gameTime, ...training, ...(outcome?{outcome}:{}) };
  }
}

// Public in-game totals only. Keep the two teams separate in a mirror match
// and skip ambiguous champions. Never copy an account identity from live data.
function teamScores(players, team, expected = [], game) {
  const teammates = players.filter(p => p.team === team);
  const rows = {};
  const count = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
  for (const player of expected) {
    const id = player.championId;
    const alias = game.championsById.get(id)?.alias;
    if (!alias || expected.filter(p => p.championId === id).length !== 1) continue;
    const matches = teammates.filter(p => matchesChampion(p, alias));
    if (matches.length !== 1) continue;
    const [match] = matches;
    if (!player.anonymous && !sameId(riotId(match), `${player.gameName}#${player.tagLine}`)) continue;
    const {kills, deaths, assists, creepScore} = match.scores || {};
    const kda = [kills,deaths,assists].every(v => count(v) !== null) ? [kills,deaths,assists] : null;
    const cs = count(creepScore);
    if (kda || cs !== null) rows[id] = {kda, cs};
  }
  return rows;
}

function enemyInventories(players, own, expected, game, mode) {
  if (!['ORDER','CHAOS'].includes(own.team) || !Array.isArray(expected) || !expected.length) return null;
  const otherTeam = own.team === 'ORDER' ? 'CHAOS' : 'ORDER';
  const opponents = players.filter(p=>p.team === otherTeam);
  if (opponents.length !== expected.length) return null;
  const used = new Set(), result = [];
  for (const enemy of expected) {
    const id = enemy.gameName && enemy.tagLine ? `${enemy.gameName}#${enemy.tagLine}` : '';
    const alias = game.championsById.get(enemy.championId)?.alias;
    // An anonymous opponent's champion can still be matched on the public
    // scoreboard when unique on their team. No account identity is needed.
    if (!alias) return null;
    const matches = enemy.anonymous ? opponents.filter(p=>matchesChampion(p,alias)) : opponents.filter(p=>sameId(riotId(p),id));
    const found = matches.length === 1 ? matches[0] : null;
    if (!found || used.has(found) || !alias || !matchesChampion(found,alias)) return null;
    const inventory = inventoryOf(found.items,game,alias,mode,true);
    if (!inventory) return null;
    used.add(found);
    result.push({ championId:enemy.championId, alias, items:inventory.items });
  }
  // Nazwy kont nie opuszczają warstwy weryfikacji odczytu.
  return result;
}

// Komponenty są widoczne w ekwipunku, ale nie zajmują miejsc gotowych itemów
// w planie. Każdy komponent liczymy tylko raz, także w rozgałęzionej recepturze.
function componentCredit(id, inventory, game) {
  const remaining = (inventory?.items || []).filter(i=>i.kind==='component').map(i=>i.id);
  function visit(target, seen = new Set()) {
    if (seen.has(target)) return 0;
    const index = remaining.indexOf(target);
    if (index >= 0) { remaining.splice(index,1); return game.items.get(target)?.priceTotal || 0; }
    const next = new Set([...seen,target]);
    return (game.items.get(target)?.from || []).reduce((sum,part)=>sum+visit(part,next),0);
  }
  return visit(id);
}

module.exports = { LiveClient, inventoryOf, componentCredit };
