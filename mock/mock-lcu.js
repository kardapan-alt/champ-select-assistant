// Symulowany klient LoL do testów bez gry: node mock/mock-lcu.js, potem LCU_MOCK=http://127.0.0.1:2999 npm start
// Kroki scenariusza: GET /__step?n=0..6 (5 = faza banów, Twoja kolej; 6 = ekran ładowania)
const http = require('http');
const data = require('../data/champions.json');
const names = require('./names');

const aliases = [...Object.keys(data.champions), 'Zoe', 'KSante', 'Rumble'];
const champions = aliases.map((alias, i) => ({
  id: i + 1, alias, name: alias.replace(/([a-z])([A-Z])/g, '$1 $2'),
  roles: { Zoe: ['mage'], KSante: ['tank'], Rumble: ['fighter', 'mage'] }[alias] || [],
}));
const id = (alias) => champions.find((c) => c.alias === alias).id;

// Uproszczone drzewka run z identyfikatorami użytymi w danych.
const statMods = [
  { type: 'kStatMod', perks: [5008, 5005, 5007] },
  { type: 'kStatMod', perks: [5008, 5010, 5001] },
  { type: 'kStatMod', perks: [5011, 5013, 5001] },
];
const style = (sid, name, rows) => ({ id: sid, name, slots: [{ type: 'kKeyStone', perks: rows[0] }, ...rows.slice(1).map((p) => ({ type: 'kMixedRegularSplashable', perks: p })), ...statMods] });
const perkstyles = { styles: [
  style(8000, 'Precyzja', [[8005, 8008, 8021, 8010], [9101, 9111, 8009], [9104, 9105, 9103], [8014, 8017, 8299]]),
  style(8100, 'Dominacja', [[8112, 8128, 9923], [8126, 8139, 8143], [8137, 8140, 8141], [8135, 8105, 8106]]),
  style(8200, 'Czarnoksięstwo', [[8214, 8229, 8230], [8224, 8226, 8275], [8210, 8234, 8233], [8237, 8232, 8236]]),
  style(8400, 'Determinacja', [[8437, 8439, 8465], [8446, 8463, 8401], [8429, 8444, 8473], [8451, 8453, 8242]]),
  style(8300, 'Inspiracja', [[8351, 8360, 8369], [8306, 8304, 8321], [8313, 8352, 8345], [8347, 8410, 8316]]),
] };
const perks = perkstyles.styles.flatMap((s) => s.slots.flatMap((sl) => sl.perks)).map((pid) => ({ id: pid, name: names.perks[pid] || `Runa ${pid}`, iconPath: `/lol-game-data/assets/v1/perk-images/${pid}.png` }));
const itemIds = new Set(JSON.stringify(data).match(/\b[1-9]\d{3}\b/g).map(Number));
const items = [...itemIds].map((iid) => ({ id: iid, name: names.items[iid] || `Item ${iid}`, iconPath: `/lol-game-data/assets/ASSETS/Items/Icons2D/${iid}.png` }));
const spells = [[4, 'Błysk'], [14, 'Podpalenie'], [12, 'Teleportacja'], [7, 'Uzdrowienie'], [3, 'Wyczerpanie'], [11, 'Porażenie'], [6, 'Duch'], [21, 'Bariera'], [1, 'Oczyszczenie']]
  .map(([sid, name]) => ({ id: sid, name, iconPath: `/lol-game-data/assets/DATA/Spells/Icons2D/${sid}.png` }));

let step = Number(process.env.STEP || 0);
const pages = [{ id: 1, name: 'Moja strona', isDeletable: true }];
let mySpells = { spell1Id: 4, spell2Id: 14 };
let itemSets = { accountId: 42, timestamp: 0, itemSets: [{ uid: 'own-1', title: 'Mój zestaw', type: 'custom', blocks: [] }] };

function session() {
  const ally = (cellId, pos, alias, locked) => ({ cellId, assignedPosition: pos, championId: alias && locked ? id(alias) : 0, championPickIntent: alias && !locked ? id(alias) : 0, ...(cellId === 2 ? mySpells : {}) });
  const s = step;
  const myTeam = [
    ally(0, 'top', 'Darius', true),
    ally(1, 'jungle', 'LeeSin', true),
    ally(2, 'middle', s >= 1 ? 'Ahri' : null, s >= 2),
    ally(3, 'bottom', s >= 1 ? 'Jinx' : 'Jinx', s >= 2),
    ally(4, 'utility', s >= 2 ? 'Thresh' : null, s >= 2),
  ];
  const enemy = (cellId, alias, visible) => ({ cellId, championId: visible ? id(alias) : 0 });
  // Krok 4: skład prawie cały AP (Rumble, Amumu, Leona, Caitlyn, Lux).
  const theirTeam = s === 4
    ? [enemy(5, 'Rumble', true), enemy(6, 'Amumu', true), enemy(7, 'Lux', true), enemy(8, 'Caitlyn', true), enemy(9, 'Leona', true)]
    : [enemy(5, 'Mordekaiser', true), enemy(6, 'Warwick', true), enemy(7, 'Zed', s >= 1), enemy(8, 'Caitlyn', s >= 2), enemy(9, 'Soraka', s >= 2)];
  const done = (cell) => myTeam.concat(theirTeam).find((p) => p.cellId === cell).championId > 0;
  const actions = [[...myTeam, ...theirTeam].map((p) => ({ actorCellId: p.cellId, type: 'pick', championId: p.championId || p.championPickIntent || 0, completed: done(p.cellId) }))];
  if (s === 5) {
    // Faza banów: nikt nic nie zablokował, Ty hoverujesz Ahri, sojusznicy deklarują picki.
    myTeam.forEach((p) => { p.championId = 0; });
    myTeam[2].championPickIntent = id('Ahri');
    myTeam[3].championPickIntent = id('Jinx');
    myTeam[4].championPickIntent = id('Thresh');
    theirTeam.forEach((p) => { p.championId = 0; });
    const bans = [...myTeam, ...theirTeam].map((p) => ({ actorCellId: p.cellId, type: 'ban', championId: 0, completed: false, isInProgress: true }));
    return { localPlayerCellId: 2, myTeam, theirTeam, actions: [bans], bans: { myTeamBans: [], theirTeamBans: [] }, timer: { phase: 'BAN_PICK' } };
  }
  actions.unshift([{ actorCellId: 0, type: 'ban', championId: id('Yasuo'), completed: true }, { actorCellId: 5, type: 'ban', championId: id('Syndra'), completed: true }]);
  return { localPlayerCellId: 2, myTeam, theirTeam, actions, bans: { myTeamBans: [], theirTeamBans: [] }, timer: { phase: s >= 3 ? 'FINALIZATION' : 'BAN_PICK' } };
}

// Ekran ładowania: zmyślone Riot ID graczy (nie dotyczą prawdziwych osób).
const LOADING = {
  teamOne: [['Kowal Topu', 'EUNE', 'Darius', 'TOP'], ['Leśny Duch', '1234', 'LeeSin', 'JUNGLE'], ['Daniel', 'EUNE', 'Ahri', 'MIDDLE'], ['Strzał w Kolano', 'PL1', 'Jinx', 'BOTTOM'], ['Hak i Latarnia', 'EUNE', 'Thresh', 'UTILITY']],
  teamTwo: [['Topowy Młot', 'EUNE', 'Mordekaiser', 'TOP'], ['Wilk z Zaun', 'EUW', 'Warwick', 'JUNGLE'], ['Cień Midu', 'EUNE', 'Zed', 'MIDDLE'], ['Pułapkarka', 'PL2', 'Caitlyn', 'BOTTOM'], ['Gwiezdna', 'EUNE', 'Soraka', 'UTILITY']],
};
function gameflowSession() {
  const team = (list) => list.map(([gameName, tagLine, alias, pos]) => ({
    puuid: gameName === 'Daniel' ? 'puuid-me' : `puuid-${gameName}`, gameName, tagLine, championId: id(alias), selectedPosition: pos,
  }));
  return { phase: 'InProgress', gameData: { gameId: 777, teamOne: team(LOADING.teamOne), teamTwo: team(LOADING.teamTwo) } };
}

function svgIcon(label) {
  const hue = [...label].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="hsl(${hue} 45% 35%)"/><text x="32" y="40" font-size="20" text-anchor="middle" fill="#fff" font-family="sans-serif">${label.slice(0, 3)}</text></svg>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = (obj, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (p === '/__step') { step = Number(url.searchParams.get('n')); return json({ step }); }
    if (p === '/__pages') return json({ pages, mySpells, itemSets });
    if (p.endsWith('.png')) {
      const m = /champion-icons\/(\d+)\.png/.exec(p);
      const assetId = Number(p.split('/').pop().replace('.png', ''));
      const name = names.items[assetId] || names.perks[assetId] || spells.find((x) => x.id === assetId)?.name;
      const initials = name ? name.replace(/[^A-Za-zĄ-ż ]/g, '').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 3) : String(assetId);
      const label = m ? champions[Number(m[1]) - 1].alias : initials;
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      return res.end(svgIcon(label));
    }
    switch (`${req.method} ${p}`) {
      case 'GET /lol-gameflow/v1/gameflow-phase': return json(step < 0 ? 'Lobby' : step === 6 ? 'InProgress' : 'ChampSelect');
      case 'GET /lol-gameflow/v1/session': return json(gameflowSession());
      case 'GET /lol-summoner/v1/current-summoner': return json({ puuid: 'puuid-me', gameName: 'Daniel', tagLine: 'EUNE', summonerId: 1001, accountId: 42 });
      case 'GET /riotclient/region-locale': return json({ region: 'EUNE', locale: 'pl_PL', webRegion: 'eune' });
      case 'GET /lol-champ-select/v1/session': return json(session());
      case 'GET /lol-game-data/assets/v1/champion-summary.json': return json([{ id: -1, alias: 'None', name: 'None' }, ...champions]);
      case 'GET /lol-game-data/assets/v1/perkstyles.json': return json(perkstyles);
      case 'GET /lol-game-data/assets/v1/perks.json': return json(perks);
      case 'GET /lol-game-data/assets/v1/items.json': return json(items);
      case 'GET /lol-game-data/assets/v1/summoner-spells.json': return json(spells);
      case 'GET /lol-champions/v1/owned-champions-minimal': return json(champions.filter((c) => c.alias !== 'Lux'));
      case 'GET /lol-champion-mastery/v1/local-player/champion-mastery':
        return json(champions.filter((c, i) => i % 3 !== 0).map((c, i) => ({ championId: c.id, championLevel: 1 + (i * 7) % 10, championPoints: ((i * 7919) % 400) * 1000 + 1200 })));
      case 'GET /lol-perks/v1/pages': return json(pages);
      case 'GET /lol-perks/v1/currentpage': return json(pages[pages.length - 1]);
      case 'POST /lol-perks/v1/pages': {
        if (pages.length >= 2) return json({ message: 'Max pages reached' }, 400);
        const page = { id: Date.now(), isDeletable: true, ...JSON.parse(body) };
        pages.push(page);
        return json(page);
      }
      case 'GET /lol-item-sets/v1/item-sets/1001/sets': return json(itemSets);
      case 'PUT /lol-item-sets/v1/item-sets/1001/sets': itemSets = JSON.parse(body); return json({});
      case 'PATCH /lol-champ-select/v1/session/my-selection': mySpells = JSON.parse(body); return json({});
      default:
        if (req.method === 'DELETE' && p.startsWith('/lol-perks/v1/pages/')) {
          const i = pages.findIndex((x) => String(x.id) === p.split('/').pop());
          if (i >= 0) pages.splice(i, 1);
          return json({});
        }
        return json({ message: 'not found' }, 404);
    }
  });
});
server.listen(Number(process.env.PORT || 2999), '127.0.0.1', () => console.log(`Mock LCU na http://127.0.0.1:${server.address().port}`));
module.exports = server;
