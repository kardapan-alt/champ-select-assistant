const {recipeFor} = require('./shop-plan');
const {itemAvailable,itemFitsResource} = require('./itemrules');
const {comparePlans} = require('./plan-diff');
const {questFor} = require('./mayhem-quest-state');
const rules = require('./mayhem-rules');
const {upgradeTargets} = require('./mayhem');
const catalog = new Map(require('../data/mayhem-augments.json').augments.map(card=>[card.id,card]));

// Guaranteed grants in Riot's 16.22 KIWI descriptions / RootSpell Gold
// calculations. The current wallet is always reported separately from grants.
const goldGrants = {Upgrade_IE:500, Upgrade_Sheen:250, Upgrade_ZH:250, Upgrade_Collector:250,
  Upgrade_Immolate:250, Upgrade_DeathDance:250, Upgrade_Ravenous:500, Upgrade_SunderedSky:500, Upgrade_Stormsurge:500};
const componentGrants = {Quest_WoogletsWitchcap:1058, Quest_VoidImmolation:6660,
  DontStopCleavin:773134, TrueEternity:773010};

function quoteItems(ids, context, grantId) {
  const {inventory,manual,selection={},game}=context;
  const exact=Array.isArray(inventory?.items);
  const owned=exact ? inventory.items.map(item=>item.id) : manual ? [...(selection.owned||[]),selection.ownedBoots] : [];
  const available=(exact?inventory.items:[]).map(item=>({...item,count:item.count||1}));
  const rows=ids.map(id=>({id,name:game.items.get(id)?.name||String(id),held:owned.includes(id)}));
  // Reserve complete targets before allocating shared components between goals.
  for(const row of rows.filter(row=>row.held)){
    const held=available.find(item=>item.id===row.id&&item.count>0);
    if(held)held.count--;
  }
  if(grantId)available.push({id:grantId,count:1,kind:'component',grant:true});
  let credit=0,grantCredit=0;
  for(const row of rows){
    if(row.held){row.cost=0;continue;}
    const parts=available.filter(item=>item.count>0);
    const tree=itemAvailable(row.id,game,'mayhem',context.champion?.alias) && recipeFor(row.id,{items:parts},game);
    if(!tree||tree.total<=0){row.cost=null;continue;}
    row.cost=tree.cost;
    const components=[];
    for(const index of tree.used){
      const part=parts[index],item=game.items.get(part.id);
      part.count--;
      if(part.grant)grantCredit+=item?.priceTotal||0;
      else {credit+=item?.priceTotal||0;components.push(item?.name||String(part.id));}
    }
    row.components=components;
  }
  return {rows,exact,manual:!!manual,credit,grantCredit,
    cost:rows.every(row=>Number.isFinite(row.cost))?rows.reduce((sum,row)=>sum+row.cost,0):null};
}

function purchaseImpact(id,snapshot,owned) {
  const after=snapshot?.cards?.find(card=>card.id===id)?.plan;
  if(!after||!snapshot.before)return null;
  const pending=plan=>plan.filter(item=>!item.side&&!owned.includes(item.id));
  const changes=comparePlans(pending(snapshot.before),pending(after));
  const later=changes.find(item=>item.from!=null&&(item.to===null||item.to>item.from));
  if(later)return later.to===null?`Poza planem: ${later.name}`:`Później: ${later.name} (${later.from} → ${later.to})`;
  const added=changes.find(item=>item.from===null);
  return added?`Do planu: ${added.name} (poz. ${added.to})`:'Kolejność zakupów bez zmian';
}

function activationFor(card,context) {
  const key=catalog.get(card.id)?.api.replace(/^ARAM_/,'');
  const rule=rules[key],{selection={},champion={},enemy={},game,inventory,manual,gold}=context;
  const owned=inventory?.items?.map(item=>item.id)|| (manual?selection.owned||[]:[]);
  const impact=purchaseImpact(card.id,context.offerSnapshot,owned);
  if(!rule||['selected','conflict','unknown'].includes(card.status))return {label:'Koszt nieustalony',impact};
  let targets=rule.upgrade?upgradeTargets(rule,champion,{...selection,owned},enemy):rule.quest||rule.repeat?rule.items:[];
  let targetNote='';
  if(rule.spellbladeUpgrade){
    const held=rule.items.find(id=>owned.includes(id));
    targets=[held||3057];
    targetNote='Pierwszy efekt Spellblade';
  }else if(key==='Upgrade_ZH'){
    const held=[3157,228002,2420].find(id=>owned.includes(id));
    targets=[held||2420];targetNote='Ruch w stazie · pełny efekt z Zhonyą';
  }else if(rule.anyItem)targets=targets.slice(0,1);
  const blocked=targets?.filter(id=>!owned.includes(id) && !itemFitsResource(id,game,champion.alias)) || [];
  if(blocked.length){
    const names=blocked.map(id=>game.items.get(id)?.name||String(id));
    return {label:'Zakup poza buildem tej postaci',details:[names.join(', ')+' · przedmiot z maną'],impact};
  }
  if(!targets?.length){
    const needsItem=['KingMe','WeaponOfDestiny','DoransBiggestFan'].includes(key);
    const label=needsItem?'Zależne od wybranego przedmiotu':rule.quest?'Zadanie bez zakupu':key==='HexCore'?'Pierwszy Hex Core z karty':key==='CrimsonCobalt'?'Bez wymaganego zakupu':'Bez wskazanego przedmiotu';
    return {label,impact};
  }
  const grant=componentGrants[key],quote=quoteItems(targets,context,grant);
  const names=quote.rows.map(row=>row.name).join(' + ');
  const details=[];
  if(targetNote)details.push(targetNote);
  else if(rule.anyItem)details.push('Jeden dopasowany wariant');
  if(key==='Upgrade_SwordOfBlossom'||key==='Upgrade_Ravenous')details.push('Koszt części efektu związanej z przedmiotem');
  if(quote.rows.every(row=>row.held)){
    if(goldGrants[key])details.push(`Karta daje +${goldGrants[key]} zł`);
    return {label:`Już masz: ${names}`,details,impact,cost:0,missing:0};
  }
  const exact=quote.exact&&quote.cost!==null;
  const label=quote.cost===null?`Brak ceny: ${names}`:exact?`${names} · ${quote.cost} zł`:`${names} · do ${quote.cost} zł`;
  if(!quote.exact)details.push(manual?'Ręczny ekwipunek · komponenty niepotwierdzone':'Brak bieżącego ekwipunku');
  if(quote.credit)details.push(`Twoje komponenty: ${quote.credit} zł`);
  if(quote.grantCredit)details.push(`${game.items.get(grant)?.name} z karty wliczony`);
  if(key==='Quest_UltraHydra')details.push('Kolejne darmowe Tiamaty obniżą koszt po odbiorze');
  const bonus=goldGrants[key]||0;
  const missing=exact&&Number.isFinite(gold)&&gold>=0?Math.max(0,quote.cost-Math.floor(gold)-bonus):null;
  if(bonus)details.push(`Karta daje +${bonus} zł`);
  if(missing!==null)details.push(missing?`Po wyborze zabraknie ${missing} zł`:'Po wyborze wystarczy złota');
  return {label,details,impact,cost:quote.cost,missing,credit:quote.credit};
}

function questProgress(context,receipts=[]) {
  const {selection={},game}=context;
  return (selection.augments||[]).filter(questFor).map(id=>{
    const card=catalog.get(id),rule=rules[card.api.replace(/^ARAM_/,'')],quest=questFor(id);
    const automatic=receipts.includes(id),done=automatic||selection.completed?.includes(id);
    const quote=quoteItems(rule.items||[],context);
    const status=automatic?`Nagroda wykryta: ${game.items.get(quest.reward)?.name||quest.reward}`:
      done?'Ukończenie potwierdzone ręcznie':quest.condition||'Czekam na nagrodę w ekwipunku';
    return {id,name:card.name,status,done:!!done,known:quote.exact||quote.manual,exact:quote.exact,rows:done?[]:quote.rows};
  });
}

module.exports={activationFor,questProgress};
