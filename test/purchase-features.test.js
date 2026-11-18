const test=require('node:test'),assert=require('node:assert/strict');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const data=require('../data/champions.json'),engine=require('../src/engine');
const {inventoryOf}=require('../src/liveclient'),{shopPlan}=require('../src/shop-plan');
const {PurchaseGoal,withPurchaseGoal,purchaseKey,canBuy}=require('../src/next-purchase');
const {patchOf,patchStatus,dataFreshness}=require('../src/data-freshness');
function fixture(mode='mayhem',owned=[6655,3020]){
  const inventory=inventoryOf(owned.map((itemID,slot)=>({itemID,slot})),game,'Ahri',mode);
  const state={mode,me:{championId:103,position:'middle'},allies:[],enemies:[{championId:99}],choices:{items:[]},
    liveInventory:inventory,liveEnemies:[],mayhem:{augments:[],owned:inventory.owned,ownedBoots:inventory.ownedBoots}};
  return {state,inventory,base:engine.buildFor('Ahri',state,game,data)};
}
test('przypięty cel wyprzedza resztę zakupów w Mayhem, ARAM i SR, bez zmiany zapisanych wyborów',()=>{
  for(const mode of ['mayhem','aram','classic']){
    const f=fixture(mode),before=JSON.stringify(f.state.choices);
    const r=withPurchaseGoal('Ahri',f.state,game,data,f.base,3089);
    assert.equal(r.active,true);assert.equal(r.build.items.find(i=>!i.owned).id,3089);
    const shop=shopPlan(r.build,{inventory:f.inventory,gold:1200},game,'live');
    assert.equal(shop.target.id,3089);assert.equal(shop.purchase.id,1058);
    assert.equal(JSON.stringify(f.state.choices),before);assert.ok(r.build.items.find(i=>i.id===6655).owned);
  }
});
test('nowe zakupy przeciwnika nie zmieniają przypiętego celu',()=>{
  const f=fixture();
  f.state.liveEnemies=[{championId:99,alias:'Lux',items:inventoryOf([{itemID:4401,slot:0},{itemID:3111,slot:1}],game,'Lux').items}];
  const natural=engine.buildFor('Ahri',f.state,game,data);
  assert.ok(natural.liveAdaptation.some(a=>a.item===3135));
  const r=withPurchaseGoal('Ahri',f.state,game,data,natural,3089);
  assert.equal(shopPlan(r.build,{inventory:f.inventory,gold:3500},game,'live').target.id,3089);
});
test('odczytany zakup kończy cel, a brak danych nie generuje podpowiedzi za stare złoto',()=>{
  const f=fixture('mayhem',[6655,3020,3089]);
  const r=withPurchaseGoal('Ahri',f.state,game,data,f.base,3089);assert.equal(r.done,true);assert.equal(r.active,undefined);
  assert.equal(shopPlan({...f.base,nextPurchase:{id:3135}},null,game,'stale').purchase,undefined);
});
test('cel nie omija wykluczeń rodzin, posiadanych butów ani dostępności trybu',()=>{
  const f=fixture('mayhem',[6655,3020,3135]);
  assert.equal(withPurchaseGoal('Ahri',f.state,game,data,f.base,3137).active,undefined);
  assert.equal(withPurchaseGoal('Ahri',f.state,game,data,f.base,3111).active,undefined);
  assert.equal(withPurchaseGoal('Ahri',f.state,game,data,f.base,2055).active,undefined);
  assert.equal(withPurchaseGoal('Ahri',f.state,game,data,f.base,-1).active,undefined);
});
test('augment wykluczający przedmiot jest respektowany także przez przypięcie',()=>{
  const rules=require('../src/mayhem-rules'),catalog=require('../data/mayhem-augments.json').augments;
  const entry=Object.entries(rules).find(([,r])=>r.exclude?.includes(3031));
  assert.ok(entry,'Katalog zawiera wykluczenie Infinity Edge');
  const a=catalog.find(a=>a.api.replace(/^ARAM_/,'')===entry[0]);assert.ok(a);
  const f=fixture();f.state.mayhem.augments=[a.id];
  const base=engine.buildFor('Ahri',f.state,game,data);
  assert.equal(withPurchaseGoal('Ahri',f.state,game,data,base,3031).active,undefined);
});
test('cel zakupu z maną zapisany przez starszą wersję wraca do planu zgodnego z zasobem',()=>{
  for(const alias of ['Zed','Yasuo']){
    const f=fixture('mayhem',[]);
    f.state.me.championId=game.championsByAlias.get(alias).id;
    const base=engine.buildFor(alias,f.state,game,data);
    const goal=new PurchaseGoal({key:purchaseKey(1,alias,'mayhem'),revision:1,id:3110});
    assert.equal(canBuy(3110,game,base),false);
    const result=withPurchaseGoal(alias,f.state,game,data,base,goal.value.id);
    assert.equal(result.active,undefined);assert.equal(result.build,base);assert.match(result.reason,/many/);
  }
});
test('zapis celu przetrwa ponowne otwarcie; stary formularz i inny mecz nie nadpisują nowego celu',()=>{
  assert.notEqual(purchaseKey(1,'Ahri','mayhem','owner-a'),purchaseKey(1,'Ahri','mayhem','owner-b'));
  let saved;const a=new PurchaseGoal(null,v=>{saved=structuredClone(v);});
  a.ensure('1:Ahri:mayhem');a.set(a.value.key,0,3089);
  const b=new PurchaseGoal(saved);assert.equal(b.ensure('1:Ahri:mayhem').id,3089);
  assert.throws(()=>b.set(b.value.key,0,3135),/zmienił/);
  b.ensure('2:Ahri:mayhem');assert.equal(b.value.id,null);
  assert.throws(()=>b.set('1:Ahri:mayhem',1,3135),/zmienił/);
});
test('nieudany zapis celu nie zmienia stanu w pamięci',()=>{
  const a=new PurchaseGoal({key:'1',id:null,revision:0,notice:''},()=>{throw Error('dysk');});
  assert.throws(()=>a.set('1',0,3089),/dysk/);assert.equal(a.value.id,null);
});
test('numer patcha jest oddzielony od wersji kompilacji; brak wersji nie daje zgodności',()=>{
  assert.equal(patchOf('16.22.8348910+branch'), '16.22');assert.equal(patchOf('16.22+branch'),'16.22');
  assert.equal(patchStatus('16.22.9','16.22.1'),'match');assert.equal(patchStatus('16.23.1','16.22'),'different');
  for(const invalid of [null,{},'latest','2026-11-16'])assert.equal(patchStatus(invalid,'16.22'),'unknown');
});
test('aktualność rozróżnia dane klienta, wbudowane reguły, brak patcha i nowszy klient',()=>{
  const g={...game,provenance:{source:'client',version:'16.22.9',loadedAt:12345}};
  const current=dataFreshness(g,{connected:true,mode:'mayhem'});
  assert.equal(current.warning,false);assert.equal(current.rows.find(r=>r.name==='Reguły augmentów').status,'match');
  assert.equal(current.rows.find(r=>r.name==='Katalog augmentów').status,'unknown');
  assert.equal(current.rows.find(r=>r.name==='Reguły buildu i run').status,'unknown');
  g.provenance.version='16.23.0';assert.equal(dataFreshness(g,{connected:true,mode:'mayhem'}).warning,true);
  assert.equal(dataFreshness(g,{connected:false,mode:'mayhem'}).version,null);
  assert.equal(dataFreshness(game).rows[0].status,'unknown');
});
