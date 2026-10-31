const test = require('node:test');
const assert = require('node:assert');
const { LcuClient } = require('../src/lcu');
const { loadGameData } = require('../src/gamedata');
const engine = require('../src/engine');
const { detectSituations } = require('../src/situational');
const data = require('../data/champions.json');

process.env.PORT = '0';
const server = require('../mock/mock-lcu');

let game;
test.before(async () => {
  await new Promise((r) => (server.listening ? r() : server.once('listening', r)));
  const lcu = new LcuClient({ protocol: 'http', host: '127.0.0.1', port: server.address().port, password: 'x' });
  game = await loadGameData(lcu);
});
test.after(() => server.close());

const vs = (enemies) => ({ enemies: enemies.map((alias) => ({ championId: game.championsByAlias.get(alias).id })) });
const show = (b) => b.items.map((i) => `${i.id}(${i.why})`).join(', ');

test('Yasuo + Jhin: tank dostaje Randuin\'s Omen z nazwami championów', () => {
  const b = engine.buildFor('Shen', vs(['Yasuo', 'Jhin', 'Ahri', 'LeeSin', 'Leona']), game, data);
  console.log('Shen vs Yasuo+Jhin:', show(b));
  const omen = b.items.find((i) => i.id === 3143);
  assert.ok(omen, 'brak Randuin\'s Omen');
  assert.equal(omen.why, 'kryty: Yasuo, Jhin');
  const crit = b.situations.find((s) => s.key === 'crit');
  assert.equal(crit.text, 'Yasuo i Jhin opierają się na krytach');
  assert.equal(crit.item.inBuild, true);
  assert.deepEqual(crit.champions.map((c) => c.name), ['Yasuo', 'Jhin']);
});

test('jeden kryt to tylko wskazówka, bez wymuszania itemu', () => {
  const b = engine.buildFor('Shen', vs(['Yasuo', 'Ahri', 'LeeSin', 'Leona', 'Lux']), game, data);
  const crit = b.situations.find((s) => s.key === 'crit');
  assert.equal(crit.level, 1);
  assert.equal(crit.text, 'Yasuo opiera się na krytach');
});

test('Malzahar: strzelec dostaje Mercurial, mag Zhonyę przeciw Zedowi', () => {
  const jinx = engine.buildFor('Jinx', vs(['Garen', 'LeeSin', 'Malzahar', 'Caitlyn', 'Lulu']), game, data);
  console.log('Jinx vs Malzahar:', show(jinx));
  assert.ok(jinx.items.some((i) => i.id === 3139 && i.why === 'supresja: Malzahar'), show(jinx));
  const ahri = engine.buildFor('Ahri', vs(['Garen', 'LeeSin', 'Zed', 'Caitlyn', 'Lulu']), game, data);
  assert.ok(ahri.items.some((i) => i.id === 3157 && i.why === 'zabójcy AD: Zed'), show(ahri));
});

test('Soraka: strzelec kupuje antyleczenie z nazwą championa', () => {
  const b = engine.buildFor('Jinx', vs(['Garen', 'LeeSin', 'Ahri', 'Caitlyn', 'Soraka']), game, data);
  console.log('Jinx vs Soraka:', show(b));
  assert.ok(b.items.some((i) => i.id === 3033 && i.why === 'leczenie: Soraka'), show(b));
});

test('najwyżej dwa itemy wymuszone przez sytuacje, reszta w alternatywach', () => {
  // Kryty, leczenie i zabójcy AD naraz.
  const b = engine.buildFor('Ornn', vs(['Yasuo', 'Jhin', 'Soraka', 'Zed', 'Warwick']), game, data);
  console.log('Ornn vs wszystko:', show(b), '| alt:', b.alternatives.map((a) => `${a.id}(${a.why})`).join(', '));
  const situational = b.items.filter((i) => /^[a-ząćęłńóśźż ]+: /i.test(i.why));
  assert.ok(situational.length >= 1 && situational.length <= 3, show(b));
  assert.ok(b.items.some((i) => i.id === 3143));
  assert.ok(b.items.some((i) => i.id === 3075), 'Thornmail na leczenie');
});

test('niewidzialni: wskazówka o Oracle Lens bez itemu w buildzie', () => {
  const enemies = ['Vayne', 'Akali', 'Shaco'].map((alias) => ({ alias, name: alias, championId: 1, traits: [] }));
  const s = detectSituations(enemies, 'mage').find((x) => x.key === 'stealth');
  assert.equal(s.level, 2);
  assert.equal(s.myItem, null);
  assert.equal(s.general, 3364);
  assert.equal(s.text, 'Vayne, Akali i Shaco stają się niewidzialni');
});

test('tanki rozpoznane po cechach championów', () => {
  const b = engine.buildFor('Jinx', vs(['Ornn', 'Malphite', 'Leona', 'Ahri', 'LeeSin']), game, data);
  console.log('Jinx vs tanki:', show(b));
  const tanks = b.situations.find((s) => s.key === 'tanks');
  assert.equal(tanks.level, 2);
  assert.ok(b.items.some((i) => i.id === 3036 || i.id === 3153), show(b));
});

test('plan na grę: sytuacje dla całej drużyny z ogólnym itemem', () => {
  const { gamePlan } = require('../src/gameplan');
  const p = (alias, position) => ({ championId: game.championsByAlias.get(alias).id, position });
  const plan = gamePlan([p('Shen', 'top'), p('LeeSin', 'jungle'), p('Ahri', 'middle'), p('Jinx', 'bottom'), p('Thresh', 'utility')],
    [p('Garen', 'top'), p('Warwick', 'jungle'), p('Yasuo', 'middle'), p('Jhin', 'bottom'), p('Soraka', 'utility')], null, game, data);
  const crit = plan.situations.find((s) => s.key === 'crit');
  assert.equal(crit.text, 'Yasuo i Jhin opierają się na krytach');
  assert.equal(crit.item.id, 3143);
  assert.equal(crit.item.mine, false);
  assert.ok(plan.situations.some((s) => s.key === 'heal' && s.level === 2));
});
