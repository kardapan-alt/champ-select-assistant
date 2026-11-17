const test = require('node:test');
const assert = require('node:assert/strict');
const {buildGameData} = require('../src/gamedata');
const {createReport} = require('../src/build-report');
const {buildFor} = require('../src/engine');
const {comparePlans} = require('../src/plan-diff');
const {rememberReplay,ReplayLibrary,replayEntries,checkReplay} = require('../src/replay-checks');
const game = buildGameData(require('../data/catalog.json')), data = require('../data/champions.json');
function xayah() {
  const me={isMe:true,championId:game.championsByAlias.get('Xayah').id,position:'bottom'};
  const s={me,allies:[me],enemies:[],mode:'classic',roleQuestsEnabled:true};
  const b=buildFor('Xayah',s,game,data);
  return createReport(s,b,game,{version:'0.6.34',patch:'16.22',gold:1220});
}
test('porównanie z raportem 0.6.34 odróżnia przesunięcie, usunięcie i boczne buty',()=>{
  const r=xayah(), first=checkReplay({report:r},game,data);
  assert.equal(first.status,'same');
  const ie=r.observed.plan.find(i=>i.id===3031);
  assert.ok(ie);
  r.observed.plan=r.observed.plan.filter(i=>i!==ie);
  r.observed.plan.unshift({id:3078,name:'Trinity Force',reason:'Stara reguła'});
  r.observed.questSlot=null;
  const before=JSON.stringify(r), result=checkReplay({report:r},game,data);
  assert.equal(result.status,'changed');
  assert.equal(result.changes.find(c=>c.id===3078).to,null);
  assert.equal(result.changes.find(c=>c.id===3031).to,first.before.findIndex(i=>i.id===3031)+1);
  assert.equal(result.quest.after,xayah().observed.questSlot.name);
  assert.equal(JSON.stringify(r),before);
});
test('porównanie zachowuje kopię przedmiotu, która nie zmieniła slotu',()=>{
  const [a,b]=[{id:3,name:'A'},{id:4,name:'B'}];
  const diff=comparePlans([a,b,a],[b,a,a]);
  assert.deepEqual(diff.map(c=>[c.id,c.from,c.to]),[[3,1,2],[4,2,1]]);
  assert.deepEqual(comparePlans([a,a],[a]).map(c=>c.from),[2]);
});
test('historia przechowuje pierwszy i późniejszy wybór zanim zakupy zablokują plan',()=>{
  const match={}, report=xayah();let captures=0;
  const record=(t,owned)=>rememberReplay(match,t,{items:[{owned},{owned},{}]},()=>{captures++;return {...report,observed:{...report.observed,gold:t}};});
  record(10,false);
  const original=match.replays.first;
  record(10,false);assert.equal(match.replays.first,original);assert.equal(match.replays.decision.time,10);
  record(22,false);record(30,true);
  assert.equal(captures,3);
  assert.equal(match.replays.first.time,10);
  assert.equal(match.replays.decision.time,22);
});
test('zachowane przypadki przeżywają wygaśnięcie historii i restart, błąd jednego nie przerywa pozostałych',()=>{
  let disk;const store=new ReplayLibrary([],entries=>disk=structuredClone(entries)), r=xayah();
  const id=store.add(r);
  store.add(structuredClone(r));assert.equal(disk.length,1);
  const history=[{name:'Xayah',endedAt:2,replays:{first:{time:7,report:r}}},{name:'Zed',endedAt:1}];
  const {entries,missing}=replayEntries(history,store);
  assert.equal(entries.size,1);assert.equal([...entries.values()][0].caseId,id);
  assert.equal([...entries.values()][0].saved,true);assert.equal(missing[0].name,'Zed');
  assert.equal(replayEntries([...history,{...history[0],endedAt:3}],store).entries.size,2);
  const restored=new ReplayLibrary(disk,entries=>disk=entries);
  assert.equal(replayEntries([],restored).entries.size,1);
  const broken={...r,scenario:{...r.scenario,alias:'unknown'}};
  assert.equal(checkReplay({report:broken},game,data).status,'unavailable');
  assert.equal(checkReplay({report:r},game,data).status,'same');
  restored.remove(id);assert.deepEqual(disk,[]);
});
