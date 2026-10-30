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

function masteryMap(list) {
  return new Map((Array.isArray(list) ? list : []).map((m) => [m.championId, m]));
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
    lcu.get(MASTERY_PATH),
  ]);
  if (!champions) throw new Error('Nie udało się pobrać listy championów z klienta');
  return buildGameData({ champions, perkstyles, perks, items, spells, owned, mastery });
}

module.exports = { loadGameData, buildGameData, emptyGameData, masteryMap, MASTERY_PATH };
