const test=require('node:test'),assert=require('node:assert/strict');
const {MatchReview}=require('../src/match-review');
const {synergies}=require('../src/augment-synergies');
const {headlinerView}=require('../src/headliners');
const {compareAugments}=require('../src/mayhem-compare');
const mayhem=require('../src/mayhem'),screen=require('../src/augment-screen');
const {shopPlan}=require('../src/shop-plan'),{inventoryOf}=require('../src/liveclient');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const catalog=require('../data/mayhem-augments.json').augments;
const id=k=>catalog.find(a=>a.api.replace(/^ARAM_/,'')===k).id;
const inv=ids=>inventoryOf(ids.map((itemID,slot)=>({itemID,slot})),game,'Ahri','mayhem');
const cmp=selection=>compareAugments(['HeavyHitter','Deft','BacktoBasics'].map(id),{selection,champion:{class:'tank'},build:{items:[]},game});
test('konkretna para augmentów podnosi dopasowanie; ręczna korekta i konwersja HP usuwają tę synergię',()=>{
  const s={augments:[id('Goliath'),id('HeavyHitter')]};
  assert.equal(synergies(s).length,1);
  assert.equal(synergies({...s,effects:{[id('Goliath')]:[]}}).length,0);
  assert.equal(synergies({augments:[...s.augments,id('GiftoftheDrowned')]}).length,0);
  assert.ok(cmp({augments:[id('Goliath')]}).cards[0].score>cmp({augments:[]}).cards[0].score);
});
test('Headliner jest walidowany, zachowany przez OCR i cofnięcie; dodatkowe augmenty nie znikają po piątym',()=>{
  const augments=['Deft','Goliath','HeavyHitter','ApexInventor','ItsCritical','JeweledGauntlet'].map(id);
  const selection=mayhem.validateSelection({augments,headliner:{id:'kda'}},game,'Ahri');
  assert.equal(selection.augments.length,6);
  const session={alias:'Ahri',selection,screenSlots:[],screenHistory:[]};
  const next=screen.reconcile(session,[id('Recursion')],game,'KIWI',{token:'one',at:1});
  assert.equal(next.selection.augments.length,7);assert.equal(next.selection.headliner.id,'kda');
  assert.equal(screen.undoRecognition(next,'one').selection.headliner.id,'kda');
  assert.throws(()=>mayhem.validateSelection({headliner:{id:'invented'}},game,'Ahri'));
  assert.throws(()=>mayhem.validateSelection({headliner:{id:'pentakill',ability:'X'}},game,'Ahri'));
});
test('Pentakill z R ostrzega o Back To Basics; HEARTSTEEL nie udaje oceny nieznanego modyfikatora',()=>{
  assert.ok(headlinerView({id:'pentakill',ability:'R'},{augments:[id('BacktoBasics')]}).warning);
  assert.equal(headlinerView({id:'pentakill',ability:'Q'},{augments:[id('BacktoBasics')]}).warning,null);
  const p=cmp({augments:[],headliner:{id:'pentakill',ability:'R'}});assert.ok(p.cards[2].warnings.some(w=>w.includes('Pentakill')));
  const h=cmp({augments:[],headliner:{id:'heartsteel'}});assert.ok(h.cards.every(c=>c.warnings.some(w=>w.includes('HEARTSTEEL'))));assert.equal(h.cards.some(c=>c.recommended),false);
});
test('porównanie liczy każdą ścieżkę osobno, uwzględnia części i nie zmienia przypiętego planu',()=>{
  const b={alias:'Ahri',mode:'mayhem',inventory:{bootsSlot:'none'},items:[{id:3089,pinned:true,why:'AP'},{id:3135,why:'MR wroga'}],alternatives:[{id:3157,why:'Ochrona'}]};
  const before=JSON.stringify(b),snapshot={inventory:inv([1058]),gold:2300};
  const result=shopPlan(b,snapshot,game,'live');assert.equal(JSON.stringify(b),before);
  assert.equal(result.comparison.length,3);assert.equal(result.comparison[0].purchase.id,3089);
  assert.ok(result.comparison[2].focus.includes('pancerz'));
  assert.equal(result.comparison[0].target.cost,2300);assert.ok(result.comparison[1].tradeoff.includes(result.target.name));
  assert.equal(shopPlan(b,snapshot,game,'stale').comparison,undefined);
});
const observe=(r,time=30,ids=[1058],extra={})=>r.observe({key:'1:Ahri:mayhem',alias:'Ahri',name:'Ahri',mode:'mayhem',
  snapshot:{status:'live',gameTime:time,inventory:inv(ids),gold:100,enemies:[{gameName:'DO_NOT_SAVE'}]},
  build:{items:[{id:3089,name:'Rabadon'}],shop:{target:{id:3089,name:'Rabadon',why:'AP'}},mayhem:{hints:[],synergies:[]}},...extra});
test('historia przeżywa restart, pomija identyczne odczyty i oznacza lukę bez dopisywania zakupów',()=>{
  let saved;let r=new MatchReview({},x=>saved=x);observe(r);const n=r.value.active.events.length;
  observe(r,31);assert.equal(r.value.active.events.length,n);
  r=new MatchReview(saved,x=>saved=x);r.gap();observe(r,50,[1058,1058]);
  assert.ok(r.value.active.events.some(e=>e.type==='gap'));assert.equal(r.value.active.events.at(-1).added[0].count,1);
  observe(r,40,[3089]);assert.equal(r.value.active.duration,50);
  r.finish('ended');r.finish('ended');assert.equal(r.list().length,1);
  assert.equal(JSON.stringify(saved).includes('DO_NOT_SAVE'),false);
  const updated=r.feedback(r.list()[0].key,{result:'win',rating:'mixed'});assert.equal(updated.feedback.rating,'mixed');
  assert.throws(()=>r.feedback('wrong',{result:'win',rating:'mixed'}));
  observe(r,70);assert.equal(r.value.active,null,'Zakończony mecz nie odradza się ze starego odczytu');
});
test('nowy mecz zamyka stary zapis i oddziela ekwipunek; historia zachowuje ostatnie 10 meczów',()=>{
  const r=new MatchReview();observe(r);
  for(let n=2;n<=12;n++)observe(r,1,[],{key:n+':Ahri:mayhem'});
  r.finish();assert.equal(r.list().length,10);assert.equal(r.list()[0].key,'12:Ahri:mayhem');assert.deepEqual(r.list()[0].items,[]);
});
