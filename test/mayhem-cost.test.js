const test=require('node:test'),assert=require('node:assert/strict');
const {activationFor,questProgress}=require('../src/mayhem-cost');
const {MayhemSession,effectiveSelection,adaptation}=require('../src/mayhem');
const {buildGameData}=require('../src/gamedata');
const game=buildGameData(require('../data/catalog.json'));
const inv=(...ids)=>({items:ids.map((id,slot)=>({id,slot,count:1,kind:'component'})),owned:[],ownedBoots:null});
const offer=(id,context)=>activationFor({id},{game,...context});
const row=(id,selection,extra)=>questProgress({selection:{augments:[id],...selection},game,...extra})[0];

test('Stormsurge wycenia wyłącznie obecne komponenty i jeden gwarantowany grant po wyborze',()=>{
  const storm=offer(3150,{inventory:inv(3145),gold:350});
  assert.equal(storm.cost,1700);assert.equal(storm.credit,1100);assert.equal(storm.missing,850);
  assert.ok(storm.details.some(x=>x.includes('+500')));
  assert.equal(offer(3150,{inventory:inv(3145),gold:1200}).missing,0);
  assert.equal(offer(3150,{inventory:inv(4646),gold:0}).cost,0);
  assert.equal(offer(3150,{inventory:inv(3145)}).missing,null);
  const stale=offer(3150,{selection:{owned:[4646]},gold:2500});
  assert.equal(stale.missing,null);assert.equal(stale.cost,2800);assert.match(stale.label,/do 2800/);
  assert.equal(offer(3150,{manual:true,selection:{owned:[4646]}}).cost,0);
});

test('Cobalt na Zedzie nie wymaga zakupu, impact pochodzi z faktycznej symulacji oferty',()=>{
  const before=[{id:6692,name:'Eclipse'},{id:3158,name:'Ionian Boots'},{id:3142,name:"Youmuu's"}];
  const changed=[before[1],{id:4646,name:'Stormsurge'},before[0]];
  const snap={before,cards:[{id:3088,plan:before},{id:3150,plan:changed}]};
  const ctx={offerSnapshot:snap,champion:{alias:'Zed'},inventory:inv(),gold:0};
  assert.match(offer(3088,ctx).label,/Bez wymaganego zakupu/);
  assert.match(offer(3088,ctx).impact,/bez zmian/);
  assert.match(offer(3150,ctx).impact,/Później: Eclipse \(1 → 3\)/);
});

test('warianty Immolate nie sumują dwóch receptur, Spellblade działa od samego Sheen',()=>{
  const immolate=offer(1319,{inventory:inv(6664,3068),enemy:{apShare:.1},gold:0});
  assert.equal(immolate.cost,0);assert.equal(immolate.label.includes('+'),false);
  const missing=offer(1319,{inventory:inv(),enemy:{apShare:.7},gold:0});
  assert.match(missing.label,/Hollow Radiance/);assert.equal(missing.cost,2800);
  assert.equal(offer(1996,{inventory:inv(3057),gold:0}).cost,0);
  assert.equal(offer(1996,{inventory:inv(),gold:0}).cost,900);
});

test('wspólne komponenty przypisane do jednej receptury, grant karty wyłącznie w ofercie',()=>{
  const live=inv(1058);
  const offerCost=offer(1156,{inventory:live,gold:0});
  assert.equal(offerCost.cost,3500+3250-1200-1200);
  assert.equal(offerCost.credit,1200);
  const progress=row(1156,{}, {inventory:live});
  assert.equal(progress.rows.reduce((sum,item)=>sum+item.cost,0),3500+3250-1200);
  assert.equal(progress.rows.flatMap(r=>r.components).length,1);
  assert.deepEqual(live,inv(1058));
  const condition=row(1152,{}, {inventory:inv(3084)});
  assert.equal(condition.done,false);assert.match(condition.status,/brak odczytu licznika/);
  const unknown=row(1156,{owned:[3089]},{});assert.equal(unknown.known,false);
  const manual=row(1156,{owned:[3089]},{manual:true});assert.equal(manual.rows[0].held,true);
});

test('potwierdzenie nagrody jest trwałe dla aktywnego zadania w tym meczu i zatrzymuje ponowne zakupy',()=>{
  let saved;const store=new MayhemSession(null,value=>{saved=value;});
  const {key,selection}=store.ensure(777,'Ahri');
  store.setInventory(key,inv(228002));
  assert.deepEqual(effectiveSelection(store.value).completed,[]);
  store.set(key,{...selection,augments:[1156]});
  store.setInventory(key,inv(3089,3157));
  assert.deepEqual(effectiveSelection(store.value).completed,[]);
  store.setInventory(key,inv(228002));
  store.setInventory(key,inv());
  const resumed=new MayhemSession(saved);
  const effective=effectiveSelection(resumed.value);
  assert.deepEqual(effective.completed,[1156]);assert.deepEqual(resumed.value.selection.completed,[]);
  assert.ok(adaptation(effective,{class:'mage',dmg:'ap'},{game}).excluded.has(3089));
  const quest=questProgress({game,selection:effective},resumed.value.questReceipts)[0];
  assert.equal(quest.done,true);assert.match(quest.status,/Wooglet/);
  resumed.patch(key,{selection});assert.deepEqual(resumed.value.questReceipts,[]);
  resumed.set(key,{...selection,augments:[1152,1154],completed:[1152]});
  resumed.setInventory(key,inv(3084,4403,994403));assert.deepEqual(effectiveSelection(resumed.value).completed,[1152]);
  assert.match(questProgress({game,selection:effectiveSelection(resumed.value)})[0].status,/ręcznie/);
  assert.deepEqual(effectiveSelection(resumed.ensure(778,'Ahri')).completed,[]);
});
