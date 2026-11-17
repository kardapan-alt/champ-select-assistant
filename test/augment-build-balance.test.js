const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../src/engine'),data=require('../data/champions.json');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const catalog=require('../data/mayhem-augments.json').augments;
const id=name=>catalog.find(a=>a.api.replace(/^ARAM_/,'')===name).id;
function build(alias,names,owned=[],enemies=[]){
  return engine.buildFor(alias,{mode:'mayhem',me:{championId:game.championsByAlias.get(alias).id},allies:[],
    enemies:enemies.map(a=>({championId:game.championsByAlias.get(a).id})),
    mayhem:{augments:names.map(id),owned,completed:[],effects:{}}},game,data);
}

test('Zed z Crimson Cobalt zachowuje AD/przebicie zamiast kompletu on-hit i Spellblade',()=>{
  for(const enemies of [[],['Ryze','Jinx','Nidalee','Lulu','Sion']]){
    const b=build('Zed',['CrimsonCobalt'],[],enemies),ids=b.items.map(i=>i.id);
    assert.ok([126697,6696,6699].filter(id=>ids.includes(id)).length>=2,'Rdzeń AD Zeda z aktualnej bazy');
    assert.ok(!ids.some(i=>[3078,6662,3100,3091,3124,3153].includes(i)),b.items.map(i=>i.name).join(', '));
    assert.ok(!b.mayhem.hints[0].effects.includes('onhit'));
  }
});

test('zwykła synergia zachowuje podstawowe zakupy, a nie wszystkie warianty efektu',()=>{
  const mage=build('Ahri',['ApexInventor']);
  assert.equal(mage.items[0].id,3157);
  for(const core of [6655,4646,4645])assert.ok(mage.items.some(i=>i.id===core));
  const adc=build('Jinx',['Deft']);
  for(const core of [3032,3031,3085])assert.ok(adc.items.some(i=>i.id===core));
  assert.ok(adc.items.filter(i=>i.priority).length<adc.items.length,'Nie każda drobna synergia to przyspieszony zakup');
  const sona=build('Sona',['ProteinShake']);assert.equal(sona.items[0].id,3190);
});

test('rekomendacje nie dublują Spellblade, również przy kombinacji augmentów',()=>{
  for(const alias of ['Ahri','Zed','Jinx','Ornn','Garen','Sona'])for(const names of [['MysticPunch'],['Upgrade_Sheen'],['MysticPunch','Bonk','Upgrade_Sheen']]){
    const b=build(alias,names);assert.ok(b.items.filter(i=>[3100,3078,6662].includes(i.id)).length<=1,`${alias}: ${names}`);
  }
  // Już posiadany ekwipunek nie znika z widoku przez filtr rekomendacji.
  const b=build('Zed',['MysticPunch'],[3078,6662]);
  assert.deepEqual(b.items.filter(i=>i.owned).map(i=>i.id),[3078,6662]);
});
