const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../src/engine'),mayhem=require('../src/mayhem'),rules=require('../src/mayhem-rules');
const data=require('../data/champions.json'),catalog=require('../data/mayhem-augments.json').augments;
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const {buildProfile}=require('../src/mayhem-profile');
const {itemAvailable,itemsCompatible}=require('../src/itemrules');
const id=name=>catalog.find(a=>a.api.replace(/^ARAM_/,'')===name).id;
const ids=b=>b.items.map(i=>i.id);
function build(alias,names,extra={}) {
  return engine.buildFor(alias,{mode:'mayhem',me:{championId:game.championsByAlias.get(alias).id},allies:[],enemies:[],
    ...extra,mayhem:{augments:names.map(id),owned:[],completed:[],effects:{},...extra.mayhem}},game,data);
}

test('statystyki, zasięg i pojedynczy wzmocniony atak nie zmieniają roli championa',()=>{
  for(const alias of ['Zed','Riven','Ahri','Gragas','Leona','Sona']) {
    const b=build(alias,['Deft','ScopedWeapons','Bonk']);
    assert.ok(!ids(b).some(i=>[3115,3124,3091,3153].includes(i)),alias+': '+b.items.map(i=>i.name));
  }
  for(const alias of ['Zed','Jinx'])for(const name of ['WitchfulThinking','LichBrain','PhenomenalEvil','NoManaNoProblem'])
    assert.deepEqual(ids(build(alias,[name])),ids(build(alias,[])),`${alias}: ${name}`);
  for(const alias of ['Ahri','Gragas','Sona'])assert.deepEqual(ids(build(alias,['BluntForce'])),ids(build(alias,[])),alias);
  assert.ok(!ids(build('Sona',['MercysStrike'])).some(i=>[3115,3124,3153].includes(i)));
});

test('tank z obrażeniami magicznymi wybiera obronę, a wojownik AP zachowuje AP',()=>{
  for(const alias of ['Leona','Ornn','Zac'])for(const names of [['SlapAround','OneHitWonder'],['CantTouchThis'],['JeweledGauntlet'],['BigShot'],['ApexInventor'],['ArmoredImpact']]) {
    const b=build(alias,names);
    assert.ok(!ids(b).some(i=>[3031,3071,3161,6696,3089,4645,3115,3124].includes(i)),`${alias} ${names}: ${b.items.map(i=>i.name)}`);
  }
  for(const alias of ['Gragas','Gwen','Mordekaiser'])for(const names of [['Goliath'],['HeavyHitter'],['ApexInventor'],['CantTouchThis']]) {
    const b=build(alias,names);
    assert.ok(!ids(b).some(i=>[3748,3053,6333,3071,3161,6696].includes(i)),`${alias} ${names}`);
  }
});

test('mana ma pokrycie w zasobie championa; konwersje, zadania i własne zakupy mają jawne wyjątki',()=>{
  for(const alias of ['Zed','Akali','Katarina','Garen','Riven','Mordekaiser','Shen']) {
    assert.equal(buildProfile(engine.champInfo(alias,game,data)).usesMana,false);
    for(const names of [[],['Overflow'],['BlueBarrier'],['DoubleTime'],['CantTouchThis'],['MightyShield']]) {
      const b=build(alias,names);
      assert.ok(!b.items.some(i=>{const c=game.items.get(i.id).categories;return c.includes('Mana')&&c.some(v=>['SpellDamage','Damage'].includes(v));}),`${alias}: ${names}`);
    }
  }
  assert.equal(buildProfile({alias:'UnreleasedChampion'}).usesMana,null);
  assert.equal(build('Ahri',['Overflow']).items[0].id,3003);
  assert.deepEqual(ids(build('Zed',['MindtoMatter'])),ids(build('Zed',[])));
  assert.equal(build('Akali',['NoManaNoProblem']).items[0].id,3003);
  assert.equal(build('Akali',['TrueEternity']).items[0].id,773027);
  const owned=build('Zed',['Overflow'],{mayhem:{owned:[3004]}});assert.equal(owned.items[0].id,3004);assert.equal(owned.items[0].owned,true);
  assert.equal(build('Zed',['Overflow'],{choices:{items:[{id:3004,slot:0}]}}).items[0].id,3004);
  // Armor can still justify Frozen Heart without a mana bar.
  const fh=mayhem.adaptation({augments:[id('Impassable')]},engine.champInfo('Shen',game,data),{game,enemy:{adShare:1}});
  assert.ok(!fh.excluded.has(3110));
});

test('prawdziwe nakładanie on-hit, konwersje i ulepszenia nadal wpływają na zakupy',()=>{
  assert.ok(ids(build('Ahri',['EtherealWeapon'])).includes(3115));
  assert.equal(build('Ahri',['Marksmage']).items[0].id,3115);
  assert.ok(ids(build('Jinx',['ADAPt'])).includes(3089));
  assert.ok(!ids(build('Ahri',['escAPADe'])).includes(3089));
  assert.equal(build('Leona',['Upgrade_IE']).items[0].id,3031);
  assert.equal(build('Gragas',['Upgrade_Stormsurge']).items[0].id,4646);
  assert.ok(ids(build('Ahri',['JeweledGauntlet','ItsCritical'])).includes(3031),'Kryty czarów nadają sens dodatkowej szansie na kryt');
  const corrected=build('Ahri',['Deft'],{mayhem:{effects:{[id('Deft')]:['onhit']}}});
  assert.ok(ids(corrected).includes(3115),'Ręczny efekt zachowuje pierwszeństwo');
});

test('kilka podobnych augmentów nie mnoży premii do kolejnych wariantów itemu',()=>{
  const stacked=build('Jinx',['Deft','Typhoon','DualWield']);
  for(const core of [3032,3031,3085])assert.ok(ids(stacked).includes(core),'Rdzeń Jinx: '+core);
  const owned=build('Jinx',['Deft','Typhoon','DualWield'],{mayhem:{owned:[3153]}});
  assert.equal(owned.items[0].id,3153);assert.ok(owned.items[0].owned);
  for(const core of [3032,3031,3085])assert.ok(ids(owned).includes(core),'Zakup zaspokaja wspólną premię: '+core);
  const pinned=build('Jinx',['Deft','Typhoon','DualWield'],{choices:{items:[{id:3153,slot:0}]}});
  for(const core of [3032,3031,3085])assert.ok(ids(pinned).includes(core));
});

test('283 augmenty × 18 profili: zgodność, zasoby i brak zamiany AP/AD od samej statystyki',()=>{
  const aliases=['Ahri','Zed','Akali','Katarina','Garen','Riven','Mordekaiser','Gragas','Gwen','Ornn','Leona','Shen','Zac','Sona','Lulu','Jinx','Xayah','Vayne'];
  for(const a of catalog)for(const alias of aliases) {
    const b=build(alias,[a.api.replace(/^ARAM_/,'')]),r=rules[a.api.replace(/^ARAM_/,'')],repeat=new Set(b.mayhem.repeat);
    assert.equal(b.items.length,5,`${alias} ${a.api}`);
    b.items.forEach((i,n)=>{
      assert.ok(itemAvailable(i.id,game,'mayhem',alias));
      assert.ok(itemsCompatible(i.id,ids(b).slice(0,n),repeat));
      if(buildProfile(engine.champInfo(alias,game,data)).usesMana===false&&!r.manaConversion&&!(r.items||[]).includes(i.id)) {
        const c=game.items.get(i.id).categories;
        assert.ok(!c.includes('Mana')||!c.some(v=>['SpellDamage','Damage'].includes(v)),`${alias} ${a.api}: ${i.name}`);
      }
    });
    assert.ok(ids(b).filter(id=>[3078,6662,3100].includes(id)).length<=1);
    assert.ok(b.mayhem.hints.every(h=>h.supported));
  }
});
