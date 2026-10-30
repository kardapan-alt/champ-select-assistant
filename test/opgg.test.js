const test = require('node:test');
const assert = require('node:assert');
const { LcuClient } = require('../src/lcu');
const { loadGameData } = require('../src/gamedata');
const engine = require('../src/engine');
const opgg = require('../src/opgg');
const data = require('../data/champions.json');

process.env.PORT = '0';
const lcuServer = require('../mock/mock-lcu');
const opggServer = require('../mock/mock-opgg');

let game;
let provider;
const listening = (s) => new Promise((r) => (s.listening ? r() : s.once('listening', r)));

test.before(async () => {
  opggServer.listen(0, '127.0.0.1');
  await Promise.all([listening(lcuServer), listening(opggServer)]);
  const lcu = new LcuClient({ protocol: 'http', host: '127.0.0.1', port: lcuServer.address().port, password: 'x' });
  game = await loadGameData(lcu);
  provider = new opgg.OpggProvider({ endpoint: `http://127.0.0.1:${opggServer.address().port}/mcp` });
});
test.after(() => { lcuServer.close(); opggServer.close(); });

test('parser zapisu Name(pole=wartość)', () => {
  const v = opgg.parsePayload("A(x=1, y=[B(z='q', w=True)], n=None, f=-0.5e1)");
  assert.deepEqual(v, { _type: 'A', x: 1, y: [{ _type: 'B', z: 'q', w: true }], n: null, f: -5 });
  assert.deepEqual(opgg.parsePayload('{"a":[1,2]}'), { a: [1, 2] });
  assert.deepEqual(opgg.parsePayload('a,b\n1,x\n2,y'), [{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
});

test('argumenty dobierane ze schematu narzędzia', () => {
  const tool = { inputSchema: { properties: {
    champion: { enum: ['AHRI', 'MONKEYKING', 'JARVANIV'] }, position: { enum: ['top', 'mid', 'adc'] },
    game_mode: { enum: ['ARAM', 'RANKED'] }, lang: { enum: ['ko_KR', 'en_US'] },
  } } };
  assert.deepEqual(opgg.buildArgs(tool, { champion: 'JarvanIV', position: 'middle' }), { champion: 'JARVANIV', position: 'mid', game_mode: 'RANKED', lang: 'en_US' });
});

test('meta z OP.GG: tiery i role także dla championów spoza naszych danych', async () => {
  const meta = await provider.meta(game);
  assert.ok(meta.tiers.S.includes('Vex'));
  assert.deepEqual(meta.roles.Rumble, ['top', 'middle']);
  const merged = opgg.mergeStats(data, { meta }, game);
  assert.equal(merged.meta.source, 'OP.GG (na żywo)');
  assert.ok(merged.champions.Rumble && merged.champions.Rumble.dmg === 'ap', 'Rumble jako AP z cech');
  const { list } = engine.suggestPicks({ me: { position: 'top' }, allies: [], enemies: [], bans: new Set() }, game, merged, { limit: 20 });
  assert.ok(list.some((s) => s.alias === 'KSante'), 'K\'Sante sugerowany dzięki roli z OP.GG');
  assert.equal(provider.status.ok, true);
});

test('analiza: kontry, build, runy, czary i skill order', async () => {
  const zed = await provider.analysis('Zed', 'middle', game);
  assert.deepEqual(zed.weakVs.sort(), ['Malzahar', 'Vex']);
  assert.deepEqual(zed.counters, ['Lux']);
  assert.ok(!zed.weakVs.includes('Annie'), 'za mało gier, pomijamy');
  assert.deepEqual(zed.items, [3165, 6653, 3157]);
  assert.equal(zed.boots, 3158);
  assert.deepEqual(zed.spells, [14, 4]);
  assert.equal(zed.skills, 'Q > E > W');
  assert.deepEqual(zed.runes, { p: 8200, s: 8100, perks: [8229, 8226, 8210, 8237, 8143, 8135], shards: [5008, 5008, 5001] });
  const call = opggServer.calls.find((c) => c.champion === 'ZED');
  assert.deepEqual(call, { champion: 'ZED', game_mode: 'RANKED', lang: 'en_US', position: 'mid' });
});

test('statystyki wroga zmieniają sugestie, a build dalej się adaptuje', async () => {
  const zed = await provider.analysis('Zed', 'middle', game);
  const ahri = await provider.analysis('Ahri', 'middle', game);
  const merged = opgg.mergeStats(data, { analyses: { Zed: zed, Ahri: ahri } }, game);
  const enemy = (alias) => ({ championId: game.championsByAlias.get(alias).id });
  const state = { me: { position: 'middle' }, allies: [], enemies: [enemy('Zed')], bans: new Set() };
  const { list } = engine.suggestPicks(state, game, merged);
  const vex = list.find((s) => s.alias === 'Vex');
  assert.ok(vex.reasons.some((r) => r.text === 'kontruje Zed'));

  // Build Ahri: baza z OP.GG, ale przeciw pełnemu AD wchodzi Zhonya/armor zamiast samych obrażeń.
  const vsAd = { enemies: ['Darius', 'Zed', 'Jinx', 'LeeSin', 'Pyke'].map(enemy) };
  const build = engine.buildFor('Ahri', vsAd, game, merged);
  console.log('Ahri (OP.GG) vs AD:', build.boots.id, build.items.map((i) => `${i.id}(${i.why})`).join(', '));
  assert.equal(build.fromStats, true);
  assert.deepEqual(build.items.slice(0, 2).map((i) => i.id), [3165, 6653]);
  assert.ok(build.items.some((i) => i.why === 'dużo obrażeń fizycznych'));
  const page = engine.runePageFor('Ahri', game, merged);
  assert.equal(page.primaryStyleId, 8200);
});

test('brak OP.GG: czytelny błąd i powrót do własnych danych', async () => {
  const dead = new opgg.OpggProvider({ endpoint: 'http://127.0.0.1:9/mcp' });
  assert.equal(await dead.meta(game), null);
  assert.equal(dead.status.ok, false);
  assert.match(dead.status.message, /OP.GG niedostępne/);
  const merged = opgg.mergeStats(data, { meta: null, analyses: {} }, game);
  assert.equal(merged.meta.source, data.meta.source);
});
