const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../src/engine'),data=require('../data/champions.json');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const championId=alias=>game.championsByAlias.get(alias).id;
const state=(owned=[3032,6675,3033])=>({mode:'mayhem',me:{championId:championId('Xayah')},allies:[],
  enemies:['Nidalee','Ryze','RekSai','Yuumi','Sion'].map(alias=>({championId:championId(alias)})),
  liveInventory:{owned,ownedBoots:3006},
  liveEnemies:['Ryze','RekSai','Sion'].map(alias=>({alias,championId:championId(alias),items:[{id:3084,kind:'finished',name:'Heartsteel'}]})),
  mayhem:{augments:[],owned,ownedBoots:3006,completed:[],effects:{}}});

test('Xayah: zakupione HP przeciwników nie wypycha IE po Yun Tal, Navori i Mortal Reminder',()=>{
  for(const mode of ['aram','mayhem','classic']){
    const s={...state(),mode},b=engine.buildFor('Xayah',s,game,data);
    assert.deepEqual(b.items.filter(i=>i.owned).map(i=>i.id),[3032,6675,3033]);
    assert.equal(b.items.find(i=>!i.owned).id,3031);
    assert.match(b.items.find(i=>i.id===3031).why,/kryty/);
    assert.equal(b.items.length,5);
  }
});

test('IE nie dubluje się i respektuje zakupione/przypięte przedmioty oraz konwersję augmentu',()=>{
  const bought=engine.buildFor('Xayah',state([3032,6675,3033,3031]),game,data);
  assert.equal(bought.items.filter(i=>i.id===3031).length,1);
  const full=state();full.choices={items:[{id:3153,slot:3},{id:3156,slot:4}]};
  assert.deepEqual(engine.buildFor('Xayah',full,game,data).items.map(i=>i.id),[3032,6675,3033,3153,3156]);
  const converted=state();converted.mayhem.augments=[require('../data/mayhem-augments.json').augments.find(a=>a.api.replace(/^ARAM_/,'')==='ADAPt').id];
  assert.ok(!engine.buildFor('Xayah',converted,game,data).items.some(i=>!i.owned&&i.id===3031));
});
