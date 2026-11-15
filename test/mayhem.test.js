const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/engine');
const mayhem = require('../src/mayhem');
const { modeFromFlow } = require('../src/modes');
const lab = require('../src/draftlab');
const data = require('../data/champions.json');
const game = require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const catalog = mayhem.choicesCatalog().augments;
const aug = api => { const a=catalog.find(x=>x.api===api || x.api==='ARAM_'+api);assert.ok(a,api);return a.id; };
const state = (alias='Ahri', selection={}, enemies=[]) => ({ mode:'mayhem', roleQuestsEnabled:false,
  me:{championId:game.championsByAlias.get(alias).id,position:'utility'}, allies:[],
  enemies:enemies.map(a=>({championId:game.championsByAlias.get(a).id})),
  mayhem:mayhem.validateSelection(selection,game,alias) });
const build = (alias,selection,enemies) => engine.buildFor(alias,state(alias,selection,enemies),game,data);

test('KIWI i KIWI_JADE są osobnym Mayhem; zwykły ARAM i SR nie zmieniają trybu', () => {
  for(const mode of ['KIWI','KIWI_JADE'])assert.equal(modeFromFlow({gameData:{queue:{gameMode:mode}}}),'mayhem');
  assert.equal(modeFromFlow({map:{id:12},gameData:{queue:{gameMode:'ARAM'}}}),'aram');
  assert.equal(modeFromFlow({map:{id:11},gameData:{queue:{gameMode:'CLASSIC'}}}),'classic');
  const s=engine.readSession({myTeam:[{cellId:1,championId:103}],localPlayerCellId:1,benchEnabled:true},'mayhem');
  assert.equal(s.mode,'mayhem');assert.equal(s.allLocked,true);assert.equal(s.roleQuestsEnabled,false);
});
test('katalog nie miesza wariantów Areny z Mayhem i ma polskie oraz angielskie nazwy', () => {
  assert.ok(catalog.length>200);assert.equal(new Set(catalog.map(a=>a.id)).size,catalog.length);
  assert.ok(catalog.every(a=>a.pools.includes('KIWI')&&a.name.trim()&&a.english.trim()));
  assert.ok(catalog.some(a=>a.name!==a.english));assert.ok(!catalog.some(a=>a.id===41));
});
test('Mayhem nie generuje run, Exhausta ani slotów questów ról; support ma pełny build', () => {
  const s=state('Sona',{},['Zed','Nocturne']);const r=engine.runePageFor('Sona',game,data,s);
  assert.equal(r.disabled,true);assert.equal(r.selectedPerkIds,undefined);assert.ok(!r.spells.some(s=>s.id===3));
  const b=engine.buildFor('Sona',s,game,data);assert.equal(b.items.length,5);assert.equal(b.reservedSlot,null);assert.equal(b.quest,null);
  const exported=engine.itemSetFor(b,'Sona',s,game,data);assert.deepEqual(exported.associatedMaps,[12]);assert.match(exported.title,/Mayhem/);
  assert.ok(!JSON.stringify(exported).includes('2055'));assert.ok(!b.situations.some(s=>s.vision));
});
test('HP, on-hit, AP oraz aktywy dają różne konkretne zakupy z uzasadnieniem', () => {
  const tank=build('Ornn',{augments:[aug('Goliath'),aug('HeavyHitter')]});assert.equal(tank.items[0].id,3084);
  const onhit=build('Ahri',{augments:[aug('Marksmage')]});assert.equal(onhit.items[0].id,3115);
  const active=build('Ahri',{augments:[aug('ApexInventor')]});assert.equal(active.items[0].id,3157);
  assert.equal(active.items[0].source,'augment');assert.match(active.items[0].why,/augment/);
  const heal=build('Sona',{augments:[aug('AllForYou')]});assert.equal(heal.items[0].id,6617);
  assert.notDeepEqual(onhit.items.map(i=>i.id),build('Ahri',{}).items.map(i=>i.id));
});
test('posiadane itemy i buty zostają, pozostałe zakupy dopasowują się; następny nie jest już kupiony', () => {
  const b=build('Ahri',{augments:[aug('ApexInventor')],owned:[6655],ownedBoots:3020});
  assert.equal(b.items[0].id,6655);assert.equal(b.items[0].owned,true);assert.equal(b.boots.id,3020);assert.equal(b.boots.owned,true);
  assert.equal(b.mayhem.nextItem.id,3157);assert.equal(new Set(b.items.map(i=>i.id)).size,5);
  const all=build('Ahri',{owned:b.items.map(i=>i.id),augments:[aug('Marksmage')]});assert.equal(all.mayhem.nextItem,null);
});
test('augmenty nie wyłączają odpowiedzi na mocne zagrożenia ani zgodności przedmiotów', () => {
  const b=build('Ornn',{augments:[aug('Goliath')]},['Yasuo','Jhin','Vayne','MasterYi','Soraka']);
  assert.ok(b.items.some(i=>i.id===3143));
  const s=state('Jinx',{augments:[aug('ItsCritical')],owned:[3036]},['Ornn','Soraka']);
  const x=engine.buildFor('Jinx',s,game,data);assert.ok(!x.items.some(i=>i.id===3033));
});
test('quest priorytetyzuje składniki, ukończenie nie każe kupować ich drugi raz', () => {
  const id=aug('Quest_WoogletsWitchcap');
  const first=build('Ahri',{augments:[id]});assert.deepEqual(first.items.slice(0,2).map(i=>i.id).sort(),[3089,3157]);
  const done=build('Ahri',{augments:[id],completed:[id],owned:[228002]});
  assert.equal(done.items[0].id,228002);assert.ok(!done.items.some(i=>[3089,3157].includes(i.id)));
});
test('ekonomiczny augment zachowuje build, opcjonalna korekta nadal działa i daje się usunąć', () => {
  const a=catalog.find(a=>a.api==='Donation');const baseline=build('Ahri',{});
  const neutral=build('Ahri',{augments:[a.id]});assert.deepEqual(neutral.items.map(i=>i.id),baseline.items.map(i=>i.id));assert.equal(neutral.mayhem.unknown.length,0);
  const custom=build('Ahri',{augments:[a.id],effects:{[a.id]:['onhit']}});assert.equal(custom.items[0].id,3115);assert.equal(custom.mayhem.unknown.length,0);
  assert.deepEqual(build('Ahri',{}).items.map(i=>i.id),baseline.items.map(i=>i.id));
});
test('konwersja AP/AD zmienia dalsze zakupy, ale nie sprzedaje posiadanych przedmiotów', () => {
  const b=build('Jinx',{augments:[aug('ADAPt')],owned:[3031]});assert.equal(b.items[0].id,3031);assert.ok(b.items.some(i=>i.id===3089));
  assert.throws(()=>state('Ahri',{augments:[aug('ADAPt'),aug('escAPADe')]}),/konwersji/);
});
test('walidacja blokuje obce augmenty, duplikaty, szósty augment, nielegalne itemy i stare zadania', () => {
  for(const input of [{augments:[41]},{augments:[1041,1041]},{augments:catalog.slice(0,6).map(a=>a.id)},
    {owned:[3089,3089]},{owned:[2055]},{owned:[3006]},{owned:[3036,3033]},{ownedBoots:3089},
    {completed:[1041]},{augments:[1041],effects:{1041:['bad']}}])assert.throws(()=>state('Ahri',input));
});
test('wybory przetrwają restart w tym samym meczu, ale nowy mecz i champion je zerują', () => {
  let disk;const s=new mayhem.MayhemSession(null,v=>{disk=JSON.stringify(v);});const match=s.ensure(7,'Ahri');
  s.set(match.key,{augments:[1041],owned:[]});const restored=new mayhem.MayhemSession(JSON.parse(disk));
  assert.deepEqual(restored.ensure(7,'Ahri').selection.augments,[1041]);assert.deepEqual(restored.ensure(8,'Ahri').selection.augments,[]);
  assert.throws(()=>restored.set(match.key,{}),/Mecz/);assert.deepEqual(restored.ensure(8,'Jinx').selection.augments,[]);
});
test('tester obsługuje Mayhem, nie modyfikuje wejścia i ukrywa runy', () => {
  const input={alias:'Ahri',role:'middle',mode:'mayhem',mayhem:{augments:[aug('ApexInventor')],owned:[6655]}};
  const before=JSON.stringify(input),v=lab.preview(input,game,data);assert.equal(JSON.stringify(input),before);
  assert.equal(v.myChampion.runes.disabled,true);assert.equal(v.build.mayhem.nextItem.id,3157);
});
