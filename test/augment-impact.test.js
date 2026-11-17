const test = require('node:test');
const assert = require('node:assert/strict');
const { augmentImpact } = require('../src/augment-impact');
const { MatchReview } = require('../src/match-review');
const { buildFor } = require('../src/engine');
const { withPurchaseGoal } = require('../src/next-purchase');
const { planOf } = require('../src/plan-diff');
const data = require('../data/champions.json');
const game = require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const cards = require('../data/mayhem-augments.json').augments;
const cardId = api => cards.find(a => a.api.replace(/^ARAM_/,'')===api).id;
const cobalt = cardId('CrimsonCobalt'), storm = cardId('Upgrade_Stormsurge');

function stateFor(alias,augments) {
  return { mode:'mayhem', me:{ championId:game.championsByAlias.get(alias).id }, allies:[], enemies:[],
    mayhem:{augments,completed:[],owned:[],effects:{}} };
}

test('przed i po: Crimson Cobalt zachowuje plan Zeda, Stormsurge wskazuje pozycję i wymagany zakup Zoe', () => {
  for (const [alias,id] of [['Zed',cobalt],['Zoe',storm]]) {
    const state = stateFor(alias,[id]), copy = structuredClone(state);
    const impact = augmentImpact(id,state,buildFor(alias,state,game,data),null,game,data);
    assert.deepEqual(state,copy);
    assert.deepEqual(impact.before,planOf(buildFor(alias,stateFor(alias,[]),game,data)));
    if (alias==='Zed') assert.deepEqual(impact.changes,[]);
    else {
      assert.ok(impact.changes.some(i=>i.id===4646 && i.to===1 && i.from!==1));
      assert.deepEqual(impact.requiredItems,[{id:4646,name:'Stormsurge',status:'planned'}]);
    }
  }
});

test('symulacja jednej karty pozostawia pozostałe augmenty, własne zakupy i przypięty cel po obu stronach', () => {
  const state = stateFor('Zoe',[storm,cardId('Goliath')]);
  state.liveInventory = {items:[],owned:[3157],ownedBoots:3020};
  state.mayhem.effects[storm] = ['ap'];
  state.mayhem.owned = [3157];
  state.choices = {items:[],boots:3020};
  const base = s => buildFor('Zoe',s,game,data);
  const withGoal = s => withPurchaseGoal('Zoe',s,game,data,base(s),3135).build;
  const after = withGoal(state);
  const impact = augmentImpact(storm,state,after,3135,game,data);
  const without = structuredClone(state);
  without.mayhem.augments = without.mayhem.augments.filter(id => id!==storm);
  delete without.mayhem.effects[storm];
  assert.deepEqual(impact.before,planOf(withGoal(without)));
  assert.deepEqual(impact.after,planOf(after));
  assert.ok(impact.before.some(i=>i.id===3157 && i.source==='owned'));
  assert.ok(impact.before.some(i=>i.id===3135 && i.source==='pinned'));
});

test('podsumowanie zachowuje pierwotny odczyt, uwzględnia cofnięcie i oznacza grupę oraz przerwę', () => {
  let disk, reviews = new MatchReview({},v => {disk=v;});
  const observe = (time,ids) => reviews.observe({
    mode:'mayhem',key:'match-zed',alias:'Zed',name:'Zed',
    snapshot:{status:'live',gameTime:time,inventory:{items:[]}},
    build:{items:[],mayhem:{hints:ids.map(id=>({id,name:String(id)}))}},
    compareAugment:id=>({before:[],after:[],changes:[],summary:'capture-'+time+'-'+id})
  });
  observe(1,[]);observe(11,[cobalt]);observe(13,[cobalt]);
  assert.deepEqual(disk.active.augmentComparisons.map(c=>[c.id,c.time,c.context]),[[cobalt,11,'single']]);
  reviews = new MatchReview(disk,v=>{disk=v;});
  observe(40,[]);assert.deepEqual(disk.active.augmentComparisons,[]);
  observe(55,[cobalt,storm]);observe(50,[cobalt]); // stale poll cannot drop a card
  assert.deepEqual(disk.active.augmentComparisons.map(c=>[c.id,c.context]),[[cobalt,'group'],[storm,'group']]);
  reviews.gap();observe(72,[cobalt,storm,1001]);reviews.finish();
  assert.equal(reviews.list()[0].augmentComparisons[2].context,'gap');
  assert.equal(reviews.list()[0].augmentComparisons[0].summary,'capture-55-'+cobalt);
  assert.equal(new MatchReview({matches:[{key:'old'}]}).list()[0].augmentComparisons,undefined);
});
