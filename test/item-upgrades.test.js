const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../src/engine'),data=require('../data/champions.json');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const catalog=require('../data/mayhem-augments.json').augments,rules=require('../src/mayhem-rules');
const {upgradeTargets}=require('../src/mayhem');
const build=(alias,augments,owned=[])=>engine.buildFor(alias,{mode:'mayhem',me:{championId:game.championsByAlias.get(alias).id},allies:[],enemies:[],
  mayhem:{augments,owned,ownedBoots:3020,effects:{},completed:[]}},game,data);

test('każde katalogowe ulepszenie przedmiotu ma konkretny cel widoczny przy augmencie',()=>{
  const upgrades=catalog.filter(a=>a.api.replace(/^ARAM_/,'').startsWith('Upgrade_'));
  assert.equal(upgrades.length,13);
  for(const a of upgrades){
    const b=build('Ahri',[a.id]),r=rules[a.api.replace(/^ARAM_/,'')];
    const targets=upgradeTargets(r,data.champions.Ahri,{});
    assert.ok(targets.length,a.english);assert.ok(b.mayhem.hints[0].requiredItems.length,a.english);
    assert.ok(b.items.some(i=>targets.includes(i.id)),a.english);
  }
});

test('Zoe z Upgrade Stormsurge dostaje ten item przed pozostałymi zakupami i nie dubluje kupionego',()=>{
  for(const owned of [[],[6655],[6655,4645,3089]]){
    const b=build('Zoe',[3150],owned);
    assert.equal(b.items.find(i=>!i.owned).id,4646);
    assert.equal(b.mayhem.hints[0].requiredItems.find(i=>i.id===4646).status,'planned');
  }
  const bought=build('Zoe',[3150],[6655,4646]);
  assert.equal(bought.items.filter(i=>i.id===4646).length,1);
  assert.equal(bought.mayhem.hints[0].requiredItems[0].status,'owned');
});

test('Sheen dobiera jeden wariant do postaci, a Immolate zachowuje wystarczający kupiony przedmiot',()=>{
  for(const [alias,target] of [['Ahri',3100],['Trundle',3078],['Leona',6662]]){
    const b=build(alias,[1996]);assert.equal(b.items.find(i=>!i.owned).id,target);
    assert.equal(b.mayhem.hints[0].requiredItems.length,1);
    assert.equal(b.items.filter(i=>[3100,3078,6662].includes(i.id)).length,1);
  }
  const b=build('Leona',[1319],[3068]);
  assert.equal(b.items.filter(i=>[3068,6664].includes(i.id)).length,1);
  assert.deepEqual(b.mayhem.hints[0].requiredItems.map(i=>[i.id,i.status]),[[3068,'owned']]);
});
