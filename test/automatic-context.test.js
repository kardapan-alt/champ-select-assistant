const test=require('node:test'),assert=require('node:assert/strict');
const {detectHeadliner,HeadlinerConsensus,automaticHeadliner,applyHeadliner}=require('../src/headliner-vision');
const {texts}=require('../data/headliner-texts.json');
const {ownerKey,fromEndStats,fromHistory,fromLiveEvents,ResultResolver}=require('../src/match-result');
const {MatchReview}=require('../src/match-review');
const line=(text,y,center=960)=>{const words=text.split(' '),width=text.length*15;let x=center-width/2;return {words:words.map(text=>{const w={text,x,y,w:text.length*15,h:32};x+=(text.length+1)*15;return w;})};};
const frame=(entry=texts[0])=>({width:1920,height:1080,layouts:[[line(entry.title,270),line(entry.description,340)]]});
test('OCR rozpoznaje wszystkie 9 Headlinerów po nazwie i opisie PL/EN, również zawijanym',()=>{
  for(const entry of texts){assert.equal(detectHeadliner(frame(entry))?.id,entry.id,entry.locale+entry.id);
    const parts=entry.description.split(' '),half=Math.ceil(parts.length/2),f=frame(entry);
    f.layouts[0]=[line(entry.title,270),line(parts.slice(0,half).join(' '),340),line(parts.slice(half).join(' '),380)];
    assert.equal(detectHeadliner(f)?.id,entry.id);
  }
});
test('skin, sama nazwa, tekst czatu, sprzeczne odczyty i niepełny opis nie ustalają Headlinera',()=>{
  const kda=frame(texts[0]);kda.layouts[0][0]=line('KIDA',270);assert.equal(detectHeadliner(kda)?.id,'kda');
  assert.equal(detectHeadliner({...kda,layouts:[[line('KIDA',270)]]}),null);
  const e=texts.find(t=>t.id==='heartsteel'),f=frame(e);
  assert.equal(detectHeadliner({...f,layouts:[[line('HEARTSTEEL Sett',270),line(e.description,340)]]}),null);
  assert.equal(detectHeadliner({...f,layouts:[[line(e.title,270)]]}),null);
  assert.equal(detectHeadliner({...f,layouts:[[line(e.title,800,200),line(e.description,850,200)]]}),null);
  assert.equal(detectHeadliner({...f,layouts:[[...f.layouts[0],...frame(texts[0]).layouts[0]]]}),null);
  assert.equal(detectHeadliner({...f,layouts:[[line(e.title,270),line('Augments',340)]]}),null);
});
test('trzy odczyty dotyczą jednego meczu i nie przekraczają przerwy ani ręcznej korekty',()=>{
  const c=new HeadlinerConsensus(),f=frame();
  assert.equal(c.observe('one',f,1000),null);assert.equal(c.observe('one',f,1700),null);
  assert.equal(c.observe('two',f,2400),null);assert.equal(c.observe('two',f,3100),null);assert.equal(c.observe('two',f,3800),texts[0].id);
  c.observe('two',null,4500);assert.equal(c.observe('two',f,5200),null);
  assert.equal(c.observe('two',f,10000),null);
  const manual={selection:{headliner:{id:'pentakill',ability:'R'}}};assert.equal(automaticHeadliner(manual),false);assert.equal(applyHeadliner(manual,'kda'),null);
  const session={selection:{augments:[1041]}};const patch=applyHeadliner(session,'kda');assert.equal(patch.headlinerSource,'screen');assert.deepEqual(patch.selection.augments,[1041]);
  assert.equal(applyHeadliner({...session,...patch},'disco'),null);
});
const me={puuid:'private-owner',summonerId:12};
const record={key:'7:Ahri:mayhem',gameId:7,championId:103,owner:ownerKey(me.puuid)};
const end=win=>({gameId:7,localPlayer:{puuid:me.puuid,championId:103,stats:{WIN:win}}});
const history=win=>({gameId:7,participantIdentities:[{participantId:1,player:{puuid:me.puuid}}],participants:[{participantId:1,championId:103,stats:{win}}]});
test('wynik wymaga tego samego meczu, gracza i postaci; brak WIN nie oznacza porażki',()=>{
  assert.equal(fromEndStats(end(1),record,me).result,'win');assert.equal(fromEndStats(end('0'),record,me).result,'loss');
  for(const mutate of [d=>delete d.localPlayer.stats.WIN,d=>d.gameId=8,d=>d.localPlayer.puuid='other',d=>d.localPlayer.championId=99]){const d=end(1);mutate(d);assert.equal(fromEndStats(d,record,me),null);}
  assert.equal(fromEndStats(end(1),record,{...me,puuid:'changed-account'}),null);
  const d=end(1);d.teams=[{isWinningTeam:false,players:[d.localPlayer]}];assert.equal(fromEndStats(d,record,me),null);
  assert.equal(fromHistory(history(false),record,me).result,'loss');
  const h=history(true);h.participantIdentities[0].player.puuid='other';assert.equal(fromHistory(h,record,me),null);
  assert.equal(fromHistory(history(undefined),record,me),null);
});
test('zdarzenie GameEnd nie jest mylone z brakiem danych, starą klatką ani sprzecznymi zdarzeniami',()=>{
  const e={EventName:'GameEnd',Result:'Win',EventTime:300};
  assert.equal(fromLiveEvents({Events:[e]},301),'win');assert.equal(fromLiveEvents({Events:[{...e,Result:'Lose'}]},301),'loss');
  assert.equal(fromLiveEvents({Events:[e]},200),null);assert.equal(fromLiveEvents({Events:[e,e]},301),null);
  assert.equal(fromLiveEvents({Events:[{...e,Result:'unknown'}]},301),null);assert.equal(fromLiveEvents({Events:{}},301),null);
});
function review(){return new MatchReview({active:null,matches:[{...record,items:[],events:[],augments:[]}]});}
test('opóźniony wynik wraca z historii, przetrwa restart i nie nadpisuje ręcznej korekty',async()=>{
  const r=review(),resolver=new ResultResolver();let ready=false,requests=0;
  const client={get:async p=>{requests++;return p.includes('current-summoner')?me:p.includes('eog-stats')?null:ready?history(true):null;}};
  assert.equal(await resolver.poll(r,client,1000),false);const n=requests;assert.equal(await resolver.poll(r,client,2000),false);assert.equal(requests,n);
  r.feedback(record.key,{result:'loss',rating:'mixed'});ready=true;
  assert.equal(await resolver.poll(r,client,7000),true);assert.equal(r.list()[0].outcome.result,'win');assert.equal(r.list()[0].feedback.result,'loss');
  const restored=new MatchReview(JSON.parse(JSON.stringify(r.value)));assert.equal(restored.list()[0].outcome.source,'history');
  restored.feedback(record.key,{result:'auto',rating:'mixed'});assert.equal(restored.list()[0].outcome.result,'win');
  assert.equal(JSON.stringify(restored.value).includes('private-owner'),false);
});
test('wynik z innego konta albo poprzedniego meczu nie trafia do podsumowania',async()=>{
  for(const current of [me,{...me,puuid:'other'}]){const r=review(),resolver=new ResultResolver();
    const client={get:async p=>p.includes('current-summoner')?current:{...end(1),gameId:99}};
    assert.equal(await resolver.poll(r,client,1000),false);assert.equal(r.list()[0].outcome,undefined);
  }
});
