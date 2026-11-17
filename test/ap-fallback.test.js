const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../src/engine'),data=require('../data/champions.json');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const state=(alias,mode='mayhem',position='')=>({mode,me:{championId:game.championsByAlias.get(alias).id,position},allies:[],enemies:[]});
const adCore=new Set([3078,3053,6333,3142,6694,6701]);

test('Gragas i inni wojownicy/zabójcy AP bez danych nie dostają domyślnego rdzenia AD',()=>{
  for(const alias of ['Gragas','Gwen','Ekko','Elise','Evelynn'])for(const mode of ['aram','mayhem']){
    const b=engine.buildFor(alias,state(alias,mode),game,data);
    assert.ok(b.items.length>=4,alias);
    assert.ok(!b.items.some(i=>adCore.has(i.id)),`${alias}: ${b.items.map(i=>i.name)}`);
    assert.ok(b.items.some(i=>i.id===3089),alias);
  }
});

test('rola Gragasa nie podmienia AP na przedmioty wojownika AD',()=>{
  for(const position of ['top','jungle','middle']){
    const b=engine.buildFor('Gragas',state('Gragas','classic',position),game,data);
    assert.ok(!b.items.some(i=>adCore.has(i.id)),`${position}: ${b.items.map(i=>i.name)}`);
  }
  assert.ok(engine.buildFor('Trundle',state('Trundle'),game,data).items.some(i=>i.id===3078));
  assert.ok(engine.buildFor('Leona',state('Leona'),game,data).items.some(i=>i.id===3190));
});

test('świadoma konwersja i kupione przedmioty zachowują pierwszeństwo nad szablonem AP',()=>{
  const id=require('../data/mayhem-augments.json').augments.find(a=>a.api.replace(/^ARAM_/,'')==='escAPADe').id;
  const s=state('Gragas');s.mayhem={augments:[id],owned:[],completed:[],effects:{}};
  assert.ok(engine.buildFor('Gragas',s,game,data).items.some(i=>adCore.has(i.id)));
  s.mayhem={augments:[],owned:[3078],completed:[],effects:{}};
  const b=engine.buildFor('Gragas',s,game,data);
  assert.equal(b.items.filter(i=>i.id===3078).length,1);
  assert.ok(b.items.find(i=>i.id===3078).owned);
  assert.ok(!b.items.some(i=>[3053,6333].includes(i.id)));
});
