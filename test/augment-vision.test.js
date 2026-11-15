const test=require('node:test'),assert=require('node:assert/strict');
const vision=require('../src/augment-vision');
const screen=require('../src/augment-screen');
const catalog=require('../data/mayhem-augments.json').augments;
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const {MayhemSession}=require('../src/mayhem');
test('dokładne polskie i angielskie nazwy w obu pulach',()=>{
  for(const a of catalog)for(const pool of a.pools)for(const title of [a.name,a.english]){
    const r=vision.recognizeText([[title]],catalog,pool);
    assert.ok(r.status==='match'||r.status==='ambiguous');
    if(r.status==='match')assert.equal(r.id,a.id);
  }
  assert.equal(vision.recognizeText([['Genialny','Wynalazca']],catalog,'KIWI').id,1002);
});
test('opisy, nieznane nazwy i kilka propozycji nie tworzą wyboru',()=>{
  assert.equal(vision.recognizeText([['Apex Inventor','Back To Basics']],catalog,'KIWI').status,'ambiguous');
  for(const lines of [[],['Zwiększa efekty augmentu Apex Inventor'],['Apex Invent0r'],['Sklep'],['']])
    assert.equal(vision.recognizeText([lines],catalog,'KIWI').status,'unreadable');
  assert.equal(vision.recognizeText([['Genialny Wynalazca'],['Apex Inventor']],catalog,'KIWI').id,1002);
});
test('trzy kolejne pewne odczyty i reset po przerwie lub zmianie meczu',()=>{
  const c=new vision.Consensus(),a=[{status:'match',id:1002}];
  assert.deepEqual(c.observe('a',a),[null]);assert.deepEqual(c.observe('a',a),[null]);assert.deepEqual(c.observe('a',a),[1002]);
  assert.deepEqual(c.observe('a',[{status:'ambiguous'}]),[null]);assert.deepEqual(c.observe('a',a),[null]);
  assert.deepEqual(c.observe('b',a),[null]);c.reset();assert.deepEqual(c.observe('b',a),[null]);
});
test('kalibracja odrzuca cały ekran, nakładanie, NaN i zmianę rozdzielczości',()=>{
  const config={enabled:true,width:1920,height:1080,regions:[{x:.05,y:.8,w:.20,h:.044}]};
  assert.deepEqual(vision.validateConfig(config),config);
  for(const regions of [[],[{x:0,y:0,w:1,h:1}],[config.regions[0],config.regions[0]],[{x:NaN,y:0,w:.025,h:.044}]])assert.throws(()=>vision.validateConfig({...config,regions}));
  assert.ok(vision.sameLayout(config,1920,1080));assert.ok(!vision.sameLayout(config,1280,720));
});
test('wybiera wyłącznie dokładne okno procesu gry, bez fallbacku do monitora',()=>{
  const sources=[{id:'window:11:0',name:'League of Legends'},{id:'window:12:0',name:'gra'},{id:'screen:12:0'}];
  assert.equal(screen.sourceForHandle(sources,'12'),sources[1]);assert.equal(screen.sourceForHandle(sources,'99'),null);
  assert.equal(screen.sourceForHandle([...sources,sources[1]],'12'),null);assert.equal(screen.sourceForHandle(sources,null),null);
});
test('nowy odczyt zachowuje ręczne wybory, a brak ikony nie usuwa wyboru',()=>{
  const s=new MayhemSession();s.ensure(1,'Ahri');
  s.value.selection.augments=[1004];
  const next=screen.reconcile(s.value,[1002,null],game,'KIWI');assert.deepEqual(next.selection.augments,[1004,1002]);
  const missing=screen.reconcile(next,[null,null],game,'KIWI');assert.deepEqual(missing.selection.augments,[1004,1002]);
  const manual=screen.manualSelection(next,{...next.selection,augments:[1004]},[1002]);
  const corrected=screen.reconcile({...next,...manual},[1002,null],game,'KIWI');assert.deepEqual(corrected.selection.augments,[1004]);
});
test('stary formularz nie cofa augmentu wykrytego po jego otwarciu',()=>{
  const s=new MayhemSession();s.ensure(1,'Ahri');
  const next=screen.reconcile(s.value,[1002],game,'KIWI');
  const merged=screen.manualSelection(next,{...next.selection,augments:[1004]},[]);
  assert.deepEqual(merged.selection.augments,[1004,1002]);
  const anew=s.ensure(2,'Ahri');assert.equal(anew.screenSlots,undefined);
});
