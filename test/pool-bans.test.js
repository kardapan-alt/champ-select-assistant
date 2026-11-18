const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGameData } = require('../src/gamedata');
const { PickPools, comparison } = require('../src/pick-pool');
const { poolBans } = require('../src/pool-bans');
const base = require('../data/champions.json');
const game = buildGameData(require('../data/catalog.json'));
const id = name => game.championsByAlias.get(name).id;
const state = () => ({
  mode: 'classic', me: { position:'bottom', locked:false, championId:0 }, bans:new Set(),
  allies:[], enemies:[], pickable:null, banPhase:true, myBanTurn:true,
});
function panel(s = state(), aliases = ['Jinx','Caitlyn'], analyses = {}, data = base, queue = 420) {
  const pools = new PickPools({[s.me.position]:{aliases}}, () => {});
  const view = comparison(s, queue, game, data, pools);
  return poolBans(s, view, game, data, analyses);
}
const row = (list, alias) => list.find(r => r.alias === alias);
const live = (key, matchupEvidence) => ({_key:key, matchupEvidence});

test('ban dwóch picków bez hoveru bazuje na obu parach i odróżnia potwierdzone pokrycie', () => {
  const joint = row(panel().common, 'Draven');
  assert.deepEqual(joint.pairs, [{result:'bad',source:'profil postaci'}, {result:'bad',source:'profil postaci'}]);
  const swapped = panel(state(), ['Jinx','Ezreal']);
  assert.equal(row(swapped.common, 'Draven'), undefined);
  assert.deepEqual(row(swapped.covered, 'Draven').pairs.map(p => p.result), ['bad','good']);
  assert.equal(row(panel().covered, 'Lucian'), undefined);
  assert.ok(row(panel().other, 'Lucian').pairs[1].conflict);
});

test('właściwa pozycja, odwrotne wyniki, minimalna próba i brak danych rozliczane osobno dla obu picków', () => {
  const data = { ...base, champions:{} };
  const analyses = {
    Jinx:live('Jinx:bottom:classic', {Draven:{games:100,winRate:48.5}, Zed:{games:130,winRate:43}, Samira:{games:500,winRate:42}, Lucian:{games:380,winRate:47}}),
    Caitlyn:live('Caitlyn:bottom:classic', {Draven:{games:200,winRate:48}, Samira:{games:99,winRate:69}, Lucian:{games:105,winRate:50}}),
    Zed:live('Zed:bottom:classic', {Caitlyn:{games:140,winRate:48}}),
    Samira:live('Samira:middle:classic', {Caitlyn:{games:2500,winRate:47}}),
  };
  const result = panel(state(), ['Jinx','Caitlyn'], analyses, data);
  assert.deepEqual(result.common.map(r => r.alias), ['Draven']);
  assert.deepEqual(row(result.covered, 'Zed').pairs[1], {result:'good',source:'OP.GG',games:140,winRate:52});
  assert.deepEqual(row(result.other, 'Samira').pairs[1], {result:'unknown'});
  assert.equal(row(result.other, 'Lucian').pairs[1].result, 'even');
  assert.deepEqual(result.counts, [4,3]);
  analyses.Jinx._key = 'Jinx:bottom:aram';
  assert.deepEqual(panel(state(), ['Jinx','Caitlyn'], analyses, data).counts, [0,3]);
});

test('ban pomija bany, deklaracje sojuszników oraz jawnie wybrane postacie', () => {
  const s = state();
  s.bans.add(id('Samira'));
  s.allies = [{championId:id('Draven'),locked:false}];
  assert.ok(!JSON.stringify(panel(s)).includes('Draven'));
  assert.ok(!JSON.stringify(panel(s)).includes('Samira'));
  s.allies = [];
  s.enemies = [{championId:id('Draven'),locked:false}];
  assert.ok(row(panel(s).common, 'Draven')); // Hidden and unconfirmed opponents never inform the recommendation.
  s.enemies[0].locked = true;
  assert.ok(!JSON.stringify(panel(s)).includes('Draven'));
  s.bans.add(id('Jinx'));
  assert.deepEqual(panel(s).blocked, ['Jinx']);
  assert.deepEqual(panel(s).common, []);
});

test('panel tylko w aktywnej turze bana Solo/Duo, poza główną rolą profilu bez danych statystycznych', () => {
  const s = state();
  for (const queue of [0,440,450]) assert.equal(panel(s, undefined, {}, base, queue), null);
  assert.equal(panel({...s,myBanTurn:false}), null);
  assert.equal(panel({...s,banPhase:false}), null);
  assert.equal(panel({...s,mode:'mayhem'}), null);
  assert.equal(panel({...s,me:{...s.me,locked:true}}), null);
  assert.deepEqual(panel({...s,me:{...s.me,position:'middle'}}).counts,[0,0]);
});
