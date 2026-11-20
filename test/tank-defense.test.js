const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFor, enemyProfile } = require('../src/engine');
const { offensiveBuild } = require('../src/live-build');
const { inventoryOf } = require('../src/liveclient');
const { shopPlan } = require('../src/shop-plan');
const game = require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const data = require('../data/champions.json');
const { scenario } = require('./fixtures/reported-builds/shen.json');
const id = alias => game.championsByAlias.get(alias).id;
const roster = aliases => aliases.map(alias => ({championId:id(alias)}));
const liveEnemies = scenario.context.enemies.map(({alias,items}) => ({
  alias, championId:id(alias), items:inventoryOf(items,game,alias,'mayhem',true).items,
}));
const inventory = inventoryOf(scenario.context.inventory,game,'Shen','mayhem');
const state = { mode:'mayhem', me:{championId:id('Shen')}, allies:[], enemies:roster(scenario.enemies),
  liveEnemies, liveInventory:inventory, mayhem:scenario.mayhem };
const stats = id => game.items.get(id)?.categories || [];
const dedicated = (id,preferred,other) => stats(id).includes(preferred) && !stats(id).includes(other);

test('Shen przeciw zakupom AP Alistara, Evelynn i Zileana widzi MR w buildzie i w Kup teraz', () => {
  const b = buildFor('Shen',state,game,data);
  assert.equal(b.enemy.apPercent,60);
  assert.equal(enemyProfile(state,game,data).apPercent,b.enemy.apPercent);
  assert.equal(b.items[0].id,3084); assert.ok(b.items[0].owned);
  assert.equal(b.boots.id,3111); assert.ok(b.boots.owned);
  const next=b.items[1];
  assert.ok(dedicated(next.id,'SpellBlock','Armor'));
  assert.match(next.why,/MR.*zakupy AP: Alistar, Evelynn, Zilean/);
  const shop=shopPlan(b,{inventory,gold:1300,gameTime:565},game,'live');
  assert.equal(shop.target.id,next.id);
  // A purchased chain vest cannot pin a full armor item, but an explicit user pin can.
  const pinned=buildFor('Shen',{...state,choices:{items:[{slot:1,id:2502}]}},game,data);
  assert.ok(pinned.items[1].pinned);assert.equal(pinned.items[1].id,2502);
  const draft={...state,liveEnemies:null};
  const fallback=buildFor('Shen',draft,game,data);
  assert.ok(fallback.enemy.apPercent<60);
  assert.ok(dedicated(fallback.items[1].id,'SpellBlock','Armor'));
  assert.doesNotMatch(fallback.items[1].why,/zakupy AP/);
});

test('tank przeciw czterem źródłom jednego typu dostaje wczesną, odpowiednią obronę z augmentem i bez', () => {
  for (const [enemies,preferred,other] of [
    [['Lux','Brand','Evelynn','Xerath','Jinx'],'SpellBlock','Armor'],
    [['Jinx','XinZhao','Draven','Darius','Lux'],'Armor','SpellBlock'],
  ]) {
    for (const augments of [[],[1013],[1353]]) {
      const b=buildFor('Shen',{...state,enemies:roster(enemies),liveEnemies:null,mayhem:{augments}},game,data);
      assert.equal(b.items[0].id,3084);
      assert.ok(dedicated(b.items[1].id,preferred,other));
      assert.ok(b.items.slice(1,4).filter(it=>stats(it.id).includes(preferred)).length>=2);
      assert.equal(b.items.some(it=>stats(it.id).includes('Mana')),false);
    }
  }
});

test('sam komponent, buty lub przedmioty enchantera nie zmieniają przeciwnika w AP carry', () => {
  for(const items of [
    [{id:1052,kind:'component'},{id:3020,kind:'boots'}],
    [{id:6617,kind:'finished'},{id:6620,kind:'finished'}],
    [{id:3087,kind:'finished'},{id:3057,kind:'component'}],
    [{id:3020,kind:'boots'},{id:3020,kind:'boots'}],
  ]) assert.equal(offensiveBuild(items,game),null);
  const wrongRoster = {...state,liveEnemies:liveEnemies.map(p=>({...p,alias:'Shen'}))};
  assert.equal(enemyProfile(wrongRoster,game,data).apPercent,enemyProfile({...state,liveEnemies:null},game,data).apPercent);
});
