const test = require('node:test');
const assert = require('node:assert');
const { LcuClient } = require('../src/lcu');
const { loadGameData } = require('../src/gamedata');
const engine = require('../src/engine');
const { readLoadingPlayers } = require('../src/players');
const { lanePlan } = require('../src/laneplan');
const { gamePlan } = require('../src/gameplan');
const data = require('../data/champions.json');

process.env.PORT = '0';
const server = require('../mock/mock-lcu');

let lcu;
let game;
const step = (n) => lcu.get(`/__step?n=${n}`);
const idOf = (alias) => game.championsByAlias.get(alias).id;
// Sztuczny champ select: Ty na danej pozycji i widoczni przeciwnicy.
const stateFor = (position, alias, enemies) => ({
  me: { position, championId: idOf(alias), isMe: true },
  allies: [{ position, championId: idOf(alias), isMe: true, locked: true }],
  enemies: enemies.map((a) => ({ championId: idOf(a), locked: true })),
  bans: new Set(),
});

test.before(async () => {
  await new Promise((r) => (server.listening ? r() : server.once('listening', r)));
  lcu = new LcuClient({ protocol: 'http', host: '127.0.0.1', port: server.address().port, password: 'x' });
  game = await loadGameData(lcu);
});
test.after(() => server.close());

test('runy: melee na topie przeciw pokującemu dostaje Determinację jako drugie drzewko', () => {
  const page = engine.runePageFor('Mordekaiser', game, data, stateFor('top', 'Mordekaiser', ['Teemo']));
  assert.equal(page.subStyleId, 8400);
  assert.ok(page.selectedPerkIds.includes(8444), 'Second Wind');
  assert.equal(page.selectedPerkIds.length, 9);
  assert.ok(page.adaptations.some((a) => a.includes('Teemo')));
  assert.equal(page.name, 'CS Assist: Mordekaiser vs Teemo');
});

test('runy: przeciw all-inowi Kościana Płyta zamiast Second Wind', () => {
  const page = engine.runePageFor('Garen', game, data, stateFor('top', 'Garen', ['Renekton']));
  assert.ok(page.selectedPerkIds.includes(8473));
  assert.ok(!page.selectedPerkIds.includes(8444));
});

test('runy: bez widocznego przeciwnika strona się nie zmienia', () => {
  const plain = engine.runePageFor('Garen', game, data);
  const blind = engine.runePageFor('Garen', game, data, stateFor('top', 'Garen', []));
  assert.deepEqual(blind.selectedPerkIds, plain.selectedPerkIds);
  assert.equal(blind.adaptations.length, 0);
});

test('odłamki: dużo CC u wroga daje Nieustępliwość', async () => {
  await step(4);
  const state = engine.readSession(await lcu.get('/lol-champ-select/v1/session'));
  const page = engine.runePageFor('Ahri', game, data, state);
  assert.equal(page.selectedPerkIds[8], 5013);
  assert.ok(page.adaptations.some((a) => a.includes('CC')));
});

test('czary: Bariera na midzie przeciw zabójcy, Podpalenie na wygranym topie', () => {
  const mid = engine.spellsFor('Ahri', stateFor('middle', 'Ahri', ['Zed']), game, data);
  assert.ok(mid.ids.includes(21) && mid.ids.includes(4));
  assert.ok(mid.why.includes('Zed'));
  const top = engine.spellsFor('Renekton', stateFor('top', 'Renekton', ['Camille']), game, data);
  assert.ok(top.ids.includes(14) && top.ids.includes(4), 'Podpalenie zamiast Teleportu');
  const jungle = engine.spellsFor('LeeSin', stateFor('jungle', 'LeeSin', ['Zed']), game, data);
  assert.ok(jungle.ids.includes(11) && !jungle.why);
});

test('zestaw przedmiotów: start, build z powodami i poprawny format', async () => {
  await step(4);
  const state = engine.readSession(await lcu.get('/lol-champ-select/v1/session'));
  const build = engine.buildFor('Ahri', state, game, data);
  const set = engine.itemSetFor(build, 'Ahri', state, game, data);
  assert.ok(set.title.startsWith('CS Assist: Ahri'));
  assert.deepEqual(set.associatedChampions, [idOf('Ahri')]);
  assert.equal(set.blocks[0].items[0].id, '1056', "Doran's Ring na start dla maga");
  for (const b of set.blocks) for (const it of b.items) assert.equal(typeof it.id, 'string');
  const full = set.blocks.find((b) => b.type.startsWith('Build'));
  assert.equal(full.items.length, 6);
  assert.ok(set.blocks.some((b) => b.type.startsWith('Dlaczego:')), 'bloki z powodami');
  console.log('zestaw:', set.blocks.map((b) => `${b.type}: ${b.items.map((i) => i.id).join(',')}`));
});

test('plan na linię: przeciwnik z pozycji, wskazówki z cech i statystyk gracza', async () => {
  await step(6);
  const players = await readLoadingPlayers(lcu);
  const me = players.allies.find((p) => p.isMe);
  const cardFor = (p) => (p.gameName === 'Cień Midu' ? { tags: [{ text: 'Dużo zgonów (śr. 8.2)', kind: 'warn' }] } : null);
  const plan = lanePlan(me, players.enemies, cardFor, game, data);
  assert.equal(plan.opponent.name, 'Zed');
  assert.equal(plan.opponentIndex, 2);
  assert.ok(plan.tips.length >= 3 && plan.tips.length <= 4);
  assert.ok(plan.tips.some((t) => t.includes('burst')));
  assert.ok(plan.tips.some((t) => t.includes('często ginie')));
  assert.equal(plan.firstBack.id, 1029, 'Zed zadaje obrażenia fizyczne');
  // Bez pozycji w sesji: przeciwnik zgadnięty po roli championa.
  const noPos = lanePlan({ ...me, position: '' }, players.enemies.map((p) => ({ ...p, position: '' })), null, game, data);
  assert.equal(noPos.opponent.name, 'Zed');
  console.log('plan:', plan.tips);
});

test('support: bez strzelców i fighterów, kruchy pick słabszy przeciw zabójcom', () => {
  const state = stateFor('utility', 'Thresh', ['Samira', 'LeeSin', 'Garen', 'Zed']);
  state.me.championId = 0;
  state.allies = [{ position: 'utility', championId: 0, isMe: true }];
  const { list } = engine.suggestPicks(state, game, data);
  const names = list.map((s) => s.alias);
  assert.ok(!names.includes('Ashe') && !names.includes('Sett'), names.join(','));
  const lux = engine.suggestPicks(state, game, data, { limit: 50 }).list.find((s) => s.alias === 'Lux');
  if (lux) assert.ok(lux.reasons.some((r) => !r.good && r.text.startsWith('łatwy cel')), JSON.stringify(lux.reasons));
  console.log('support:', list.map((s) => `${s.name} ${s.score}`).join(', '));
});

test('plan na grę: fazy gry ze składów, groźni gracze przed słabymi punktami', async () => {
  await step(6);
  const players = await readLoadingPlayers(lcu);
  const cardFor = (p) => ({
    loaded: true,
    tags: p.gameName === 'Cień Midu' ? [{ text: 'Doświadczony (300 gier)' }] : p.gameName === 'Topowy Młot' ? [{ text: 'Mało gier tym championem' }] : [],
    champion: { seasonGames: p.gameName === 'Cień Midu' ? 300 : 2 },
    recent: { games: 20, winRate: p.gameName === 'Wilk z Zaun' ? 70 : 50 },
  });
  const plan = gamePlan(players.allies, players.enemies, cardFor, game, data);
  assert.deepEqual(plan.phases.map((p) => p.title), ['Początek gry', 'Środek gry', 'Walki drużynowe']);
  assert.ok(plan.phases.every((p) => p.tips.length >= 1));
  assert.ok(plan.ourStyle.length >= 1);
  assert.deepEqual(plan.threats.map((t) => t.who), ['Cień Midu (Zed)', 'Wilk z Zaun (Warwick)'], 'doświadczenie przed dobrą serią');
  assert.deepEqual(plan.targets, [{ who: 'Topowy Młot (Mordekaiser)', why: 'mało gier tym championem' }]);
  // Bez widocznych przeciwników nie ma planu.
  assert.equal(gamePlan(players.allies, [], cardFor, game, data), null);
  console.log('plan gry:', plan.phases.map((p) => p.tips).flat());
});
