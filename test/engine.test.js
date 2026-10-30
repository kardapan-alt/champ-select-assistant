const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { LcuClient } = require('../src/lcu');
const { loadGameData } = require('../src/gamedata');
const engine = require('../src/engine');
const data = require('../data/champions.json');

process.env.PORT = '0';
const server = require('../mock/mock-lcu');

let lcu;
let game;
const step = (n) => lcu.get(`/__step?n=${n}`);

test.before(async () => {
  await new Promise((r) => (server.listening ? r() : server.once('listening', r)));
  lcu = new LcuClient({ protocol: 'http', host: '127.0.0.1', port: server.address().port, password: 'x' });
  game = await loadGameData(lcu);
});
test.after(() => server.close());

test('dane: wszystkie presety run i itemy istnieją', () => {
  for (const [alias, c] of Object.entries(data.champions)) {
    if (typeof c.runes === 'string') assert.ok(data.runePresets[c.runes], `${alias}: brak presetu ${c.runes}`);
    assert.ok(c.roles.length, `${alias}: brak ról`);
    for (const ref of [...c.counters, ...c.weakVs]) assert.ok(data.champions[ref], `${alias}: nieznany champion ${ref}`);
  }
});

test('dane: synergie i tiery wskazują na istniejących championów', () => {
  for (const [a, b] of data.synergies) assert.ok(data.champions[a] && data.champions[b], `${a}+${b}`);
  for (const list of Object.values(data.meta.tiers)) for (const a of list) assert.ok(data.champions[a], a);
});

test('odczyt sesji i sugestie dla mida', async () => {
  await step(0);
  const state = engine.readSession(await lcu.get('/lol-champ-select/v1/session'));
  assert.equal(state.me.position, 'middle');
  assert.equal(state.allLocked, false);
  assert.equal(state.enemies.filter((e) => e.championId).length, 2);
  const { list, blind } = engine.suggestPicks(state, game, data);
  assert.equal(list.length, 10);
  assert.equal(blind, true, 'Zed jeszcze niewidoczny, więc blind pick');
  assert.ok(list.every((s) => typeof s.mastery.points === 'number'));
  assert.ok(list.some((s) => s.mastery.points > 0), 'maestria z klienta');
  const names = list.map((s) => s.alias);
  for (const s of list) assert.ok(data.champions[s.alias].roles.includes('middle'));
  assert.ok(!names.includes('Syndra'), 'zbanowany champion nie powinien być sugerowany');
  assert.ok(!names.includes('Lux'), 'nieposiadany champion nie powinien być sugerowany');
  console.log('sugestie:', list.map((s) => `${s.name} ${s.score} [${s.reasons.map((r) => r.text).join('; ')}]`));
});

test('kontra na widocznego przeciwnika z linii podnosi wynik', async () => {
  await step(1);
  const state = engine.readSession(await lcu.get('/lol-champ-select/v1/session'));
  const { list, blind, laneOpponent } = engine.suggestPicks(state, game, data);
  assert.equal(blind, false);
  assert.equal(laneOpponent, 'Zed');
  const zedCounters = list.filter((s) => s.reasons.some((r) => r.good && r.text.includes('Zed')));
  assert.ok(zedCounters.length > 0, 'powinien być pick kontrujący Zeda');
  assert.ok(list.every((s) => s.alias !== 'Zed'));
});

test('runy są poprawne względem drzewek z klienta', () => {
  for (const alias of Object.keys(data.champions)) {
    const page = engine.runePageFor(alias, game, data);
    assert.equal(page.selectedPerkIds.length, 9, alias);
    const primary = game.styles.get(page.primaryStyleId);
    const sub = game.styles.get(page.subStyleId);
    assert.notEqual(primary.id, sub.id);
    page.selectedPerkIds.slice(0, 4).forEach((id, i) => assert.ok(primary.slots[i].perks.includes(id), `${alias} runa ${id}`));
    const secSlots = page.selectedPerkIds.slice(4, 6).map((id) => sub.slots.findIndex((s, i) => i > 0 && i < 4 && s.perks.includes(id)));
    assert.ok(secSlots.every((i) => i > 0) && secSlots[0] !== secSlots[1], `${alias} runy dodatkowe`);
  }
});

test('nieistniejąca runa zostaje zastąpiona', () => {
  const page = engine.normalizeRunes({ p: 8100, s: 8200, perks: [99999, 8143, 1, 8135, 8226, 8236], shards: [5008, 5008, 5011] }, game);
  assert.equal(page.perks[0], 8112);
  assert.equal(page.perks[2], 8137);
});

const vs = (enemies) => ({ enemies: enemies.map((alias) => ({ championId: game.championsByAlias.get(alias).id })) });
const defensiveCount = (build, tag) => build.items.filter((i) => data.itemPools[Object.keys(data.itemPools).find((k) => data.itemPools[k].some((x) => x.id === i.id))]?.find((x) => x.id === i.id)?.tags[tag] >= 0.8).length;

test('build po zlockowaniu i antyleczenie', async () => {
  await step(2);
  const state = engine.readSession(await lcu.get('/lol-champ-select/v1/session'));
  assert.equal(state.allLocked, true);
  const build = engine.buildFor('Ahri', state, game, data);
  assert.equal(build.items.length, 5);
  assert.ok(build.items.some((s) => s.why === 'antyleczenie'), 'Soraka/Warwick/Mordekaiser leczą');
  const unknown = engine.buildFor('Zoe', state, game, data);
  assert.equal(unknown.estimated, true);
  assert.equal(unknown.items.length, 5);
});

test('skład prawie cały AP daje kilka itemów na MR', () => {
  const enemies = ['Rumble', 'Amumu', 'Leona', 'Caitlyn', 'Lux'];
  for (const alias of ['Darius', 'Ornn', 'Jinx', 'Ahri', 'Zed']) {
    const b = engine.buildFor(alias, vs(enemies), game, data);
    console.log(alias, b.enemy.apPercent + '% AP', b.boots.id, b.items.map((i) => `${i.id}(${i.why})`).join(', '));
    assert.ok(b.enemy.apPercent >= 70, 'Rumble rozpoznany jako AP');
    assert.ok(defensiveCount(b, 'mr') >= (['Darius', 'Ornn'].includes(alias) ? 2 : 1), `${alias}: za mało MR`);
  }
  assert.equal(engine.buildFor('Darius', vs(enemies), game, data).boots.id, data.boots.vsAp);
});

test('skład AD daje armor, zbalansowany nie przesadza z obroną', () => {
  const ad = engine.buildFor('Ornn', vs(['Darius', 'Zed', 'Jinx', 'LeeSin', 'Pyke']), game, data);
  console.log('Ornn vs AD', ad.boots.id, ad.items.map((i) => `${i.id}(${i.why})`).join(', '));
  assert.ok(defensiveCount(ad, 'armor') >= 2);
  assert.equal(defensiveCount(ad, 'mr'), 0);
  const mixed = engine.buildFor('Jinx', vs(['Garen', 'Ahri', 'Graves', 'Caitlyn', 'Lulu']), game, data);
  console.log('Jinx vs mix', mixed.items.map((i) => `${i.id}(${i.why})`).join(', '));
  assert.ok(defensiveCount(mixed, 'mr') + defensiveCount(mixed, 'armor') <= 1);
});

test('blind pick promuje postacie z małą liczbą kontr', () => {
  const state = { me: { position: 'middle' }, allies: [], enemies: [], bans: new Set() };
  const { list, blind } = engine.suggestPicks(state, game, data);
  assert.equal(blind, true);
  const avg = (arr) => arr.reduce((a, x) => a + engine.counterCount(x.alias, data), 0) / arr.length;
  const all = Object.keys(data.champions).filter((a) => data.champions[a].roles.includes('middle')).map((alias) => ({ alias }));
  console.log('blind mid:', list.slice(0, 5).map((s) => `${s.name}(${s.tier}, ${engine.counterCount(s.alias, data)} kontr)`).join(', '));
  assert.ok(avg(list.slice(0, 5)) <= avg(all), 'top 5 ma mniej kontr niż średnia');
});

test('synergia podbija pick', () => {
  const ally = (alias, position) => ({ championId: game.championsByAlias.get(alias).id, position, isMe: false, locked: true });
  const state = { me: { position: 'top' }, allies: [ally('Yasuo', 'middle')], enemies: [], bans: new Set() };
  const { list } = engine.suggestPicks(state, game, data);
  const malph = list.find((s) => s.alias === 'Malphite');
  assert.ok(malph && malph.reasons.some((r) => r.text.startsWith('synergia z Yasuo')));
});

test('archetypy składów', () => {
  const champs = (aliases) => aliases.map((alias) => ({ championId: game.championsByAlias.get(alias).id }));
  const comp = engine.compositions({ allies: champs(['Lulu', 'Jinx', 'Janna', 'Braum']), enemies: champs(['Hecarim', 'Vi', 'Diana', 'Camille', 'Leona']) }, game, data);
  console.log('archetypy:', JSON.stringify(comp));
  assert.equal(comp.ally.primary, 'protect');
  assert.equal(comp.enemy.primary, 'dive');
});

test('bany: kontry Twojego hovera, bez banowania picków sojuszników', async () => {
  await step(5);
  const state = engine.readSession(await lcu.get('/lol-champ-select/v1/session'));
  assert.equal(state.banPhase, true);
  assert.equal(state.myBanTurn, true);
  const bans = engine.suggestBans(state, game, data);
  console.log('bany:', bans.map((b) => `${b.name} [${b.reasons.join('; ')}]`).join(' | '));
  assert.equal(bans.length, 5);
  assert.ok(!bans.some((b) => ['Ahri', 'Jinx', 'Thresh'].includes(b.alias)));
  assert.ok(bans.some((b) => b.reasons.some((r) => r.includes('Twój pick'))));
});

test('import run i czary przez API klienta', async () => {
  const page = engine.runePageFor('Ahri', game, data);
  let res = await lcu.request('POST', '/lol-perks/v1/pages', { name: page.name, primaryStyleId: page.primaryStyleId, subStyleId: page.subStyleId, selectedPerkIds: page.selectedPerkIds, current: true });
  assert.ok(res.ok);
  assert.deepEqual(engine.orderSpells([14, 4], { spell1Id: 4, spell2Id: 14 }), { spell1Id: 4, spell2Id: 14 });
  assert.deepEqual(engine.orderSpells([14, 4], { spell1Id: 7, spell2Id: 4 }), { spell1Id: 14, spell2Id: 4 });
});
