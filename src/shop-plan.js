const { itemAvailable } = require('./itemrules');
const { isBootItem } = require('./rolequests');

// Receptura z przypisaniem konkretnych posiadanych sztuk. Jedna różdżka nie
// pokrywa dwóch gałęzi Rabadona, a gotowy komponent nie jest kupowany drugi raz.
function recipeFor(id, inventory, game) {
  const available = (inventory?.items || []).map((i,index)=>({ ...i, index, left:i.count || 1 }));
  function visit(target, seen = new Set(), root = false) {
    const item = game.items.get(target), total = item?.priceTotal;
    if (!item || !Number.isFinite(total) || total < 0 || seen.has(target)) return null;
    const held = !root && available.find(i=>(i.id===target || (target===1001 && i.id===2422)) && i.left>0 && i.kind!=='unknown');
    if (held) { held.left--; return { id:target,total,cost:0,credit:total,held:true,used:[held.index],children:[] }; }
    const children = (item.from || []).map(part=>visit(part,new Set([...seen,target])));
    if (children.some(c=>!c) || children.reduce((sum,c)=>sum+c.total,0)>total) return null;
    const credit = children.reduce((sum,c)=>sum+c.credit,0);
    return { id:target,total,cost:total-credit,credit,held:false,used:children.flatMap(c=>c.used),children };
  }
  return visit(id,new Set(),true);
}

function singlePlan(build, snapshot, game, status = 'waiting') {
  if (status !== 'live' || !snapshot?.inventory || !Number.isFinite(snapshot.gold) || snapshot.gold<0)
    return { status:status==='live'?'waiting':status, gold:null };
  const gold = Math.floor(snapshot.gold), inventory = snapshot.inventory;
  const exists = id => {
    const item = game.items.get(id);
    return itemAvailable(id,game,build.mode,build.alias) && !item?.requiredBuffCurrencyName
      && !item?.requiredAlly && !item?.categories?.includes('Trinket');
  };
  const order = [...build.items];
  if (build.inventory.bootsSlot !== 'none' && build.boots?.id) order.splice(Math.min(1,order.length),0,build.boots);
  const upgrade = build.mayhem?.nextItem?.upgrade ? build.mayhem.nextItem : null;
  if (upgrade && exists(upgrade.id)) order.unshift(upgrade);
  const pinned=build.nextPurchase?.id&&order.find(i=>i.id===build.nextPurchase.id&&!i.owned);
  if(pinned)order.unshift(pinned);
  const next = order.find(i=>!i.owned && exists(i.id));
  if (!next) {
    if (build.mayhem?.skipped?.length && (build.items.length < build.inventory.itemSlots || !build.boots?.id && !build.boots?.owned && build.inventory.bootsSlot==='inventory')) return {status:'skipped',gold};
    return { status:order.some(i=>!i.owned)?'unavailable':'complete', gold };
  }
  const tree = recipeFor(next.id,inventory,game);
  if (!tree) return { status:'unknown-price',gold };
  const itemView = id => { const item=game.items.get(id); return {id,name:item.name,icon:item.iconPath}; };
  const target = { ...itemView(next.id), cost:tree.cost, credit:tree.credit, why:next.why || 'Kolejny przedmiot w buildzie' };
  const candidates = [];
  const visit = node => {
    if (node.held) return;
    if (exists(node.id) && (node.cost>0 || node.used.length)) candidates.push(node);
    node.children.forEach(visit);
  };
  visit(tree);
  const fits = node => {
    const consumed = new Map();
    node.used.forEach(i=>consumed.set(i,(consumed.get(i)||0)+1));
    // Nie zakładamy ukończenia questa ADC. Boczny slot musi być widoczny
    // w odczycie; przed ukończeniem nadal obowiązuje sześć zwykłych slotów.
    const sideBoots = build.quest?.extraSlot==='boots' && inventory.items.some(i=>i.slot>6 && isBootItem(i.id,game));
    const side = sideBoots && isBootItem(node.id,game);
    const slots = inventory.items.filter(i=>side ? i.slot>6 && isBootItem(i.id,game) : i.slot<6);
    const freed = inventory.items.filter((i,index)=>(side ? i.slot>6 && isBootItem(i.id,game) : i.slot<6)
      && (consumed.get(index)||0)>=(i.count || 1)).length;
    return slots.length-freed+1 <= (side ? 1 : 6);
  };
  const fitting = candidates.filter(fits);
  // Najpierw ukończenie celu, potem największy dostępny krok w jego recepturze.
  const affordable = fitting.filter(n=>n.cost<=gold).sort((a,b)=>(b.id===next.id)-(a.id===next.id) || b.cost-a.cost || b.total-a.total);
  if (affordable.length) {
    const choice=affordable[0];
    return { status:'buy',gold,target,purchase:{...itemView(choice.id),cost:choice.cost,credit:choice.credit,
      component:choice.id!==next.id}, remaining:gold-choice.cost };
  }
  if (!fitting.length) return { status:'full',gold,target };
  const cheapest = fitting.reduce((best,n)=>n.cost<best.cost?n:best);
  return { status:'save',gold,target,missing:Math.max(0,cheapest.cost-gold),
    savingFor:{...itemView(cheapest.id),cost:cheapest.cost} };
}

function shopPlan(build,snapshot,game,status='waiting'){
  const main=singlePlan(build,snapshot,game,status);
  if(!main.target||status!=='live')return main;
  const labels={SpellDamage:'AP',Damage:'AD',Armor:'pancerz',SpellBlock:'odporność na magię',Health:'zdrowie',Mana:'mana',
    AbilityHaste:'haste',CooldownReduction:'haste',MagicPenetration:'przebicie magiczne',ArmorPenetration:'przebicie pancerza',
    CriticalStrike:'kryty',AttackSpeed:'szybkość ataku',LifeSteal:'kradzież życia',Movement:'ruch'};
  const focus=id=>[...new Set((game.items.get(id)?.categories||[]).map(c=>labels[c]).filter(Boolean))];
  const mainFocus=focus(main.target.id);
  const later=build.items.filter(i=>!i.owned&&i.id!==main.target.id).map(i=>({...i,kind:'later'}));
  const alternatives=(build.alternatives||[]).filter(i=>!i.owned&&i.id!==main.target.id).map(i=>({...i,kind:'alternative'}));
  if(build.purchaseAlternative&&build.purchaseAlternative.id!==main.target.id)
    alternatives.unshift({...build.purchaseAlternative,kind:'alternative'});
  const seen=new Set([main.target.id]);
  const options=[{...main,kind:'plan',focus:mainFocus,benefit:main.target.why,tradeoff:'Zachowujesz bieżącą kolejność buildu.'}];
  // One later planned purchase and one compatible engine alternative, if available.
  for(const pool of [later,alternatives]){
    for(const candidate of pool){
      if(seen.has(candidate.id))continue;
      const option=singlePlan({...build,items:[candidate],boots:null,mayhem:null,nextPurchase:null},snapshot,game,status);
      if(!option.target)continue;
      seen.add(candidate.id);
      const candidateFocus=focus(candidate.id),delayed=mainFocus.filter(x=>!candidateFocus.includes(x));
      options.push({...option,kind:candidate.kind,focus:candidateFocus,benefit:candidate.why||'Sytuacyjna alternatywa z Twojego buildu.',
        tradeoff:`Odkładasz ${main.target.name}: ${main.target.why}.${delayed.length?' Później rozwiniesz: '+delayed.join(', ')+'.':''}`});
      break;
    }
  }
  return {...main,comparison:options};
}
module.exports = { recipeFor, shopPlan };
