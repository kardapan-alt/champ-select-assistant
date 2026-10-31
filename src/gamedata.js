// Dane gry (championy, runy, itemy, czary) pobierane z lokalnego klienta, więc zawsze pasują do patcha.

const MASTERY_PATH = '/lol-champion-mastery/v1/local-player/champion-mastery';

function emptyGameData() {
  return {
    championsById: new Map(), championsByAlias: new Map(), styles: new Map(),
    perks: new Map(), items: new Map(), spells: new Map(), owned: new Set(), mastery: new Map(),
  };
}

function buildGameData({ champions, perkstyles, perks, items, spells, owned, mastery }) {
  const g = emptyGameData();
  for (const c of champions || []) {
    if (c.id > 0) {
      g.championsById.set(c.id, c);
      g.championsByAlias.set(c.alias, c);
    }
  }
  for (const s of (perkstyles && perkstyles.styles) || []) g.styles.set(s.id, s);
  for (const p of perks || []) g.perks.set(p.id, p);
  for (const i of items || []) g.items.set(i.id, i);
  for (const s of spells || []) g.spells.set(s.id, s);
  for (const c of owned || []) if (c.id > 0) g.owned.add(c.id);
  g.mastery = masteryMap(mastery);
  return g;
}

// Maestria z kilku list naraz: przy tym samym championie wygrywa wpis z większą liczbą punktów.
function masteryMap(...lists) {
  const out = new Map();
  for (const list of lists) {
    for (const m of Array.isArray(list) ? list : []) {
      if (!m || !(m.championId > 0)) continue;
      const prev = out.get(m.championId);
      if (!prev || (m.championPoints || 0) > (prev.championPoints || 0)) out.set(m.championId, m);
    }
  }
  return out;
}

// Endpoint local-player nie zawsze zwraca wszystkie championy, więc dokładamy maestrię z kolekcji gracza.
// Lista maestrii z odpowiedzi: tablica albo obiekt z tablicą (różne wersje klienta).
const masteryList = (res) => (Array.isArray(res) ? res : res && Array.isArray(res.masteries) ? res.masteries : res && Array.isArray(res.championMasteries) ? res.championMasteries : null);

function masteryPaths(me) {
  const paths = [MASTERY_PATH];
  if (me && me.puuid) paths.push(`/lol-champion-mastery/v1/${me.puuid}/champion-mastery`, `/lol-collections/v1/inventories/${me.puuid}/champion-mastery`);
  if (me && me.summonerId) paths.push(`/lol-collections/v1/inventories/${me.summonerId}/champion-mastery`);
  return paths;
}

async function loadMastery(lcu) {
  const me = await lcu.get('/lol-summoner/v1/current-summoner').catch(() => null);
  const paths = masteryPaths(me);
  const lists = await Promise.all(paths.map((p) => lcu.get(p).then(masteryList).catch(() => null)));
  return { map: masteryMap(...lists), raw: Object.fromEntries(paths.map((p, i) => [p, lists[i] ? lists[i].length : null])) };
}

async function loadGameData(lcu) {
  const base = '/lol-game-data/assets/v1';
  const [champions, perkstyles, perks, items, spells, owned, mastery] = await Promise.all([
    lcu.get(`${base}/champion-summary.json`),
    lcu.get(`${base}/perkstyles.json`),
    lcu.get(`${base}/perks.json`),
    lcu.get(`${base}/items.json`),
    lcu.get(`${base}/summoner-spells.json`),
    lcu.get('/lol-champions/v1/owned-champions-minimal'),
    loadMastery(lcu),
  ]);
  if (!champions) throw new Error('Nie udało się pobrać listy championów z klienta');
  const g = buildGameData({ champions, perkstyles, perks, items, spells, owned });
  g.mastery = mastery.map;
  return g;
}

module.exports = { loadGameData, loadMastery, masteryPaths, masteryList, buildGameData, emptyGameData, masteryMap, MASTERY_PATH };
