const test=require('node:test');
const assert=require('node:assert/strict');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const data=require('../data/champions.json');
const engine=require('../src/engine');
const {inventoryOf}=require('../src/liveclient');
const {recipeFor,shopPlan}=require('../src/shop-plan');
const {liveSituations}=require('../src/live-build');
const {itemAvailable}=require('../src/itemrules');
const inv=(ids,alias='Ahri',mode='mayhem')=>inventoryOf(ids.map((itemID,slot)=>({itemID,slot})),game,alias,mode);
const enemy=(ids,alias='Lux')=>({championId:game.championsByAlias.get(alias).id,alias,items:inv(ids,alias).items});
const build=(id,extra={})=>({alias:'Ahri',mode:'mayhem',items:[{id}],boots:{id:null},inventory:{bootsSlot:'none'},...extra});
const plan=(id,ids,gold,extra={})=>shopPlan(build(id,extra),{inventory:inv(ids),gold},game,'live');

function roleShop(alias,position,ids=[],gold=500,gameTime=0,mode='classic',champions=data) {
  const inventory=inv(ids,alias,mode);
  const state={mode,me:{championId:game.championsByAlias.get(alias).id,position},allies:[],enemies:[],liveInventory:inventory};
  const build=engine.buildFor(alias,state,game,champions);
  return {build,state,shop:shopPlan(build,{inventory,gold,gameTime},game,'live')};
}

test('pierwszy zakup na supporcie i w jungli zgadza się z zestawem startowym roli',()=>{
  for (const [alias,role,starter,cost] of [['Leona','utility',3865,400],['Warwick','jungle',1102,450]]) {
    const {build,state,shop}=roleShop(alias,role);
    const start=engine.itemSetFor(build,alias,state,game,data).blocks.find(b=>b.type==='Start');
    assert.equal(Number(start.items[0].id),starter);
    assert.equal(shop.target.id,starter);
    assert.equal(shop.purchase.id,starter);
    assert.equal(shop.purchase.cost,cost);
    assert.equal(shop.remaining,500-cost);
    assert.equal(shop.target.starter,true);
    assert.equal(shop.comparison,undefined);
    assert.equal(roleShop(alias,role,[2003],450,8).shop.purchase.id,starter);
    assert.equal(roleShop(alias,role,[],cost-1,9).shop.missing,1);
    assert.equal(roleShop(alias,role,[starter],50,12).shop.target.starter,undefined);
    assert.equal(roleShop(alias,role,[],500,500).shop.target.starter,undefined);
    assert.equal(roleShop(alias,'',[],500,0).build.roleStarter,null);
    for(const mode of ['practice','aram','mayhem'])assert.equal(roleShop(alias,role,[],500,0,mode).build.roleStarter,null);
  }
  assert.equal(roleShop('Warwick','jungle',[1103],50,12).shop.target.starter,undefined);
  assert.equal(roleShop('Leona','utility',[1093],500,0).shop.purchase.id,3865);
  const otherRole={...data,champions:{...data.champions,Warwick:{...data.champions.Warwick,starters:[1055,2003]}}};
  assert.equal(roleShop('Warwick','jungle',[],500,0,'classic',otherRole).shop.purchase.id,1102);
});

test('Zaahen może połączyć składniki z różnych gałęzi Trinity w pełnym ekwipunku za 600 złota',()=>{
  const ids=[1036,1042,1001,1033,2003,1029];
  const p=plan(3078,ids,600,{alias:'Zaahen',mode:'practice'});
  assert.equal(p.target.id,3078);assert.equal(p.target.credit,600);
  assert.equal(p.purchase.id,3051);assert.equal(p.purchase.credit,600);
  assert.equal(p.purchase.cost,600);assert.equal(p.remaining,0);
  const waiting=plan(3078,ids,599,{alias:'Zaahen',mode:'practice'});
  assert.equal(waiting.savingFor.id,3051);assert.equal(waiting.missing,1);
});

test('Leona po sprzedaży butów zachowuje prawdziwy przedmiot wsparcia i pięć pełnych zakupów',()=>{
  const items=[3190,3109,3075,3143,3083];
  const {build,shop}=roleShop('Leona','utility',[3869,...items],800,1800);
  assert.equal(build.inventory.bootsSlot,'none');
  assert.equal(build.boots.id,null);
  assert.equal(build.inventory.reservedSlots,1);
  assert.equal(build.inventory.itemSlots,5);
  assert.deepEqual(build.items.map(i=>i.id),items);
  assert.ok(build.items.every(i=>i.owned));
  assert.equal(build.reservedSlot,'Celestial Opposition');
  assert.deepEqual(build.choiceWarnings,[]);
  assert.doesNotMatch(build.decisionSummary,/przypię/i);
  assert.equal(shop.status,'complete');
  const withBoots=roleShop('Leona','utility',[3869,3047,...items.slice(0,4)],500,1800);
  assert.equal(withBoots.build.boots.owned,true);
  assert.equal(withBoots.build.inventory.itemSlots,4);
  const emptySlot=roleShop('Leona','utility',[3869,...items.slice(0,4)],500,1800);
  assert.equal(emptySlot.build.inventory.bootsSlot,'inventory');
  assert.ok(emptySlot.build.boots.id);
});

test('Kup teraz: gotowy przedmiot, największy komponent lub brakujące złoto',()=>{
  let p=plan(3089,[],3500);assert.equal(p.purchase.id,3089);assert.equal(p.purchase.cost,3500);assert.equal(p.remaining,0);
  p=plan(3089,[],1500);assert.equal(p.purchase.id,1058);assert.equal(p.purchase.cost,1200);assert.equal(p.purchase.component,true);
  p=plan(3089,[],1199);assert.equal(p.status,'save');assert.equal(p.missing,1);assert.equal(p.savingFor.id,1058);
  p=plan(3089,[],0);assert.equal(p.status,'save');assert.equal(p.missing,1200);
});

test('receptura liczy każdą posiadaną sztukę raz i proponuje tylko brakujące składniki',()=>{
  let p=plan(3089,[1058],2300);assert.equal(p.purchase.id,3089);assert.equal(p.purchase.cost,2300);assert.equal(p.target.credit,1200);
  p=plan(3089,[1058],1200);assert.equal(p.purchase.id,1058,'Druga różdżka jest potrzebna');
  p=plan(3089,[1058,1058],1100);assert.equal(p.purchase.id,3089);assert.equal(p.purchase.credit,2400);
  p=plan(3089,[1058,1058],1099);assert.equal(p.status,'save');assert.equal(p.savingFor.id,3089);assert.equal(p.missing,1);
  p=plan(3036,[3035],1300);assert.equal(p.purchase.id,6670,'Nie kupujemy ponownie Last Whisper');
  assert.equal(recipeFor(3036,inv([1036]),game).credit,350,'Jeden miecz nie wypełnia dwóch gałęzi');
  assert.equal(recipeFor(3036,inv([1036,1036]),game).credit,700);
  p=plan(3036,[3035,6670],550);assert.equal(p.purchase.cost,550);assert.equal(p.purchase.id,3036);
});

test('pełny ekwipunek pozwala łączyć części, ale nie kupić siódmego przedmiotu',()=>{
  const full=[1058,1058,6655,3020,3116,3040];
  const p=plan(3089,full,1100);assert.equal(p.purchase.id,3089);
  assert.equal(plan(3089,[6655,3020,3116,3040,3157,3135],10000).status,'full');
  const wait=plan(3089,full,1000);assert.equal(wait.status,'save');assert.equal(wait.missing,100);
  const complete=shopPlan(build(3089,{items:[{id:3089,owned:true}]}),{inventory:inv([3089]),gold:9999},game,'live');
  assert.equal(complete.status,'complete');assert.equal(complete.purchase,undefined);
});

test('aktualne złoto i spójny automatyczny ekwipunek są wymagane do rekomendacji',()=>{
  for(const status of ['waiting','stale','manual']){
    const p=shopPlan(build(3089),{inventory:inv([1058]),gold:5000},game,status);
    assert.equal(p.status,status);assert.equal(p.gold,null);assert.equal(p.purchase,undefined);
  }
  for(const gold of [undefined,NaN,-1,'3000'])assert.equal(plan(3089,[],gold).purchase,undefined);
  const before=plan(3089,[1058],2300),after=plan(3089,[],3500);
  assert.equal(before.purchase.cost,2300);assert.equal(after.purchase.cost,3500,'Sprzedany komponent nie daje zniżki');
});

test('zakupy respektują mapę, blokady i nieznane receptury',()=>{
  const clone={...game,items:new Map(game.items)};
  clone.items.set(3089,{...game.items.get(3089),requiredBuffCurrencyName:'quest'});
  assert.equal(shopPlan(build(3089),{inventory:inv([]),gold:9999},clone,'live').status,'unavailable');
  clone.items.set(3089,{...game.items.get(3089),from:[3089]});
  assert.equal(shopPlan(build(3089),{inventory:inv([]),gold:9999},clone,'live').status,'unknown-price');
  clone.items.set(3089,{...game.items.get(3089),priceTotal:undefined});
  assert.equal(shopPlan(build(3089),{inventory:inv([]),gold:9999},clone,'live').status,'unknown-price');
  assert.equal(plan(3040,[],9999).status,'unavailable','Transformacja Serapha nie jest zakupem');
});

test('stary cel, ulepszenie i alternatywa z maną nie wracają do sklepu postaci bez many',()=>{
  for(const alias of ['Yasuo','Zed','Akali']){
    const options={alias,items:[{id:3110},{id:3143}],nextPurchase:{id:3110},
      mayhem:{nextItem:{id:3110,upgrade:true}},alternatives:[{id:3004},{id:3053}]};
    const p=plan(3110,[],5000,options);
    assert.equal(p.target.id,3143,alias);
    assert.deepEqual(p.comparison.map(option=>option.target.id),[3143,3053],alias);
  }
  assert.equal(plan(3110,[],5000,{alias:'Ornn'}).purchase.id,3110);
});

test('zasada zasobu dotyczy także komponentów i celu oszczędzania, a posiadane części pokrywają koszt',()=>{
  const catalog={...game,items:new Map(game.items)};
  // Exercise a patch where a resource-neutral item builds from a mana component.
  catalog.items.set(3143,{...game.items.get(3143),from:[1027,1029]});
  const quote=(alias,ids,gold)=>shopPlan(build(3143,{alias}),{inventory:inv(ids,alias),gold},catalog,'live');
  assert.equal(quote('Zed',[],300).purchase.id,1029);
  assert.equal(quote('Akali',[],100).savingFor.id,1029);
  assert.equal(quote('Ornn',[],300).purchase.id,1027);
  assert.equal(quote('Yasuo',[1027],5000).target.credit,300);
  const mirror=plan(4642,[],200,{alias:'Akali'});
  assert.equal(mirror.target.id,4642);
  assert.equal(mirror.status,'save');
  assert.equal(mirror.savingFor.id,2022);
  assert.equal(plan(4642,[],200,{alias:'Ahri'}).purchase.id,1004);
});

test('buty mają własny krok zakupów, quest ADC nie daje miejsca przed ukończeniem',()=>{
  const b=build(3031,{alias:'Ashe',mode:'classic',items:[{id:3031,owned:true},{id:3036}],
    boots:{id:3006},inventory:{bootsSlot:'quest'},quest:{extraSlot:'boots'}});
  let p=shopPlan(b,{inventory:inv([3031,1001],'Ashe','classic'),gold:800},game,'live');
  assert.equal(p.purchase.id,3006);assert.equal(p.purchase.cost,800);
  p=shopPlan(b,{inventory:inv([3031,2422],'Ashe','classic'),gold:800},game,'live');
  assert.equal(p.purchase.id,3006);assert.equal(p.purchase.cost,800,'Darmowe buty z run też są komponentem');
  b.boots.owned=true;
  const full=[3031,3006,3085,3072,3026,6672];
  p=shopPlan(b,{inventory:inv(full,'Ashe','classic'),gold:9999},game,'live');assert.equal(p.status,'full');
  const side=inventoryOf(full.map((itemID,slot)=>({itemID,slot:itemID===3006?7:slot})),game,'Ashe','classic',true);
  p=shopPlan(b,{inventory:side,gold:9999},game,'live');assert.equal(p.purchase.id,3036);
});

test('typ odpowiedzi zależy od zakupów wroga i roli, sam komponent nie przestawia buildu',()=>{
  const cases=[['adc',[3143,3110],'live-armor',3036],['mage',[4401,3111],'live-mr',3135],
    ['tank',[3031,3085],'crit',3143],['tank',[3006,3085],'onhit',3110],['mage',[3083,3143],'live-health',6653]];
  for(const [role,ids,key,want] of cases){
    const s=liveSituations([enemy(ids)],role,game,id=>itemAvailable(id,game,'mayhem','Ahri'));
    assert.equal(s.find(x=>x.key===key)?.myItem,want,role+key);
  }
  assert.equal(liveSituations([enemy([1029,1031])],'adc',game,()=>true).length,0);
  assert.equal(liveSituations([enemy([3143,3110])],'mage',game,()=>true).some(x=>x.myItem===3036),false);
  assert.equal(liveSituations(null,'tank',game,()=>true).length,0);
});

test('kupione itemy pozostają, przebicie trafia przed dalszy rdzeń; sprzedaż usuwa powód',()=>{
  for(const mode of ['mayhem','aram','classic']){
    const inventory=inv([3031,3006],'Ashe',mode);
    const s={mode,me:{championId:22,position:'bottom'},allies:[],enemies:[{championId:99}],liveInventory:inventory,
      mayhem:{owned:inventory.owned,ownedBoots:inventory.ownedBoots},liveEnemies:[enemy([3143,3110]) ]};
    const b=engine.buildFor('Ashe',s,game,data);
    assert.equal(b.items[0].id,3031);assert.equal(b.items[0].owned,true);assert.equal(b.boots.owned,true);
    assert.equal(b.items.find(i=>!i.owned).id,3036,mode);assert.match(b.items.find(i=>i.id===3036).why,/kupiony pancerz/);
    const after=engine.buildFor('Ashe',{...s,liveEnemies:[enemy([])]},game,data);
    assert.equal(after.liveAdaptation.length,0);
  }
});

test('zakupy nie dublują wykluczających się penetracji i respektują ręczne przypięcia',()=>{
  const inventory=inv([3031,3006],'Ashe');
  const s={mode:'mayhem',me:{championId:22},allies:[],enemies:[{championId:16}],liveInventory:inventory,
    mayhem:{owned:inventory.owned,ownedBoots:inventory.ownedBoots},liveEnemies:[enemy([3143,3110],'Soraka')]};
  const b=engine.buildFor('Ashe',s,game,data);
  assert.equal(b.items.filter(i=>[3033,3036,6694,3302].includes(i.id)).length,1);
  assert.ok(b.items.some(i=>i.id===3033));
  const pinned=engine.buildFor('Ashe',{...s,choices:{items:[{id:3085,slot:1}]}},game,data);
  assert.equal(pinned.items[1].id,3085);assert.equal(pinned.items[0].id,3031);
});
