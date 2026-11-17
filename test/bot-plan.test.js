const test = require('node:test');
const assert = require('node:assert/strict');
const { botLanePlan, rememberAllyRoles } = require('../src/bot-plan');
const { readSession } = require('../src/engine');
const { buildGameData } = require('../src/gamedata');
const data = require('../data/champions.json');
const game = buildGameData(require('../data/catalog.json'));
const id = alias => game.championsByAlias.get(alias).id;
const player = (alias, position) => ({ championId: id(alias), position });
const plan = (state, queueId = 420) => botLanePlan(state, queueId, game, data);

function loading(localRole = 'bottom') {
  const allies = [player('Xayah', 'bottom'), player('Leona', 'utility')];
  const me = allies.find(p => p.position === localRole);
  me.isMe = true;
  return { mode: 'classic', me, allies, enemies: [player('Caitlyn', 'BOTTOM'), player('Lux', 'UTILITY')] };
}

test('solo/duo: both local roles see their four champions and the same shared trade', () => {
  const adc = plan(loading()), support = plan(loading('utility'), '420');
  assert.deepEqual(adc, support);
  assert.deepEqual(adc.allies, ['Xayah', 'Leona']);
  assert.deepEqual(adc.enemies, ['Caitlyn', 'Lux']);
  assert.deepEqual(adc.inferred, []);
  assert.match(adc.trade, /Q \(Lux\).*Leona.*E.*Xayah/);
  assert.match(adc.threat, /Lux.*Caitlyn.*pułapkę/);
});

test('a support swap changes the trade and a new opposing carry changes the threat', () => {
  const s = loading();
  const original = plan(s);
  s.allies[1] = player('Lulu', 'support');
  assert.match(plan(s).trade, /Lulu.*wsparcia/);
  assert.notEqual(plan(s).trade, original.trade);
  s.enemies[0] = player('Ezreal', 'adc');
  assert.match(plan(s).threat, /Ezreal.*E.*Lux/);
  assert.notEqual(plan(s).threat, original.threat);
});

test('draft uses locked client selections; enemy actions or intent alone never reveal a pick', () => {
  const entry = (cellId, alias, assignedPosition) => ({ cellId, assignedPosition, championId: id(alias) });
  const session = {
    localPlayerCellId: 0,
    myTeam: [entry(0, 'Xayah', 'bottom'), entry(1, 'Leona', 'utility')],
    theirTeam: [entry(5, 'Caitlyn', ''), entry(6, 'Lux', '')],
  };
  session.actions = [[...session.myTeam, ...session.theirTeam].map(p => ({
    type: 'pick', actorCellId: p.cellId, championId: p.championId, completed: true,
  }))];
  const draftPlan = () => plan(readSession(session));
  assert.deepEqual(draftPlan().inferred, ['Caitlyn', 'Lux']);
  session.actions[0][3].completed = false;
  assert.equal(draftPlan(), null);
  session.actions[0][3].completed = true;
  session.theirTeam[1].championId = 0;
  session.theirTeam[1].championPickIntent = id('Lux');
  assert.equal(draftPlan(), null);
  session.theirTeam[1].championId = id('Lux');
  session.actions[0][1].completed = false;
  assert.equal(draftPlan(), null);
});

test('unresolved, ambiguous and explicitly off-role picks do not fill an unseen slot', () => {
  const s = loading();
  s.enemies = [player('Lux', 'mid'), player('Caitlyn', ''), player('Lulu', 'NONE')];
  const inferred = plan(s);
  assert.deepEqual(inferred.enemies, ['Caitlyn', 'Lulu']);
  assert.deepEqual(inferred.inferred, ['Caitlyn', 'Lulu']);
  s.enemies.push(player('Jhin', ''));
  assert.equal(plan(s), null);
  s.enemies.pop();
  s.enemies.push({ championId: 0, position: 'utility' });
  assert.equal(plan(s), null);
  s.enemies = [player('Caitlyn', 'bottom'), player('Lux', 'utility')];
  s.allies = [s.me, player('Leona', 'top')];
  assert.equal(plan(s), null);
});

test('queue, mode and assigned local role gate the plan, including off-meta champions', () => {
  for (const queue of [400, 440, 450, 2400, 0, null]) assert.equal(plan(loading(), queue), null);
  for (const mode of ['aram', 'mayhem', 'unsupported']) assert.equal(plan({ ...loading(), mode }), null);
  const s = loading();
  for (const position of ['middle', 'top', 'jungle', '']) assert.equal(plan({ ...s, me: { ...s.me, position } }), null);
  assert.equal(plan({ ...s, me: null }), null);
  s.me.championId = id('Veigar');
  s.enemies[1] = player('Shen', 'support');
  assert.deepEqual(plan(s).allies, ['Veigar', 'Leona']);
  assert.deepEqual(plan(s).enemies, ['Caitlyn', 'Shen']);
});

test('loading can recover missing ally assignments only from the same draft and champion', () => {
  const state = loading();
  state.allies.forEach(p => { p.locked = true; });
  state.allies[1].championId = id('Shen');
  const draft = rememberAllyRoles(state, 420, 483);
  const s = loading();
  s.allies[1].championId = id('Shen');
  s.allies.forEach(p => { p.position = 'NONE'; });
  const fromDraft = () => botLanePlan(s, 420, game, data, draft);
  s.gameId = '483';
  assert.deepEqual(fromDraft().allies, ['Xayah', 'Shen']);
  s.gameId = 484;
  assert.equal(fromDraft(), null);
  s.gameId = 483;
  s.me.championId = id('Draven');
  assert.equal(fromDraft(), null);
  s.me.championId = id('Xayah');
  s.me.position = 'TOP';
  assert.equal(fromDraft(), null);
});
