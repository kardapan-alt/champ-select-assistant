const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/engine');
const { roleQuestsEnabled } = require('../src/rolequests');
const { itemsCompatible } = require('../src/itemrules');
const { loadGameData } = require('../src/gamedata');
const { LcuClient } = require('../src/lcu');
const data = require('../data/champions.json');
process.env.PORT = '0';
const server = require('../mock/mock-lcu');
let game;
test.before(async () => {
  await new Promise((r) => server.listening ? r() : server.once('listening', r));
  game = await loadGameData(new LcuClient({ protocol: 'http', host: '127.0.0.1', port: server.address().port, password: 'test' }));
});
test.after(() => server.close());
const state = (alias, position, extra = {}) => ({ mode: 'classic', roleQuestsEnabled: true,
  me: { championId: game.championsByAlias.get(alias).id, position }, allies: [], enemies: [], ...extra });

test('bot: sześć zgodnych przedmiotów, osobne buty, szósty zakup w sklepie dopiero po queście', () => {
  const s = state('Jinx', 'bottom');
  const b = engine.buildFor('Jinx', s, game, data);
  assert.equal(b.items.length, 6);
  assert.equal(b.inventory.bootsSlot, 'quest');
  assert.equal(b.quest.slotItem.id, b.boots.id);
  assert.equal(b.reservedSlot, null);
  b.items.forEach((item, i) => assert.ok(itemsCompatible(item.id, b.items.slice(0, i).map(x => x.id))));
  assert.ok(!b.items.some(x => x.id === b.boots.id));
  const set = engine.itemSetFor(b, 'Jinx', s, game, data);
  const before = set.blocks.find(x => x.type === 'Build (kolejno)').items.map(x => Number(x.id));
  const after = set.blocks.find(x => x.type === '6. item po queście bota').items.map(x => Number(x.id));
  assert.deepEqual(before, [b.items[0].id, b.boots.id, ...b.items.slice(1, 5).map(x => x.id)]);
  assert.deepEqual(after, [b.items[5].id]);
  assert.equal(new Set([...before, ...after]).size, 7);
  assert.ok(set.blocks.every(x => x.items.length <= 6));
});

test('quest pochodzi z roli: mag na bocie ma 6 itemów, strzelec na midzie 5', () => {
  const mage = engine.buildFor('Ahri', state('Ahri', 'bottom'), game, data);
  assert.equal(mage.items.length, 6);
  assert.equal(mage.quest.role, 'bottom');
  const adcMid = engine.buildFor('Jinx', state('Jinx', 'middle'), game, data);
  assert.equal(adcMid.items.length, 5);
  assert.equal(adcMid.quest.role, 'middle');
  assert.equal(adcMid.inventory.bootsSlot, 'inventory');
});

test('brak przypisanej roli i ARAM nie dostają dodatkowego slotu bota', () => {
  for (const s of [state('Jinx', ''), state('Jinx', 'bottom', { mode: 'aram' }), state('Jinx', 'bottom', { roleQuestsEnabled: false })]) {
    const b = engine.buildFor('Jinx', s, game, data);
    assert.equal(b.items.length, 5);
    assert.equal(b.quest, null);
    assert.equal(b.inventory.bootsSlot, 'inventory');
  }
});

test('support: 4 zakupy, buty i przedmiot wsparcia; Control Wardy są osobno po queście', () => {
  const b = engine.buildFor('Leona', state('Leona', 'utility'), game, data);
  assert.equal(b.items.length, 4);
  assert.equal(b.inventory.reservedSlots, 1);
  assert.equal(b.reservedSlot, 'Przedmiot wsparcia');
  assert.equal(b.quest.slotItem.id, 2055);
  assert.equal(b.inventory.bootsSlot, 'inventory');
  assert.ok(!b.items.some(x => x.id === 2055));
});

test('mid: darmowe T3 z danych OP.GG są zamieniane na zakup T2, ulepszenie nie zajmuje drugiego slotu', () => {
  const g = { ...game, items: new Map(game.items) };
  g.items.set(3175, { id: 3175, name: "Spellslinger's Shoes", inStore: true, from: [3020] });
  g.items.set(3871, { id: 3871, name: "Zaz'Zak's Realmspike", inStore: true });
  const d = { ...data, champions: { ...data.champions, Ahri: { ...data.champions.Ahri, statsBuild: true, boots: 3175,
    items: [...data.champions.Ahri.items, 3175, 3871], lateItems: [{ id: 3175, score: 100 }, { id: 3871, score: 100 }] } } };
  const s = state('Ahri', 'middle');
  const b = engine.buildFor('Ahri', s, g, d);
  assert.equal(b.boots.id, 3020);
  assert.equal(b.quest.bootsUpgrade.id, 3175);
  assert.equal(b.items.length, 5);
  assert.ok(!b.items.some(x => [3175, 3871, 3020].includes(x.id)));
  assert.ok(!engine.itemSetFor(b, 'Ahri', s, g, d).blocks.flatMap(x => x.items).some(x => x.id === '3175'));
});

test('top i jungle mają zwykłe sześć slotów; startowy pet nie rezerwuje miejsca na koniec gry', () => {
  for (const [alias, role] of [['Darius', 'top'], ['LeeSin', 'jungle']]) {
    const b = engine.buildFor(alias, state(alias, role), game, data);
    assert.equal(b.items.length, 5);
    assert.equal(b.inventory.reservedSlots, 0);
    assert.equal(b.quest.role, role);
    assert.equal(b.quest.slotItem, null);
  }
});

test('wykrywanie kolejki nie daje questów Swiftplay, ARAM ani trybom rotacyjnym', () => {
  const flow = (id, map = 11, mode = 'CLASSIC') => ({ map: { id: map }, gameData: { queue: { id, gameMode: mode } } });
  for (const id of [0, 400, 420, 440, 700]) assert.equal(roleQuestsEnabled(flow(id)), true);
  for (const f of [flow(480), flow(450, 12, 'ARAM'), flow(900, 11, 'URF'), flow(420, 12), null, {}]) assert.equal(roleQuestsEnabled(f), false);
});

test('odczyt sesji zachowuje informację o questach i aktualną przypisaną pozycję po zamianie', () => {
  const session = { localPlayerCellId: 0, myTeam: [{ cellId: 0, championId: game.championsByAlias.get('Jinx').id, assignedPosition: 'bottom' }] };
  const first = engine.readSession(session, 'classic', { roleQuestsEnabled: true });
  assert.equal(engine.buildFor('Jinx', first, game, data).items.length, 6);
  session.myTeam[0].assignedPosition = 'middle';
  const swapped = engine.readSession(session, 'classic', { roleQuestsEnabled: true });
  assert.equal(engine.buildFor('Jinx', swapped, game, data).items.length, 5);
  const disabled = engine.readSession(session, 'classic', { roleQuestsEnabled: false });
  assert.equal(engine.buildFor('Jinx', disabled, game, data).quest, null);
});
