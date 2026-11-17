const test=require('node:test'), assert=require('node:assert/strict');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const data=require('../data/champions.json');
const {buildFor}=require('../src/engine');
const {skipChoices,replacement}=require('../src/match-skips');
const {createReport}=require('../src/build-report');
const {preview}=require('../src/draftlab');
const {MayhemSession}=require('../src/mayhem');
const {checkReplay}=require('../src/replay-checks');

const me={championId:game.championsByAlias.get('Ahri').id,position:'middle',isMe:true};
const base={me,allies:[me],enemies:[],mode:'mayhem',mayhem:{augments:[],completed:[],owned:[],effects:{}}};
const build=extra=>buildFor('Ahri',{...base,...extra},game,data);

test('pominięcie zmienia rdzeń, alternatywy i plan odtworzony z raportu',()=>{
  const before=build({}), id=before.items[0].id;
  const after=build({skippedItems:[id]});
  assert.ok(skipChoices(before).some(i=>i.id===id));
  assert.ok(![...after.items,...after.alternatives].some(i=>i.id===id));
  assert.equal(after.items.length,before.items.length);
  assert.match(replacement(before,after,id),/Wchodzi do planu:/);
  const report=createReport({...base,skippedItems:[id]},after,game,{version:'test'});
  assert.deepEqual(report.scenario.context.skippedItems,[id]);
  assert.deepEqual(preview(report.scenario,game,data).build.items.map(i=>i.id),after.items.map(i=>i.id));
  assert.throws(()=>preview({...report.scenario,context:{...report.scenario.context,skippedItems:['zły']}},game,data));
  assert.ok(!build({...base,mode:'classic',skippedItems:[id]}).mayhem);
});

test('ekwipunek, przypięcie i nowy quest mają pierwszeństwo przed wcześniejszym pominięciem',()=>{
  const skippedItems=[3089,3157,3116], selection={...base.mayhem,augments:[1156],owned:[3116]};
  const quest=build({skippedItems,mayhem:selection});
  assert.ok(quest.items.find(i=>i.id===3116)?.owned);
  for (const id of skippedItems) assert.ok(!skipChoices(quest).some(i=>i.id===id));
  assert.ok(quest.items.some(i=>i.id===3089));assert.ok(quest.items.some(i=>i.id===3157));
  const pinned=build({skippedItems,choices:{items:[{slot:1,id:3157}]}});
  assert.ok(pinned.items.find(i=>i.id===3157)?.pinned);
  assert.ok(!skipChoices(pinned).some(i=>i.id===3157));
  const boots=build({}).boots.id,other=build({skippedItems:[boots]});
  assert.notEqual(other.boots.id,boots);assert.ok(game.items.has(other.boots.id));
  const withBoots=build({skippedItems:[boots],mayhem:{...base.mayhem,ownedBoots:boots}});
  assert.equal(withBoots.boots.id,boots);assert.ok(!skipChoices(withBoots).some(i=>i.id===boots));
});

test('pominięcia przetrwają zwykłą edycję augmentów i wznowienie tego meczu, po czym wygasną',()=>{
  let disk;
  const store=new MayhemSession(null,next=>{disk=JSON.parse(JSON.stringify(next));});
  const session=store.ensure(778,'Ahri');
  store.patch(session.key,{skips:[{id:3089}],skipRevision:1});
  store.set(session.key,base.mayhem);
  const restarted=new MayhemSession(disk);
  assert.deepEqual(restarted.ensure(778,'Ahri').skips,[{id:3089}]);
  assert.equal(restarted.ensure(779,'Ahri').skips,undefined);
});

test('pominięcie ulepszenia Hex Core zachowuje kupiony rdzeń, raport pierwotnego planu wychwytuje rekomendację',()=>{
  const card=require('../data/mayhem-augments.json').augments.find(a=>a.api.replace(/^ARAM_/,'')==='HexCore');
  const mayhem={...base.mayhem,augments:[card.id],owned:[773513]};
  const original=build({mayhem}), id=773516;
  assert.equal(original.mayhem.nextItem.id,id);
  assert.ok(skipChoices(original).some(i=>i.id===id));
  const corrected=build({mayhem,skippedItems:[id]});
  assert.notEqual(corrected.mayhem.nextItem?.id,id);
  assert.ok(corrected.items.find(i=>i.id===773513)?.owned);
  const report=createReport({...base,mayhem,mayhemPool:'KIWI_JADE'},original,game,{});
  report.expectation={kind:'exclude',itemId:id};
  assert.equal(checkReplay({report},game,data).expectation.passed,false);
});
