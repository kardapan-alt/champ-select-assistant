const test=require('node:test'),assert=require('node:assert/strict');
const {BuildChanges,readoutFor}=require('../src/build-insight');
const i=(id,name,extra={})=>({id,name,why:'Powód '+name,...extra});
const core=i(1,'Rdzeń'),armor=i(2,'Przebicie'),late=i(3,'Późny zakup');
const response={item:2,text:'Lux: kupiona odporność',evidence:[{championId:99,name:'Lux',items:[{id:44,name:'Odporność'}]}]};
const b=(items,target=items.find(i=>!i.owned),extra={})=>({items,shop:{target,gold:1000},liveAdaptation:[],...extra});
const context={key:'match1',status:'live',enemies:[]};

test('pierwszy odczyt i samo złoto nie udają zmiany buildu',()=>{
  const t=new BuildChanges(),build=b([core,armor,late]);
  assert.equal(t.observe(build,context,1000),null);
  build.shop.gold=2000;
  assert.equal(t.observe(build,context,2000),null);
  build.shop.target.cost=123;
  assert.equal(t.observe(build,context,3000),null);
  assert.equal(t.observe({...build,shop:{status:'waiting',gold:null}},context,4000),null);
  assert.equal(t.observe(build,context,5000),null,'Brak złota nie może wymazać poprzedniego celu');
});
test('nowe zakupy wroga wyjaśniają konkretny awans itemu, bez odświeżania komunikatu co odczyt',()=>{
  const t=new BuildChanges();t.observe(b([core,late,armor]),context,1000);
  const next=b([core,armor,late],core,{liveAdaptation:[response]});
  const change=t.observe(next,context,2000);
  assert.equal(change.title,'Wcześniej: Przebicie');assert.deepEqual(change.causes,['Lux: kupiona odporność.']);
  assert.deepEqual(change.before,['Rdzeń','Późny zakup','Przebicie']);assert.deepEqual(change.after,['Rdzeń','Przebicie','Późny zakup']);
  assert.equal(change.evidence[0].items[0].name,'Odporność');
  assert.equal(t.observe(next,context,4000).at,2000);
});
test('przerwa i niezweryfikowani przeciwnicy nie są sprzedażą; powrót porównuje potwierdzone dane',()=>{
  const t=new BuildChanges(),first=b([core,armor,late],core,{liveAdaptation:[response]});
  t.observe(first,context,1000);
  assert.equal(t.observe(b([core,late,armor]),{...context,status:'stale',enemies:null},2000),null);
  assert.equal(t.observe(b([core,late,armor]),{...context,enemies:null},3000),null);
  assert.equal(t.observe(first,context,4000),null);
  assert.ok(t.observe(b([core,late,armor]),context,5000));
});
test('nowo posiadany przedmiot przesuwa cel bez przypisywania go niezmienionym zakupom wroga',()=>{
  const t=new BuildChanges();t.observe(b([core,armor,late],core,{liveAdaptation:[response]}),context,1000);
  const event=t.observe(b([{...core,owned:true},armor,late],armor,{liveAdaptation:[response]}),context,2000);
  assert.equal(event.title,'Następny cel: Przebicie');assert.deepEqual(event.causes,['Ekwipunek: odczytano Rdzeń.']);
  assert.equal(event.beforeTarget,'Rdzeń');assert.equal(event.afterTarget,'Przebicie');
});
test('nowy mecz usuwa poprzednią zmianę, ręczny tryb nie dopisuje zakupów',()=>{
  const t=new BuildChanges();t.observe(b([core,armor]),context,1000);
  const event=t.observe(b([armor,core]),context,2000);assert.ok(event);
  assert.equal(t.observe(b([late]),{...context,status:'manual'},3000),event);
  assert.equal(t.observe(b([late]),{...context,key:'match2',status:'waiting'},4000),null);
  assert.equal(t.observe(b([late]),{...context,key:'match2'},5000),null);
});
test('zmiana augmentów i przypięć jest nazwana tylko jeśli zmienia plan',()=>{
  const t=new BuildChanges();t.observe(b([core,armor]),context,1000);
  const next=b([{...late,pinned:true},armor],late,{mayhem:{selection:{augments:[5],effects:{},completed:[]}}});
  assert.deepEqual(t.observe(next,context,2000).causes,['Zmieniono zestaw lub efekty augmentów.','Zmieniono przypięte przedmioty.']);
});
test('status rozdziela ekwipunek, wrogów i OCR; brak potwierdzenia nie oznacza kompletnego zestawu augmentów',()=>{
  const build={mayhem:{screen:{enabled:true,config:{mode:'auto'},status:'paused'},hints:[{},{}],unknown:[{}],
    headliner:{name:'K/DA'},headlinerDetection:{auto:true,source:'screen',available:true}}};
  const r=readoutFor(build,{status:'live',liveAt:2000,enemiesAt:1000,enemies:null,inventory:{items:[{kind:'unknown'}]},screenAt:500});
  assert.equal(r.inventory.status,'live');assert.equal(r.inventory.unknown,1);
  assert.equal(r.inventory.goldKnown,false);
  assert.equal(readoutFor(build,{status:'live',gold:0}).inventory.goldKnown,true);
  assert.equal(r.enemies.status,'stale');assert.equal(r.enemies.at,1000);
  assert.equal(r.screen.count,2);assert.equal(r.screen.unknown,1);assert.equal(r.screen.status,'paused');
  assert.equal(r.headliner.source,'screen');
  assert.equal(readoutFor(build,{status:'manual',enemies:[],session:{autoInventory:false}}).enemies.status,'live');
});
test('widok odlicza wiek danych i oznacza przeterminowanie nawet bez nowego komunikatu z main',()=>{
  const fs=require('fs'),vm=require('vm');
  let tick,renders=0;
  const context=vm.createContext({setInterval:fn=>{tick=fn;},Date:{now:()=>10000},esc:s=>String(s).replaceAll('<','&lt;')});
  vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/insight.js'),'utf8'),context);
  assert.equal(vm.runInContext("freshRead({status:'live',at:4000})",context),false);
  assert.equal(vm.runInContext("freshRead({status:'live',at:4001})",context),true);
  assert.equal(vm.runInContext("freshRead({status:'live',at:11000})",context),false);
  assert.equal(vm.runInContext("readAge(8000)",context),'2 s temu');
  context.build={readout:{inventory:{status:'live',at:4000},enemies:{status:'waiting'},screen:{count:2,enabled:true,status:'scanning',at:4000},headliner:{name:'<img>',source:'manual'}}};
  const html=vm.runInContext('readoutRows(build)',context);
  assert.match(html,/Przerwa/);assert.match(html,/Brak świeżego obrazu/);assert.match(html,/Zapisane: 2/);assert.ok(!html.includes('<img>'));
  Object.assign(context,{labActive:false,lastState:{status:'loading-screen',final:{build:context.build}},
    document:{querySelector:()=>({}),querySelectorAll:()=>[]},patch:()=>{},render:()=>{renders++;}});
  tick();assert.equal(renders,1,'Zegar musi usunąć przeterminowaną poradę zakupu');
  context.build.readout.inventory.at=9999;tick();assert.equal(renders,1,'Świeże dane nie wymagają przebudowy całego widoku');
});
