const test = require('node:test');
const assert = require('node:assert/strict');
const { MatchReview } = require('../src/match-review');
const { draftId, draftTraining, setTrainingGoal, recordTraining } = require('../src/training');
const { LiveClient } = require('../src/liveclient');

const context = (id, role='bottom', owner='local') => ({id:String(id),owner,position:role,queueId:420});
const meta = ({id,owner}) => ({key:id+':Xayah:classic',gameId:id,mode:'classic',championId:498,name:'Xayah',alias:'Xayah',owner});
const set = (r,c,metric='cs10',target=70) => setTrainingGoal(r,c,{gameId:c.id,role:c.position,metric,target});
const observe = (r,c,time,scores) => recordTraining(r,meta(c),c.queueId,c.position,{status:'live',gameTime:time,trainingScores:scores});

test('cele dotyczą bieżącego potwierdzonego draftu solo/duo i jednego konta', () => {
  const r = new MatchReview(), c = context(1);
  assert.equal(draftId({gameData:{gameId:0}},{gameId:123}),'123');
  assert.equal(draftId({gameData:{gameId:456}},{gameId:123}),null);
  assert.equal(draftTraining(440,'1',c.owner,c.position,null),null);
  assert.equal(draftTraining(420,null,c.owner,c.position,null).ready,false);
  set(r,c);
  assert.equal(draftTraining(420,'1','other','bottom',r.value.trainingChoice).metric,null);
  assert.throws(()=>setTrainingGoal(r,c,{gameId:'2',role:'bottom',metric:'cs10',target:70}));
  assert.throws(()=>setTrainingGoal(r,c,{gameId:'1',role:'utility',metric:'cs10',target:70}));
  for(const target of [NaN,Infinity,'70',0,12.5,1000]) assert.throws(()=>set(r,c,'cs10',target));
  assert.equal(set(r,c,'vision10',5).target,5);
  assert.equal(set(r,c,null).metric,null);
  observe(r,context(2),601,{cs10:71});
  assert.equal(r.value.active.training.goal,null);
});

test('próbka pochodzi z wyniku aktualnego gracza i tylko z żądanej kolejki',async () => {
  const players=[{riotId:'Other#EU',rawChampionName:'Character_Xayah_Name',items:[],scores:{creepScore:200,wardScore:20}},
    {riotId:'Self#EU',rawChampionName:'Character_Xayah_Name',items:[],scores:{creepScore:0,wardScore:3.25}}];
  const data={activePlayer:{riotId:'Self#EU'},allPlayers:players,gameData:{gameMode:'CLASSIC',gameTime:600}};
  const live=new LiveClient(async()=>data);
  const read=training=>live.inventory({gameName:'Self',tagLine:'EU'},'Xayah','CLASSIC',{items:new Map()},{training});
  assert.deepEqual((await read(true)).trainingScores,{cs10:0,vision10:3.25});
  assert.equal((await read(false)).trainingScores,undefined);
  players[1].scores={creepScore:'0',wardScore:-1};
  assert.deepEqual((await read(true)).trainingScores,{cs10:null,vision10:null});
  data.activePlayer.riotId = 'Other#EU';
  assert.equal((await read(true)).trainingScores,undefined);
});

test('wynik w oknie 10:00–10:05 przetrwa restart; późne i puste próbki nie tworzą wyniku', () => {
  let disk;
  const r=new MatchReview({},v=>disk=v), c=context(3);
  set(r,c,'vision10',5);
  observe(r,c,599.99,{cs10:58,vision10:5});
  assert.deepEqual(r.value.active.training.samples,{});
  assert.equal(r.value.active.firstRead,null);
  observe(r,c,600.7,{cs10:60,vision10:null});
  const resumed = new MatchReview(disk);
  observe(resumed,c,603.1,{cs10:61,vision10:0});
  observe(resumed,c,606,{cs10:62,vision10:10});
  resumed.finish();
  const m=resumed.latest();
  assert.deepEqual(m.training.samples,{cs10:{value:60,at:600.7},vision10:{value:0,at:603.1}});
  assert.deepEqual(m.training.goal,{metric:'vision10',target:5});
  const next = context(4);set(resumed,next);
  observe(resumed,next,604,{cs10:null});
  observe(resumed,next,620,{cs10:80});
  resumed.finish();
  assert.equal(resumed.latest().training.samples.cs10,undefined);
  const later=context(5);
  observe(resumed,later,610,{cs10:60,vision10:5});
  assert.equal(resumed.value.active,null);
});

test('mediana wykorzystuje do 20 zapisów tej roli i konta, także sprzed ostatnich 10 meczów', () => {
  const r=new MatchReview();
  for(let i=1;i<=22;i++) { const c=context(i);observe(r,c,602,{cs10:i,vision10:i});r.finish(); }
  observe(r,context(23,'utility'),601,{cs10:400});r.finish();
  observe(r,context(24,'bottom','someone'),601,{cs10:500});r.finish();
  const next=context(25);set(r,next);observe(r,next,601,{cs10:900});
  assert.deepEqual(r.value.active.training.baseline,{median:12.5,count:20});
  r.finish();
  const newRole=context(26,'utility');set(r,newRole,'vision10',3);observe(r,newRole,604,{vision10:3});
  assert.deepEqual(r.value.active.training.baseline,{median:null,count:0});
});

test('przerwa w odczycie zapisuje wybrany cel bez fikcyjnego czasu; stare podsumowania pozostają czytelne',() => {
  const r=new MatchReview({matches:[{key:'old',mode:'classic',owner:'local'}],active:null});
  const c=context(27);set(r,c);
  recordTraining(r,meta(c),440,c.position,null);
  assert.equal(r.value.active,null);
  recordTraining(r,meta(c),420,'',null);
  assert.equal(r.value.active.training.role,'bottom');
  assert.equal(r.value.active.firstRead,null);
  r.finish();
  const m=r.latest();assert.deepEqual(m.training.samples,{});
  assert.deepEqual(m.training.baseline,{count:0,median:null});
  observe(r,c,602,{cs10:80});
  assert.equal(r.value.active,null);
});
