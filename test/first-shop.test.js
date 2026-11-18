const test=require('node:test');
const assert=require('node:assert/strict');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const {MatchReview}=require('../src/match-review');
const {inventoryOf}=require('../src/liveclient');
const {shopPlan}=require('../src/shop-plan');

const meta={key:'one',gameId:1,owner:'one',mode:'classic',alias:'Ahri',championId:103};
function read(review,time,gold,ids,options={}) {
  const alias=meta.alias;
  const inventory=inventoryOf(ids.map((itemID,slot)=>({itemID,slot})),game,alias,'classic');
  const snapshot={status:'live',gameTime:time,inventory,gold};
  const build={alias,mode:'classic',items:[{id:options.target || 3802}],inventory:{bootsSlot:'inventory'},boots:{id:1001}};
  build.shop=shopPlan(build,snapshot,game,'live');
  review.observe({...meta,shopGame:game,...options,snapshot,build});
  return review.value.active.firstShop;
}

test('first post-start shopping burst uses opening wallet and receipts net of pre-owned components',()=>{
  const r=new MatchReview();
  read(r,14,500,[]);
  assert.equal(read(r,16,100,[1052]).status,'waiting');
  read(r,89,1098,[1052]);read(r,91,1100,[1052]);
  read(r,93,700,[1052,1052]); // second Tome is consumed before the burst ends
  const trip=read(r,95,200,[3108,1052,2003],{target:3089});
  assert.deepEqual(trip.items.map(i=>i.id),[3108,2003]);
  assert.equal(trip.cost,900); // original Tome still present, so no credit
  assert.equal(trip.budget,1100);
  assert.equal(trip.budgetAt,91);
  assert.equal(trip.alternative.id,3802);
  assert.equal(trip.alternative.cost,800);
  assert.equal(trip.alternative.credit,400);
  for(const t of [101,107,113])read(r,t,200,[2003,3108,1052]);
  assert.equal(read(r,160,10,[2003,3108,1052,1001]).end,95);
  r.finish();
  assert.equal(r.firstShopReview('one','one').alternative.id,3802);
  assert.equal(r.firstShopReview('one','other'),null);
  assert.equal(r.list()[0].firstShop,undefined);
});

test('two upgrades share one consumed Tome; same purchase or recipe component is never the alternative',()=>{
  const r=new MatchReview();
  read(r,150,2000,[1052],{target:1052});
  const trip=read(r,152,700,[3108,3108]);
  assert.equal(trip.cost,1300);assert.equal(trip.items[0].count,2);
  assert.equal(trip.alternative.id,1001);
  assert.ok(trip.late);
});

test('undo restores budget and baseline; using a purchased ward retains the purchase',()=>{
  const r=new MatchReview();
  read(r,91,900,[]);read(r,93,600,[1001]);
  assert.equal(read(r,95,902,[]).status,'waiting');
  read(r,97,827,[2055]);read(r,99,830,[]);
  const trip=read(r,101,530,[1001]);
  assert.deepEqual(trip.items.map(i=>i.id).sort(),[1001,2055]);
  assert.equal(trip.budget,902);assert.equal(trip.cost,375);
});

test('missing gold, delayed reads, and different match/account cannot fabricate a comparison',()=>{
  const r=new MatchReview();
  read(r,90,null,[]);assert.equal(read(r,92,400,[1052]).status,'waiting');
  read(r,110,800,[1052]);assert.equal(read(r,109,1,[1052,3108]).status,'waiting');
  const trip=read(r,112,350,[3108]);
  assert.equal(trip.cost,450);assert.ok(trip.gap);
  r.gap();assert.ok(r.value.active.firstShop.cutShort);r.finish();
  assert.equal(read(r,220,400,[1052],{key:'two',owner:'two',gameId:2}).status,'waiting');
  r.finish();assert.equal(r.firstShopReview('two','one'),null);
  assert.equal(read(r,90,200,[],{key:'normal',gameId:3,shopGame:null}),undefined);
  r.finish();assert.equal(r.firstShopReview('normal','one'),null);
});

test('restoring during a shopping burst retains only its confirmed portion',()=>{
  const r=new MatchReview();
  read(r,90,450,[]);read(r,92,150,[1001]);
  const restored=new MatchReview(structuredClone(r.value));
  const trip=read(restored,94,100,[1001,2003]);
  assert.equal(trip.collecting,undefined);assert.equal(trip.cutShort,true);
  assert.deepEqual(trip.items.map(i=>i.id),[1001]);
});
