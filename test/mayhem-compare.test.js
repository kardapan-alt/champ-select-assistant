const test=require('node:test'),assert=require('node:assert/strict');
const {compareAugments,selectedAugmentGrades}=require('../src/mayhem-compare');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const data=require('../data/champions.json'),catalog=require('../data/mayhem-augments.json').augments;
const id=name=>{const a=catalog.find(a=>a.english===name||a.api.replace(/^ARAM_/,'')===name);assert.ok(a,name);return a.id;};
const compare=(names,champion,selection={},items=[])=>compareAugments(names.map(id),{champion:{alias:champion,...data.champions[champion]},
  selection:{augments:[],completed:[],owned:[],effects:{},...selection},build:{items:items.map(id=>({id}))},game});
test('różne postacie otrzymują różne wyróżnienie, kolejność kart pozostaje jak w grze',()=>{
  const names=['Deft','FirstAidKit','Goliath'];
  for(const [champion,best] of [['Ashe','Deft'],['Soraka','FirstAidKit'],['Leona','Goliath']]){
    const result=compare(names,champion);
    assert.deepEqual(result.cards.map(c=>c.id),names.map(id));
    assert.equal(result.cards.find(c=>c.recommended)?.id,id(best),champion);
    assert.ok(result.cards.find(c=>c.recommended).reasons.length);
  }
});
test('posiadane przedmioty i wcześniejsze augmenty są konkretnym uzasadnieniem',()=>{
  const r=compare(['Apex Inventor','Goliath','FirstAidKit'],'Ahri',{owned:[3157],augments:[id('Wooglet\'s Witchcap')]},[3157,3089]);
  const apex=r.cards[0];assert.ok(apex.recommended);
  assert.ok(apex.reasons.some(r=>r.includes(game.items.get(3157).name)));
  assert.ok(apex.reasons.some(r=>r.includes('Wspólne zakupy')));
});
test('zadanie pokazuje brakujące zakupy i nie udaje gotowej nagrody',()=>{
  const r=compare(['Quest_WoogletsWitchcap','Deft','Goliath'],'Ahri',{owned:[3157]},[3089]);
  assert.ok(r.cards[0].warnings.some(w=>w.includes(game.items.get(3089).name)));
  assert.ok(!r.cards[0].recommended);
});
test('wyłączone R oraz konflikty konwersji nie dostają rekomendacji',()=>{
  const r=compare(['GoH_PentakillAug_R','Apex Inventor','Goliath'],'Ahri',{augments:[id('Back To Basics')]});
  assert.equal(r.cards[0].status,'conflict');assert.ok(!r.cards[0].recommended);
  const conversions=catalog.filter(a=>require('../src/mayhem-rules')[a.api.replace(/^ARAM_/,'')]?.conversion);
  const rr=compareAugments([conversions[1].id,id('Goliath'),id('Deft')],{champion:data.champions.Ahri,selection:{augments:[conversions[0].id]},build:{items:[]},game});
  assert.equal(rr.cards[0].status,'conflict');
});
test('augmenty niezależne od buildu i remis nie otrzymują wymyślonego zwycięzcy',()=>{
  const r=compare(['Donation','Flashy','King Me'],'Ahri');
  assert.ok(r.cards.every(c=>c.status==='independent'&&!c.recommended));
  assert.ok(compare(['Deft','Typhoon','Scoped Weapons'],'Ashe').cards.every(c=>!c.recommended));
});
test('odrzuca niepełne lub obce oferty; porównywanie nie zmienia buildu ani wyboru',()=>{
  const context={champion:data.champions.Ahri,selection:{augments:[id('Apex Inventor')],owned:[3157],effects:{}},build:{items:[{id:3157,owned:true}]},game};
  const before=JSON.stringify({selection:context.selection,build:context.build});
  assert.equal(compareAugments([id('Deft')],context),null);
  assert.equal(compareAugments([id('Deft'),id('Deft'),id('Goliath')],context),null);
  assert.equal(compareAugments([-1,id('Deft'),id('Goliath')],context),null);
  compareAugments(['Deft','Goliath','FirstAidKit'].map(id),context);
  assert.equal(JSON.stringify({selection:context.selection,build:context.build}),before);
});
test('każdy augment w obu pulach daje skończoną ocenę albo jawny brak oceny',()=>{
  for(const pool of ['KIWI','KIWI_JADE'])for(const a of catalog.filter(a=>a.pools.includes(pool))){
    const ids=[a.id,...catalog.filter(x=>x.pools.includes(pool)&&x.id!==a.id).slice(0,2).map(x=>x.id)];
    const r=compareAugments(ids,{champion:data.champions.Ahri,selection:{augments:[],owned:[]},build:{items:[]},game,pool});
    assert.equal(r.cards.length,3);assert.ok(r.cards.every(c=>Number.isFinite(c.score)));
  }
});

test('oceny F–S zależą od synergii i konfliktów; neutralne efekty nie dostają fałszywego F',()=>{
  const strong=compare(['Goliath','Upgrade_Stormsurge','FirstAidKit'],'Leona',{owned:[3084,2502],augments:[id('HeavyHitter')]});
  assert.equal(strong.cards[0].grade,'S');
  const blocked=compare(['GoH_PentakillAug_R','Apex Inventor','Donation'],'Ahri',{augments:[id('Back To Basics')]});
  assert.equal(blocked.cards[0].grade,'F');assert.equal(blocked.cards[2].grade,null);
  assert.ok(blocked.cards[0].warnings.length);assert.match(strong.note,/dopasowania/);
});

test('ocena wybranego ulepszenia rośnie po zakupie itemu, bez liczenia synergii z samym sobą',()=>{
  const context={champion:data.champions.Ahri,selection:{augments:[3150],owned:[],effects:{}},build:{items:[{id:4646}]},game};
  const original=JSON.stringify(context.selection),before=selectedAugmentGrades(context)[0];
  const after=selectedAugmentGrades({...context,selection:{...context.selection,owned:[4646]}})[0];
  assert.equal(before.grade,'C');assert.equal(after.grade,'A');assert.equal(JSON.stringify(context.selection),original);
  assert.equal(selectedAugmentGrades({...context,selection:{...context.selection,effects:{3150:['haste']}}})[0].grade,null);
});
