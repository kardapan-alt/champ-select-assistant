const test = require('node:test');
const assert = require('node:assert');
const { LcuClient } = require('../src/lcu');
const { loadGameData } = require('../src/gamedata');
const engine = require('../src/engine');
const { gamePlan } = require('../src/gameplan');
const data = require('../data/champions.json');

process.env.PORT = '0';
const server = require('../mock/mock-lcu');

let lcu;
let game;
test.before(async () => {
  await new Promise((r) => (server.listening ? r() : server.once('listening', r)));
  lcu = new LcuClient({ protocol: 'http', host: '127.0.0.1', port: server.address().port, password: 'x' });
  game = await loadGameData(lcu);
});
test.after(() => server.close());

async function aramState() {
  await lcu.get('/__step?n=7');
  return engine.readSession(await lcu.get('/lol-champ-select/v1/session'), 'aram');
}

test('ARAM: championy przydzielone od razu, ławka z sesji', async () => {
  const s = await aramState();
  assert.equal(s.mode, 'aram');
  assert.equal(s.allLocked, true);
  assert.equal(s.me.locked, true);
  assert.deepEqual(s.bench.map((id) => game.championsById.get(id).alias), ['Malphite', 'Lux', 'Ornn']);
  // Ławkę rozpoznajemy też bez trybu z gameflow (benchEnabled w sesji).
  assert.equal(engine.readSession(await lcu.get('/lol-champ-select/v1/session')).mode, 'aram');
});

test('ARAM: czary bez Smite\'a i Teleportu', async () => {
  const s = await aramState();
  for (const alias of ['Darius', 'LeeSin', 'Ahri', 'Jinx', 'Thresh', 'Ornn']) {
    const { ids, why } = engine.spellsFor(alias, { ...s, me: { ...s.me, championId: game.championsByAlias.get(alias).id } }, game, data);
    assert.equal(ids[0], engine.SPELL.flash, alias);
    assert.ok(![engine.SPELL.smite, engine.SPELL.tp].includes(ids[1]), `${alias}: ${ids}`);
    assert.match(why, /^ARAM/);
  }
  assert.equal(engine.spellsFor('LeeSin', s, game, data).ids[1], engine.SPELL.mark);
  assert.equal(engine.spellsFor('Jinx', s, game, data).ids[1], engine.SPELL.heal);
});

test('ARAM: ranking ławki z obecnym championem', async () => {
  const s = await aramState();
  const list = engine.aramChoices(s, game, data);
  assert.equal(list.length, 4);
  assert.equal(list.filter((c) => c.current).length, 1);
  assert.equal(list.find((c) => c.current).alias, 'Ahri');
  // Ławka nie zależy od posiadanych championów (Lux nie jest posiadana w mocku).
  assert.ok(list.some((c) => c.alias === 'Lux'));
  assert.deepEqual([...list].sort((a, b) => b.score - a.score).map((c) => c.alias), list.map((c) => c.alias));
});

test('ARAM: zestaw do sklepu na Howling Abyss, bez startu z linii i wardów', async () => {
  const s = await aramState();
  const build = engine.buildFor('Ahri', s, game, data);
  const set = engine.itemSetFor(build, 'Ahri', s, game, data);
  assert.deepEqual(set.associatedMaps, [12]);
  assert.match(set.title, /^CS Assist ARAM: /);
  assert.ok(!set.blocks.some((b) => /^Start|Wizja|Pierwszy powrót/.test(b.type)), set.blocks.map((b) => b.type).join(' | '));
  // Na Summoner's Rift zestaw zostaje przypięty do mapy 11.
  await lcu.get('/__step?n=2');
  const sr = engine.readSession(await lcu.get('/lol-champ-select/v1/session'));
  assert.deepEqual(engine.itemSetFor(engine.buildFor('Ahri', sr, game, data), 'Ahri', sr, game, data).associatedMaps, [11]);
});

test('ARAM: build pod wroga znanego dopiero z ekranu ładowania, bez niewidzialności', async () => {
  const s = await aramState();
  const ids = (list) => list.map((a) => ({ championId: game.championsByAlias.get(a).id }));
  const build = engine.buildFor('Ahri', { ...s, enemies: ids(['Zed', 'Soraka', 'Vayne', 'Pyke', 'Garen']) }, game, data);
  assert.ok(!build.situations.some((x) => x.key === 'stealth'));
  assert.ok(build.situations.some((x) => x.key === 'heal'));
});

test('ARAM: plan na grę bez smoków i jungli', () => {
  const p = (alias) => ({ championId: game.championsByAlias.get(alias).id, position: '' });
  const plan = gamePlan(['Darius', 'LeeSin', 'Ahri', 'Jinx', 'Thresh'].map(p), ['Zed', 'Soraka', 'Vayne', 'Pyke', 'Garen'].map(p), null, game, data, 'aram');
  assert.equal(plan.mode, 'aram');
  const text = plan.phases.flatMap((ph) => ph.tips).join(' ');
  assert.ok(!/smok|Baron|jungl|Void Grub/i.test(text), text);
  assert.match(text, /Apteczki/);
  assert.ok(!plan.situations.some((x) => x.key === 'stealth'));
});
