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

function inventoryOf(items, game, alias) {
  if (!Array.isArray(items) || items.length > 12) return null;
  const slots = new Set(), inventory = [];
  for (const raw of items) {
    if (!raw || !Number.isInteger(raw.itemID) || raw.itemID < 0 || !Number.isInteger(raw.slot) || raw.slot < 0 || raw.slot > 11) return null;
    if (slots.has(raw.slot)) return null;
    slots.add(raw.slot);
    if (!raw.itemID || raw.slot > 5) continue; // Mayhem: sześć slotów, bez trinketu.
    const id = raw.itemID, item = game.items.get(id);
    const consumable = raw.consumable === true || item?.categories?.includes('Consumable');
    const boots = isBootItem(id,game);
    const upgrades = (item?.to || []).filter(next => itemAvailable(next,game,'mayhem',alias));
    const finished = !consumable && ownedAvailable(id,game,alias)
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

class LiveClient {
  constructor(read = getJson) { this.read = read; }
  async inventory(me, alias, pool, game) {
    // Porównujemy aktywnego gracza z listą graczy. Nie wybieramy pierwszej
    // postaci o pasującej nazwie (lustra są możliwe, np. w grach niestandardowych).
    const [active, players, stats] = await Promise.all([
      this.read('/liveclientdata/activeplayer'), this.read('/liveclientdata/playerlist'), this.read('/liveclientdata/gamestats'),
    ]);
    if (!active || !Array.isArray(players) || !stats) return { status:'waiting' };
    if (stats.gameMode !== pool || !Number.isFinite(stats.gameTime) || stats.gameTime < 0) return { status:'mismatch' };
    const expected = me?.gameName && me?.tagLine ? `${me.gameName}#${me.tagLine}` : '';
    if (!sameId(riotId(active),expected)) return { status:'mismatch' };
    const matches = players.filter(p => sameId(riotId(p),expected));
    const own = matches.length === 1 ? matches[0] : null;
    if (!own || own.rawChampionName !== `game_character_displayname_${alias}`) return { status:'mismatch' };
    const inventory = inventoryOf(own.items,game,alias);
    return inventory ? { status:'live', inventory } : { status:'invalid' };
  }
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
