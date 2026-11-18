const {itemAvailable} = require('./itemrules');
const {recipeFor,singlePlan} = require('./shop-plan');

const OPENING = 90, MAX_GAP = 8, GROUP_SECONDS = 15;

// Net inventory differences ignore slot moves. Only copies that disappeared
// may pay for a recipe, and a copy can pay for just one item in the basket.
function difference(after,before) {
  const left=new Map();
  for (const i of before) left.set(i.id,(left.get(i.id)||0)+i.count);
  const out=new Map();
  for (const i of after) {
    const matched=Math.min(i.count,left.get(i.id)||0);
    left.set(i.id,(left.get(i.id)||0)-matched);
    if (matched<i.count) out.set(i.id,{...i,count:(out.get(i.id)?.count||0)+i.count-matched});
  }
  return [...out.values()];
}

function basket(start,items,game,alias) {
  const added=difference(items,start), removed=difference(start,items);
  const bought=[];
  let total=0, known=true;
  for (const item of added) {
    const record=game.items.get(item.id);
    if (!record || !Number.isFinite(record.priceTotal)) {known=false;continue;}
    if (!itemAvailable(item.id,game,'classic',alias) || record.priceTotal<=0 || record.requiredBuffCurrencyName) continue;
    bought.push({id:item.id,name:item.name,count:item.count});
    for (let n=0;n<item.count;n++) {
      const stock=removed.filter(part=>part.count>0);
      const recipe=recipeFor(item.id,{items:stock},game);
      if (!recipe) {known=false;break;}
      total+=recipe.cost;
      for (const index of recipe.used) stock[index].count--;
    }
  }
  return {items:bought,cost:known && removed.every(i=>i.count===0) ? total : null};
}

function purchaseChoices(build,snapshot,game,lane) {
  const paths=[...(build.shop?.comparison || [])];
  const defense=lane?.firstBack && {...lane.firstBack,why:'Obrona na linię przeciw '+lane.opponent.name+' (obrażenia '+lane.damage+').'};
  for (const target of [defense,build.boots]) {
    if (!target?.id || target.owned || snapshot.inventory.items.some(i=>i.id===target.id)) continue;
    const option=singlePlan({...build,items:[target],boots:null,nextPurchase:null},snapshot,game,'live');
    paths.push({...option,benefit:target.why});
  }
  return paths.filter(o=>o.status==='buy' && o.purchase.cost>0 && o.purchase.cost<=snapshot.gold)
    .map(o=>({id:o.purchase.id,name:o.purchase.name,cost:o.purchase.cost,credit:o.purchase.credit,
      target:o.target.name,reason:o.benefit || o.target.why}));
}

function includesPart(itemId,partId,game,seen=new Set()) {
  if (itemId===partId) return true;
  if (seen.has(itemId)) return false;
  seen.add(itemId);
  return (game.items.get(itemId)?.from || []).some(id=>includesPart(id,partId,game,seen));
}

// Only the comparison is saved. The immediately preceding read and its shop
// options live in memory; a restart or a gap cannot join unrelated purchases.
class FirstShopTracker {
  gap(match) {
    if (!match) return;
    if (match.firstShop?.collecting) {match.firstShop.cutShort=true;delete match.firstShop.collecting;}
    if (match.firstShop?.status==='waiting') match.firstShop.gap=true;
    this.previous=null;
    this.opening=null;
  }
  observe(match,snapshot,build,game,lane) {
    if (this.match!==match) {
      this.match=match;this.previous=null;this.opening=null;
      if (match.firstShop?.collecting) {this.gap(match);return true;}
      if (match.firstShop?.status==='waiting') match.firstShop.gap=true;
    }
    const time=snapshot.gameTime, items=snapshot.inventory.items, gold=snapshot.gold;
    const first=!match.firstShop;
    if (first) match.firstShop={status:'waiting',late:time>OPENING};
    if (match.firstShop.status==='recorded' && !this.opening) return false;
    const prev=this.previous;
    if (prev && time<=prev.time) return first;
    if (prev && time-prev.time>MAX_GAP) {
      this.gap(match);
      if (match.firstShop.status==='recorded') return true;
    }
    if (this.opening && time-this.opening.lastChange>GROUP_SECONDS) {
      this.opening=null;
      this.previous=null;
      delete match.firstShop.collecting;
      return true;
    }
    const sample={time,items,gold,choices:time>=OPENING-MAX_GAP && Number.isFinite(gold) ? purchaseChoices(build,snapshot,game,lane) : []};
    const last=this.previous;
    this.previous=sample;
    if (!last || last.time<OPENING) return first;
    const changed=difference(items,last.items).length || difference(last.items,items).length;
    if (!changed) return first;
    if (!Number.isFinite(gold) || !Number.isFinite(last.gold)) {
      this.gap(match);
      return true;
    }
    if (!this.opening) {
      if (gold>=last.gold || !basket(last.items,items,game,build.alias).items.length) return first;
      this.opening={start:last,first:time,lastChange:time,late:match.firstShop.late,gap:match.firstShop.gap,used:[]};
    }
    const window=this.opening, start=window.start;
    window.lastChange=time;
    // A newly purchased potion or ward may be used seconds later. With no new
    // items and no corresponding refund, its disappearance isn't a shop undo.
    if (!difference(items,last.items).length) {
      for (const gone of difference(last.items,items)) {
        const price=game.items.get(gone.id)?.priceTotal;
        if (gone.kind==='consumable' && price>0 && gold-last.gold<price) window.used.push(gone);
      }
    }
    const net=basket(start.items,[...items,...window.used],game,build.alias);
    if (!net.items.length) {
      if (gold<start.gold && match.firstShop.status==='recorded') {
        this.gap(match);
        return true;
      }
      // Inventory and wallet are consistent with a full undo.
      match.firstShop={status:'waiting',late:window.late,gap:window.gap};
      this.opening=null;
      return true;
    }
    const alternative=start.choices.find(option=>!net.items.some(i=>includesPart(i.id,option.id,game)));
    match.firstShop={status:'recorded',collecting:true,start:window.first,end:time,budgetAt:start.time,budget:start.gold,
      ...net,late:window.late,gap:window.gap,alternative:alternative || null};
    return true;
  }
}
module.exports={FirstShopTracker};
