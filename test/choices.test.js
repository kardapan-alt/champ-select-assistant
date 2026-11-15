const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/engine');
const lab = require('../src/draftlab');
const data = require('../data/champions.json');
const { buildGameData } = require('../src/gamedata');
const game = buildGameData(require('../data/catalog.json'));
const { ChoiceStore, validateChoices, validateRunes, savedRunes, serialQueue } = require('../src/choices');
const id = a => game.championsByAlias.get(a).id;
const state = (alias='Ornn', role='top', enemies=['Yasuo','LeeSin','Ahri','Jhin','Lulu']) => ({ mode:'classic',roleQuestsEnabled:true,
  me:{championId:id(alias),position:role}, allies:[], enemies:enemies.map(a=>({championId:id(a)})) });

test('przypięty item zachowuje slot po zmianie przeciwników; reszta nadal reaguje', () => {
  const s = state(); s.choices={items:[{slot:0,id:6665}],boots:3111};
  const first=engine.buildFor('Ornn',s,game,data);
  const next=engine.buildFor('Ornn',{...s,enemies:['Vayne','Jax','Ahri','LeeSin','Lulu'].map(a=>({championId:id(a)}))},game,data);
  for (const b of [first,next]) { assert.equal(b.items[0].id,6665); assert.equal(b.items[0].pinned,true); assert.equal(b.boots.id,3111); }
  assert.ok(first.items.some(i=>i.id===3143));
  assert.ok(next.items.some(i=>i.id===3110));
});
test('przypięta rodzina przebicia wyklucza konkurencyjne ulepszenie także z rdzenia', () => {
  const s=state('Jinx','bottom',['Ornn','Malphite','Soraka','Ahri','LeeSin']);s.choices={items:[{slot:2,id:3036}]};
  const b=engine.buildFor('Jinx',s,game,data);
  assert.equal(b.items.length,6); assert.equal(b.items[2].id,3036);
  assert.ok(!b.items.some(i=>i.id===3033));
  assert.equal(new Set(b.items.map(i=>i.id)).size,6);
});
test('niekompatybilne przypięcia i przedmiot w złym slocie są odrzucane', () => {
  const s=state('Jinx','bottom'),b=engine.buildFor('Jinx',s,game,data);
  for(const items of [[{slot:0,id:3036},{slot:1,id:3033}],[{slot:0,id:3006}],[{slot:9,id:3031}],[{slot:0,id:3031},{slot:0,id:3072}]]) {
    assert.throws(()=>validateChoices({items},b,'Jinx',s,game));
  }
});
test('wszystkie sloty przypięte: zachowuje cały zestaw i eksport bez dublowania', () => {
  const s=state('Jinx','bottom'); const original=engine.buildFor('Jinx',s,game,data);
  s.choices={items:original.items.map((i,slot)=>({slot,id:i.id}))};
  const b=engine.buildFor('Jinx',s,game,data);
  assert.deepEqual(b.items.map(i=>i.id),original.items.map(i=>i.id));
  assert.ok(b.items.every(i=>i.pinned));
  assert.ok(b.alternatives.every(a=>!b.items.some(i=>i.id===a.id)));
  const exported=engine.itemSetFor(b,'Jinx',s,game,data);
  assert.equal(exported.blocks.find(x=>x.type==='6. item po queście bota').items[0].id,String(b.items[5].id));
});
test('przypięte runy nie zmieniają się po zmianie draftu', () => {
  const s=state('Ahri','middle'); const page=engine.runePageFor('Ahri',game,data,s);
  s.choices={runes:savedRunes(page)}; s.enemies=['Ornn','Malphite','Leona','Soraka','Vayne'].map(a=>({championId:id(a)}));
  const pinned=engine.runePageFor('Ahri',game,data,s);
  assert.deepEqual(pinned.selectedPerkIds,page.selectedPerkIds); assert.equal(pinned.pinned,true);
  assert.throws(()=>validateRunes({...page,selectedPerkIds:page.selectedPerkIds.slice(0,8)},game));
});
test('preferencje przeżywają odczyt, ale nie przenoszą się między rolami, postaciami i trybami', () => {
  let disk; const store=new ChoiceStore({},x=>{disk=JSON.parse(JSON.stringify(x));}); const s=state();
  store.set('Ornn',s,{items:[{slot:0,id:6665}],boots:null,runes:null});
  const restored=new ChoiceStore(disk);
  assert.equal(restored.get('Ornn',s).items[0].id,6665);
  assert.equal(restored.get('Ornn',{...s,mode:'aram'}).items.length,0);
  assert.equal(restored.get('Ornn',state('Ornn','utility')).items.length,0);
  assert.equal(restored.get('Leona',s).items.length,0);
  const fail=new ChoiceStore({},()=>{throw Error('write denied');});assert.throws(()=>fail.set('Ornn',s,{items:[1]}));
  assert.equal(fail.get('Ornn',s).items.length,0);
});
test('uzasadnienie opisuje przyspieszenie i prawdziwe przesunięcia, bez twierdzenia że wybrany item wypadł', () => {
  const b=engine.buildFor('Ornn',state(),game,data);
  const omen=b.decisions.find(x=>x.id===3143);
  assert.ok(omen.text.includes('Przyspieszony'));assert.ok(omen.text.includes('Yasuo'));
  for(const i of b.items) assert.ok(!b.changes.some(t=>t===`${i.name}: pominięty w docelowym zestawie.`));
});
test('tester działa na katalogu offline, zachowuje questy i nie zmienia danych wejściowych', () => {
  const input={alias:'Jinx',role:'bottom',mode:'classic',allies:[],enemies:['Ornn','Amumu','Malphite','Jhin','Soraka']};
  const before=JSON.stringify(input);const result=lab.preview(input,game,data);
  assert.equal(result.build.items.length,6); assert.ok(result.build.items.some(i=>i.id===3033));
  assert.equal(JSON.stringify(input),before);
  assert.throws(()=>lab.preview({...input,enemies:['Ornn','Ornn']},game,data));
  assert.throws(()=>lab.preview({...input,allies:['Jinx']},game,data));
  assert.equal(lab.preview({...input,mode:'aram'},game,data).build.items.length,5);
});
test('kolejka zapisów zachowuje kolejność i działa dalej po błędzie', async () => {
  const queue=serialQueue(),seen=[];
  await Promise.all([queue(async()=>{await new Promise(r=>setTimeout(r,10));seen.push(1);}),queue(()=>{seen.push(2);throw Error('fail');}).catch(()=>{}),queue(()=>seen.push(3))]);
  assert.deepEqual(seen,[1,2,3]);
});
