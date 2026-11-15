const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../src/engine');
const mayhem=require('../src/mayhem');
const rules=require('../src/mayhem-rules');
const evidence=require('../data/mayhem-rule-evidence.json');
const catalog=require('../data/mayhem-augments.json').augments;
const data=require('../data/champions.json');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const {itemsCompatible,itemAvailable}=require('../src/itemrules');
const lookup=name=>catalog.find(a=>a.api===name || a.api==='ARAM_'+name);
function setup(alias,names,owned=[],extra={},pool='KIWI') {
  const selection=mayhem.validateSelection({augments:names.map(n=>lookup(n).id),owned,...extra},game,alias,pool);
  return {mode:'mayhem',me:{championId:game.championsByAlias.get(alias).id,position:''},allies:[],enemies:[],mayhem:selection};
}
const build=(alias,names,owned=[],extra={},pool)=>engine.buildFor(alias,setup(alias,names,owned,extra,pool),game,data);

test('każdy augment KIWI i KIWI_JADE ma jawną regułę oraz ślad sprawdzonego opisu',()=>{
  assert.equal(catalog.length,283);
  assert.deepEqual(Object.keys(rules).sort(),catalog.map(a=>a.api.replace(/^ARAM_/,'')).sort());
  assert.deepEqual(Object.keys(evidence.augments).sort(),catalog.map(a=>a.api).sort());
  for(const a of catalog) {
    const r=rules[a.api.replace(/^ARAM_/,'')],source=evidence.augments[a.api];
    assert.ok(r.summary.length>35,a.api);assert.match(source.sha256,/^[a-f0-9]{64}$/);
    assert.ok(source.definition.includes(a.api) || /^\{[a-f0-9]{8}\}$/.test(source.definition),a.api);assert.ok(source.description);
    assert.ok(r.effects.every(e=>mayhem.EFFECTS[e]),a.api);
    assert.ok(r.neutral || r.effects.length || r.items?.length,a.api);
    for(const id of r.items || [])assert.ok(game.items.has(id),a.api+':'+id);
  }
  for(const pool of ['KIWI','KIWI_JADE'])assert.ok(mayhem.choicesCatalog(pool).augments.every(a=>a.supported));
});

test('283 augmenty × 6 klas: pełny legalny build, bez nieznanych efektów i nieuprawnionych duplikatów',()=>{
  for(const a of catalog)for(const alias of ['Ahri','Jinx','Ornn','Garen','Zed','Sona']) {
    const state=setup(alias,[a.api],[],{},a.pools[0]), before=JSON.stringify(state);
    const b=engine.buildFor(alias,state,game,data),repeat=new Set(b.mayhem.repeat);
    assert.equal(JSON.stringify(state),before,'Mutacja '+a.api);
    assert.equal(b.items.length,5,alias+' '+a.api);
    assert.deepEqual(b.mayhem.unknown,[],a.api);assert.equal(b.mayhem.hints[0].supported,true);
    b.items.forEach((i,n)=>{assert.ok(itemAvailable(i.id,game,'mayhem',alias),i.name);assert.ok(itemsCompatible(i.id,b.items.slice(0,n).map(x=>x.id),repeat),a.api);});
    assert.ok(b.boots.id || a.api==='Quest_Sneakerhead');
    assert.ok(!b.situations.some(s=>s.vision));
  }
});

test('konkretne nowe efekty wybierają slow, kryty czarów, on-hit, manę i odporności leczącego',()=>{
  assert.equal(build('Ahri',['IceCold']).items[0].id,3116);
  assert.ok(build('Sona',['ProteinShake']).items.slice(0,3).some(i=>i.id===3190));
  const twin=build('Ahri',['Twinfire']);assert.ok(twin.items.some(i=>i.id===3031));assert.ok(!twin.items.some(i=>i.id===3115 || i.id===6676));
  const big=build('Jinx',['BigShot']);assert.equal(big.items[0].id,3031);
  const tickle=build('Jinx',['TickleMonster']);assert.equal(tickle.items[0].id,3115);assert.ok(!tickle.items.some(i=>[3031,6676].includes(i.id)));
  assert.equal(build('Ahri',['NoManaNoProblem']).items[0].id,3003);
  assert.equal(build('Ahri',['ApexInventor']).items[0].id,3157);
});

test('sprzeczne synergie nie przywracają wyłączonego R, regeneracji ani HP zamienionego w lethality',()=>{
  const r=build('Ahri',['BacktoBasics','CantTouchThis','GoH_PentakillAug_R']);
  assert.ok(!r.items.some(i=>[3118,6696].includes(i.id)));
  assert.ok(r.mayhem.hints.slice(1).every(h=>h.summary.includes('wyłącza ultimate')));
  const v=build('Ornn',['Vampirism','CircleofDeath'],[],{},'KIWI_JADE');assert.ok(!v.items.some(i=>i.id===3083));
  const hp=build('Garen',['GiftoftheDrowned','Goliath','HeavyHitter']);assert.ok(!hp.items.some(i=>[3084,3083,2502,3748].includes(i.id)));
  const converted=build('Jinx',['ADAPt'],[],{effects:{[lookup('ADAPt').id]:[]}});assert.ok(converted.items.some(i=>i.id===3089),'Korekta priorytetu nie cofa konwersji');
});

test('ekonomia, losowe nagrody i Flash nie powodują przypadkowej przebudowy przedmiotów',()=>{
  const baseline=build('Ahri',[]).items.map(i=>i.id);
  for(const name of ['Donation','TransmuteGold','PandorasBox','Stats','Flashy','WeaponOfDestiny']) {
    const b=build('Ahri',[name]);assert.deepEqual(b.items.map(i=>i.id),baseline,name);assert.equal(b.mayhem.hints[0].neutral,true);
  }
});

test('zadania nie każą kupować darmowego Heartsteela ani drugich butów; zachowują nagrody',()=>{
  const free=build('Ornn',['FutureSightHeartsteel'],[],{},'KIWI_JADE');assert.ok(!free.items.some(i=>i.id===3084));
  const received=build('Ornn',['FutureSightHeartsteel'],[3084],{},'KIWI_JADE');assert.equal(received.items[0].id,3084);assert.equal(received.items[0].owned,true);
  const boots=build('Ahri',['Quest_Sneakerhead']);assert.equal(boots.boots.id,null);assert.match(boots.boots.why,/Darmowe/);
  const reward=build('Ahri',['Quest_Sneakerhead'],[3040],{ownedBoots:1111});assert.equal(reward.boots.id,1111);assert.equal(reward.items[0].id,3040);assert.equal(reward.items[0].owned,true);
  const ctx=setup('Ahri',['Quest_Sneakerhead']);assert.ok(engine.itemSetFor(boots,'Ahri',ctx,game,data).blocks.flatMap(b=>b.items).every(i=>Number(i.id)>0));
});

test('kopie przedmiotów wymagają właściwego augmentu i eksport zachowuje ich liczbę',()=>{
  assert.throws(()=>setup('Ahri',[],[773027,773027],{},'KIWI_JADE'));
  const state=setup('Ahri',['TrueEternity'],[773027,773027],{},'KIWI_JADE');
  const b=engine.buildFor('Ahri',state,game,data);
  assert.deepEqual(b.items.slice(0,2).map(i=>i.id),[773027,773027]);assert.ok(b.items.slice(0,2).every(i=>i.owned));
  const exported=engine.itemSetFor(b,'Ahri',state,game,data);
  assert.ok(exported.blocks.some(b=>b.items.some(i=>i.id==='773027' && i.count===2)));
  const cleave=build('Garen',['DontStopCleavin'],[773071,773071],{},'KIWI_JADE');assert.equal(cleave.items.filter(i=>i.id===773071).length,2);
});

test('Hex Core proponuje ulepszenie posiadanego rdzenia bez zabierania drugiego slotu',()=>{
  const b=build('Ahri',['HexCore'],[773513],{},'KIWI_JADE');
  assert.equal(b.items[0].id,773513);assert.ok(!b.items.some(i=>i.id===773516));
  assert.equal(b.mayhem.nextItem.id,773516);assert.equal(b.mayhem.nextItem.upgrade,true);
});

test('posiadane automatyczne ulepszenie many nie prowadzi do zakupu jego poprzednika',()=>{
  const b=build('Ahri',['NoManaNoProblem'],[3040]);
  assert.equal(b.items[0].id,3040);assert.ok(!b.items.some(i=>i.id===3003));
});

test('ustawienia z 0.6.16 bez ręcznego profilu automatycznie korzystają z nowej reguły',()=>{
  const id=lookup('IceCold').id, restored=new mayhem.MayhemSession({key:'77:Ahri:KIWI',selection:{augments:[id],effects:{},owned:[]}});
  const s=restored.ensure(77,'Ahri');const b=engine.buildFor('Ahri',{...setup('Ahri',[]),mayhem:s.selection},game,data);
  assert.equal(b.items[0].id,3116);assert.equal(b.mayhem.unknown.length,0);
});
