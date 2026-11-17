const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../src/engine'),data=require('../data/champions.json');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const {itemAvailable,itemsCompatible,redundantSpellblade,purchaseItem}=require('../src/itemrules');
const {usesMana,canonicalAlias}=require('../src/champion-identity');
const {buildIdentity}=require('../src/base-build');
const {isBootItem,SUPPORT_ITEMS}=require('../src/rolequests');
const {dataFreshness}=require('../src/data-freshness');
const opgg=require('../src/opgg');
const roster=[...game.championsByAlias.keys()].filter(a=>!a.startsWith('Jade_'));
const scenarios=[[],['Ornn','Sion','Rammus','Malphite','Chogath'],['Yasuo','Yone','Jinx','Caitlyn','Tryndamere'],['Lux','Veigar','Brand','Syndra','Ahri']];
const state=(alias,mode,enemies=[])=>({mode,me:{championId:game.championsByAlias.get(alias).id,position:data.champions[alias]?.roles[0]},allies:[],
  enemies:enemies.map(a=>({championId:game.championsByAlias.get(a).id}))});
const build=(alias,mode='mayhem',enemies=[])=>engine.buildFor(alias,state(alias,mode,enemies),game,data);

test('all champions have complete, compatible baseline builds in three modes and four enemy scenarios',()=>{
  assert.equal(roster.length,173);
  for(const alias of roster)for(const mode of ['classic','aram','mayhem'])for(const enemies of scenarios){
    const b=build(alias,mode,enemies),c=data.champions[alias],ids=b.items.map(i=>i.id),label=`${alias} ${mode} vs ${enemies}: ${ids}`;
    const count=mode==='classic'?(c.roles[0]==='bottom'?6:c.roles[0]==='support'?4:5):5;
    assert.equal(ids.length,count,label);
    assert.equal(b.estimated,false,label);
    assert.ok(itemAvailable(b.boots.id,game,mode,alias),label);
    for(const [index,id] of ids.entries()){
      const item=game.items.get(id);
      assert.ok(itemAvailable(id,game,mode,alias),label);
      assert.ok(item.priceTotal>=1500&&!isBootItem(id,game)&&!SUPPORT_ITEMS.has(id),label);
      assert.ok(!(item.to||[]).some(next=>game.items.get(next)?.inStore===true),label);
      assert.ok(itemsCompatible(id,ids.slice(0,index)),label);
      assert.ok(!redundantSpellblade(id,ids.slice(0,index)),label);
      if(usesMana(alias)===false)assert.ok(!item.categories.includes('Mana')||!item.categories.some(t=>['Damage','SpellDamage'].includes(t)),label);
    }
    if(!enemies.length){
      const source=mode==='classic'?c:c.aram;
      for(const id of source.items)assert.ok(ids.includes(id),label+' missing core '+id);
      assert.equal(b.baseSource.mode,mode==='classic'?'classic':'aram');
      assert.equal(b.baseSource.patch,'16.22');
    }
  }
});

test('client Jade variants inherit the real champion instead of generic AD fallbacks',()=>{
  const variants=[...game.championsByAlias.keys()].filter(a=>a.startsWith('Jade_'));
  assert.ok(variants.length>50);
  for(const alias of variants){
    const standard=canonicalAlias(alias),info=engine.champInfo(alias,game,data);
    assert.equal(info.unknown,undefined,alias);
    assert.deepEqual(info.items,data.champions[standard].items,alias);
    const b=build(alias),normal=build(standard);
    assert.deepEqual(b.items.map(i=>i.id),normal.items.map(i=>i.id),alias);
  }
});

test('baseline styles do not mix AP, crit, on-hit and enchanter alternatives',()=>{
  for(const mode of ['classic','aram','mayhem']){
    const ez=build('Ezreal',mode).items.map(i=>i.id);
    for(const id of [3078,3004,3161])assert.ok(ez.includes(id));
    assert.ok(!ez.includes(3070)&&!ez.includes(3508));
    for(const alias of ['Xayah','Jinx','Sivir'])for(const enemies of scenarios)
      assert.ok(build(alias,mode,enemies).items.some(i=>i.id===3031),`${alias} ${mode}: IE`);
    for(const alias of ['KogMaw','Vayne'])assert.ok(!build(alias,mode).items.some(i=>[3089,4645,3031].includes(i.id)),alias);
    assert.ok(!build('Vi',mode).items.some(i=>i.id===3031),'IE without a crit core');
    for(const alias of ['Janna','Milio','Sona'])assert.ok(!build(alias,mode).items.some(i=>[6655,3089,4645].includes(i.id)),alias);
  }
  const blitz=build('Blitzcrank');
  assert.ok(blitz.items.every(i=>game.items.get(i.id).categories.includes('SpellDamage')),'AP core keeps AP follow-up items');
  assert.ok(build('Gragas').items.some(i=>i.id===3089));
  assert.ok(!build('Gragas').items.some(i=>[3078,3053,3124].includes(i.id)));
});

test('live analysis can change damage style, while owned and pinned items remain explicit choices',()=>{
  assert.equal(buildIdentity({...data.champions.Gragas,items:[3078,3053,6333]},game).dmg,'ad');
  const s=state('Ahri','mayhem');
  s.mayhem={augments:[],owned:[3040],effects:{}};
  s.choices={items:[{id:3078,slot:2}]};
  const b=engine.buildFor('Ahri',s,game,data);
  assert.ok(b.items.some(i=>i.id===3040&&i.owned));
  assert.ok(!b.items.some(i=>i.id===3003));
  assert.ok(b.items.some(i=>i.id===3078&&i.pinned));
});

test('OP.GG removes components before taking three core items and resolves automatic transformations',()=>{
  const a=opgg.interpretAnalysis({data:{core_items:{ids:[3070,3078,3042,3161],play:5000},
    fourth_items:[{ids:[3042],pick_rate:0.5},{ids:[3053],pick_rate:0.3}]}},game);
  assert.deepEqual(a.items,[3078,3004,3161]);
  assert.deepEqual(a.lateItems.map(i=>i.id),[3053]);
  assert.deepEqual([3040,3042,3121,2530].map(purchaseItem),[3003,3004,3119,2526]);
  assert.deepEqual(opgg.interpretAnalysis({core_items:{ids:[6617,2530,3504]}},game).items,[6617,2526,3504]);
  for(const id of [3100,3078,6662,2510,3508])for(const other of [3100,3078,6662,2510,3508])
    if(id!==other)assert.ok(redundantSpellblade(id,[other]));
});

test('OP.GG resolves standard champion names ahead of Jade and requests necessary output fields',()=>{
  const meta=opgg.interpretMeta({positions:{support:[{champion:'Sona',tier:2,play:10000}]}},game);
  assert.deepEqual(meta.roles.Sona,['support']);assert.equal(meta.roles.Jade_Sona,undefined);
  const tool={name:'lol_get_champion_analysis',inputSchema:{properties:{desired_output_fields:{type:'array',items:{type:'string'}}}}};
  assert.ok(opgg.buildArgs(tool,{}).desired_output_fields.includes('data.core_items'));
  const minimal={...data,champions:{}};
  const merged=opgg.mergeStats(minimal,{analyses:{Gragas:{items:[6655,4646,4645]}}},game);
  assert.ok(merged.champions.Gragas.statsBuild);
  assert.equal(opgg.mergeStats(data,{analyses:{Gragas:{items:[]}}},game).champions.Gragas.statsBuild,false);
});

test('old parsed build cache is discarded even offline, but player profiles and new stale builds survive',async()=>{
  const key='analysis:Ezreal:bottom',cache={meta:{at:Date.now(),value:{roles:{Jade_Sona:['support']}}},
    [key]:{at:Date.now(),value:{items:[3070,3078,3042]}},player:{at:Date.now(),value:{level:30}}};
  const provider=new opgg.OpggProvider({cache});
  assert.equal(provider.fresh(key),null);assert.equal(provider.fresh('meta'),null);
  assert.deepEqual(provider.fresh('player'),{level:30});
  const offline=async()=>{throw Error('offline')};
  assert.equal(await provider.cached(key,offline),null);
  const corrected={items:[3078,3004,3161]};
  assert.deepEqual(await provider.cached(key,async()=>corrected),corrected);
  cache[key].at=0;
  assert.deepEqual(await provider.cached(key,offline),corrected);
});

test('baseline provenance distinguishes saved ARAM data from Mayhem statistics and detects patch mismatch',()=>{
  const source=data.champions.Ahri.aram.baseSource;
  const fresh=dataFreshness({...game,provenance:{version:'16.23.1',source:'client'}},{connected:true,mode:'mayhem',baseSource:source});
  const row=fresh.rows.find(r=>r.name==='Bazowy build');
  assert.equal(row.status,'different');assert.equal(fresh.warning,true);
  assert.match(row.detail,/to nie statystyki Mayhem/);
});
