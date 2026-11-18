const {itemAvailable,itemFitsResource,itemsCompatible}=require('./itemrules');
const {isBootItem,SUPPORT_ITEMS}=require('./rolequests');
const engine=require('./engine');

const purchaseKey=(gameId,alias,mode,owner='')=>`${owner?owner+':':''}${gameId}:${alias}:${mode}`;
function canBuy(id,game,build){
  const i=game.items.get(id);
  return Number.isSafeInteger(id)&&!!i&&itemAvailable(id,game,build.mode,build.alias)&&itemFitsResource(id,game,build.alias)
    &&!i.requiredBuffCurrencyName&&!i.requiredAlly&&!SUPPORT_ITEMS.has(id)
    &&!i.categories?.some(c=>['Trinket','Consumable'].includes(c));
}
// Overlay a match-only choice on the existing build engine. The same engine
// checks augment exclusions, role slots, boots and purchased items.
function withPurchaseGoal(alias,state,game,data,base,id){
  if(!id)return {build:base};
  const owned=[...base.items,base.boots].filter(i=>i?.owned);
  if(owned.some(i=>i.id===id))return {build:base,done:true,reason:'Cel jest już w ekwipunku. Przywrócono automatyczny plan.'};
  if(!canBuy(id,game,base)){
    const reason=itemFitsResource(id,game,alias) ? 'Przypięty przedmiot nie jest dostępny w tym trybie.' : 'Odpięto przedmiot z maną. Ta postać nie używa many.';
    return {build:base,reason:reason+' Przywrócono automatyczny plan.'};
  }
  if(base.mayhem?.nextItem?.upgrade&&base.mayhem.nextItem.id===id)return {build:{...base,nextPurchase:{id}},active:true};
  const choices=structuredClone(state.choices||{});
  if(isBootItem(id,game)){
    if(base.boots?.owned||base.inventory.bootsSlot==='none')return {build:base,reason:'Buty są już posiadane lub ich zakup jest zablokowany.'};
    choices.boots=id;
  }else{
    const existing=base.items.find(i=>i.id===id&&!i.owned&&i.pinned);
    const slot=existing?.slot??base.items.find(i=>!i.owned&&!i.pinned)?.slot;
    if(slot==null)return {build:base,reason:'Brak miejsca w planie: pozostałe sloty są zajęte lub przypięte.'};
    const other=(choices.items||[]).filter(p=>p.id!==id&&p.slot!==slot);
    if(!itemsCompatible(id,[...owned.map(i=>i.id),...other.map(i=>i.id)]))return {build:base,reason:'Cel koliduje z posiadanym lub przypiętym przedmiotem.'};
    choices.items=[...other,{id,slot}];
  }
  const next=engine.buildFor(alias,{...state,choices},game,data);
  const target=[...next.items,next.boots].find(i=>i?.id===id&&!i.owned);
  if(!target)return {build:base,reason:'Bieżące augmenty lub ograniczenia buildu wykluczają ten cel.'};
  target.why='Twój następny zakup';
  return {build:{...next,scope:base.scope,nextPurchase:{id}},active:true};
}
class PurchaseGoal {
  constructor(value=null,save=()=>{}){
    this.value=value&&typeof value.key==='string'&&Number.isSafeInteger(value.revision)&&value.revision>=0
      &&(value.id===null||Number.isSafeInteger(value.id)&&value.id>0)?value:null;
    this.save=save;
  }
  ensure(key){
    if(this.value?.key!==key)this.write({key,id:null,revision:0,notice:''});
    return this.value;
  }
  write(value){this.save(value);this.value=value;return value;}
  set(key,revision,id,notice=''){
    if(key!==this.value?.key||revision!==this.value.revision)throw Error('Cel lub mecz się zmienił. Wybierz przedmiot ponownie.');
    if(id!==null&&(!Number.isSafeInteger(id)||id<=0))throw Error('Nieprawidłowy przedmiot.');
    return this.write({key,id,revision:revision+1,notice});
  }
}
module.exports={purchaseKey,canBuy,withPurchaseGoal,PurchaseGoal};
