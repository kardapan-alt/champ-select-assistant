const test = require('node:test');
const assert = require('node:assert/strict');
const {validOffer,newFrame,recordOffer,snapshotOffer,correctOffer,withdrawPicks,rerollInput} = require('../src/offer-history');
const {MatchReview} = require('../src/match-review');
const game = require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const data = require('../data/champions.json');
const catalog = require('../data/mayhem-augments.json').augments;
const id = key => catalog.find(a=>a.api.replace(/^ARAM_/,'')===key).id;
const choices = ['Upgrade_Stormsurge','IceCold','Vulnerability'].map(id);
const meta = {key:'777:Zoe:mayhem',gameId:777,mode:'mayhem',alias:'Zoe',name:'Zoe',owner:'owner'};
const state = () => ({mode:'mayhem',mayhemPool:'KIWI',me:{championId:game.championsByAlias.get('Zoe').id},
  allies:[],enemies:[],choices:{items:[]},mayhem:{augments:[],completed:[],owned:[3157],effects:{},ownedBoots:3020}});
const names = ids => ({cards:ids.map(id=>({id,name:catalog.find(a=>a.id===id).name})),inventory:'unknown'});
const capture = ids => ({pool:'KIWI',time:null,snapshot:names(ids)});

test('live review offers only the current player’s unconfirmed choices, including the last after reopening',()=>{
  const {earlierOffers,confirmEarlierOffer}=require('../src/offer-history');
  const match={...meta,offers:[1,2,3,4].map(id=>({id,...names(choices)}))};
  match.offers[0].replacedBy=2;
  match.offers[1].picked=choices[1];
  assert.deepEqual(earlierOffers(match,meta,'KIWI').map(o=>o.id),[3]);
  assert.deepEqual(earlierOffers(match,meta,'KIWI',true).map(o=>o.id),[3,4]);
  for(const changed of [{key:'other-game'},{owner:'other-account'}])
    assert.deepEqual(earlierOffers(match,{...meta,...changed},'KIWI',true),[]);
  assert.deepEqual(earlierOffers({...match,endedAt:123},meta,'KIWI',true),[]);
  assert.deepEqual(earlierOffers({...match,owner:null},{...meta,owner:null},'KIWI',true),[]);
  assert.throws(()=>confirmEarlierOffer(match.offers[0],choices[0],'receipt'));
  confirmEarlierOffer(match.offers[2],choices[0],'receipt');
  assert.equal(match.offers[2].picked,choices[0]);assert.ok(!match.offers[3].picked);
  assert.deepEqual(earlierOffers(match,meta,'KIWI',true).map(o=>o.id),[4]);
});

test('an offer freezes independent builds, including purchases, goal and earlier augments', () => {
  const s=state(),goal=3135;
  s.mayhem.augments.push(id('Goliath'));
  const snapshot=snapshotOffer(choices,s,'Zoe',goal,game,data,'manual');
  assert.deepEqual(snapshot.cards.map(c=>c.id),choices);
  assert.ok(snapshot.cards[0].plan.some(i=>i.id===4646));
  assert.notDeepEqual(snapshot.cards[0].plan,snapshot.cards[1].plan);
  const saved=structuredClone(snapshot);
  s.mayhem.owned=[];
  s.mayhem.augments.push(id('CrimsonCobalt'));
  assert.deepEqual(snapshot,saved);
  for (const plan of [snapshot.before,...snapshot.cards.map(c=>c.plan)]) {
    assert.ok(plan.some(i=>i.id===3157)); assert.ok(plan.some(i=>i.id===3135)); assert.ok(plan.some(i=>i.id===3020));
  }
});

test('two visible variants, repeated frames and a restart preserve order without inventing a pick', () => {
  const review=new MatchReview();
  const match=review.ensureActive(meta);
  const first=newFrame(null,choices,2000,()=>capture(choices));
  assert.equal(recordOffer(match,first),true);
  assert.equal(newFrame(first,choices,2500,()=>assert.fail('Recomputed unchanged offer')),first);
  assert.equal(recordOffer(match,first),false);
  const rerolled=[id('ApexInventor'),...choices.slice(1)];
  assert.ok(!newFrame(first,rerolled,3500,()=>capture(rerolled)).replaces,'Similar lineups alone cannot prove a reroll');
  Object.assign(first,{visible:true,aspect:16/9,rects:[{x:.21,y:.18,w:.18,h:.5}]});
  const click=(type,at,x=576,y=783)=>rerollInput(first,{type,at,x,y,width:1920,height:1080});
  click('down',2700); click('up',2800);
  assert.ok(!newFrame(first,[choices[0],id('ApexInventor'),choices[2]],3500,()=>capture(choices)).replaces);
  rerollInput(first,{type:'focus',focused:false,at:2840});
  assert.equal(newFrame(first,rerolled,3500,()=>capture(rerolled)).replaces,first.recordId);
  assert.ok(!newFrame(first,rerolled,9000,()=>capture(rerolled)).replaces);
  rerollInput(first,{type:'cancel',at:2900});
  assert.ok(!newFrame(first,rerolled,3500,()=>capture(rerolled)).replaces);
  first.visible=true;
  click('down',3000); click('up',3120,576,550);
  assert.ok(!newFrame(first,rerolled,3500,()=>capture(rerolled)).replaces);
  click('down',3230); click('up',3300);
  const second=newFrame(first,rerolled,3500,()=>capture(rerolled));
  assert.equal(recordOffer(match,second),true);
  assert.deepEqual(match.offers.map(o=>o.cards.map(c=>c.id)),[choices,rerolled]);
  assert.equal(match.offers[0].replacedBy,second.recordId);
  assert.ok(!match.offers.some(o=>o.picked));
  const resumed=new MatchReview(structuredClone(review.value)).value.active;
  const fresh=newFrame(null,rerolled,4500,()=>capture(rerolled));
  assert.equal(recordOffer(resumed,fresh),false);
  assert.equal(recordOffer(resumed,fresh,rerolled[1],'receipt'),true);
  assert.equal(resumed.offers.length,2);
  assert.equal(resumed.offers[1].source,'screen');
  assert.equal(withdrawPicks(resumed,[choices[1]],'older-receipt'),false);
  assert.equal(withdrawPicks(resumed,[choices[1]]),true);
  assert.equal(resumed.offers[1].picked,undefined);
  const delayed=newFrame(fresh,choices,60000,()=>capture(choices));
  assert.ok(!delayed.replaces);
  assert.equal(validOffer([choices[0],choices[1],choices[1]],'KIWI'),false);
});

test('full OCR corrects a filled slot in place; live confirmation records one reversible choice', () => {
  const review=new MatchReview(),match=review.ensureActive(meta);
  const filled=newFrame(null,choices,1000,()=>capture(choices));recordOffer(match,filled);
  const verified=choices.with(1,id('CrimsonCobalt'));
  const full=newFrame(filled,verified,2100,()=>({...capture(verified),corrects:filled.recordId}));
  recordOffer(match,full);
  assert.equal(match.offers.length,1);assert.equal(full.recordId,filled.recordId);
  assert.deepEqual(match.offers[0].cards.map(c=>c.id),verified);
  assert.equal(recordOffer(match,full,verified[1],'token','confirmed'),true);
  assert.equal(recordOffer(match,full,verified[2],'stale','confirmed'),false);
  assert.equal(match.offers[0].source,'confirmed');assert.throws(()=>correctOffer(match,filled.recordId,null));
  assert.equal(withdrawPicks(match,[verified[1]],'token'),true);assert.equal(match.offers[0].picked,undefined);
});

test('a finished OCR-only game supports missing picks, manual corrections and undo', () => {
  const history=new MatchReview();
  const m=history.ensureActive(meta);
  const frame=newFrame(null,choices,1000,()=>capture(choices));
  recordOffer(m,frame);
  const other=[id('CrimsonCobalt'),...choices.slice(1)];
  recordOffer(m,newFrame(frame,other,20000,()=>capture(other)),other[0],'a');
  history.finish();
  const saved=history.value.matches[0];
  assert.equal(saved.firstRead,null);
  assert.deepEqual(saved.augments.map(a=>a.id),[other[0]]);
  assert.equal(saved.offers[0].snapshot,undefined);
  assert.ok(!saved.offers[0].before);
  assert.throws(()=>correctOffer(saved,1000,id('Goliath')));
  assert.throws(()=>correctOffer(saved,20000,other[2]));
  correctOffer(saved,1000,choices[0]);
  assert.deepEqual(saved.augments.map(a=>a.id),[other[0],choices[0]]);
  correctOffer(saved,1000,choices[2]);
  assert.deepEqual(saved.augments.map(a=>a.id),[other[0],choices[2]]);
  correctOffer(saved,1000,null);
  assert.deepEqual(saved.augments.map(a=>a.id),[other[0]]);
  assert.equal(history.ensureActive(meta),null);
  assert.throws(()=>correctOffer({augments:[]},123,choices[0]));
});
test('przerzuty trzech kart na 1440p korzystają z obszaru poniżej ozdobnej ramki',()=>{
  const {rerollSlot}=require('../src/offer-history');
  const rects=[.221875,.4125,.6046875].map(x=>({x,y:.17222,w:.15625,h:.46944}));
  const click=(x,y)=>rerollSlot(rects,{x,y,width:2560,height:1440},16/9);
  for(const [slot,x] of [795,1285,1775].entries()){
    assert.equal(click(x,1019),slot);
    assert.equal(click(x+22,1037),slot);
    assert.equal(click(x,720),-1);
    assert.equal(click(x,1147),-1);
  }
  assert.equal(click(1044,1019),-1);
  assert.equal(rerollSlot(rects,{x:1285,y:1019,width:1920,height:1200},16/9),-1);
});
