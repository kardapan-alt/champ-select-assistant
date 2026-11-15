const test = require('node:test');
const assert = require('node:assert/strict');
const { LcuClient } = require('../src/lcu');
const { loadGameData, emptyGameData } = require('../src/gamedata');
const { itemAvailable } = require('../src/itemrules');
const engine = require('../src/engine');
const { playerCard } = require('../src/players');
const data = require('../data/champions.json');
process.env.PORT = '0';
const server = require('../mock/mock-lcu');
let game;
test.before(async () => {
  await new Promise((r) => server.listening ? r() : server.once('listening', r));
  game = await loadGameData(new LcuClient({ protocol: 'http', host: '127.0.0.1', port: server.address().port, password: 'x' }));
});
test.after(() => server.close());
const id = (alias) => game.championsByAlias.get(alias).id;
const state = (alias, position, enemies) => ({
  me: { championId: id(alias), position, isMe: true }, allies: [], bans: new Set(),
  enemies: enemies.map((a) => ({ championId: id(a) })),
});
const validRunes = (page) => {
  assert.equal(page.selectedPerkIds.length, 9);
  const p = game.styles.get(page.primaryStyleId), s = game.styles.get(page.subStyleId);
  assert.notEqual(p.id, s.id);
  page.selectedPerkIds.slice(0, 4).forEach((id, i) => assert.ok(p.slots[i].perks.includes(id)));
  const rows = page.selectedPerkIds.slice(4, 6).map((id) => s.slots.findIndex((r, i) => i > 0 && i < 4 && r.perks.includes(id)));
  assert.ok(rows.every((i) => i > 0) && rows[0] !== rows[1]);
};

test('dwa kryty: Randuin trafia do pierwszych trzech zakupów tanka również z OP.GG', () => {
  const d = { ...data, champions: { ...data.champions, Ornn: { ...data.champions.Ornn, statsBuild: true } } };
  const b = engine.buildFor('Ornn', state('Ornn', 'top', ['Yasuo', 'Jhin', 'Ahri', 'LeeSin', 'Leona']), game, d);
  assert.equal(b.items[0].id, data.champions.Ornn.items[0]);
  assert.ok(b.items.slice(1, 3).some((i) => i.id === 3143 && i.priority));
  for (const i of b.items) assert.ok(!b.notes.some((n) => n.includes(`${i.name} wypada`)));
});
test('dwóch autoatakujących: Frozen Heart wcześnie, bez podsuwania go magowi', () => {
  const enemies = ['Vayne', 'Jax', 'Ahri', 'LeeSin', 'Lulu'];
  const tank = engine.buildFor('Ornn', state('Ornn', 'top', enemies), game, data);
  assert.ok(tank.items.slice(1, 3).some((i) => i.id === 3110 && i.priority));
  const mage = engine.buildFor('Ahri', state('Ahri', 'middle', enemies), game, data);
  assert.ok(!mage.items.some((i) => i.id === 3110));
});
test('dwóch tanków przyspiesza właściwe przebicie dla ADC, maga i fightera', () => {
  for (const [alias, role, item] of [['Jinx', 'bottom', 3036], ['Ahri', 'middle', 3135], ['Darius', 'top', 3071]]) {
    const b = engine.buildFor(alias, state(alias, role, ['Ornn', 'Malphite', 'Ahri', 'Jhin', 'Lulu']), game, data);
    assert.ok(b.items.slice(0, 3).some((i) => i.id === item), `${alias}: ${b.items.map((i) => i.id)}`);
  }
});
test('tanki i leczenie: Mortal Reminder zastępuje LDR, nie dubluje ulepszeń', () => {
  const b = engine.buildFor('Jinx', state('Jinx', 'bottom', ['Ornn', 'Malphite', 'Soraka', 'Ahri', 'LeeSin']), game, data);
  assert.ok(b.items.some((i) => i.id === 3033));
  assert.equal(b.items.filter((i) => [3033, 3036, 6694, 3302].includes(i.id)).length, 1);
});
test('support zachowuje slot na przedmiot wsparcia; eksport ma taką samą kolejność jak ekran', () => {
  const s = state('Leona', 'utility', ['Yasuo', 'Jhin', 'Soraka', 'Ahri', 'LeeSin']);
  const b = engine.buildFor('Leona', s, game, data);
  assert.equal(b.items.length, 4);
  assert.ok(b.reservedSlot);
  const set = engine.itemSetFor(b, 'Leona', s, game, data);
  assert.deepEqual(set.blocks.find((x) => x.type === 'Build (kolejno)').items.map((i) => Number(i.id)), [b.items[0].id, b.boots.id, ...b.items.slice(1).map((i) => i.id)]);
});
test('obecny w danych, ale niedostępny przedmiot nie trafia do buildu ani eksportu', () => {
  const g = { ...game, items: new Map(game.items) };
  g.items.set(3110, { ...g.items.get(3110), inStore: false });
  const s = state('Ornn', 'top', ['Vayne', 'Jax', 'Ahri', 'LeeSin', 'Lulu']);
  const b = engine.buildFor('Ornn', s, g, data);
  assert.ok(!b.items.some((i) => i.id === 3110));
  assert.ok(!engine.itemSetFor(b, 'Ornn', s, g, data).blocks.flatMap((x) => x.items).some((i) => i.id === '3110'));
  g.items.set(123, { maps: [12], inStore: true });
  assert.equal(itemAvailable(123, g), false);
  assert.equal(itemAvailable(123, g, 'aram'), true);
});
test('Senna z klasami support/marksman nie dostaje obrażeń AP', () => {
  const g = emptyGameData();
  g.championsByAlias.set('Senna', { id: 235, roles: ['support', 'marksman'] });
  const c = engine.champInfo('Senna', g, data);
  assert.equal(c.class, 'adc'); assert.equal(c.dmg, 'ad');
});
test('brak danych kontr nie podbija blinda, maestria obejmuje także pick spoza top 10', () => {
  const d = structuredClone(data);
  for (const c of Object.values(d.champions)) { c.counters = []; c.weakVs = []; }
  const s = { me: { position: 'middle' }, allies: [], enemies: [], bans: new Set() };
  const full = engine.suggestPicks(s, game, d, { limit: 100 });
  const last = full.list.at(-1);
  const g = { ...game, mastery: new Map([[last.championId, { championLevel: 50, championPoints: 999999 }]]) };
  const picks = engine.suggestPicks(s, g, d);
  assert.ok(!picks.list.some((p) => p.alias === last.alias));
  assert.equal(picks.masteryList[0].alias, last.alias);
  assert.ok(picks.list.every((p) => !p.reasons.some((r) => /bezpieczny blind/.test(r.text)) && p.dataNote));
});
test('runy zmieniają się między poke, burstem, tankami i CC, zachowując legalną stronę', () => {
  const poke = engine.runePageFor('Garen', game, data, state('Garen', 'top', ['Teemo']));
  assert.ok(poke.selectedPerkIds.includes(8444)); validRunes(poke);
  const burst = engine.runePageFor('Garen', game, data, state('Garen', 'top', ['Renekton']));
  assert.ok(burst.selectedPerkIds.includes(8473)); validRunes(burst);
  const tanks = engine.runePageFor('Jinx', game, data, state('Jinx', 'bottom', ['Ornn', 'Malphite', 'Leona']));
  assert.ok(tanks.selectedPerkIds.includes(8017)); validRunes(tanks);
  const cc = engine.runePageFor('Leona', game, data, state('Leona', 'utility', ['Ahri', 'Leona', 'Ashe', 'Amumu']));
  assert.ok(cc.selectedPerkIds.includes(8242)); assert.ok(cc.selectedPerkIds.includes(5013)); validRunes(cc);
});
test('niepełna lista sezonu daje neutralny komunikat, nie etykietę słabego gracza', () => {
  const c = playerCard({ championId: id('Leona'), position: 'utility' }, { seasonChampions: {}, seasonList: { partial: true, below: 14 }, games: [{ championId: id('Ahri'), kills: 1, deaths: 10, assists: 1, win: false }] }, game);
  assert.ok(c.tags.some((t) => /Mała próba/.test(t.text) && t.kind === 'info'));
  assert.ok(!c.tags.some((t) => /Mało gier|Dużo zgonów|poza swoją/.test(t.text)));
});
