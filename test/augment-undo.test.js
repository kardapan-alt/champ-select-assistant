const test=require('node:test'),assert=require('node:assert/strict');
const {reconcile,undoCandidate,undoRecognition,manualSelection}=require('../src/augment-screen');
const {MayhemSession}=require('../src/mayhem');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const receipt={token:'first',at:1000};
test('cofnięcie usuwa tylko automatyczny augment i jego stan, zachowuje późniejsze zakupy oraz ręczne wybory',()=>{
  const s=new MayhemSession();s.ensure(1,'Ahri');s.value.selection.augments=[1004];
  const next=reconcile(s.value,[1002],game,'KIWI',receipt);
  next.inventory={owned:[3157],ownedBoots:3020};next.selection.effects={1002:['itemhaste']};
  const undone=undoRecognition(next,receipt.token);
  assert.deepEqual(undone.selection.augments,[1004]);assert.deepEqual(undone.inventory,next.inventory);
  assert.deepEqual(undone.selection.effects,{});assert.equal(undoCandidate(undone),null);
  assert.equal(undone.screenUndoRevision,1);assert.ok(undone.screenIgnored.includes(1002));
});
test('ponowny odczyt po restarcie nie cofa poprawki użytkownika',()=>{
  const s=new MayhemSession();s.ensure(1,'Ahri');
  const next=reconcile(s.value,[1002],game,'KIWI',receipt),undone=JSON.parse(JSON.stringify(undoRecognition(next,'first')));
  const repeated=reconcile(undone,[1002],game,'KIWI',{token:'repeat',at:2000});
  assert.deepEqual(repeated.selection.augments,[]);assert.equal(undoCandidate(repeated),null);
  const manual=manualSelection(repeated,{...repeated.selection,augments:[1002]},[1002]);
  assert.ok(!manual.screenIgnored.includes(1002));assert.deepEqual(manual.selection.augments,[1002]);
});
test('ręczny wybór istniejący przed OCR nie dostaje przycisku cofania',()=>{
  const s=new MayhemSession();s.ensure(1,'Ahri');s.value.selection.augments=[1002];
  const next=reconcile(s.value,[1002],game,'KIWI',receipt);assert.equal(undoCandidate(next),null);
});
test('stary przycisk nie cofa nowszego wyboru ani kolejnego wpisu historii',()=>{
  const s=new MayhemSession();s.ensure(1,'Ahri');
  const first=reconcile(s.value,[1002],game,'KIWI',receipt);
  const second=reconcile(first,[1002,1004],game,'KIWI',{token:'second',at:2000});
  assert.throws(()=>undoRecognition(second,'first'));
  const undone=undoRecognition(second,'second');assert.deepEqual(undone.selection.augments,[1002]);
  assert.throws(()=>undoRecognition(undone,'second'));assert.equal(undoCandidate(undone).token,'first');
});
test('ręczne usunięcie unieważnia historię, a nowy mecz resetuje cofnięcia',()=>{
  const s=new MayhemSession();s.ensure(1,'Ahri');
  const next=reconcile(s.value,[1002],game,'KIWI',receipt);
  const manual=manualSelection(next,{...next.selection,augments:[]},[1002]);
  assert.equal(undoCandidate({...next,...manual}),null);
  s.value=undoRecognition(next,'first');s.ensure(2,'Ahri');assert.equal(s.value.screenIgnored,undefined);
});
