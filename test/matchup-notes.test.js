const test = require('node:test');
const assert = require('node:assert/strict');
const {matchupContexts,recordMatchup,MatchupNotes}=require('../src/matchup-notes');
const {MatchReview}=require('../src/match-review');

const game = {championsById:new Map(['Xayah','Leona','Caitlyn','Lux','Jhin','Ahri'].map((name,i)=>[i+1,{alias:name,name}]))};
const matchup = () => ({gameId:123, allies:[{isMe:true,puuid:'local',championId:1,position:'bottom'},{championId:2,position:'utility'}],
  enemies:[{championId:3,position:'bottom'},{championId:4,position:'utility'}]});
const get=(loading,queue=420,mode='classic',draft=null)=>matchupContexts(loading,queue,mode,game,draft);
const meta = {key:'123:Xayah:classic',owner:'me',name:'Xayah',alias:'Xayah',mode:'classic',gameId:123,championId:1};

test('notatka dla duetu wraca przeciw innemu botowi, notatka dla konkretnego rywala wymaga jego potwierdzonej pozycji',()=>{
  const loading=matchup(), contexts=get(loading);
  assert.deepEqual(contexts.map(c=>c.kind),['enemy','enemy','duo']);
  assert.equal(get(loading,440).length,0);
  assert.equal(get(loading,420,'mayhem').length,0);
  const match={...meta,noteContexts:contexts};let stored;
  const notes=new MatchupNotes(null,next=>{stored=structuredClone(next);});
  for(const c of contexts)notes.edit('me',match,{id:c.id,owner:'me',action:'save',text:'  Notatka '+c.other+'  '});
  const loaded=new MatchupNotes(stored,next=>{stored=next;});
  loading.enemies=[{championId:5,position:'bottom'},{championId:4,position:''}];
  assert.deepEqual(loaded.reminders('me',get(loading)).map(n=>n.text),['Notatka Leona']);
  assert.deepEqual(loaded.reminders('someoneElse',contexts),[]);
  assert.deepEqual(loaded.view('someoneElse',match).options,[]);
  assert.throws(()=>loaded.edit('someoneElse',match,{id:contexts[0].id,owner:'me',action:'remove'}));
  const duo=contexts[2].id;
  loaded.edit('me',null,{id:duo,owner:'me',action:'save',text:'Po edycji'});
  assert.equal(loaded.reminders('me',get(loading))[0].text,'Po edycji');
  loaded.edit('me',null,{id:duo,owner:'me',action:'remove'});
  assert.equal(loaded.reminders('me',get(loading)).length,0);
});

test('przy braku pozycji można użyć przypisania sojuszników z dokładnie tego draftu',()=>{
  const loading=matchup();
  loading.allies.forEach(p=>p.position='');
  const draft={gameId:'123',meId:1,positions:new Map([[1,'bottom'],[2,'utility']])};
  assert.equal(get(loading,420,'classic',draft).length,3);
  assert.deepEqual(get(loading,420,'classic',{...draft,gameId:'321'}),[]);
  loading.enemies.push({championId:6,position:'utility'});
  assert.ok(!get(loading,420,'classic',draft).some(c=>c.kind==='enemy'&&c.otherRole==='utility'));
  loading.allies[0].puuid='';
  assert.deepEqual(get(loading,420,'classic',draft),[]);
});

test('zakres do notatki jest zapisywany przy ładowaniu nawet bez danych o zakupach i przeżywa restart',()=>{
  let saved; const review=new MatchReview({},v=>{saved=v;});
  const contexts=get(matchup());recordMatchup(review,meta,contexts);
  assert.equal(saved.active.firstRead,null);
  const restarted=new MatchReview(saved,()=>{});
  restarted.finish('ended');
  const match=restarted.list()[0], notes=new MatchupNotes([],()=>{});
  assert.deepEqual(notes.view('me',match).options.map(o=>o.context),contexts);
  assert.deepEqual(notes.view('me',{...match,noteContexts:undefined}).options,[]);
  assert.throws(()=>notes.edit('me',match,{id:contexts[0].id,owner:'me',action:'save',text:' '}));
  assert.throws(()=>notes.edit('me',match,{id:'unverified',owner:'me',action:'save',text:'moja notatka'}));
});
